import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,rm} from 'node:fs/promises';
import path from 'node:path';
import type {AddressInfo} from 'node:net';
import express from 'express';
import sharp from 'sharp';
import {createStore} from '../server/store.ts';
import {LocalFileStorage} from '../server/media.ts';
import {createMotionRouter,motionSchema} from '../server/motion-routes.ts';
import {defaultMotionComposition,activeMotionCue} from '../shared/motion-types.ts';
import {mediaToolPaths,runMediaTool} from '../server/film-media.ts';
import {exportProject,importProject} from '../server/project-routes.ts';

test('motion timing is bounded and moving a cue changes the active rendered text',()=>{
 const c=defaultMotionComposition();assert.equal(motionSchema.safeParse(c).success,true);
 assert.equal(motionSchema.safeParse({...c,cues:[{...c.cues[0],end:c.duration+1}]}).success,false);
 assert.notDeepEqual(activeMotionCue(c,1),activeMotionCue({...c,cues:c.cues.map(q=>({...q,start:q.start+2,end:q.end+2}))},1));
});

test('actual audio waveform, frame mux, idempotency, immutable versions and portable motion reopen',async()=>{
 const base=path.resolve('data/test-fixtures');await mkdir(base,{recursive:true});const directory=await mkdtemp(path.join(base,'motion-')),store=createStore(directory),media=new LocalFileStorage(directory),now=new Date().toISOString();
 store.upsertProject({id:'motion-project',name:'Motion test',description:'',createdAt:now,updatedAt:now});const app=express();app.use(express.json());app.use('/api',createMotionRouter(store,media));const server=await new Promise<ReturnType<typeof app.listen>>(r=>{const s=app.listen(0,'127.0.0.1',()=>r(s));}),url=`http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
 const post=async(p:string,body:unknown)=>{const r=await fetch(url+p,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});assert.ok(r.ok,await r.clone().text());return r.json();};
 try{
 const sound=await post('/projects/motion-project/motion/pulse-track',{duration:2,bpm:120});assert.equal(sound.asset.kind,'audio');const wave=await(await fetch(url+'/assets/'+sound.asset.id+'/waveform')).json();assert.equal(wave.peaks.length,200);assert.ok(wave.peaks.some((n:number)=>n>.05));
 const c={...defaultMotionComposition(),duration:2,fps:12 as const,width:256,height:256,cues:[{id:'line',start:0,end:2,text:'PULSE',style:'punch' as const}],beats:[0,.5,1,1.5],audioAssetId:sound.asset.id};
 const saved=await post('/projects/motion-project/motion/compositions',{composition:c});const revision=await post('/projects/motion-project/motion/compositions',{composition:{...c,cues:[{...c.cues[0],start:.5}]},parentTakeId:saved.take.id});assert.equal(revision.take.parentTakeId,saved.take.id);assert.equal((await(await fetch(url+'/assets/'+saved.asset.id+'/motion-composition')).json()).cues[0].start,0);
 const pngs=await Promise.all(['#e34b65','#b5e82c'].map(background=>sharp({create:{width:256,height:256,channels:3,background}}).png().toBuffer()));
 function form(){const f=new FormData();f.append('compositionAssetId',saved.asset.id);f.append('clientRequestId','motion-test-render');for(let i=0;i<24;i++)f.append('frames',new Blob([pngs[i<12?0:1]],{type:'image/png'}),`f${i}.png`);return f;}
 const rendered=await fetch(url+'/projects/motion-project/motion/render',{method:'POST',body:form()});assert.equal(rendered.status,201);const result=await rendered.json();const repeated=await fetch(url+'/projects/motion-project/motion/render',{method:'POST',body:form()});assert.equal((await repeated.json()).take.id,result.take.id);
 const {ffprobe}=mediaToolPaths();const probe=JSON.parse((await runMediaTool(ffprobe,['-v','error','-show_streams','-show_format','-of','json',media.path(store.getAsset(result.asset.id)!)])).toString());assert.ok(probe.streams.some((s:any)=>s.codec_type==='audio'));assert.ok(probe.streams.some((s:any)=>s.codec_type==='video'&&s.width===256&&s.nb_frames==='24'));assert.equal(Number(probe.format.duration),2);
 const zip=await exportProject(store,media,'motion-project'),imported=await importProject(store,media,zip),detail=store.projectDetail(imported.id)!;const composition=detail.assets.find(a=>a.name===saved.asset.name)!;const reopened=await(await fetch(url+'/assets/'+composition.id+'/motion-composition')).json();assert.notEqual(reopened.audioAssetId,sound.asset.id);assert.ok(detail.assets.some(a=>a.id===reopened.audioAssetId&&a.sha256===sound.asset.sha256));assert.ok(detail.assets.some(a=>a.sha256===result.asset.sha256));assert.equal(store.listTakes('motion-project').length,4);
 }finally{await new Promise<void>(r=>server.close(()=>r()));store.close();assert.equal(path.dirname(path.resolve(directory)),base);await rm(directory,{recursive:true,force:true});}
});
