import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,rm} from 'node:fs/promises';
import path from 'node:path';
import {randomBytes} from 'node:crypto';
import type {AddressInfo} from 'node:net';
import express from 'express';
import AdmZip from 'adm-zip';
import {ReviewerCredentials} from '../server/reviewer-credentials.ts';
import {CredentialUnavailableError,type CredentialSource} from '../server/credential-source.ts';
import {createStudioRuntime,type StudioRuntimeOptions} from '../server/studio-runtime.ts';
import {createReviewerSystem} from '../server/reviewer-system.ts';
import {readRuntimeConfig} from '../server/runtime-config.ts';
import {AuthSessions,createAuthRouter,hashOwnerPassword} from '../server/auth-session.ts';
import {securityBoundary} from '../server/runtime-security.ts';
import {safeMessage} from '../server/config.ts';
import {hostedInput} from '../server/hosted-input-cache.ts';
import {LocalFileStorage} from '../server/media.ts';
import type {HostedMediaReference} from '../server/media-transport.ts';
import type {RouterPort} from '../server/router-port.ts';
import type {WorkflowPort,WorkflowSnapshot} from '../server/workflow-port.ts';
import type {WorkflowGraph} from '../shared/workflow-types.ts';
import type {Asset,Job,Project,ProjectDetail} from '../shared/types.ts';

const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jx1sAAAAASUVORK5CYII=','base64');
const keyA='reviewer-A-private-fixture-123456',keyB='reviewer-B-private-fixture-123456',emptyKey='reviewer-no-credit-fixture-123456';
const noRemote=async():Promise<never>=>{throw new Error('Unexpected real remote operation');};
const native:WorkflowPort={validate:noRemote,upload:noRemote,submit:noRemote,get:noRemote,download:noRemote,executedGraph:noRemote,cancel:noRemote};
const origin='https://reviewer.example.test';
const fixtureHeaders={'X-Fixture-Host':'reviewer.example.test','X-Forwarded-Proto':'https',Origin:origin};

async function fixture(t:test.TestContext,withNative=false){
  await mkdir('data/test-fixtures',{recursive:true});const dir=await mkdtemp(path.resolve('data/test-fixtures/reviewer-isolation-'));
  let time=Date.now();const encryptionKey=randomBytes(32).toString('base64url');
  const probe=async(key:string)=>{if(key==='invalid-private-fixture-123456')throw Object.assign(new Error('Comfy rejected this key.'),{status:400});return key===emptyKey?'insufficient_credits' as const:'verified' as const;};
  let vault=new ReviewerCredentials(path.join(dir,'vault'),encryptionKey,{now:()=>time,probe});
  const settings=readRuntimeConfig({OTS_MODE:'hosted',OTS_DATA_DIR:dir,OTS_PUBLIC_ORIGIN:origin,OTS_OWNER_PASSWORD_HASH:await hashOwnerPassword('only a fixture password'),OTS_PERSISTENT_STORAGE_CONFIRMED:'true'},process.cwd());
  const calls:Array<{operation:string;key:string;identity:string}>=[];
  const nativeGraphs=new Map<string,WorkflowGraph>();
  const makeNative=(source:CredentialSource):WorkflowPort=>{const record=(operation:string,identity:string)=>{const credential=source.resolve();calls.push({operation,key:credential.apiKey,identity});return credential;};const snapshot=(id:string,status:string):WorkflowSnapshot=>({id,status,outputs:status==='succeeded'?[{id:'output-image',nodeId:'4',name:'Native fixture.png',contentType:'image/png',sizeBytes:png.length,type:'image'}]:[]});return{
    validate:async()=>{record('native-validate','graph');return{checkedAt:new Date().toISOString(),target:'comfy-cloud',valid:true,issues:[],nodes:[]};},
    upload:async()=>{const credential=record('native-upload','source');return'uploaded-'+credential.id;},
    submit:async(graph,key)=>{record('native-submit',key);const id='native-'+key;nativeGraphs.set(id,structuredClone(graph));return snapshot(id,'queued');},
    get:async id=>{record('native-poll',id);return snapshot(id,'succeeded');},
    download:async(id)=>{record('native-download',id);return png;},
    executedGraph:async id=>{record('native-graph',id);return{format:'api',graph:nativeGraphs.get(id)};},cancel:noRemote,
  };};
  const makePort=(source:CredentialSource):RouterPort=>({
    submit:async(_model,_inputs,id)=>{const key=source.resolve().apiKey;calls.push({operation:'submit',key,identity:id});if(key===emptyKey)throw Object.assign(new Error('Insufficient credits'),{errorType:'insufficient_credits',status:402});return{requestId:'request-'+id};},
    status:async(_model,id)=>{calls.push({operation:'status',key:source.resolve().apiKey,identity:id});return{status:'COMPLETED',queuePosition:0,errorType:null,retryAfterMs:1000};},
    result:async(_model,id)=>{calls.push({operation:'result',key:source.resolve().apiKey,identity:id});return{kind:'binary',data:png,contentType:'image/png'};},cancel:async()=>({}),
  });
  const makeRuntime=(options:StudioRuntimeOptions)=>{const runtime=createStudioRuntime({...options,routerPort:makePort(options.credentials!),workflowPort:withNative?makeNative(options.credentials!):native,startWorkers:false});runtime.start=()=>{};runtime.worker.tick=async()=>{};runtime.workflowWorker.tick=async()=>{};return runtime;};
  const ownerSource:CredentialSource={available:()=>false,resolve:()=>{throw new Error('OWNER KEY MUST NOT BE USED');}};
  let owner=createStudioRuntime({dataDir:path.join(dir,'owner'),settings,credentials:ownerSource,routerPort:makePort(ownerSource),workflowPort:native,startWorkers:false});
  let system=createReviewerSystem({vault,owner,settings,runtimeFactory:makeRuntime});
  let server:ReturnType<ReturnType<typeof express>['listen']>,url='';
  async function listen(){const app=express();app.set('trust proxy',1);app.use((req,_res,next)=>{req.headers.host=String(req.headers['x-fixture-host']??req.headers.host);next();});app.use(securityBoundary(settings));const sessions=new AuthSessions(owner.store,settings);app.use(sessions.identify());app.use(system.identify);app.use(system.router);app.use(createAuthRouter(sessions));app.use(system.dispatch);app.use(sessions.gate());app.use(owner.router);app.use(((error:Error&{status?:number},_req,res,_next)=>res.status(error.status??500).json({error:safeMessage(error)})) as express.ErrorRequestHandler);server=app.listen(0,'127.0.0.1');await new Promise<void>(resolve=>server.once('listening',resolve));url=`http://127.0.0.1:${(server.address() as AddressInfo).port}`;}
  await listen();
  async function close(){await new Promise<void>(resolve=>server.close(()=>resolve()));await system.close();await owner.close();vault.close();}
  t.after(async()=>{await close();await rm(dir,{recursive:true,force:true});});
  const request=(cookie:string,route:string,method='GET',body?:unknown)=>fetch(url+route,{method,headers:{...fixtureHeaders,...(cookie?{Cookie:cookie}:{}),...(body===undefined?{}:{'Content-Type':'application/json'})},...(body===undefined?{}:{body:JSON.stringify(body)}),redirect:'manual'});
  async function json<T>(cookie:string,route:string,method='GET',body?:unknown){const response=await request(cookie,route,method,body);assert.ok(response.ok,`${method} ${route}: ${response.status} ${await response.clone().text()}`);return response.json() as Promise<T>;}
  async function session(){const response=await request('','/auth/reviewer','POST',{});assert.ok([200,303].includes(response.status));const raw=response.headers.getSetCookie().find(cookie=>cookie.startsWith('__Host-ots_reviewer='));assert.ok(raw);assert.match(raw,/HttpOnly/);assert.match(raw,/Secure/);assert.match(raw,/SameSite=Lax/);const cookie=raw.split(';')[0],id=vault.identify(cookie.split('=')[1])!.id;return{cookie,id};}
  return{dir,calls,request,json,session,get owner(){return owner;},get vault(){return vault;},runtime:(id:string)=>system.getRuntime(id),advance:(ms:number)=>{time+=ms;},async restart(){await close();vault=new ReviewerCredentials(path.join(dir,'vault'),encryptionKey,{now:()=>time,probe});owner=createStudioRuntime({dataDir:path.join(dir,'owner'),settings,credentials:ownerSource,routerPort:makePort(ownerSource),workflowPort:native,startWorkers:false});system=createReviewerSystem({vault,owner,settings,runtimeFactory:makeRuntime});await listen();}};
}

test('two reviewer sessions isolate owner/peer projects, media, packages and request identities',async t=>{
  const f=await fixture(t),now=new Date().toISOString();f.owner.store.upsertProject({id:'private-owner-project',name:'Owner confidential',description:'',createdAt:now,updatedAt:now});const ownerAsset=await f.owner.media.put({projectId:'private-owner-project',name:'Owner image',bytes:png,mimeType:'image/png',provenance:'imported',metadata:{}});f.owner.store.upsertAsset(ownerAsset);
  const [a,b]=await Promise.all([f.session(),f.session()]);assert.notEqual(a.id,b.id);
  await Promise.all([f.json(a.cookie,'/api/reviewer/connect','POST',{apiKey:keyA}),f.json(b.cookie,'/api/reviewer/connect','POST',{apiKey:keyB})]);
  const [pa,pb]=await Promise.all([f.json<Project>(a.cookie,'/api/projects','POST',{name:'Reviewer A',description:''}),f.json<Project>(b.cookie,'/api/projects','POST',{name:'Reviewer B',description:''})]);
  const resume=await f.request(a.cookie,'/auth/reviewer','POST',{});assert.ok([200,303].includes(resume.status));assert.equal(f.vault.listSessions().length,2,'Ordinary reviewer entry must resume the existing workspace');
  assert.equal((await f.request(a.cookie,`/api/projects/${pa.id}`,'PATCH',{description:keyA})).status,400,'A connected key must never be persisted as creative JSON');
  for(const [cookie,foreign]of[[a.cookie,pb.id],[b.cookie,pa.id],[a.cookie,'private-owner-project'],[b.cookie,'private-owner-project']])for(const suffix of['','/export'])assert.equal((await f.request(cookie,`/api/projects/${foreign}${suffix}`)).status,404);
  for(const cookie of[a.cookie,b.cookie])for(const route of[ownerAsset.url,`/api/assets/${ownerAsset.id}/poster`,`/api/display/${ownerAsset.id}/poster`,`/api/runtime/backup`])assert.ok([403,404].includes((await f.request(cookie,route)).status),route);
  const generate=(cookie:string,projectId:string)=>f.json<{job:Job}>(cookie,'/api/generate','POST',{projectId,clientRequestId:'same-client-intention',modelId:'bfl/flux-3-image',prompt:'An original studio fixture',settings:{},inputAssetIds:{}});
  const [ja,jb]=await Promise.all([generate(a.cookie,pa.id),generate(b.cookie,pb.id)]);assert.notEqual(ja.job.idempotencyKey,jb.job.idempotencyKey);
  const [ra,rb]=await Promise.all([f.runtime(a.id),f.runtime(b.id)]);await Promise.all([ra.worker.process(ja.job.id),rb.worker.process(jb.job.id)]);await Promise.all([ra.worker.process(ja.job.id),rb.worker.process(jb.job.id)]);
  assert.deepEqual(new Set(f.calls.filter(c=>c.operation==='submit').map(c=>c.key)),new Set([keyA,keyB]));assert.equal((await generate(a.cookie,pa.id)).job.id,ja.job.id);assert.equal(f.calls.filter(c=>c.operation==='submit').length,2);
  const da=await f.json<ProjectDetail>(a.cookie,`/api/projects/${pa.id}`),db=await f.json<ProjectDetail>(b.cookie,`/api/projects/${pb.id}`);assert.equal(da.jobs[0].state,'COMPLETED');assert.equal(db.jobs[0].state,'COMPLETED');
  assert.equal((await f.request(b.cookie,da.assets[0].url)).status,404);assert.equal((await f.request(a.cookie,db.assets[0].url)).status,404);
  const zip=new AdmZip(Buffer.from(await(await f.request(a.cookie,`/api/projects/${pa.id}/export`)).arrayBuffer()));for(const entry of zip.getEntries())if(!entry.isDirectory){const bytes=entry.getData();for(const secret of[keyA,keyB,a.cookie,b.cookie])assert.equal(bytes.includes(Buffer.from(secret)),false);}
  assert.equal(f.owner.store.listProjects().length,1);assert.equal(f.owner.store.listAssets('private-owner-project').length,1);
  const logout=await f.request(a.cookie,'/auth/logout','POST');assert.equal(logout.status,303);assert.equal(f.vault.status(a.id).connected,false,'Reviewer logout must disconnect its credential');assert.ok(logout.headers.getSetCookie().some(value=>value.startsWith('__Host-ots_reviewer=;')));
});

test('missing/invalid keys fail closed; disconnect, expiry and restart preserve one accepted request under its original key',async t=>{
  const f=await fixture(t),a=await f.session(),p=await f.json<Project>(a.cookie,'/api/projects','POST',{name:'Recovery',description:''});
  const body={projectId:p.id,clientRequestId:'recovery-intention',modelId:'bfl/flux-3-image',prompt:'Recovery fixture',settings:{},inputAssetIds:{}};
  assert.ok([400,401,409].includes((await f.request(a.cookie,'/api/generate','POST',body)).status));assert.equal(f.calls.length,0);
  for(const action of['validate','run','import-execution'])assert.ok([400,401,409].includes((await f.request(a.cookie,`/api/workflows/unavailable-fixture/${action}`,'POST',{})).status),'Native remote admission must reject a missing reviewer credential before remote calls');
  assert.equal((await f.request('','/api/reviewer/connect','POST',{apiKey:keyA})).status,401);
  assert.equal((await f.request(a.cookie,'/api/reviewer/connect','POST',{apiKey:'invalid-private-fixture-123456'})).status,400);assert.equal(f.calls.length,0);
  await f.json(a.cookie,'/api/reviewer/connect','POST',{apiKey:keyA});assert.equal((await f.request(a.cookie,'/api/generate','POST',{...body,prompt:keyA})).status,400);const admitted=await f.json<{job:Job}>(a.cookie,'/api/generate','POST',body);let runtime=await f.runtime(a.id);await runtime.worker.process(admitted.job.id);const queued=runtime.store.getJob(admitted.job.id)!;assert.ok(queued.requestId);assert.equal(queued.attempts,1);
  await f.json(a.cookie,'/api/reviewer/connect','DELETE');await runtime.worker.process(queued.id);assert.equal(runtime.store.getJob(queued.id)!.state,'BLOCKED');assert.equal(f.calls.filter(c=>c.operation==='submit').length,1);
  assert.equal((await f.request(a.cookie,'/api/reviewer/connect','POST',{apiKey:keyB})).status,409);
  await f.restart();assert.equal((await f.json<ProjectDetail>(a.cookie,`/api/projects/${p.id}`)).jobs[0].requestId,queued.requestId);assert.equal(f.calls.length,1);
  await f.json(a.cookie,'/api/reviewer/connect','POST',{apiKey:keyA});runtime=await f.runtime(a.id);await runtime.worker.process(queued.id);assert.equal(runtime.store.getJob(queued.id)!.state,'COMPLETED');assert.equal(f.calls.filter(c=>c.operation==='submit').length,1);assert.ok(f.calls.every(c=>c.key===keyA));
  f.advance(12*3600_000+1);assert.equal(f.vault.status(a.id).state,'expired');assert.throws(()=>f.vault.resolve(a.id),CredentialUnavailableError);assert.ok([400,401,409].includes((await f.request(a.cookie,'/api/generate','POST',{...body,clientRequestId:'post-expiry-intention'})).status));
});

test('a no-credit reviewer records one blocked attempt without automatic resubmission or owner fallback',async t=>{
  const f=await fixture(t),a=await f.session();await f.json(a.cookie,'/api/reviewer/connect','POST',{apiKey:emptyKey});const p=await f.json<Project>(a.cookie,'/api/projects','POST',{name:'No credits',description:''}),runtime=await f.runtime(a.id);
  const response=await f.request(a.cookie,'/api/generate','POST',{projectId:p.id,clientRequestId:'no-credit-intention',modelId:'bfl/flux-3-image',prompt:'No-credit fixture',settings:{},inputAssetIds:{}});
  if(response.status===402){assert.equal(f.calls.length,0);return;}
  assert.equal(response.status,202);const {job}=await response.json() as {job:Job};await runtime.worker.process(job.id);await runtime.worker.tick();await runtime.worker.tick();assert.equal(runtime.store.getJob(job.id)!.state,'BLOCKED');assert.equal(runtime.store.getJob(job.id)!.errorType,'insufficient_credits');assert.equal(f.calls.length,1);assert.equal(f.calls[0].key,emptyKey);
});

test('native workflow upload, submit and recovery use the same isolated reviewer credential without replay',async t=>{
  const f=await fixture(t,true),definition=JSON.parse(await readFile('workflows/native/02-image-finish.studio.json','utf8'));
  const [a,b]=await Promise.all([f.session(),f.session()]);await Promise.all([f.json(a.cookie,'/api/reviewer/connect','POST',{apiKey:keyA}),f.json(b.cookie,'/api/reviewer/connect','POST',{apiKey:keyB})]);
  const records=await Promise.all([a,b].map(async session=>{const project=await f.json<Project>(session.cookie,'/api/projects','POST',{name:'Native '+session.id,description:''}),runtime=await f.runtime(session.id),input=await runtime.media.put({projectId:project.id,name:'Native source',bytes:png,mimeType:'image/png',provenance:'imported'});runtime.store.upsertAsset(input);const version=await f.json<{asset:Asset}>(session.cookie,`/api/projects/${project.id}/workflows`,'POST',definition),body={values:{image:{assetId:input.id},width:512,height:512,sharpen:.25},clientRequestId:'native-reviewer-once'},admission=await f.json<{job:Job}>(session.cookie,`/api/workflows/${version.asset.id}/run`,'POST',body);await runtime.workflowWorker.process(admission.job.id);return{...session,project,version,body,job:runtime.store.getJob(admission.job.id)!};}));
  for(const record of records){assert.equal(record.job.attempts,1);assert.equal(record.job.state,'IN_QUEUE');assert.ok(record.job.requestId);const peer=records.find(value=>value.id!==record.id)!;assert.equal((await f.request(peer.cookie,`/api/workflow-jobs/${record.job.id}/cancel`,'POST',{})).status,404);}
  assert.deepEqual(new Set(f.calls.filter(c=>c.operation==='native-submit').map(c=>c.key)),new Set([keyA,keyB]));
  await f.json(a.cookie,'/api/reviewer/connect','DELETE');await(await f.runtime(a.id)).workflowWorker.process(records[0].job.id);await f.restart();await f.json(a.cookie,'/api/reviewer/connect','POST',{apiKey:keyA});
  for(const record of records){const runtime=await f.runtime(record.id);await runtime.workflowWorker.process(record.job.id);const completed=runtime.store.getJob(record.job.id)!;assert.equal(completed.state,'COMPLETED');assert.equal(completed.requestId,record.job.requestId);assert.equal(completed.attempts,1);const replay=await f.json<{job:Job}>(record.cookie,`/api/workflows/${record.version.asset.id}/run`,'POST',record.body);assert.equal(replay.job.id,record.job.id);const output=runtime.store.listAssets(record.project.id).find(asset=>asset.metadata.operation==='comfy-workflow-output')!;assert.deepEqual(await runtime.media.read(output),png);}
  assert.equal(f.calls.filter(c=>c.operation==='native-submit').length,2);assert.equal(f.calls.filter(c=>c.operation==='native-upload').length,2);assert.equal(f.calls.filter(c=>c.operation==='submit').length,0,'Native jobs must not enter the Router worker');
});

test('temporary media uploads and in-flight cache entries are credential and storage scoped',async t=>{
  await mkdir('data/test-fixtures',{recursive:true});const dir=await mkdtemp(path.resolve('data/test-fixtures/reviewer-hosted-'));t.after(()=>rm(dir,{recursive:true,force:true}));
  const media=new LocalFileStorage(dir),asset=await media.put({projectId:'p',name:'Same bytes',mimeType:'image/png',bytes:png,provenance:'imported',metadata:{}});let connected=true;
  const source=(id:string,key:string):CredentialSource=>({available:()=>connected,resolve:()=>{if(!connected)throw new CredentialUnavailableError();return{id,apiKey:key};}});
  const calls:string[]=[];const upload=async(value:Asset,_bytes:Uint8Array,options?:{credentialSource?:CredentialSource}):Promise<HostedMediaReference>=>{const key=options!.credentialSource!.resolve().apiKey;calls.push(key);await new Promise(resolve=>setTimeout(resolve,20));return{host:'comfy-cloud',sourceAssetId:value.id,sourceSha256:value.sha256,hostedSha256:value.sha256,contentType:value.mimeType,sizeBytes:value.size,assetId:'cloud-'+calls.length,url:'https://example.test/'+key,urlExpiresAt:new Date(Date.now()+6*3600_000).toISOString(),assetExpiresAt:new Date(Date.now()+24*3600_000).toISOString(),uploadedAt:new Date().toISOString(),verifiedAt:new Date().toISOString()};};
  const [a,b]=await Promise.all([hostedInput(asset,media,dir,{credentialSource:source('scope-a',keyA),upload}),hostedInput(asset,media,dir,{credentialSource:source('scope-b',keyB),upload})]);assert.notEqual(a.url,b.url);assert.deepEqual(new Set(calls),new Set([keyA,keyB]));
  await hostedInput(asset,media,dir,{credentialSource:source('scope-a',keyA),upload});assert.equal(calls.length,2);connected=false;await assert.rejects(hostedInput(asset,media,dir,{credentialSource:source('scope-a',keyA),upload}),CredentialUnavailableError);assert.equal(calls.length,2);
});
