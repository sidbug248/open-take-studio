import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, rm, readFile } from 'node:fs/promises';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import express from 'express';
import sharp from 'sharp';
import AdmZip from 'adm-zip';
import { createStore } from '../server/store.ts';
import { LocalFileStorage } from '../server/media.ts';
import { createWorkflowRouter } from '../server/workflow-routes.ts';
import { WorkflowWorker } from '../server/workflow-worker.ts';
import { createProjectRouter, exportProject, importProject } from '../server/project-routes.ts';
import { GenerationWorker } from '../server/worker.ts';
import { makeWorkflowVersion, validateWorkflowGraph } from '../server/workflow-schema.ts';
import { validateAgainstNodeInfo, type WorkflowPort, type WorkflowSnapshot } from '../server/workflow-port.ts';
import type { WorkflowGraph } from '../shared/workflow-types.ts';
import type { Job, Project, Take, Asset } from '../shared/types.ts';

async function fixture(){
  await mkdir('data/test-fixtures',{recursive:true});const dir=await mkdtemp(path.resolve('data/test-fixtures/native-'));let store=createStore(dir);const media=new LocalFileStorage(dir),png=await sharp({create:{width:256,height:256,channels:3,background:'#62529e'}}).png().toBuffer();
  const timestamp=new Date().toISOString(),project:Project={id:randomUUID(),name:'Native test',description:'',createdAt:timestamp,updatedAt:timestamp};store.upsertProject(project);
  let submissions=0,uploads=0,polls=0,downloads=0,mode:'success'|'ambiguous'|'credits'='success',failDownload=false;let submittedGraph:WorkflowGraph={};let submittedKey='';
  const remoteId=randomUUID(),outputId=randomUUID();const snap=(status:string):WorkflowSnapshot=>({id:remoteId,status,queuePosition:status==='queued'?1:undefined,outputs:status==='succeeded'?[{id:outputId,nodeId:'4',name:'native.png',contentType:'image/png',sizeBytes:png.length,type:'image'}]:[]});
  const port:WorkflowPort={validate:async graph=>({checkedAt:timestamp,target:'comfy-cloud',valid:true,issues:[],nodes:Object.entries(graph).map(([nodeId,node])=>({nodeId,classType:node.class_type,available:true,partnerNode:false,models:{}}))}),upload:async file=>{assert.deepEqual(await readFile(file),png);uploads++;return 'remote-input';},submit:async(graph,key)=>{submissions++;submittedKey=key;submittedGraph=structuredClone(graph);if(mode==='ambiguous')throw new TypeError('connection dropped after send');if(mode==='credits')throw Object.assign(new Error('No credits available'),{code:'insufficient_credits',httpStatus:402});return snap('queued');},get:async id=>{assert.equal(id,remoteId);polls++;return snap(polls===1?'running':'succeeded');},download:async()=>{downloads++;if(failDownload){failDownload=false;throw new Error('temporary output download failure');}return png;},executedGraph:async()=>({format:'api',graph:submittedGraph}),cancel:async()=>snap('canceled')};
  let worker=new WorkflowWorker(store,media,port,()=>true);const inert={tick:async()=>undefined,isActive:()=>false} as unknown as WorkflowWorker;
  const app=express();app.use(express.json({limit:'2mb'}));app.use('/api',createWorkflowRouter(store,media,inert,port));app.use('/api',createProjectRouter(store,media));app.use(((error:any,_req:any,res:any,_next:any)=>res.status(error.status??400).json({error:error.message})) as express.ErrorRequestHandler);
  const server=await new Promise<ReturnType<typeof app.listen>>(resolve=>{const listener=app.listen(0,'127.0.0.1',()=>resolve(listener));});const base=`http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
  const post=async(route:string,body:unknown)=>fetch(base+route,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
  const input=await media.put({projectId:project.id,name:'Source.png',mimeType:'image/png',bytes:png,provenance:'imported'});store.upsertAsset(input);
  const definition=JSON.parse(await readFile('workflows/native/02-image-finish.studio.json','utf8'));
  return{dir,media,png,project,input,definition,base,post,port,get store(){return store;},get worker(){return worker;},setMode:(next:typeof mode)=>mode=next,failNextDownload:()=>failDownload=true,counts:()=>({submissions,uploads,polls,downloads,submittedKey}),graph:()=>submittedGraph,remoteId,reopen:()=>{worker.stop();store.close();store=createStore(dir);worker=new WorkflowWorker(store,media,port,()=>true);},cleanup:async()=>{worker.stop();await new Promise<void>(resolve=>server.close(()=>resolve()));store.close();await rm(dir,{recursive:true,force:true});}};
}

test('native SDK route uploads, submits once, recovers after restart, collects actual bytes and preserves graph history in packages',async()=>{
  const f=await fixture();try{
    const created=await f.post(`/projects/${f.project.id}/workflows`,f.definition);assert.equal(created.status,201);const saved=await created.json() as {asset:Asset;take:Take};
    const body={values:{image:{assetId:f.input.id},width:512,height:512,sharpen:.25},clientRequestId:'native-once-only'};
    const response=await f.post(`/workflows/${saved.asset.id}/run`,body);assert.equal(response.status,202);const {job}=await response.json() as {job:Job};
    assert.equal((await f.post(`/workflows/${saved.asset.id}/run`,body)).status,200);assert.equal((await f.post(`/workflows/${saved.asset.id}/run`,{...body,values:{...body.values,width:768}})).status,409);
    await f.worker.process(job.id);assert.equal(f.store.getJob(job.id)!.state,'IN_QUEUE');assert.equal(f.counts().submissions,1);assert.equal(f.counts().uploads,1);assert.deepEqual(f.graph()['1'].inputs.image,{__type:'core/ASSET',info:{id:'remote-input'}});
    const routerWorker=new GenerationWorker(f.store,f.media,{submit:async()=>{throw new Error('Native graph leaked to Router');}} as any,{keyConfigured:()=>true});await routerWorker.process(job.id);assert.equal(f.counts().submissions,1);
    f.reopen();await f.worker.process(job.id);assert.equal(f.store.getJob(job.id)!.state,'IN_PROGRESS');f.failNextDownload();await f.worker.process(job.id);assert.equal(f.store.getJob(job.id)!.state,'COLLECTING');await f.worker.process(job.id);
    const complete=f.store.getJob(job.id)!;assert.equal(complete.state,'COMPLETED');assert.equal(complete.requestId,f.remoteId);assert.equal(complete.idempotencyKey,f.counts().submittedKey);assert.equal(f.counts().submissions,1);assert.equal(f.counts().uploads,1);
    const take=f.store.getTake(job.takeId)!,output=f.store.getAsset(take.assetIds[0])!;assert.deepEqual(await f.media.read(output),f.png);assert.equal(output.metadata.operation,'comfy-workflow-output');assert.ok(complete.workflow!.executedGraphAssetId);
    const project=f.store.getProject(f.project.id)!;f.store.upsertProject({...project,catalogueDemonstrations:[{id:randomUUID(),capabilityId:'native-workflow',operationId:'native.image-finish',title:'Native finish',previewKind:'workflow',projectId:project.id,posterAssetId:output.id,inputAssetIds:[f.input.id],outputAssetIds:[output.id],takeId:take.id,jobId:job.id,workflowReference:{kind:'native-workflow',toolView:'workflow',nativeWorkflowId:saved.asset.id,artifactAssetId:complete.workflow!.executedGraphAssetId},verificationKind:'generation',verifiedAt:new Date().toISOString(),attribution:{creator:'Test',source:'studio-original'},createdAt:new Date().toISOString()}]});
    f.store.upsertTake({...take,referenceRoles:{subject:{assetId:f.input.id,inputKey:'image',locked:true}}});
    const bytes=await exportProject(f.store,f.media,project.id),copy=await importProject(f.store,f.media,bytes),detail=f.store.projectDetail(copy.id)!;const restoredJob=detail.jobs[0];assert.ok(f.store.isArchivedJob(restoredJob.id));assert.equal(restoredJob.executionRoute,'comfy-workflow');assert.equal(restoredJob.requestId,f.remoteId);assert.notEqual(restoredJob.workflow!.versionAssetId,saved.asset.id);assert.equal(f.store.getAsset(restoredJob.workflow!.versionAssetId)!.projectId,copy.id);assert.equal(f.store.getAsset(restoredJob.workflow!.executedGraphAssetId!)!.projectId,copy.id);assert.equal(restoredJob.workflow!.uploads!.image.remoteId,'remote-input');
    const demonstration=detail.project.catalogueDemonstrations![0];assert.equal(demonstration.projectId,copy.id);assert.equal(demonstration.workflowReference!.nativeWorkflowId,restoredJob.workflow!.versionAssetId);assert.equal(demonstration.takeId,restoredJob.takeId);assert.equal(detail.takes.find(t=>t.id===restoredJob.takeId)!.referenceRoles!.subject.assetId,(restoredJob.workflow!.values.image as {assetId:string}).assetId);
    await f.worker.process(restoredJob.id);assert.equal(f.counts().submissions,1);
    const zip=new AdmZip(bytes);assert.ok(zip.getEntries().some(entry=>entry.entryName.startsWith('media/')));
  }finally{await f.cleanup();}
});

test('native ambiguous admission and insufficient credits never silently resubmit; foreign inputs and credentials are rejected',async()=>{
  const f=await fixture();try{
    const {asset}=await(await f.post(`/projects/${f.project.id}/workflows`,f.definition)).json() as {asset:Asset};
    const create=async(identity:string)=>(await(await f.post(`/workflows/${asset.id}/run`,{values:{image:{assetId:f.input.id}},clientRequestId:identity})).json()) as {job:Job};
    assert.equal((await f.post(`/workflows/${asset.id}/run`,{values:{image:{assetId:randomUUID()}},clientRequestId:'foreign-image'})).status,400);
    f.setMode('ambiguous');const first=await create('native-ambiguous');await f.worker.process(first.job.id);assert.equal(f.store.getJob(first.job.id)!.errorType,'submission_unknown');await f.worker.tick();assert.equal(f.counts().submissions,1);assert.equal((await f.post(`/workflow-jobs/${first.job.id}/retry`,{})).status,409);
    f.reopen();await f.worker.process(first.job.id);assert.equal(f.counts().submissions,1);
    // No running HTTP requests after reopening: routes retained the closed store; use a new isolated job directly.
    const second={...f.store.getJob(first.job.id)!,id:randomUUID(),takeId:randomUUID(),idempotencyKey:'native-credit-test',state:'PENDING' as const,attempts:0,requestId:undefined,workflow:{...f.store.getJob(first.job.id)!.workflow!,submissionOutcome:'not-submitted' as const}};
    const secondTake={...f.store.getTake(first.job.takeId)!,id:second.takeId,jobId:second.id};f.store.saveTakeAndJob(secondTake,second);f.setMode('credits');await f.worker.process(second.id);assert.equal(f.store.getJob(second.id)!.state,'BLOCKED');assert.equal(f.store.getJob(second.id)!.errorType,'insufficient_credits');await f.worker.tick();assert.equal(f.counts().submissions,2);
    assert.throws(()=>makeWorkflowVersion({...f.definition,apiGraph:{'1':{class_type:'LoadImage',inputs:{image:'x',api_key:'never-store-me'}}}}),/credential/i);
    assert.throws(()=>validateWorkflowGraph({'1':{class_type:'SaveImage',inputs:{images:['1',0]}}}),/cycle/);
  }finally{await f.cleanup();}
});

test('native dependency validator distinguishes missing models, node ranges and real loader widgets',()=>{
  const graph:WorkflowGraph={'1':{class_type:'LoadImage',inputs:{image:{__type:'core/ASSET',info:{id:'uploaded'}}}},'2':{class_type:'Sampler',inputs:{steps:8,model_name:'available'}}};
  const nodes={LoadImage:{input:{required:{image:[['old.png'],{image_upload:true}]}}},Sampler:{input:{required:{steps:['INT',{min:1,max:12}],model_name:[['available']]}}}};
  assert.equal(validateAgainstNodeInfo(graph,nodes).valid,true);graph['2'].inputs.model_name='missing';assert.equal(validateAgainstNodeInfo(graph,nodes).valid,false);graph['2'].inputs.model_name='available';graph['2'].inputs.steps={__type:'core/ASSET',info:{id:'wrong'}};assert.match(validateAgainstNodeInfo(graph,nodes).issues[0].message,/loader file widget/);
});

test('existing Cloud execution import preserves imported origin and archives after collection without submission',async()=>{
  const f=await fixture();try{
    const {asset}=await(await f.post(`/projects/${f.project.id}/workflows`,f.definition)).json() as {asset:Asset};
    const {job}=await(await f.post(`/workflows/${asset.id}/run`,{values:{image:{assetId:f.input.id}},clientRequestId:'prepare-existing-execution'})).json() as {job:Job};
    await f.worker.process(job.id);await f.worker.process(job.id);await f.worker.process(job.id);assert.equal(f.store.getJob(job.id)!.state,'COMPLETED');
    const exact={...f.definition,name:'Exact imported Cloud version',apiGraph:f.graph(),bindings:[],parentVersionAssetId:asset.id};
    const version=await(await f.post(`/projects/${f.project.id}/workflows`,exact)).json() as {asset:Asset};
    // Simulate the current Cloud wire name `workflow`, alongside the SDK's documented `graph` shape.
    f.port.executedGraph=async()=>({format:'api',workflow:f.graph()});
    const imported=await f.post(`/workflows/${version.asset.id}/import-execution`,{requestId:f.remoteId,name:'Verified external editor result'});assert.equal(imported.status,202);const importedJob=(await imported.json() as {job:Job}).job;await f.worker.process(importedJob.id);
    assert.equal(f.counts().submissions,1);assert.equal(f.store.getJob(importedJob.id)!.state,'COMPLETED');assert.equal(f.store.getJob(importedJob.id)!.workflow!.origin,'cloud-editor');assert.ok(f.store.isArchivedJob(importedJob.id));const take=f.store.getTake(importedJob.takeId)!;assert.equal(take.provenance,'imported');assert.equal(f.store.getAsset(take.assetIds[0])!.provenance,'imported');
    assert.equal((await f.post(`/workflow-jobs/${importedJob.id}/retry`,{})).status,409);
    const document=await f.media.put({projectId:f.project.id,name:'Mix snapshot.json',mimeType:'application/json',bytes:Buffer.from('{}'),provenance:'local-edit',metadata:{operation:'audio-mix-document',audioMixDocument:{tracks:[{assetId:f.input.id}],sourceHashes:{[f.input.id]:f.input.sha256}}}});f.store.upsertAsset(document);
    const copy=await importProject(f.store,f.media,await exportProject(f.store,f.media,f.project.id));const restored=f.store.projectDetail(copy.id)!;const remapped=restored.assets.find(value=>value.metadata.operation==='audio-mix-document')!.metadata.audioMixDocument as any;assert.equal(Object.keys(remapped.sourceHashes)[0],remapped.tracks[0].assetId);assert.equal(f.store.getAsset(remapped.tracks[0].assetId)!.projectId,copy.id);
  }finally{await f.cleanup();}
});

test('Cloud editor source lineage requires matching uploaded bytes and exact editor links remain portable',async()=>{
  const f=await fixture();try{
    const hash='b'.repeat(64),graph=structuredClone(f.definition.apiGraph);graph['1'].inputs.image=hash+'.png';
    const created=await(await f.post(`/projects/${f.project.id}/workflows`,{...f.definition,apiGraph:graph})).json() as {asset:Asset};
    f.port.get=async()=>({id:f.remoteId,status:'succeeded',outputs:[]});f.port.executedGraph=async()=>({format:'api',workflow:graph});f.port.hashInput=async()=> 'c'.repeat(64);
    const body={requestId:f.remoteId,inputAssetIds:{image:f.input.id},sourceAssetId:f.input.id};
    assert.equal((await f.post(`/workflows/${created.asset.id}/import-execution`,body)).status,400);
    f.port.hashInput=async file=>{assert.deepEqual(await readFile(file),f.png);return hash;};
    const response=await f.post(`/workflows/${created.asset.id}/import-execution`,body);assert.equal(response.status,202);const {job,take}=await response.json() as {job:Job;take:Take};assert.equal(take.sourceAssetId,f.input.id);assert.deepEqual(job.workflow!.values.image,{assetId:f.input.id});assert.equal(f.counts().submissions,0);
    const patch=async(body:unknown)=>fetch(f.base+`/workflows/${created.asset.id}/cloud-reference`,{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
    assert.equal((await patch({cloudEditorUrl:'https://example.com/#'+randomUUID()})).status,400);
    const url='https://cloud.comfy.org/#'+randomUUID();assert.equal((await patch({cloudEditorUrl:url,cloudWorkspace:{id:'w-'+randomUUID(),name:'Test workspace'}})).status,200);
    const copy=await importProject(f.store,f.media,await exportProject(f.store,f.media,f.project.id));const version=f.store.listAssets(copy.id).find(value=>value.metadata.operation==='comfy-workflow-version')!;assert.equal((version.metadata.cloudReference as any).cloudEditorUrl,url);assert.deepEqual((version.metadata.workflowVersion as any).apiGraph,graph);
  }finally{await f.cleanup();}
});
