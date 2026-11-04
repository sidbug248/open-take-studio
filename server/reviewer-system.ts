import express,{Router,type RequestHandler} from 'express';
import path from 'node:path';
import {statfs} from 'node:fs/promises';
import {accessFor,setAccess} from './auth-access.ts';
import {ReviewerCredentials} from './reviewer-credentials.ts';
import {createStudioRuntime,type StudioRuntime} from './studio-runtime.ts';
import {resumeCredentialJobs} from './credential-source.ts';
import {createProductionDelivery} from './http-delivery.ts';
import {listReviewerExamples,remixReviewerExampleWithMapping,resolveReviewerExampleMedia,REVIEWER_EXAMPLE_IDS} from './reviewer-showcase.ts';
import {ReviewerDiscovery} from './reviewer-discovery.ts';
import {MODEL_REGISTRY} from './model-registry.ts';
import {clientAddress} from './request-origin.ts';
import {hasPendingPublications} from './publishing.ts';
import type {RuntimeConfig} from './runtime-config.ts';

const cookieName='__Host-ots_reviewer',cookieOptions={secure:true,httpOnly:true,sameSite:'lax' as const,path:'/'};
const cookieToken=(raw:string|undefined)=>(raw??'').split(';').map(s=>s.trim()).find(s=>s.startsWith(cookieName+'='))?.slice(cookieName.length+1);
export function createReviewerSystem(options:{vault:ReviewerCredentials;owner:StudioRuntime;settings:RuntimeConfig;runtimeFactory?:typeof createStudioRuntime;distDir?:string}){
  const {vault,owner,settings}=options,router=Router(),runtimes=new Map<string,StudioRuntime>(),deliveries=new Map<string,ReturnType<typeof createProductionDelivery>>();
  const discovery=new ReviewerDiscovery(owner);
  const publicDelivery=options.distDir?createProductionDelivery(options.distDir,discovery):undefined;
  const factory=options.runtimeFactory??createStudioRuntime,attempts=new Map<string,{count:number;until:number}>(),connectAttempts=new Map<string,{count:number;until:number}>();let activeWrites=0;
  function getRuntime(id:string){vault.status(id);let runtime=runtimes.get(id);if(!runtime){runtime=factory({dataDir:path.join(settings.dataDir,'reviewers',id),settings:{...settings,maxActiveJobs:3,maxGenerationPerHour:20,maxConcurrentWrites:1},credentials:vault.source(id),workspaceId:id,workspaceExpiresAt:vault.status(id).expiresAt,publishingAvailable:()=>{try{vault.status(id);return true;}catch{return false;}},startWorkers:true});runtimes.set(id,runtime);}return runtime;}
  const identify:RequestHandler=(req,_res,next)=>{if(!accessFor(req)){const session=vault.identify(cookieToken(req.headers.cookie));if(session)setAccess(req,{kind:'reviewer',subjectId:session.id,workspaceId:session.id,permissions:['read','write','generate','share']});}next();};
  const reviewer:RequestHandler=(req,res,next)=>{if(accessFor(req)?.kind!=='reviewer'){res.status(401).json({error:'Enter a reviewer session first.'});return;}res.setHeader('Cache-Control','no-store');next();};
  function status(id:string){const state=vault.status(id);return{ok:true,version:'0.2.0',sdkVersion:'0.5.0',mode:'hosted',accessMode:'reviewer',workspaceId:id,keyConfigured:state.connected,sessionExpiresAt:state.expiresAt,credential:{state:state.connected?(state.verification==='insufficient_credits'?'insufficient_credits':'connected'):state.state==='expired'?'expired':state.lastErrorCode==='invalid_credentials'?'invalid':state.lastErrorCode==='permission_denied'?'permission_denied':'missing',connected:state.connected,expiresAt:state.credentialExpiresAt,message:state.connected?'Generation uses your connected Comfy workspace credits.':'Connect your own Comfy API key to generate. Saved media remains available.'}};}
  const visitorStatus=()=>({ok:true,version:'0.2.0',sdkVersion:'0.5.0',mode:'hosted',accessMode:'visitor',keyConfigured:false,credential:{state:'missing',connected:false,message:'Browse saved examples freely. Start a private workspace when you are ready to create.'}});
  function issueSession(req:express.Request,res:express.Response){
    const now=Date.now(),ip=clientAddress(req);
    for(const[k,v]of attempts)if(v.until<=now)attempts.delete(k);
    const bucket=attempts.get(ip)??{count:0,until:now+3600000};
    if(bucket.count>=8||vault.listSessions().length>=64||attempts.size>=5000){
      const retryAfterSeconds=bucket.count>=8?Math.max(1,Math.ceil((bucket.until-now)/1000)):3600;
      res.status(429).setHeader('Retry-After',String(retryAfterSeconds));res.json({error:'Private workspace capacity is currently full. You can keep browsing and retry when a workspace is available.',code:'reviewer_capacity',retryAfterSeconds});return;
    }
    bucket.count++;attempts.set(ip,bucket);
    const session=vault.createSession();
    res.cookie(cookieName,session.token,{...cookieOptions,maxAge:7*86400_000});
    res.setHeader('Cache-Control','private, no-store');
    setAccess(req,{kind:'reviewer',subjectId:session.id,workspaceId:session.id,permissions:['read','write','generate','share']});
    return session;
  }
  // Keep the mount compatible, but browsing never reserves a workspace or cookie.
  const arrive:RequestHandler=(_req,_res,next)=>next();
  const begin:RequestHandler=(req,res)=>{
    const prior=vault.identify(cookieToken(req.headers.cookie));
    if(req.path==='/auth/reviewer'&&prior){res.clearCookie('__Host-ots_session',cookieOptions);res.redirect(303,'/');return;}
    const session=issueSession(req,res);if(!session)return;
    if(prior)vault.disconnect(prior.id);
    res.clearCookie('__Host-ots_session',cookieOptions);
    if(req.is('application/json'))res.json(status(session.id));else res.redirect(303,'/');
  };
  router.post('/api/reviewer/session',(req,res)=>{
    const access=accessFor(req);
    if(access?.kind==='reviewer'){res.setHeader('Cache-Control','private, no-store');res.json(status(access.subjectId));return;}
    if(access){res.status(409).json({error:'Your current signed-in workspace is already available.',code:'workspace_already_available'});return;}
    const session=issueSession(req,res);if(session)res.status(201).json(status(session.id));
  });
  router.post('/auth/reviewer',begin);
  router.post('/api/reviewer/session/new',reviewer,begin);
  router.get('/api/studio/status',(req,res,next)=>{const access=accessFor(req);if(access&&access.kind!=='reviewer'){next();return;}res.setHeader('Cache-Control','no-store');res.json(access?status(access.subjectId):visitorStatus());});
  router.get('/api/projects',(req,res,next)=>{if(accessFor(req)){next();return;}res.setHeader('Cache-Control','private, no-store');res.json([]);});
  router.get('/api/models',browse,(_req,res)=>res.json({models:MODEL_REGISTRY}));
  router.post('/api/reviewer/connect',reviewer,express.json({limit:'8kb'}),async(req,res)=>{const id=accessFor(req)!.subjectId;try{const now=Date.now(),bucket=connectAttempts.get(id)??{count:0,until:now+60000};if(bucket.until<=now){bucket.count=0;bucket.until=now+60000;}if(bucket.count>=8){res.status(429).setHeader('Retry-After','60');res.json({error:'Too many connection attempts. Try again in one minute.'});return;}bucket.count++;connectAttempts.set(id,bucket);const key=req.body?.apiKey;req.body={};await vault.connect(id,key);const runtime=getRuntime(id);resumeCredentialJobs(runtime.store,vault.source(id));res.json(status(id));}catch(error){const e=error as Error&{status?:number;code?:string};res.status(e.status??503).json({error:e.message,code:e.code});}});
  router.delete('/api/reviewer/connect',reviewer,(req,res)=>{const id=accessFor(req)!.subjectId;vault.disconnect(id);res.json(status(id));});
  router.post('/auth/logout',(req,res,next)=>{if(accessFor(req)?.kind!=='reviewer'){next();return;}vault.disconnect(accessFor(req)!.subjectId);res.clearCookie(cookieName,cookieOptions);res.redirect(303,'/login');});
  router.get('/api/explore/bootstrap',browse,async(_req,res)=>res.json(await discovery.bootstrap()));
  router.get('/api/explore/cards',browse,async(req,res)=>res.json(await discovery.page(String(req.query.section??'all'),String(req.query.cursor??''))));
  router.get('/api/explore/recipes',browse,async(_req,res)=>res.json(await discovery.recipes()));
  router.get('/api/catalogue',browse,async(req,res)=>res.json(await discovery.catalogue(req.query)));
  router.get('/api/assets/:id/display',browse,async(req,res,next)=>{const value=await discovery.display(String(req.params.id));if(!value){next();return;}res.json(value);});
  router.get('/api/explore/cards/:id',browse,async(req,res)=>{const value=await discovery.card(String(req.params.id));if(!value){res.status(404).json({error:'Example not found.'});return;}res.json(value);});
  function browse(req:express.Request,res:express.Response,next:express.NextFunction){const access=accessFor(req);if(access&&access.kind!=='reviewer'){next('route');return;}res.setHeader('Cache-Control','private, no-store');next();}
  router.get('/api/reviewer/examples',async(_req,res)=>{res.setHeader('Cache-Control','private, no-store');res.json({examples:await listReviewerExamples(owner)});});
  router.get('/api/reviewer/examples/:id/media/:assetId',async(req,res)=>{const result=await resolveReviewerExampleMedia(owner,String(req.params.id),String(req.params.assetId),String(req.query.variant??'original'));if(!result){res.status(404).json({error:'Example media not found.'});return;}res.setHeader('Cache-Control','private, max-age=60');res.type(result.mimeType).sendFile(result.path);});
  router.post('/api/reviewer/examples/:id/remix',reviewer,async(req,res)=>{if(activeWrites>=2){res.status(429).json({error:'Another studio operation is finishing. Try again shortly.'});return;}activeWrites++;try{const runtime=getRuntime(accessFor(req)!.subjectId);if(runtime.store.listProjects().length>=20)throw Object.assign(new Error('Export your work before starting another reviewer session. This workspace holds at most 20 projects.'),{status:429});const exampleId=String(req.params.id);if(!(REVIEWER_EXAMPLE_IDS as readonly string[]).includes(exampleId))throw Object.assign(new Error('Curated example not found.'),{status:404});const owned=runtime.store.listProjects().flatMap(p=>runtime.store.listAssets(p.id)).reduce((n,a)=>n+a.size,0),incoming=owner.store.listAssets(exampleId).reduce((n,a)=>n+a.size,0),disk=await statfs(settings.dataDir);if(owned+incoming>512*1024*1024)throw Object.assign(new Error('This example would exceed the reviewer media quota. Export before starting another session.'),{status:507});if(disk.bavail*disk.bsize-incoming<settings.minFreeDiskBytes)throw Object.assign(new Error('Persistent storage is nearly full. This copy cannot be admitted.'),{status:507});const result=await remixReviewerExampleWithMapping(owner,runtime,exampleId);res.status(201).json(result);}finally{activeWrites--;}});
  const dispatch:RequestHandler=(req,res,next)=>{const access=accessFor(req);if(!access){if(req.path==='/api'||req.path.startsWith('/api/')){res.status(401).json({error:'Start a private workspace to edit or access saved work.',code:'reviewer_session_required'});return;}if(publicDelivery&&['GET','HEAD'].includes(req.method)){publicDelivery(req,res,error=>{if(error)next(error);else res.status(404).end();});return;}next();return;}if(access.kind!=='reviewer'){next();return;}try{const id=accessFor(req)!.subjectId,runtime=getRuntime(id),write=!['GET','HEAD','OPTIONS'].includes(req.method);if(write){if(activeWrites>=2){res.status(429).setHeader('Retry-After','3');res.json({error:'The studio is finishing other work. Try again shortly.'});return;}const size=runtime.store.listProjects().flatMap(p=>runtime.store.listAssets(p.id)).reduce((n,a)=>n+a.size,0);if(size+Number(req.headers['content-length']??0)>512*1024*1024){res.status(507).json({error:'Reviewer workspace storage limit reached. Export your production before starting a new session.'});return;}if(Number(req.headers['content-length']??0)>64*1024*1024){res.status(413).json({error:'Reviewer uploads are limited to 64 MiB per request.'});return;}if(req.path==='/api/projects'&&req.method==='POST'&&runtime.store.listProjects().length>=20){res.status(429).json({error:'Reviewer workspaces support 20 projects. Export before starting another session.'});return;}let uploaded=0;const meter=(chunk:Buffer)=>{uploaded+=chunk.length;if(uploaded>Math.min(64*1024*1024,512*1024*1024-size)&&!res.headersSent){res.status(413).json({error:'Reviewer uploads are limited to 64 MiB per request.'});res.once('finish',()=>req.destroy());}};const arm=(event:string)=>{if(event==='data'){req.removeListener('newListener',arm);req.on('data',meter);}};req.on('newListener',arm);res.once('finish',()=>{req.removeListener('newListener',arm);req.removeListener('data',meter);});activeWrites++;let released=false;const release=()=>{if(!released){released=true;activeWrites--;}};res.once('finish',release);res.once('close',release);}
      runtime.router(req,res,error=>{if(error){next(error);return;}if(options.distDir){let delivery=deliveries.get(id);if(!delivery){delivery=createProductionDelivery(options.distDir,discovery);deliveries.set(id,delivery);}delivery(req,res,error=>{if(error)next(error);else res.status(404).json({error:'Page not found.'});});}else res.status(404).json({error:'Page not found.'});});
    }catch(error){next(error);}};
  // Recover accepted requests immediately after restart, even before the browser returns.
  for(const session of vault.listSessions())if(vault.status(session.id).connected||hasPendingPublications(path.join(settings.dataDir,'reviewers',session.id)))getRuntime(session.id);
  const expiry=setInterval(()=>vault.expire(),60000);expiry.unref();
  return{router,identify,arrive,dispatch,getRuntime,async close(){clearInterval(expiry);await Promise.all([...runtimes.values()].map(runtime=>runtime.close()));}};
}
