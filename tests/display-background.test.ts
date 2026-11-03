import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,readFile,rm} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {Store} from '../server/store.ts';
import {LocalFileStorage} from '../server/media.ts';
import {DisplayPreparationWorker} from '../server/display-worker.ts';
import {mediaToolPaths,runMediaTool} from '../server/film-media.ts';

test('background scanner prepares new assets and restores only missing-tool failures with configured media binaries',async()=>{
  const base=path.resolve('data/test-fixtures');await mkdir(base,{recursive:true});const directory=await mkdtemp(path.join(base,'display-background-')),store=new Store(directory),media=new LocalFileStorage(directory),originalEnv={ffmpeg:process.env.FFMPEG_PATH,ffprobe:process.env.FFPROBE_PATH},tools=mediaToolPaths();let worker=new DisplayPreparationWorker(store,media);
  const now=new Date().toISOString();store.upsertProject({id:'p',name:'Background fixture',description:'',createdAt:now,updatedAt:now});
  const ready=async(asset:any,timeout=16000)=>{const deadline=Date.now()+timeout;while(Date.now()<deadline){const descriptor=await worker.display.describe(asset);if(descriptor.state==='ready')return descriptor;if(descriptor.state==='failed')throw new Error(descriptor.description);await new Promise(resolve=>setTimeout(resolve,75));}throw new Error('Background preparation timed out');};
  try{
    worker.start();await worker.scan();
    const bytes=await sharp({create:{width:96,height:64,channels:3,background:'#8c73bb'}}).png().toBuffer(),image=await media.put({projectId:'p',name:'New valid image.png',mimeType:'image/png',bytes,provenance:'imported'});store.upsertAsset(image);
    const imageDisplay=await ready(image);assert.equal(imageDisplay.poster?.sourceAssetId,image.id);assert.equal(imageDisplay.original.sha256,image.sha256);const indexFile=path.join(worker.display.directory(image),'index.json'),originalIndex=await readFile(indexFile);await worker.stop();
    const videoPath=path.join(directory,'source.mp4');await runMediaTool(tools.ffmpeg,['-nostdin','-v','error','-f','lavfi','-i','testsrc2=size=96x64:rate=12:duration=1','-c:v','libx264','-pix_fmt','yuv420p','-threads','1',videoPath]);const video=await media.put({projectId:'p',name:'New real video.mp4',mimeType:'video/mp4',bytes:await readFile(videoPath),provenance:'imported'});store.upsertAsset(video);
    process.env.FFMPEG_PATH=tools.ffmpeg;process.env.FFPROBE_PATH=path.join(directory,'missing-ffprobe');worker=new DisplayPreparationWorker(store,media);
    await assert.rejects(worker.prepare(video.id),/FFmpeg media tools are unavailable/,'The worker must honor configured binary paths, rather than silently using bundled defaults');assert.equal((await worker.display.describe(video)).state,'failed');await worker.stop();
    process.env.FFMPEG_PATH=tools.ffmpeg;process.env.FFPROBE_PATH=tools.ffprobe;worker=new DisplayPreparationWorker(store,media);worker.start();
    const deadline=Date.now()+10000;let fixed=await worker.display.describe(video);while(fixed.state!=='ready'&&Date.now()<deadline){await new Promise(resolve=>setTimeout(resolve,75));fixed=await worker.display.describe(video);}assert.equal(fixed.state,'ready',fixed.description??'Recovered video preview is not ready');assert.equal(fixed.preview?.silent,true);assert.ok(fixed.preview!.duration<=1.1);assert.deepEqual(await readFile(indexFile),originalIndex,'Already prepared images must not be regenerated');assert.equal(createHash('sha256').update(await media.read(video)).digest('hex'),video.sha256);assert.equal(store.listAssets().length,2);
    const failedImage=await media.put({projectId:'p',name:'Invalid image.png',mimeType:'image/png',bytes:Buffer.from([137,80,78,71,13,10,26,10]),provenance:'imported'});store.upsertAsset(failedImage);await assert.rejects(worker.prepare(failedImage.id));const failureFile=path.join(worker.display.directory(failedImage),'failure.json'),failure=await readFile(failureFile);await worker.scan();await new Promise(resolve=>setTimeout(resolve,100));assert.deepEqual(await readFile(failureFile),failure,'Malformed-media failures must not enter a preparation loop');
  }finally{await worker.stop();store.close();if(originalEnv.ffmpeg===undefined)delete process.env.FFMPEG_PATH;else process.env.FFMPEG_PATH=originalEnv.ffmpeg;if(originalEnv.ffprobe===undefined)delete process.env.FFPROBE_PATH;else process.env.FFPROBE_PATH=originalEnv.ffprobe;await rm(directory,{recursive:true,force:true,maxRetries:5,retryDelay:100});}
});
