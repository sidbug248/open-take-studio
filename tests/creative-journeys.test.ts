import test from 'node:test';
import assert from 'node:assert/strict';
import {createSpatialScene} from '../shared/spatial-types.ts';
import {applySpatialCameraPreset,applySpatialLightPreset,spatialCinematicHandoff,sceneWithDirectedOpening} from '../shared/creative-handoffs.ts';
import {defaultMotionComposition,activeMotionCue,motionPulse} from '../shared/motion-types.ts';
import {moveMotionBeat,moveMotionCue,applyMotionTreatment} from '../shared/motion-editing.ts';
import {catalogueTransformation} from '../shared/catalogue-transformations.ts';
import type {Asset,Take} from '../shared/types.ts';
import type {CatalogueDemonstrationView} from '../shared/catalogue-types.ts';
import {mkdir,mkdtemp,rm} from 'node:fs/promises';
import path from 'node:path';
import type {AddressInfo} from 'node:net';
import express,{type ErrorRequestHandler} from 'express';
import sharp from 'sharp';
import {Store} from '../server/store.ts';
import {LocalFileStorage} from '../server/media.ts';
import {createAudioMixRouter} from '../server/audio-mix.ts';
import {createMotionRouter} from '../server/motion-routes.ts';
import {mediaToolPaths,runMediaTool} from '../server/film-media.ts';
import {exportProject,importProject} from '../server/project-routes.ts';

function asset(id:string,kind:Asset['kind'],metadata:Asset['metadata']={}):Asset{return{id,projectId:'project',name:id,kind,mimeType:kind==='image'?'image/png':kind==='video'?'video/mp4':'application/json',fileName:id,size:20,sha256:id.padEnd(64,'0'),provenance:'local-edit',createdAt:'2026-11-03',metadata,url:'/api/assets/'+id+'/file'};}
function take(id:string):Take{return{id,projectId:'project',name:id,kind:'image',inputAssetIds:{},assetIds:[],modelId:'local/threejs-guide',provider:'local',prompt:'',settings:{},status:'LOCAL',provenance:'local-edit',favorite:false,createdAt:'2026-11-03',updatedAt:'2026-11-03',changes:[]};}

test('direct-object presets preserve original mesh identity and cinematic handoff rejects a poster or wrong scene',()=>{
  const scene=createSpatialScene();scene.objects[0]={...scene.objects[0],type:'model',assetId:'original-glb',assetSha256:'mesh-sha',material:{...scene.objects[0].material,override:false}};
  const original=structuredClone(scene),directed=applySpatialLightPreset(applySpatialCameraPreset(scene,'profile'),'afterlight');
  assert.deepEqual(scene,original);assert.deepEqual(directed.objects,scene.objects);assert.notDeepEqual(directed.camera,scene.camera);assert.notDeepEqual(directed.lights,scene.lights);
  const roomScene=sceneWithDirectedOpening(directed,'directed-view');assert.deepEqual(roomScene.cameraViews[0],{...directed.camera,id:'directed-view',name:'Your directed view'});assert.deepEqual(directed.cameraViews,original.cameraViews);
  const saved={scene:directed,asset:asset('immutable-scene','document'),take:take('scene-take')},frame=asset('real-frame','image',{operation:'spatial-guide',sourceAssetId:saved.asset.id,width:960,height:540});
  const guide={...take('guide-take'),assetIds:[frame.id],inputAssetIds:{scene:saved.asset.id},parentTakeId:saved.take.id};
  const handoff=spatialCinematicHandoff(saved,frame,guide,'A deliberate camera move');
  assert.equal(handoff.asset.id,'real-frame');assert.equal(handoff.sceneSha256,saved.asset.sha256);assert.deepEqual(handoff.originalModels,[{assetId:'original-glb',sha256:'mesh-sha'}]);
  directed.camera.position[0]=99;assert.notEqual(handoff.camera.position[0],99);
  assert.throws(()=>spatialCinematicHandoff(saved,{...frame,metadata:{...frame.metadata,operation:'asset-poster'}},take('guide'),'x'),/actual rendered/);
  assert.throws(()=>spatialCinematicHandoff(saved,{...frame,metadata:{...frame.metadata,sourceAssetId:'other-scene'}},take('guide'),'x'),/actual rendered/);
});

test('pointer timing edits change rendered cue and beat pulse while preserving soundtrack and undo snapshot',()=>{
  const original={...defaultMotionComposition(),audioAssetId:'mixed-master',imageAssetId:'original-artwork'},snapshot=structuredClone(original);
  const cue=moveMotionCue(original,'cue-1',2.5);assert.equal(activeMotionCue(original,.5)?.id,'cue-1');assert.notEqual(activeMotionCue(cue,.5)?.id,'cue-1');assert.ok(Math.abs((cue.cues[0].end-cue.cues[0].start)-(original.cues[0].end-original.cues[0].start))<1e-10);
  const moved=moveMotionBeat({...original,beats:[0]},0,1.25);assert.ok(motionPulse(moved,1.25)>motionPulse(original,1.25));assert.equal(moveMotionBeat(moved,0,999).beats[0],original.duration-.01);assert.equal(moveMotionCue(original,'cue-1',999).cues[0].end,original.duration);
  const treated=applyMotionTreatment(moved,'paper');assert.equal(treated.audioAssetId,'mixed-master');assert.equal(treated.imageAssetId,'original-artwork');assert.deepEqual(treated.beats,moved.beats);assert.deepEqual(original,snapshot);
});

test('catalogue pairs operation inputs with outputs and never treats an interaction recording or poster as a transformation',()=>{
  const source=asset('source','image'),result=asset('result','video'),poster=asset('poster','image',{operation:'asset-poster'});
  const demo={operationId:'video.image',verificationKind:'generation',inputAssets:[source],outputAssets:[result,poster],previewAsset:poster} as CatalogueDemonstrationView;
  assert.deepEqual(catalogueTransformation(demo),{source,result,before:'Source frame',after:'In motion',kind:'still-motion'});
  assert.equal(catalogueTransformation({...demo,verificationKind:'interaction'}),undefined);
  assert.equal(catalogueTransformation({...demo,inputAssets:[poster]}),undefined);
  const model=asset('draft','3d'),textured=asset('refined','3d');assert.equal(catalogueTransformation({...demo,operationId:'mesh.generate.refine',inputAssets:[model],outputAssets:[textured]})?.source.id,'draft');
});

test('a selected rendered mix actually drives motion MP4 audio, with edited cues and portable source links',async()=>{
  const fixtures=path.resolve('data/test-fixtures');await mkdir(fixtures,{recursive:true});const dir=await mkdtemp(path.join(fixtures,'connected-motion-')),store=new Store(dir),media=new LocalFileStorage(dir),now=new Date().toISOString();
  store.upsertProject({id:'p',name:'Connected sound',description:'',createdAt:now,updatedAt:now});const app=express();app.use(express.json());app.use('/api',createAudioMixRouter(store,media));app.use('/api',createMotionRouter(store,media));app.use(((e,_q,r,_n)=>r.status(e.status??400).json({error:e.message})) as ErrorRequestHandler);
  const server=await new Promise<ReturnType<typeof app.listen>>(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));}),url=`http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
  const post=async(route:string,body:unknown)=>{const response=await fetch(url+route,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});assert.equal(response.status,201,await response.clone().text());return response.json();};
  try{
    const {ffmpeg}=mediaToolPaths(),tone=await media.put({projectId:'p',name:'Continuous source tone.wav',mimeType:'audio/wav',provenance:'local-edit',bytes:await runMediaTool(ffmpeg,['-nostdin','-v','error','-f','lavfi','-i','sine=frequency=330:duration=2','-f','wav','pipe:1'])});store.upsertAsset(tone);
    const arrangement=await post('/projects/p/audio-mixes',{document:{version:1,name:'The deliberate pause',duration:2,tracks:[{id:'voice',assetId:tone.id,name:'Voice',start:0,offset:0,duration:.6,gain:.7,fadeIn:0,fadeOut:.05,muted:false},{id:'return',assetId:tone.id,name:'Return',start:1.4,offset:0,duration:.6,gain:.4,fadeIn:.05,fadeOut:.05,muted:false}]}});
    const mix=await post(`/assets/${arrangement.asset.id}/audio-mix/render`,{clientRequestId:'connected-mix-original'});
    const source={...defaultMotionComposition(),duration:2,width:256,height:256,audioAssetId:mix.asset.id,audioGain:1,beats:[0,1.4],cues:[{id:'word',start:0,end:.6,text:'RETURN',style:'punch' as const}]},edited=moveMotionCue(moveMotionBeat(source,1,1.5),'word',1.4);
    const version=await post('/projects/p/motion/compositions',{composition:edited});assert.equal(version.take.inputAssetIds.audio,mix.asset.id);assert.equal(version.asset.metadata.sourceHashes[mix.asset.id],mix.asset.sha256);
    const png=await sharp({create:{width:256,height:256,channels:3,background:'#332244'}}).png().toBuffer(),form=new FormData();form.append('compositionAssetId',version.asset.id);form.append('clientRequestId','connected-film-original');for(let i=0;i<24;i++)form.append('frames',new Blob([png],{type:'image/png'}),`frame-${i}.png`);
    const response=await fetch(url+'/projects/p/motion/render',{method:'POST',body:form});assert.equal(response.status,201,await response.clone().text());const rendered=await response.json();assert.equal(rendered.asset.metadata.audioAssetId,mix.asset.id);assert.equal(rendered.take.inputAssetIds.audio,mix.asset.id);
    const pcm=await runMediaTool(ffmpeg,['-nostdin','-v','error','-i',media.path(rendered.asset),'-vn','-ac','1','-ar','8000','-f','f32le','pipe:1']);const rms=(from:number,to:number)=>{let sum=0,count=0;for(let n=Math.floor(from*8000);n<Math.floor(to*8000);n++){sum+=pcm.readFloatLE(n*4)**2;count++;}return Math.sqrt(sum/count);};assert.ok(rms(.1,.4)>.03);assert.ok(rms(.8,1.2)<.001,'The exported film must contain the gap from the mix, not the continuous original tone');assert.ok(rms(1.6,1.8)>.015);
    const imported=await importProject(store,media,await exportProject(store,media,'p')),copies=store.listAssets(imported.id),copy=copies.find(a=>a.sha256===version.asset.sha256)!;const linked=(copy.metadata.motionComposition as any).audioAssetId;assert.notEqual(linked,mix.asset.id);assert.equal(store.getAsset(linked)?.sha256,mix.asset.sha256);assert.equal((copy.metadata.motionComposition as any).cues[0].start,1.4);assert.deepEqual((copy.metadata.motionComposition as any).beats,[0,1.5]);assert.equal(store.listJobs().length,0);
  }finally{await new Promise<void>(resolve=>server.close(()=>resolve()));store.close();assert.equal(path.dirname(dir),fixtures);await rm(dir,{recursive:true,force:true});}
});
