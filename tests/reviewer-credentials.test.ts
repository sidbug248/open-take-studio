import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,rm,readFile} from 'node:fs/promises';
import {randomBytes,createHash} from 'node:crypto';
import {Worker} from 'node:worker_threads';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {ReviewerCredentials} from '../server/reviewer-credentials.ts';
import {CredentialUnavailableError,resumeCredentialJobs,type CredentialSource} from '../server/credential-source.ts';
import {createRouterPort} from '../server/router-port.ts';
import {createWorkflowPort} from '../server/workflow-port.ts';
import {createStore} from '../server/store.ts';
import {LocalFileStorage} from '../server/media.ts';
import {GenerationWorker} from '../server/worker.ts';
import type {Job,Take} from '../shared/types.ts';

async function fixture(t:test.TestContext){await mkdir('data/test-fixtures',{recursive:true});const dir=await mkdtemp(path.resolve('data/test-fixtures/reviewer-vault-'));t.after(()=>rm(dir,{recursive:true,force:true,maxRetries:5,retryDelay:100}));return dir;}
const alpha='fixture-reviewer-alpha-key-000000',beta='fixture-reviewer-beta-key-111111';
test('encrypted reviewer vault survives restart, isolates sessions, expires keys, and reconnects only the original credential',async t=>{
  const dir=await fixture(t),encryption=randomBytes(32).toString('base64url');let now=Date.now();let vault=new ReviewerCredentials(dir,encryption,{now:()=>now,probe:async()=> 'verified'});
  const a=vault.createSession(),b=vault.createSession();await vault.connect(a.id,alpha);await vault.connect(b.id,beta);const scope=vault.resolve(a.id).id;
  assert.equal(vault.resolve(b.id).apiKey,beta);assert.notEqual(vault.resolve(b.id).id,scope);assert.equal(vault.identify(a.token)?.id,a.id);assert.equal(vault.identify('forged'),undefined);assert.equal(vault.listSessions().length,2);
  const raw=new DatabaseSync(path.join(dir,'reviewer-vault.sqlite'),{readOnly:true});const serialized=JSON.stringify(raw.prepare('SELECT * FROM reviewer_sessions').all());raw.close();assert.ok(!serialized.includes(alpha)&&!serialized.includes(beta)&&!serialized.includes(a.token));
  vault.close();vault=new ReviewerCredentials(dir,encryption,{now:()=>now,probe:async()=> 'verified'});assert.equal(vault.resolve(a.id).apiKey,alpha);assert.equal(vault.resolve(a.id).id,scope);
  const lease=vault.resolve(a.id).signal!;vault.disconnect(a.id);assert.equal(lease.aborted,true);assert.throws(()=>vault.resolve(a.id),CredentialUnavailableError);await assert.rejects(vault.connect(a.id,beta),/original Comfy key/);
  await vault.connect(a.id,alpha);assert.equal(vault.resolve(a.id).id,scope);now+=12*3600_000+1;assert.equal(vault.status(a.id).state,'expired');assert.throws(()=>vault.resolve(a.id),CredentialUnavailableError);
  await vault.connect(a.id,alpha);assert.equal(vault.resolve(a.id).id,scope);vault.close();assert.ok(!(await readFile(path.join(dir,'reviewer-vault.sqlite'))).includes(Buffer.from(alpha)));
});
test('disconnect invalidates an in-flight key connection before any encrypted key can be stored',async t=>{
  const dir=await fixture(t);let done!:()=>void;const pending=new Promise<void>(resolve=>{done=resolve;});const vault=new ReviewerCredentials(dir,randomBytes(32).toString('base64url'),{probe:async()=>{await pending;return'verified';}});const session=vault.createSession();const connection=vault.connect(session.id,alpha);vault.disconnect(session.id);done();await assert.rejects(connection,/canceled/);assert.equal(vault.status(session.id).connected,false);vault.close();
});
test('concurrent Router ports use immutable scoped keys, bounded concurrency, and redact provider errors/results',async()=>{
  const ownerBefore=process.env.COMFY_API_KEY;let active=0,maxActive=0;const seen:{key:string;identity:unknown}[]=[];
  const source=(key:string):CredentialSource=>({available:()=>true,resolve:()=>({apiKey:key,id:key===alpha?'scope-a':'scope-b'})});
  const execute=async(credential:any,_operation:any,args:unknown[])=>{active++;maxActive=Math.max(maxActive,active);seen.push({key:credential.apiKey,identity:args[2]});await new Promise(resolve=>setTimeout(resolve,8));active--;return{requestId:String(args[2]),detail:credential.apiKey};};
  const a=createRouterPort(source(alpha),{execute}),b=createRouterPort(source(beta),{execute});const calls=Array.from({length:12},(_,i)=>(i%2?a:b).submit('provider/model',{},'identity-'+i));const result=await Promise.all(calls);
  assert.equal(maxActive,4);assert.equal(seen.length,12);assert.equal(process.env.COMFY_API_KEY,ownerBefore);for(let i=0;i<result.length;i++){assert.equal(result[i].requestId,'identity-'+i);assert.ok(!JSON.stringify(result[i]).includes(alpha)&&!JSON.stringify(result[i]).includes(beta));}
  const failed=createRouterPort(source(alpha),{execute:async()=>{throw Object.assign(new Error('Remote echoed '+alpha),{errorType:'invalid_input',cause:{secret:alpha}});}});await assert.rejects(failed.submit('provider/model',{},'error'),error=>!JSON.stringify(error).includes(alpha)&&!(error as Error).message.includes(alpha)&&(error as any).errorType==='invalid_input');
});
test('native node discovery caches remain scoped to the explicit Comfy credential',async()=>{
  const requests:string[]=[];const fetchImpl=(async(_input:unknown,init?:RequestInit)=>{const auth=new Headers(init?.headers).get('Authorization')!;requests.push(auth);await new Promise(resolve=>setTimeout(resolve,5));return Response.json({Loader:{input:{required:{}},label:auth}});}) as typeof fetch;
  const source=(apiKey:string):CredentialSource=>({available:()=>true,resolve:()=>({apiKey,id:apiKey===alpha?'native-a':'native-b'})});const a=createWorkflowPort(source(alpha),{fetchImpl}),b=createWorkflowPort(source(beta),{fetchImpl});
  await Promise.all([a.nodeInfo(),b.nodeInfo()]);await Promise.all([a.nodeInfo(),b.nodeInfo()]);assert.deepEqual(requests.sort(),['Bearer '+alpha,'Bearer '+beta].sort());assert.ok(!JSON.stringify(await a.nodeInfo()).includes(alpha));
});
test('real SDK Router requests run in concurrent isolated workers with distinct bearer headers and no inherited server secrets',async()=>{
  const call=(apiKey:string)=>new Promise<any>((resolve,reject)=>{const worker=new Worker(new URL('./fixtures/router-credential-isolate.mjs',import.meta.url),{workerData:{apiKey,operation:'submit',args:['provider/model',{prompt:'mock only'},'stable-intention']},env:{},execArgv:[]});worker.once('message',message=>{void worker.terminate();message.ok?resolve(message.value):reject(new Error(message.error.message));});worker.once('error',reject);});
  const [a,b]=await Promise.all([call(alpha),call(beta)]);assert.equal(a.requestId,'mock-'+createHash('sha256').update(alpha).digest('hex').slice(0,12));assert.equal(b.requestId,'mock-'+createHash('sha256').update(beta).digest('hex').slice(0,12));assert.notEqual(a.requestId,b.requestId);
});
test('real native SDK clients carry separate bearer keys and share a four-operation limit',async()=>{
  let active=0,maximum=0;const seen:string[]=[];
  const fetchImpl=(async(input:unknown,init?:RequestInit)=>{const auth=new Headers(init?.headers).get('Authorization')!;seen.push(auth);active++;maximum=Math.max(maximum,active);await new Promise(resolve=>setTimeout(resolve,10));active--;const id=String(input).split('/').at(-1);return Response.json({id,status:'queued',created_at:new Date().toISOString(),started_at:null,completed_at:null,expires_at:new Date(Date.now()+86400_000).toISOString(),queue_position:1,progress:null,outputs:[],error:null,urls:{self:'/api/v2/jobs/'+id,events:'/api/v2/jobs/'+id+'/events',cancel:'/api/v2/jobs/'+id+'/cancel'}});}) as typeof fetch;
  const source=(apiKey:string):CredentialSource=>({available:()=>true,resolve:()=>({apiKey,id:apiKey===alpha?'native-a':'native-b'})});const a=createWorkflowPort(source(alpha),{fetchImpl}),b=createWorkflowPort(source(beta),{fetchImpl});
  const jobs=await Promise.all(Array.from({length:12},(_,i)=>(i%2?a:b).get('job-'+i)));assert.equal(maximum,4);assert.equal(seen.filter(header=>header==='Bearer '+alpha).length,6);assert.equal(seen.filter(header=>header==='Bearer '+beta).length,6);assert.deepEqual(jobs.map(job=>job.id),Array.from({length:12},(_,i)=>'job-'+i));
});
test('disconnect suspends before admission; reconnect preserves request ID and idempotency while wrong scope stays blocked',async t=>{
  const dir=await fixture(t),store=createStore(dir),media=new LocalFileStorage(dir),now=new Date().toISOString();try{store.upsertProject({id:'p',name:'Isolated',description:'',createdAt:now,updatedAt:now});
  const take:Take={id:'t',projectId:'p',name:'Take',kind:'image',inputAssetIds:{},assetIds:[],modelId:'bfl/flux-3-image',provider:'bfl',prompt:'Fixture',settings:{},status:'PENDING',provenance:'generated',favorite:false,createdAt:now,updatedAt:now,jobId:'j',changes:[]};
  const job:Job={id:'j',projectId:'p',takeId:'t',modelId:take.modelId,provider:'bfl',idempotencyKey:'immutable-intention',inputs:{prompt:'Fixture'},state:'PENDING',attempts:0,createdAt:now,updatedAt:now};store.saveTakeAndJob(take,job);
  let connected=false,scope='scope-a',submissions=0,polls=0;const source:CredentialSource={available:()=>connected,resolve:()=>{if(!connected)throw new CredentialUnavailableError();return{apiKey:alpha,id:scope};}};
  const port=createRouterPort(source,{execute:async(_credential,operation,args)=>{if(operation==='submit'){submissions++;assert.equal(args[2],job.idempotencyKey);return{requestId:'existing-router-id'};}polls++;return{status:'IN_QUEUE',queuePosition:1,errorType:null,retryAfterMs:1000};}});
  const worker=new GenerationWorker(store,media,port,{keyConfigured:()=>connected,credentialSource:source});await worker.process('j');assert.equal(store.getJob('j')!.attempts,0);assert.equal(store.getJob('j')!.state,'BLOCKED');assert.equal(submissions,0);
  connected=true;assert.equal(resumeCredentialJobs(store,source),1);await worker.process('j');assert.equal(submissions,1);connected=false;await worker.process('j');assert.equal(store.getJob('j')!.requestId,'existing-router-id');assert.equal(store.getJob('j')!.idempotencyKey,job.idempotencyKey);assert.equal(store.getJob('j')!.attempts,1);
  connected=true;scope='scope-b';assert.equal(resumeCredentialJobs(store,source),0);scope='scope-a';assert.equal(resumeCredentialJobs(store,source),1);await worker.process('j');assert.equal(polls,1);assert.equal(submissions,1);assert.equal(store.getJob('j')!.requestId,'existing-router-id');}finally{store.close();}
});
