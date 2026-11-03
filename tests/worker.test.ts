import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { createStore } from '../server/store.ts';
import { LocalFileStorage } from '../server/media.ts';
import { GenerationWorker } from '../server/worker.ts';
import type { RouterPort } from '../server/router-port.ts';
import type { Job, Take } from '../shared/types.ts';
import { recordedChanges } from '../server/generation-routes.ts';
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jx1sAAAAASUVORK5CYII=','base64');
async function fixture(t:test.TestContext){await mkdir('data/test-fixtures',{recursive:true});const dir=await mkdtemp(path.resolve('data/test-fixtures/worker-'));let store=createStore(dir);const media=new LocalFileStorage(dir);const now=new Date().toISOString();store.upsertProject({id:'p',name:'Test',description:'',createdAt:now,updatedAt:now});const take:Take={id:'t',projectId:'p',name:'Take',kind:'image',inputAssetIds:{},assetIds:[],modelId:'bfl/flux-3-image',provider:'bfl',prompt:'a teapot',settings:{},status:'PENDING',provenance:'generated',favorite:false,createdAt:now,updatedAt:now,jobId:'j',changes:[]};const job:Job={id:'j',takeId:'t',projectId:'p',modelId:take.modelId,provider:'bfl',idempotencyKey:randomUUID(),inputs:{prompt:take.prompt},state:'PENDING',attempts:0,createdAt:now,updatedAt:now};store.saveTakeAndJob(take,job);t.after(async()=>{store.close();await rm(dir,{recursive:true,force:true});});return {get store(){return store;},media,job,take,reopen(){store.close();store=createStore(dir);return store;}};}
const completed=()=>Promise.resolve({status:'COMPLETED',queuePosition:0,errorType:null,retryAfterMs:1000});
const result=()=>Promise.resolve({kind:'json' as const,data:{result:{sample:'https://provider.example/result.png'}}});
test('lost admission reply reuses one idempotency identity, then restart collects durable media without another submit',async t=>{
  const f=await fixture(t);const keys:string[]=[];let submissions=0;
  const router:RouterPort={submit:async(_m,_i,key)=>{keys.push(key);if(++submissions===1)throw new Error('connection lost after server acceptance');return {requestId:'router-original'};},status:completed,result,cancel:async()=>({})};
  let worker=new GenerationWorker(f.store,f.media,router,{keyConfigured:()=>true,download:async()=>({bytes:png,mimeType:'image/png'})});
  await worker.process('j');assert.equal(f.store.getJob('j')!.state,'RETRY_WAIT');
  await worker.process('j');assert.equal(f.store.getJob('j')!.requestId,'router-original');assert.deepEqual(keys,[f.job.idempotencyKey,f.job.idempotencyKey]);
  worker=new GenerationWorker(f.reopen(),f.media,router,{keyConfigured:()=>true,download:async()=>({bytes:png,mimeType:'image/png'})});
  await worker.process('j');assert.equal(submissions,2);assert.equal(f.store.getJob('j')!.state,'COMPLETED');
  const asset=f.store.getAsset(f.store.getTake('t')!.assetIds[0])!;assert.deepEqual(await f.media.read(asset),png);assert.equal(asset.metadata.requestId,'router-original');
  f.reopen();assert.equal(f.store.projectDetail('p')!.project.selectedTakeId,'t');assert.equal(f.store.listRunnableJobs().length,0);
});
test('COMPLETED with error is FAILED and never collects media',async t=>{
 const f=await fixture(t);f.store.patchJob('j',{requestId:'request',state:'IN_PROGRESS'});let reads=0;const router:RouterPort={submit:async()=>{throw new Error('unexpected');},status:async()=>({status:'COMPLETED',errorType:'content_policy_violation',queuePosition:0,retryAfterMs:null}),result:async()=>{reads++;return {kind:'json',data:{}};},cancel:async()=>({})};
 await new GenerationWorker(f.store,f.media,router,{keyConfigured:()=>true}).process('j');assert.equal(reads,0);assert.equal(f.store.getTake('t')!.status,'FAILED');assert.equal(f.store.getJob('j')!.errorType,'content_policy_violation');
});
test('insufficient credits blocks automatic retries; explicit retry preserves identity',async t=>{
 const f=await fixture(t);let count=0;const router:RouterPort={submit:async()=>{count++;throw Object.assign(new Error('Workspace has insufficient credits'),{errorType:'insufficient_credits',status:402});},status:completed,result,cancel:async()=>({})};const worker=new GenerationWorker(f.store,f.media,router,{keyConfigured:()=>true});await worker.tick();await worker.tick();assert.equal(count,1);assert.equal(f.store.getJob('j')!.state,'BLOCKED');assert.equal(worker.retry('j').idempotencyKey,f.job.idempotencyKey);await worker.tick();assert.equal(count,2);
});
test('Retry-After schedule survives restart and suppresses premature polling',async t=>{
 const f=await fixture(t);let time=Date.now();let polls=0;f.store.patchJob('j',{requestId:'request',state:'IN_QUEUE'});const router:RouterPort={submit:async()=>{throw new Error('unexpected');},status:async()=>{polls++;return {status:'IN_QUEUE',queuePosition:4,errorType:null,retryAfterMs:120000};},result,cancel:async()=>({})};let worker=new GenerationWorker(f.store,f.media,router,{keyConfigured:()=>true,now:()=>time});await worker.tick();assert.equal(f.store.getJob('j')!.queuePosition,4);worker=new GenerationWorker(f.reopen(),f.media,router,{keyConfigured:()=>true,now:()=>time});time+=119999;await worker.tick();assert.equal(polls,1);time++;await worker.tick();assert.equal(polls,2);
});
test('partial collection recovery reuses saved outputs and imported jobs never execute',async t=>{
 const f=await fixture(t);f.store.patchJob('j',{requestId:'request',state:'COLLECTING'});let downloads=0;const asset=await f.media.put({projectId:'p',name:'existing',mimeType:'image/png',bytes:png,provenance:'generated',metadata:{jobId:'j',outputIndex:0}});f.store.upsertAsset(asset);const worker=new GenerationWorker(f.store,f.media,{submit:async()=>{throw new Error('unexpected');},status:completed,result,cancel:async()=>({})},{keyConfigured:()=>true,download:async()=>{downloads++;return {bytes:png,mimeType:'image/png'};}});await worker.process('j');assert.equal(downloads,0);assert.deepEqual(f.store.getTake('t')!.assetIds,[asset.id]);f.store.patchJob('j',{state:'IN_QUEUE'});f.store.archiveJob('j');await worker.tick();assert.equal(f.store.getJob('j')!.state,'IN_QUEUE');assert.throws(()=>worker.retry('j'),/Imported/);
});
test('sync-only audio uses durable identity and stores returned bytes',async t=>{
 const f=await fixture(t);f.store.upsertTake({...f.take,kind:'audio',modelId:'elevenlabs/eleven_sfx_v2',provider:'elevenlabs'});f.store.upsertJob({...f.job,modelId:'elevenlabs/eleven_sfx_v2',provider:'elevenlabs',delivery:'sync'});let key='';const bytes=Buffer.concat([Buffer.from('ID3'),Buffer.alloc(40)]);const worker=new GenerationWorker(f.store,f.media,{submit:async()=>{throw new Error('must not queue binary');},run:async(_m,_i,k)=>{key=k;return {kind:'binary',data:bytes,contentType:'audio/mpeg'};},status:completed,result,cancel:async()=>({})},{keyConfigured:()=>true});await worker.process('j');assert.equal(key,f.job.idempotencyKey);assert.equal(f.store.getJob('j')!.state,'COMPLETED');assert.equal(f.store.listAssets('p')[0].kind,'audio');assert.deepEqual(await f.media.read(f.store.listAssets('p')[0]),bytes);
});
test('branch change records preserve the source and compare supported settings',async t=>{const f=await fixture(t);const parent={...f.take,sourceAssetId:'source',settings:{resolution:'1k'}};assert.deepEqual(recordedChanges(parent,{...parent,prompt:'new direction',settings:{resolution:'2k'}}).map(c=>c.field),['prompt','settings.resolution']);});
