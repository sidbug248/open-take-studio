import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import AdmZip from 'adm-zip';
import { createStore } from '../server/store.ts';
import { LocalFileStorage, identifyMedia } from '../server/media.ts';
import { exportProject, importProject } from '../server/project-routes.ts';
import type { Job, Project, Take } from '../shared/types.ts';

const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jLXsAAAAASUVORK5CYII=','base64');
async function fixture(){const base=path.resolve('data','test-fixtures');await mkdir(base,{recursive:true});const dir=await mkdtemp(path.join(base,'storage-'));const store=createStore(dir);const media=new LocalFileStorage(dir);const now=new Date().toISOString();const project:Project={id:randomUUID(),name:'Continuity test',description:'',createdAt:now,updatedAt:now};store.upsertProject(project);return{dir,store,media,project,now};}
test('SQLite persists jobs and idempotency identities across reopening',async()=>{
  const f=await fixture();try{
    const take:Take={id:randomUUID(),projectId:f.project.id,name:'Draft',kind:'image',inputAssetIds:{},assetIds:[],modelId:'bfl/flux-3-image',provider:'bfl',prompt:'A lighthouse',settings:{},status:'IN_QUEUE',provenance:'generated',favorite:false,createdAt:f.now,updatedAt:f.now,changes:[]};
    const job:Job={id:randomUUID(),projectId:f.project.id,takeId:take.id,modelId:take.modelId,provider:'bfl',requestId:'router-execution-1',idempotencyKey:randomUUID(),inputs:{prompt:take.prompt},state:'IN_QUEUE',attempts:1,createdAt:f.now,updatedAt:f.now};take.jobId=job.id;f.store.saveTakeAndJob(take,job);f.store.close();
    const recovered=createStore(f.dir);assert.equal(recovered.getJobByIdempotencyKey(job.idempotencyKey)?.requestId,'router-execution-1');assert.equal(recovered.listRunnableJobs().length,1);assert.throws(()=>recovered.upsertJob({...job,idempotencyKey:randomUUID()}),/preserve its idempotency/);const orphan={...take,id:randomUUID()};assert.throws(()=>recovered.saveTakeAndJob(orphan,{...job,id:randomUUID(),takeId:orphan.id}),/already belongs/);assert.equal(recovered.getTake(orphan.id),undefined);recovered.patchJob(job.id,{state:'FAILED',errorType:'content_policy_violation'});assert.equal(recovered.getTake(take.id)?.status,'FAILED');assert.equal(recovered.listRunnableJobs().length,0);recovered.close();
  }finally{await rm(f.dir,{recursive:true,force:true});}
});

test('worker scheduling filters route, due time, archive and active IDs in SQLite before reading history',async()=>{
  const f=await fixture();let reopened:ReturnType<typeof createStore>|undefined;try{
    const timestamp='2026-11-03T09:00:00.000Z';
    const add=(index:number,state:Job['state'],route?:Job['executionRoute'],nextPollAt?:string)=>{const job:Job={id:`scheduled-${index}`,takeId:`take-${index}`,projectId:f.project.id,modelId:'fixture',provider:'fixture',idempotencyKey:`schedule-${index}`,inputs:state==='COMPLETED'?{historicalInlineMedia:'x'.repeat(1024*1024)}:{},state,executionRoute:route,nextPollAt,attempts:0,createdAt:new Date(Date.parse(timestamp)+index).toISOString(),updatedAt:timestamp};f.store.upsertJob(job);return job;};
    for(let i=0;i<10;i++)add(i,'COMPLETED');
    const earliest=add(11,'IN_QUEUE'),future=add(12,'RETRY_WAIT','router','2026-11-04T00:00:00.000Z'),native=add(13,'IN_PROGRESS','comfy-workflow'),archived=add(14,'PENDING'),later=add(15,'COLLECTING','router','2026-11-03T08:00:00.000Z');f.store.archiveJob(archived.id);
    f.store.close();reopened=createStore(f.dir);reopened.listJobs=()=>{throw new Error('Worker scheduling must not load historical job bodies');};
    assert.deepEqual(reopened.listRunnableJobs({executionRoute:'router',dueAt:timestamp}).map(j=>j.id),[earliest.id,later.id]);
    assert.deepEqual(reopened.listRunnableJobs({executionRoute:'router',dueAt:timestamp,excludeIds:[earliest.id],limit:1}).map(j=>j.id),[later.id]);
    assert.deepEqual(reopened.listRunnableJobs({executionRoute:'comfy-workflow',dueAt:timestamp,limit:2}).map(j=>j.id),[native.id]);
    assert.ok(reopened.listRunnableJobs().some(j=>j.id===future.id));
    reopened.patchJob(earliest.id,{state:'COMPLETED'});assert.deepEqual(reopened.listRunnableJobs({executionRoute:'router',dueAt:timestamp}).map(j=>j.id),[later.id]);
    const plan=reopened.db.prepare("EXPLAIN QUERY PLAN SELECT data FROM jobs WHERE json_extract(data,'$.state')='IN_QUEUE'").all();assert.match(JSON.stringify(plan),/jobs_runnable_state_route/);
  }finally{reopened?.close();await rm(f.dir,{recursive:true,force:true});}
});
test('project package roundtrip preserves bytes and remaps production relationships without resuming history',async()=>{
  const f=await fixture();try{
    const asset=await f.media.put({projectId:f.project.id,name:'Lighthouse.png',mimeType:'image/png',bytes:png,provenance:'generated'});f.store.upsertAsset(asset);
    const parent:Take={id:randomUUID(),projectId:f.project.id,name:'First frame',kind:'image',inputAssetIds:{},assetIds:[asset.id],modelId:'bfl/flux-3-image',provider:'bfl',prompt:'A lighthouse',settings:{resolution:'768sq'},status:'COMPLETED',provenance:'generated',favorite:true,createdAt:f.now,updatedAt:f.now,changes:[]};f.store.upsertTake(parent);
    const child:Take={...parent,id:randomUUID(),parentTakeId:parent.id,sourceAssetId:asset.id,inputAssetIds:{first_frame:asset.id},assetIds:[],name:'Animate',kind:'video',modelId:'minimax/minimax-h3',provider:'minimax',status:'IN_PROGRESS'};
    const job:Job={id:randomUUID(),projectId:f.project.id,takeId:child.id,modelId:child.modelId,provider:child.provider,requestId:'preserved-router-id',idempotencyKey:randomUUID(),inputs:{content:[]},state:'IN_PROGRESS',attempts:1,createdAt:f.now,updatedAt:f.now};child.jobId=job.id;f.store.saveTakeAndJob(child,job);f.store.upsertProject({...f.project,selectedTakeId:parent.id,coverAssetId:asset.id});
    // Some SDK failures explicitly carry a null diagnostic ID; preserve that old history.
    f.store.patchJob(job.id,{diagnosticRequestId:null});
    const bytes=await exportProject(f.store,f.media,f.project.id);const imported=await importProject(f.store,f.media,bytes);assert.notEqual(imported.id,f.project.id);const detail=f.store.projectDetail(imported.id)!;assert.equal(detail.assets.length,1);assert.deepEqual(await f.media.read(detail.assets[0]!),png);assert.notEqual(detail.assets[0]!.id,asset.id);const importedChild=detail.takes.find(t=>t.name==='Animate')!;const importedParent=detail.takes.find(t=>t.name==='First frame')!;assert.equal(importedChild.parentTakeId,importedParent.id);assert.equal(importedChild.sourceAssetId,detail.assets[0]!.id);assert.equal(importedChild.inputAssetIds.first_frame,detail.assets[0]!.id);assert.equal(imported.selectedTakeId,importedParent.id);assert.equal(detail.jobs[0]!.requestId,'preserved-router-id');assert.equal(detail.jobs[0]!.diagnosticRequestId,null);assert.ok(f.store.isArchivedJob(detail.jobs[0]!.id));assert.ok(!f.store.listRunnableJobs().some(j=>j.projectId===imported.id));assert.equal(importedParent.provenance,'imported');
  }finally{f.store.close();await rm(f.dir,{recursive:true,force:true});}
});
test('package rejects tampered assets and unreferenced secret paths before creating projects',async()=>{
  const f=await fixture();try{
    const asset=await f.media.put({projectId:f.project.id,name:'frame.png',mimeType:'image/png',bytes:png,provenance:'imported'});f.store.upsertAsset(asset);const bytes=await exportProject(f.store,f.media,f.project.id);
    const tampered=new AdmZip(bytes);tampered.updateFile(`media/${asset.fileName}`,Buffer.from('bad'));await assert.rejects(importProject(f.store,f.media,tampered.toBuffer()),/integrity/);
    const extra=new AdmZip(bytes);extra.addFile('.env',Buffer.from('untrusted'));await assert.rejects(importProject(f.store,f.media,extra.toBuffer()),/Unexpected package path/);assert.equal(f.store.listProjects().length,1);
  }finally{f.store.close();await rm(f.dir,{recursive:true,force:true});}
});
test('media protects managed paths and rejects active markup disguised as images',async()=>{
  const f=await fixture();try{
    assert.throws(()=>f.media.path({fileName:'../../.env'}),/Invalid/);assert.throws(()=>identifyMedia(Buffer.from('<svg onload="alert(1)"/>'),'image/png'),/Unsupported/);assert.throws(()=>identifyMedia(Buffer.from('<html>hi</html>'),'text/plain'),/Active/);await assert.rejects(f.media.put({projectId:f.project.id,name:'Bad.png',mimeType:'image/png',bytes:png,provenance:'imported',id:'../outside'}),/Invalid asset ID/);
    const asset=await f.media.put({projectId:f.project.id,name:'manual.vtt',mimeType:'text/vtt',bytes:Buffer.from('WEBVTT\n\n00:00.000 --> 00:01.000\nhello\n'),provenance:'local-edit'});assert.equal(asset.kind,'document');assert.equal(asset.provenance,'local-edit');
  }finally{f.store.close();await rm(f.dir,{recursive:true,force:true});}
});
