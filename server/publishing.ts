import {createCipheriv,createDecipheriv,createHash,randomBytes,randomUUID} from 'node:crypto';
import {existsSync,mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import express,{Router} from 'express';
import type {Store} from './store.ts';
import type {LocalFileStorage} from './media.ts';
import {accessFor,requireProjectAccess} from './auth-access.ts';
import type {Publication,PublicationDraft,PublishingConnection,PublicationAsset} from '../shared/publishing-types.ts';
import {MastodonAdapter,PublishingError,normalizePublishingOrigin,type PublishAdapter} from './publishing-adapter.ts';

const CONNECTION='publishing-connection',PUBLICATION='publication';
let activeConnectionChecks=0;
type StoredConnection=PublishingConnection&{sealed?:string};
const digest=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const error=(message:string,status=400)=>new PublishingError(message,status);
const id=(value:unknown)=>{if(typeof value!=='string'||!/^[A-Za-z0-9_-]{1,128}$/.test(value))throw error('Invalid publishing identity.');return value;};
export function hasPendingPublications(dataDir:string):boolean{
 const database=path.join(dataDir,'studio.sqlite');if(!existsSync(database))return false;let db:DatabaseSync|undefined;
 try{db=new DatabaseSync(database,{readOnly:true});return !!db.prepare("SELECT 1 FROM workspace_records WHERE kind='publication' AND json_extract(data,'$.data.state') IN ('scheduled','sending') LIMIT 1").get();}catch{return false;}finally{db?.close();}
}
export class PublishingService {
 private adapter:PublishAdapter;private now:()=>number;private timer?:ReturnType<typeof setInterval>;private pending?:Promise<void>;private stopping=false;
 constructor(readonly store:Store,readonly media:LocalFileStorage,private options:{adapter?:PublishAdapter;now?:()=>number;available?:()=>boolean;workspaceExpiresAt?:string}={}){
  this.adapter=options.adapter??new MastodonAdapter();this.now=options.now??Date.now;
  for(const row of store.listScopedRecords<Publication>(PUBLICATION)){if(row.data.state==='sending'){row.data.state=row.data.stage==='post'?'uncertain':'scheduled';row.data.error=row.data.stage==='post'?'The server restarted while awaiting the publishing receipt. Check the destination before creating another post.':undefined;this.save(row.data);}}
 }
 private stamp(){return new Date(this.now()).toISOString();}
 private save(value:Publication){value.updatedAt=this.stamp();this.store.upsertScopedRecord({id:value.id,projectId:value.projectId,kind:PUBLICATION,data:value,createdAt:value.createdAt,updatedAt:value.updatedAt});return value;}
 private key(){const directory=path.join(this.store.dataDir,'private');mkdirSync(directory,{recursive:true,mode:0o700});const filename=path.join(directory,'publishing-key');try{writeFileSync(filename,randomBytes(32),{flag:'wx',mode:0o600});}catch(e){if((e as NodeJS.ErrnoException).code!=='EEXIST')throw e;}const key=readFileSync(filename);if(key.length!==32)throw error('Publishing credential storage is unavailable.',503);return key;}
 private seal(token:string,aad:string){const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',this.key(),iv);cipher.setAAD(Buffer.from(aad));return Buffer.concat([iv,cipher.update(token),cipher.final(),cipher.getAuthTag()]).toString('base64url');}
 private unseal(connection:StoredConnection){if(!connection.connected||!connection.sealed)throw error('Reconnect the publishing destination before scheduling.',409);const value=Buffer.from(connection.sealed,'base64url'),decipher=createDecipheriv('aes-256-gcm',this.key(),value.subarray(0,12));decipher.setAAD(Buffer.from(connection.projectId+':'+connection.id));decipher.setAuthTag(value.subarray(-16));return Buffer.concat([decipher.update(value.subarray(12,-16)),decipher.final()]).toString();}
 connections(projectId:string){return this.store.listScopedRecords<StoredConnection>(CONNECTION,projectId).map(row=>{const {sealed,...safe}=row.data;return safe;});}
 list(projectId:string){return this.store.listScopedRecords<Publication>(PUBLICATION,projectId).map(row=>row.data).sort((a,b)=>b.createdAt.localeCompare(a.createdAt));}
 get(projectId:string,publicationId:string){const value=this.store.getScopedRecord<Publication>(PUBLICATION,id(publicationId))?.data;if(!value||value.projectId!==projectId)throw error('Publication not found.',404);return value;}
 private connection(projectId:string,connectionId:string){const value=this.store.getScopedRecord<StoredConnection>(CONNECTION,id(connectionId))?.data;if(!value||value.projectId!==projectId||!value.connected)throw error('Publishing destination is not connected for this project.',409);return value;}
 async connect(projectId:string,input:{origin:string;token:string}){
  if(!this.store.getProject(projectId))throw error('Project not found.',404);
  if(this.connections(projectId).filter(c=>c.connected).length>=8)throw error('Disconnect a destination before adding another.',429);
  const origin=normalizePublishingOrigin(String(input.origin??'')),token=input.token;
  if(typeof token!=='string'||!/^[A-Za-z0-9_.~-]{16,1024}$/.test(token)||token.startsWith('comfyui-'))throw error('Enter a Mastodon user token, not a Comfy key.');
  if(activeConnectionChecks>=4)throw error('Other publishing accounts are being checked. Try again shortly.',429);
  activeConnectionChecks++;let account:{id:string;account:string};try{account=await this.adapter.verify(origin,token);}finally{activeConnectionChecks--;}
  if(this.connections(projectId).filter(c=>c.connected).length>=8)throw error('Disconnect a destination before adding another.',429);
  const connection:StoredConnection={id:randomUUID(),projectId,provider:'mastodon',origin,accountId:account.id,account:account.account,connected:true,createdAt:this.stamp()};
  connection.sealed=this.seal(token,projectId+':'+connection.id);
  this.store.upsertScopedRecord({id:connection.id,projectId,kind:CONNECTION,data:connection,createdAt:connection.createdAt,updatedAt:connection.createdAt});
  const {sealed,...safe}=connection;return safe;
 }
 disconnect(projectId:string,connectionId:string){
  const connection=this.connection(projectId,connectionId);
  if(this.list(projectId).some(job=>job.connectionId===connectionId&&job.state==='sending'))throw error('A send is in progress. Wait for its receipt before disconnecting.',409);
  connection.connected=false;delete connection.sealed;
  this.store.upsertScopedRecord({id:connection.id,projectId,kind:CONNECTION,data:connection,createdAt:connection.createdAt,updatedAt:this.stamp()});
  for(const job of this.list(projectId))if(job.connectionId===connectionId&&['draft','scheduled'].includes(job.state)){job.state='cancelled';job.error='Destination disconnected.';this.save(job);}
 }
 draft(projectId:string,input:PublicationDraft){
  if(!this.store.getProject(projectId))throw error('Project not found.',404);
  const connection=this.connection(projectId,input.connectionId),requestId=id(input.clientRequestId);
  const caption=String(input.caption??'').trim();if(caption.length>500)throw error('Keep the post within 500 characters.');
  if(!['public','unlisted','private'].includes(input.visibility))throw error('Choose a supported post visibility.');
  const due=Date.parse(input.dueAt);if(!Number.isFinite(due)||due<this.now()+5000||due>this.now()+30*86400000)throw error('Choose a time from five seconds to thirty days in the future.');
  if(this.options.workspaceExpiresAt&&due>=Date.parse(this.options.workspaceExpiresAt))throw error('Choose a send time before this private workspace expires.');
  if(!Array.isArray(input.assetIds)||input.assetIds.length>4||new Set(input.assetIds).size!==input.assetIds.length)throw error('Choose up to four distinct images, or one video or audio file.');
  const assets:PublicationAsset[]=input.assetIds.map(assetId=>{const asset=this.store.getAsset(id(assetId));if(!asset||asset.projectId!==projectId)throw error('A selected asset is not in this project.',403);if(!['image','video','audio'].includes(asset.kind)||!['image/png','image/jpeg','image/webp','image/gif','video/mp4','video/webm','audio/mpeg','audio/ogg','audio/wav'].includes(asset.mimeType))throw error('Choose PNG, JPEG, WebP, GIF, MP4, WebM, MP3, OGG or WAV media.');const alt=String(input.altText?.[asset.id]??'').trim();if(alt.length>1500)throw error('Alt text must be at most 1,500 characters.');return{assetId:asset.id,sha256:asset.sha256,name:asset.name,mimeType:asset.mimeType,size:asset.size,alt};});
  if(!assets.length&&!caption)throw error('Add media or a caption.');
  if(assets.some(a=>a.mimeType.startsWith('video/')||a.mimeType.startsWith('audio/'))&&assets.length!==1)throw error('Video and audio posts use one attachment.');
  if(assets.reduce((sum,a)=>sum+a.size,0)>40*1024*1024)throw error('Keep the selected media under 40 MiB. Create a smaller delivery rendition first.');
  const base={projectId,connectionId:connection.id,destination:connection.account+' @ '+new URL(connection.origin).hostname,caption,visibility:input.visibility,dueAt:new Date(due).toISOString(),assets};
  const fingerprint=digest({...base,accountId:connection.accountId,origin:connection.origin}),operationKey='publication-draft:'+projectId+':'+requestId;
  const prior=this.store.getOperationReceipt<{publicationId:string}>(operationKey);if(prior){if(prior.fingerprint!==fingerprint)throw error('This draft identity has different content.',409);return this.get(projectId,prior.result.publicationId);}
  if(this.list(projectId).length>=200)throw error('This project has reached its 200-publication record limit.',429);
  const value:Publication={...base,id:randomUUID(),state:'draft',fingerprint,createdAt:this.stamp(),updatedAt:this.stamp()};
  this.store.transaction(()=>{this.save(value);this.store.putOperationReceipt({key:operationKey,fingerprint,result:{publicationId:value.id},createdAt:value.createdAt});});return value;
 }
 approve(projectId:string,publicationId:string,fingerprint:string,actor:string,confirmed:boolean){
  const value=this.get(projectId,publicationId);if(value.state!=='draft')throw error('Only a draft can be approved.',409);
  if(confirmed!==true||fingerprint!==value.fingerprint)throw error('Review and approve this exact draft before scheduling.',409);
  this.connection(projectId,value.connectionId);if(Date.parse(value.dueAt)<this.now())throw error('This time has passed. Prepare a new draft with a future time.',409);
  value.state='scheduled';value.approvedAt=this.stamp();value.approvedBy=actor.slice(0,100);return this.save(value);
 }
 cancel(projectId:string,publicationId:string){const value=this.get(projectId,publicationId);if(!['draft','scheduled','failed'].includes(value.state))throw error('This publication cannot be cancelled now. Check the destination for an uncertain send.',409);value.state='cancelled';return this.save(value);}
 start(){if(this.timer)return;this.stopping=false;this.timer=setInterval(()=>{void this.tick();},10000);this.timer.unref();void this.tick();}
 async stop(){this.stopping=true;if(this.timer)clearInterval(this.timer);this.timer=undefined;await this.pending;}
 tick():Promise<void>{if(this.pending)return this.pending;this.pending=this.advance().finally(()=>{this.pending=undefined;});return this.pending;}
 private async advance(){
  if(this.stopping)return;
  const job=this.store.listScopedRecords<Publication>(PUBLICATION).map(row=>row.data).filter(value=>value.state==='scheduled'&&Date.parse(value.dueAt)<=this.now()).sort((a,b)=>a.dueAt.localeCompare(b.dueAt))[0];
  if(!job)return;
  try{
   if(this.options.available&&!this.options.available())throw error('Workspace session expired. Reopen a workspace and schedule again.',409);
   if(this.now()-Date.parse(job.dueAt)>15*60000)throw error('The scheduled time was missed by more than fifteen minutes. Review and schedule a new draft.',409);
   const connection=this.connection(job.projectId,job.connectionId),token=this.unseal(connection);
   if(!job.approvedAt)throw error('This publication has no approval.',409);
   job.state='sending';job.stage='media';this.save(job);
   for(const snapshot of job.assets){const asset=this.store.getAsset(snapshot.assetId);if(!asset||asset.projectId!==job.projectId||asset.sha256!==snapshot.sha256)throw error('A source asset changed after approval. Prepare a new draft.',409);}
   job.uploaded??=[];
   const pending=job.assets.find(asset=>!job.uploaded!.some(upload=>upload.assetId===asset.assetId));
   if(pending){
     const asset=this.store.getAsset(pending.assetId)!,bytes=await this.media.read(asset);if(createHash('sha256').update(bytes).digest('hex')!==pending.sha256)throw error('Source media failed its integrity check.',409);
     const result=await this.adapter.upload(connection.origin,token,{bytes,name:asset.name,mimeType:asset.mimeType,alt:pending.alt});job.uploaded.push({assetId:asset.id,remoteId:result.id,ready:result.ready});job.state='scheduled';this.save(job);return;
   }
   const processing=job.uploaded.find(upload=>!upload.ready);
   if(processing){processing.ready=await this.adapter.mediaReady(connection.origin,token,processing.remoteId);job.state='scheduled';this.save(job);return;}
   if(this.stopping){job.state='scheduled';this.save(job);return;}
   job.stage='post';this.save(job);
   const receipt=await this.adapter.post(connection.origin,token,{caption:job.caption,visibility:job.visibility,mediaIds:job.uploaded.map(item=>item.remoteId),idempotencyKey:job.id});
   job.state='published';job.remoteId=receipt.id;job.remoteUrl=receipt.url;job.publishedAt=this.stamp();delete job.error;this.save(job);
  }catch(e){job.state=job.stage==='post'&&(!(e instanceof PublishingError)||e.uncertain)?'uncertain':'failed';job.error=e instanceof PublishingError?e.message:job.state==='uncertain'?'A publishing receipt was not received. Check the destination before creating another post.':'Publishing could not complete. Check the connection and selected media, then create a new draft.';this.save(job);}
 }
 managementRouter(){
  const router=Router();router.use(express.json({limit:'32kb'}));
  router.use('/projects/:id/publishing',(req,_res,next)=>{try{requireProjectAccess(this.store,req,String(req.params.id),'share');if(accessFor(req)?.kind==='scoped-token')throw error('Manage publishing from the studio.',403);next();}catch(e){next(e);}});
  router.get('/projects/:id/publishing', (req,res)=>res.json({connections:this.connections(String(req.params.id)),publications:this.list(String(req.params.id)),providers:['mastodon'],requiresComfyCredits:false}));
  router.post('/projects/:id/publishing/connections',async(req,res)=>{const result=await this.connect(String(req.params.id),req.body);req.body={};res.status(201).json(result);});
  router.delete('/projects/:id/publishing/connections/:connectionId',(req,res)=>{this.disconnect(String(req.params.id),String(req.params.connectionId));res.status(204).end();});
  router.post('/projects/:id/publishing/drafts',(req,res)=>res.status(201).json(this.draft(String(req.params.id),req.body)));
  router.post('/projects/:id/publishing/:publicationId/approve',(req,res)=>res.json(this.approve(String(req.params.id),String(req.params.publicationId),req.body?.fingerprint,accessFor(req)!.subjectId,req.body?.confirmed)));
  router.post('/projects/:id/publishing/:publicationId/cancel',(req,res)=>res.json(this.cancel(String(req.params.id),String(req.params.publicationId))));
  return router;
 }
}
