import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,rm,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {Store} from '../server/store.ts';
import {LocalFileStorage} from '../server/media.ts';
import {createWorkspaceBackup,restoreEmptyWorkspace} from '../server/runtime-backup.ts';
import {GenerationWorker} from '../server/worker.ts';
import type {Job,Take} from '../shared/types.ts';
import type {RouterPort} from '../server/router-port.ts';
const now=new Date().toISOString();
test('consistent full-workspace backup restores original IDs, media hashes, jobs and scoped records without overwriting a populated destination',async()=>{
 const base=path.resolve('data/test-fixtures');await mkdir(base,{recursive:true});const dir=await mkdtemp(path.join(base,'backup-')),source=new Store(path.join(dir,'source')),target=new Store(path.join(dir,'target')),media=new LocalFileStorage(source.dataDir),pid=randomUUID();
 try{source.upsertProject({id:pid,name:'Actual preserved project',description:'',createdAt:now,updatedAt:now});const asset=await media.put({projectId:pid,name:'source.txt',mimeType:'text/plain',bytes:Buffer.from('Managed source media bytes'),provenance:'imported'});source.upsertAsset(asset);
 const take:Take={id:randomUUID(),projectId:pid,name:'saved take',kind:'document',modelId:'test/model',provider:'test',prompt:'Exact original prompt',settings:{seed:7},inputAssetIds:{},assetIds:[asset.id],status:'COMPLETED',provenance:'generated',favorite:false,createdAt:now,updatedAt:now,changes:[]};const job:Job={id:randomUUID(),projectId:pid,takeId:take.id,modelId:take.modelId,provider:'test',requestId:'real-retained-request',idempotencyKey:'exact-original-identity',inputs:{prompt:take.prompt},state:'COMPLETED',attempts:1,createdAt:now,updatedAt:now};source.saveTakeAndJob({...take,jobId:job.id},job);source.upsertScopedRecord({id:'review-draft',projectId:pid,kind:'draft',data:{assetId:asset.id},createdAt:now,updatedAt:now});
 const backupRoot=path.join(dir,'backups'),manifest=await createWorkspaceBackup(source,backupRoot),folder=path.join(backupRoot,manifest.id);assert.equal(manifest.counts.jobs,1);await restoreEmptyWorkspace(target,folder,manifest);assert.deepEqual(target.getJob(job.id),job);assert.equal(target.getAsset(asset.id)!.sha256,asset.sha256);assert.deepEqual(await new LocalFileStorage(target.dataDir).read(target.getAsset(asset.id)!),await media.read(asset));assert.deepEqual(target.getScopedRecord('draft','review-draft')!.data,{assetId:asset.id});await assert.rejects(restoreEmptyWorkspace(target,folder,manifest),/empty studio/);
 const empty=new Store(path.join(dir,'empty'));try{await writeFile(path.join(folder,'media',asset.fileName),'tampered');await assert.rejects(restoreEmptyWorkspace(empty,folder,manifest),/hash or size/);assert.equal(empty.listProjects().length,0);}finally{empty.close();}
 }finally{source.close();target.close();await rm(dir,{recursive:true,force:true});}
});
test('worker drain waits for an in-flight response, blocks new polls, and preserves the durable request identity',async()=>{
 const base=path.resolve('data/test-fixtures');await mkdir(base,{recursive:true});const dir=await mkdtemp(path.join(base,'drain-')),store=new Store(dir),pid=randomUUID(),tid=randomUUID(),jid=randomUUID();
 try{store.upsertProject({id:pid,name:'drain',description:'',createdAt:now,updatedAt:now});const take:Take={id:tid,projectId:pid,name:'take',kind:'image',modelId:'test/model',provider:'test',prompt:'',settings:{},inputAssetIds:{},assetIds:[],status:'IN_PROGRESS',provenance:'generated',favorite:false,createdAt:now,updatedAt:now,changes:[]};store.saveTakeAndJob(take,{id:jid,projectId:pid,takeId:tid,modelId:'test/model',provider:'test',requestId:'retained',idempotencyKey:'retained-idempotency',inputs:{},state:'IN_PROGRESS',attempts:1,createdAt:now,updatedAt:now});
 let finish!:()=>void,calls=0;const port={status:async()=>{calls++;await new Promise<void>(resolve=>{finish=resolve;});return{status:'IN_PROGRESS'};}} as unknown as RouterPort;const worker=new GenerationWorker(store,new LocalFileStorage(dir),port,{keyConfigured:()=>true});const running=worker.process(jid);let drained=false;const draining=worker.drain(1000).then(result=>{drained=result;});await new Promise(resolve=>setTimeout(resolve,30));assert.equal(drained,false);await worker.tick();assert.equal(calls,1);finish();await running;await draining;assert.equal(drained,true);assert.equal(store.getJob(jid)!.requestId,'retained');assert.equal(store.getJob(jid)!.idempotencyKey,'retained-idempotency');
 }finally{store.close();await rm(dir,{recursive:true,force:true});}
});
