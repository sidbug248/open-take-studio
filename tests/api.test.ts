import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { deflateSync } from 'node:zlib';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import express from 'express';
import AdmZip from 'adm-zip';
import type { ErrorRequestHandler } from 'express';
import { createStore } from '../server/store.ts';
import { LocalFileStorage } from '../server/media.ts';
import { createProjectRouter } from '../server/project-routes.ts';
import { unpackInlineMedia } from '../server/package-inline-media.ts';
import { createGenerationRouter } from '../server/generation-routes.ts';
import type { GenerationWorker } from '../server/worker.ts';
import type { Asset, Project, ProjectDetail, Shot, Take } from '../shared/types.ts';

// A valid deterministic 256px PNG meets the real model's minimum reference size.
function testPng():Buffer {
  const crc=(bytes:Buffer)=>{let value=0xffffffff;for(const byte of bytes){value^=byte;for(let i=0;i<8;i++)value=(value>>>1)^((value&1)?0xedb88320:0);}return(value^0xffffffff)>>>0;};
  const chunk=(name:string,data:Buffer)=>{const type=Buffer.from(name),length=Buffer.alloc(4),checksum=Buffer.alloc(4);length.writeUInt32BE(data.length);checksum.writeUInt32BE(crc(Buffer.concat([type,data])));return Buffer.concat([length,type,data,checksum]);};
  const header=Buffer.alloc(13);header.writeUInt32BE(256,0);header.writeUInt32BE(256,4);header[8]=8;header[9]=2;
  const pixels=Buffer.alloc(256*(1+256*3));let seed=1743;for(let y=0;y<256;y++)for(let x=0;x<256*3;x++){seed=(Math.imul(seed,1664525)+1013904223)|0;pixels[y*769+1+x]=seed>>>24;}
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',deflateSync(pixels)),chunk('IEND',Buffer.alloc(0))]);
}
const png=testPng();
async function setup(){
  const base=path.resolve('data','test-fixtures');await mkdir(base,{recursive:true});const dir=await mkdtemp(path.join(base,'api-'));let store=createStore(dir);const media=new LocalFileStorage(dir);
  const app=express();app.use(express.json({limit:'2mb'}));app.use('/api',createProjectRouter(store,media));
  // No external API calls: generation endpoint contract uses a deliberately inert worker.
  const worker={tick:async()=>undefined} as unknown as GenerationWorker;
  app.use('/api',createGenerationRouter(store,media,worker));
  app.use(((error,_req,res,_next)=>res.status(error.status??400).json({error:error.message})) as ErrorRequestHandler);
  const server=await new Promise<ReturnType<typeof app.listen>>(resolve=>{const listener=app.listen(0,'127.0.0.1',()=>resolve(listener));});
  const url=`http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
  const request=(route:string,body?:unknown,method='POST')=>fetch(url+route,{method,headers:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});
  return {dir,store,media,server,url,request,cleanup:async()=>{await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));store.close();await rm(dir,{recursive:true,force:true});}};
}
test('HTTP create/upload/select/download/export/import/reopen retains original bytes and relationships',async()=>{
  const f=await setup();try{
    const created=await f.request('/projects',{name:'HTTP production',description:'arbitrary user project'});assert.equal(created.status,201);const project=await created.json() as Project;
    const form=new FormData();form.set('file',new Blob([new Uint8Array(png)],{type:'image/png'}),'reference.png');const uploaded=await fetch(`${f.url}/projects/${project.id}/assets`,{method:'POST',body:form});assert.equal(uploaded.status,201);const asset=await uploaded.json() as Asset;assert.equal(asset.provenance,'imported');
    const importedTake=await f.request(`/projects/${project.id}/takes/import`,{assetId:asset.id,name:'Imported reference'});assert.equal(importedTake.status,201);const take=await importedTake.json() as Take;
    const shotResponse=await f.request(`/projects/${project.id}/shots`,{name:'Opening',description:'A coastline introduction'});const shot=await shotResponse.json() as Shot;assert.equal(shotResponse.status,201);
    assert.equal((await f.request(`/takes/${take.id}`,{favorite:true,shotId:shot.id},'PATCH')).status,200);
    assert.equal((await f.request(`/shots/${shot.id}`,{selectedTakeId:take.id},'PATCH')).status,200);
    assert.equal((await f.request(`/projects/${project.id}`,{selectedTakeId:take.id,coverAssetId:asset.id},'PATCH')).status,200);
    const full=await fetch(`${f.url}/assets/${asset.id}/file?download=1`);assert.equal(full.status,200);assert.match(full.headers.get('content-disposition')??'',/attachment/);assert.equal(full.headers.get('x-content-type-options'),'nosniff');assert.deepEqual(Buffer.from(await full.arrayBuffer()),png);
    const range=await fetch(`${f.url}/assets/${asset.id}/file`,{headers:{Range:'bytes=0-7'}});assert.equal(range.status,206);assert.equal(range.headers.get('content-range'),`bytes 0-7/${png.length}`);assert.deepEqual(Buffer.from(await range.arrayBuffer()),png.subarray(0,8));
    const exported=await fetch(`${f.url}/projects/${project.id}/export`);assert.equal(exported.status,200);const bytes=await exported.arrayBuffer();const packageForm=new FormData();packageForm.set('file',new Blob([bytes],{type:'application/zip'}),'production.opentake.zip');const imported=await fetch(`${f.url}/projects/import`,{method:'POST',body:packageForm});assert.equal(imported.status,201);const copy=await imported.json() as Project;assert.notEqual(copy.id,project.id);
    const detail=await(await fetch(`${f.url}/projects/${copy.id}`)).json() as ProjectDetail;assert.equal(detail.takes[0]!.favorite,true);assert.equal(detail.shots[0]!.selectedTakeId,detail.takes[0]!.id);assert.equal(detail.takes[0]!.shotId,detail.shots[0]!.id);assert.equal(detail.project.coverAssetId,detail.assets[0]!.id);assert.equal(detail.project.selectedTakeId,detail.takes[0]!.id);
    // Independent connection proves persisted data, not an HTTP response cache.
    const reopened=createStore(f.dir);assert.equal(reopened.projectDetail(copy.id)?.assets[0]!.sha256,asset.sha256);reopened.close();
  }finally{await f.cleanup();}
});
test('HTTP refuses cross-project references and forged generated uploads',async()=>{
  const f=await setup();try{
    const first=await(await f.request('/projects',{name:'One'})).json() as Project;const second=await(await f.request('/projects',{name:'Two'})).json() as Project;
    const form=new FormData();form.set('file',new Blob([new Uint8Array(png)],{type:'image/png'}),'asset.png');const asset=await(await fetch(`${f.url}/projects/${first.id}/assets`,{method:'POST',body:form})).json() as Asset;
    assert.equal((await f.request(`/projects/${second.id}/takes/import`,{assetId:asset.id})).status,400);
    assert.equal((await f.request(`/projects/${second.id}`,{coverAssetId:asset.id},'PATCH')).status,400);
    assert.equal((await f.request(`/projects/${second.id}/recipes`,{name:'Bad reference',modelId:'bfl/flux-3-image',prompt:'test',settings:{},inputAssetIds:{images:[asset.id]}})).status,400);
    assert.equal((await f.request('/generate',{projectId:second.id,modelId:'bfl/flux-3-image',prompt:'test',settings:{},inputAssetIds:{images:[asset.id]},clientRequestId:'cross-project-test'})).status,400);
    const forged=new FormData();forged.set('file',new Blob([new Uint8Array(png)],{type:'image/png'}),'fake.png');forged.set('provenance','generated');assert.equal((await fetch(`${f.url}/projects/${first.id}/assets`,{method:'POST',body:forged})).status,400);
    const secretFile=new FormData();secretFile.set('file',new Blob(['CONFIG=example'],{type:'text/plain'}),'.env');assert.equal((await fetch(`${f.url}/projects/${first.id}/assets`,{method:'POST',body:secretFile})).status,400);
    assert.equal(f.store.listJobs().length,0);
  }finally{await f.cleanup();}
});
test('HTTP manual edit records source and parent; generation identity is stable',async()=>{
  const f=await setup();try{
    const project=await(await f.request('/projects',{name:'Edit test'})).json() as Project;
    const asset=await f.media.put({projectId:project.id,name:'original.png',bytes:png,mimeType:'image/png',provenance:'imported'});f.store.upsertAsset(asset);
    const parent=await(await f.request(`/projects/${project.id}/takes/import`,{assetId:asset.id})).json() as Take;
    const form=new FormData();form.set('file',new Blob([new Uint8Array(png)],{type:'image/png'}),'crop.png');form.set('provenance','local-edit');form.set('metadata',JSON.stringify({operation:'canvas-composite',sourceAssetId:asset.id,settings:{crop:'square'}}));const editAsset=await(await fetch(`${f.url}/projects/${project.id}/assets`,{method:'POST',body:form})).json() as Asset;
    const take=await(await f.request(`/projects/${project.id}/takes/import`,{assetId:editAsset.id,parentTakeId:parent.id,sourceAssetId:asset.id})).json() as Take;assert.equal(take.parentTakeId,parent.id);assert.equal(take.sourceAssetId,asset.id);assert.equal(take.status,'LOCAL');assert.equal(take.provenance,'local-edit');assert.equal(take.settings.crop,'square');assert.equal(take.changes.length,3);
    const body={projectId:project.id,modelId:'bfl/flux-3-image',prompt:'A brass compass on slate',settings:{resolution:'768sq'},inputAssetIds:{images:[asset.id]},clientRequestId:'same-intended-request'};
    const first=await f.request('/generate',body);assert.equal(first.status,202);const initial=await first.json();const retry=await f.request('/generate',body);assert.equal(retry.status,200);const replay=await retry.json();assert.equal(initial.job.id,replay.job.id);assert.equal(initial.take.id,replay.take.id);assert.equal(f.store.listJobs().length,1);
    assert.equal((await f.request('/generate',{...body,prompt:'Changed intended input'})).status,409);
    const display=await(await fetch(`${f.url}/projects/${project.id}`)).json() as ProjectDetail;assert.ok(!JSON.stringify(display.jobs[0]!.inputs).includes(png.toString('base64')));assert.ok(JSON.stringify(f.store.getJob(initial.job.id)!.inputs).includes(png.toString('base64')));
    const exported=await fetch(`${f.url}/projects/${project.id}/export`);assert.equal(exported.status,200);const archive=new AdmZip(Buffer.from(await exported.arrayBuffer()));const manifest=unpackInlineMedia(JSON.parse(archive.readAsText('manifest.json')),archive).manifest as ProjectDetail;assert.ok(JSON.stringify(manifest.jobs[0].inputs).includes(png.toString('base64')));assert.equal(manifest.jobs[0].fingerprint,initial.job.fingerprint);
  }finally{await f.cleanup();}
});
