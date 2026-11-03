import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,rm} from 'node:fs/promises';
import {randomBytes,randomUUID,createHash} from 'node:crypto';
import path from 'node:path';
import type {AddressInfo} from 'node:net';
import express from 'express';
import AdmZip from 'adm-zip';
import {Store} from '../server/store.ts';
import {LocalFileStorage} from '../server/media.ts';
import {createProjectRouter,importProject} from '../server/project-routes.ts';
import {unpackInlineMedia} from '../server/package-inline-media.ts';
import type {Job,Take} from '../shared/types.ts';

test('large project export stays responsive and preserves exact media/inputs through a read-only snapshot worker',async(t)=>{
  const base=path.resolve('data/test-fixtures');await mkdir(base,{recursive:true});const directory=await mkdtemp(path.join(base,'export-worker-')),store=new Store(directory),media=new LocalFileStorage(directory),now=new Date().toISOString(),project={id:randomUUID(),name:'Large archive',description:'',createdAt:now,updatedAt:now};store.upsertProject(project);
  // Valid uncompressed PCM WAV with deliberately incompressible sample bytes exercises actual ZIP CPU work.
  const pcm=randomBytes(24*1024*1024),header=Buffer.alloc(44);header.write('RIFF');header.writeUInt32LE(36+pcm.length,4);header.write('WAVEfmt ',8);header.writeUInt32LE(16,16);header.writeUInt16LE(1,20);header.writeUInt16LE(1,22);header.writeUInt32LE(48000,24);header.writeUInt32LE(96000,28);header.writeUInt16LE(2,32);header.writeUInt16LE(16,34);header.write('data',36);header.writeUInt32LE(pcm.length,40);const wav=Buffer.concat([header,pcm]),asset=await media.put({projectId:project.id,name:'PCM source.wav',mimeType:'audio/wav',bytes:wav,provenance:'imported'});store.upsertAsset(asset);
  const take:Take={id:randomUUID(),projectId:project.id,name:'Archived source',kind:'audio',assetIds:[asset.id],inputAssetIds:{source:asset.id},modelId:'fixture',provider:'fixture',prompt:'Preserve inputs exactly',settings:{},status:'COMPLETED',provenance:'generated',favorite:false,createdAt:now,updatedAt:now,changes:[]};
  const inline='data:audio/wav;base64,'+wav.subarray(0,6*1024*1024).toString('base64'),job:Job={id:randomUUID(),takeId:take.id,projectId:project.id,modelId:'fixture',provider:'fixture',idempotencyKey:randomUUID(),requestId:'historical-request',state:'COMPLETED',inputs:{source:inline,again:inline,temporary:'https://media.example/file?X-Amz-Signature=SECRET'},attempts:1,createdAt:now,updatedAt:now};take.jobId=job.id;store.saveTakeAndJob(take,job);
  const readOnly=new Store(directory,{readOnly:true});assert.throws(()=>readOnly.upsertProject({...project,name:'Must not change'}),/readonly|read-only/i);readOnly.close();
  const app=express();app.get('/health',(_req,res)=>res.json({ok:true}));app.use('/api',createProjectRouter(store,media));app.use(((error:any,_req:any,res:any,_next:any)=>res.status(error.status??500).json({error:error.message})) as express.ErrorRequestHandler);
  const server=await new Promise<ReturnType<typeof app.listen>>(resolve=>{const value=app.listen(0,'127.0.0.1',()=>resolve(value));}),url=`http://127.0.0.1:${(server.address() as AddressInfo).port}`;let restored:Store|undefined;
  try{
    let complete=false;const started=performance.now(),archive=fetch(`${url}/api/projects/${project.id}/export`).then(async response=>{assert.equal(response.status,200,await(response.ok?Promise.resolve(''):response.text()));return Buffer.from(await response.arrayBuffer());}).finally(()=>{complete=true;});
    const health:number[]=[];while(!complete){const began=performance.now(),response=await fetch(`${url}/health`,{signal:AbortSignal.timeout(2000)});assert.equal(response.status,200);await response.json();if(!complete)health.push(performance.now()-began);await new Promise(resolve=>setTimeout(resolve,25));}
    const bytes=await archive,elapsed=performance.now()-started;assert.ok(health.length>=5,`Health must respond repeatedly during export (got ${health.length})`);assert.ok(Math.max(...health)<1500,`Export blocked health for ${Math.max(...health)}ms`);t.diagnostic(JSON.stringify({exportMs:Math.round(elapsed),healthResponsesDuringExport:health.length,maxHealthMs:Math.round(Math.max(...health))}));
    const zip=new AdmZip(bytes),manifest=unpackInlineMedia(JSON.parse(zip.readAsText('manifest.json')),zip).manifest as any;assert.equal(manifest.jobs[0].inputs.source,inline);assert.equal(manifest.jobs[0].inputs.again,inline);assert.equal(manifest.jobs[0].inputs.temporary,'https://media.example/file');assert.equal(createHash('sha256').update(zip.readFile(`media/${asset.fileName}`)!).digest('hex'),asset.sha256);
    restored=new Store(path.join(directory,'restored'));const restoredMedia=new LocalFileStorage(path.join(directory,'restored')),copy=await importProject(restored,restoredMedia,bytes),detail=restored.projectDetail(copy.id)!;assert.equal(detail.jobs[0].inputs.source,inline);assert.equal(detail.jobs[0].requestId,job.requestId);assert.ok(restored.isArchivedJob(detail.jobs[0].id));assert.deepEqual(await restoredMedia.read(detail.assets[0]),wav);assert.equal(store.getProject(project.id)!.name,project.name);assert.equal(store.getJob(job.id)!.inputs.temporary,job.inputs.temporary);
  }finally{await new Promise<void>(resolve=>server.close(()=>resolve()));restored?.close();store.close();const resolved=path.resolve(directory);assert.equal(path.dirname(resolved),base);await rm(resolved,{recursive:true,force:true});}
});
