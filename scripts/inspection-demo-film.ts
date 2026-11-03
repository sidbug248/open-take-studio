/** Rebuilds a labelled evidence montage from owned media. No inference calls. */
import { mkdir, readFile, writeFile, access } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { mediaToolPaths, runMediaTool } from '../server/film-media.ts';

const folder = path.resolve('artifacts/inspection-build/delivery'), sourceFolder = path.join(folder,'sources'), segmentFolder=path.join(folder,'segments');
await Promise.all([mkdir(sourceFolder,{recursive:true}),mkdir(segmentFolder,{recursive:true})]);
const production=JSON.parse(await readFile('artifacts/inspection-build/production/requests.json','utf8'));
const base='http://127.0.0.1:4310';
const {ffmpeg,ffprobe}=mediaToolPaths();
const esc=(value:string)=>value.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
type Scene={id:string;title:string;label:string;seconds:number;kind:'image'|'video';file?:string;key?:string;assetId?:string;audioAssetId?:string;offset?:number;projectId?:string;requestId?:string;takeId?:string;jobId?:string};
const scenes:Scene[]=[
 {id:'opening',title:'OPEN TAKE STUDIO',label:'A creative production studio. Every direction keeps its history.',seconds:4,kind:'image',key:'saffron-origin'},
 {id:'workspace',title:'Begin with a world. Keep every possibility.',label:'ACTUAL BROWSER FRAME / saved project and media workspace',seconds:4,kind:'image',file:'artifacts/inspection-build/ui-evidence/01-saved-workspace.png'},
 {id:'fresh-draft',title:'Start an original project.',label:'ACTUAL BROWSER FRAME / Velvet Observatory prompt and selected model',seconds:3,kind:'image',file:'artifacts/inspection-build/creator-review/02-fresh-draft.png'},
 {id:'fresh-image',title:'Generate a take. See the real result.',label:'ACTUAL BROWSER FRAME / completed FLUX 3 image in the same project',seconds:3,kind:'image',file:'artifacts/inspection-build/creator-review/04-new-image.png'},
 {id:'fresh-animate',title:'Animate this exact take.',label:'ACTUAL BROWSER FRAME / saved image selected for a new H3 request',seconds:3,kind:'image',file:'artifacts/inspection-build/creator-review/05-animate-submitted.png'},
 {id:'fresh-result',title:'The original image becomes a moving scene.',label:'ACTUAL COMPLETED H3 OUTPUT / linked source, take and request retained',seconds:5,kind:'video',assetId:'0d787035-4f90-4e01-8b1d-159ff197e86d',projectId:'f03f4e1f-d214-464a-9743-77fd14575fa8',takeId:'c9e7b846-83c9-46fd-936b-3bd63b6d3d79',jobId:'b0257201-ad8a-4e0d-b361-3f284cf11f10',requestId:'26238e92-e63e-44b6-9722-e34d68604089'},
 {id:'fresh-review',title:'Review the returned clip. Download the original.',label:'ACTUAL BROWSER FRAME / saved video played and original download verified',seconds:2,kind:'image',file:'artifacts/inspection-build/creator-review/06-new-video.png'},
 {id:'fresh-reopen',title:'Come back to the same project.',label:'ACTUAL BROWSER FRAME / source, prompt, parent and selected video restored',seconds:3,kind:'image',file:'artifacts/inspection-build/creator-review/07-restored-video-workspace.png'},
 {id:'couture-image',title:'Cerulean Couture',label:'ACTUAL FLUX 3 IMAGE / original collection',seconds:2.5,kind:'image',key:'couture-origin'},
 {id:'botanical-image',title:'Botanical Machines',label:'ACTUAL FLUX 3 IMAGE / original collection',seconds:2.5,kind:'image',key:'botanical-origin'},
 {id:'pocket-image',title:'Pocket Mythologies',label:'ACTUAL FLUX 3 IMAGE / original collection',seconds:2.5,kind:'image',key:'pocket-origin'},
 {id:'cinema-couture',title:'Give the image a next moment.',label:'ACTUAL MINIMAX H3 OUTPUT / image to video',seconds:4,kind:'video',key:'couture-motion-1'},
 {id:'cinema-botanical',title:'Build motion around a saved source.',label:'ACTUAL MINIMAX H3 OUTPUT / source relationships retained',seconds:4,kind:'video',key:'botanical-motion-1'},
 {id:'cinema-paper',title:'Follow another kind of story.',label:'ACTUAL MINIMAX H3 OUTPUT / Paper Signals',seconds:4,kind:'video',key:'paper-motion-1'},
 {id:'cinema-tidal',title:'Write a scene. Hear its atmosphere.',label:'ACTUAL MINIMAX H3 OUTPUT / text-only generation with native audio',seconds:4,kind:'video',key:'h3-text-sea-gate'},
 {id:'references',title:'Give your references a role.',label:'ACTUAL BROWSER FRAME / placement and locking; conditioning is interpretive',seconds:4,kind:'image',file:'artifacts/inspection-build/ui-evidence/02-reference-role-locked.png'},
 {id:'restyle-before',title:'A performance, before the new direction.',label:'ACTUAL SOURCE CLIP / original saved H3 take',seconds:3.5,kind:'video',key:'couture-motion-1'},
 {id:'restyle-after',title:'Recast its appearance. Preserve the source.',label:'ACTUAL FLUX VIDEO EDIT OUTPUT / deliberate alternate take',seconds:3.5,kind:'video',key:'couture-video-restyle'},
 {id:'camera',title:'Camera intention stays editable.',label:'ACTUAL BROWSER FRAME / prompt-guided preset; no enforced camera path',seconds:4,kind:'image',file:'artifacts/inspection-build/current-local-proofs/camera-after.png'},
 {id:'batch',title:'Reuse completed work. Reopen the same batch.',label:'ACTUAL BROWSER FRAME / two sources reused; zero new generation jobs',seconds:4,kind:'image',file:'artifacts/inspection-build/current-local-proofs/batch-reopened.png'},
 {id:'native-graph',title:'Work inside an actual native graph.',label:'ACTUAL COMFY CLOUD EDITOR FRAME / separate native workflow route',seconds:4,kind:'image',file:'artifacts/inspection-build/cloud/native-h3-completed-detail.png'},
 {id:'native-regenerate',title:'Resolve a route through the right workflow.',label:'ACTUAL NATIVE H3 2K REGENERATION / Router base-video mode remains disabled',seconds:4,kind:'video',assetId:'wf-508b0c0972066bee077c78a3fb02cc16d6a2d198',projectId:'94db17ce-def1-4abd-8f48-b08c8cb62928',requestId:'83013072-156f-4a0d-92fd-29c3971de776',takeId:'59324d6c-f0a4-414e-819b-f4205ac984e4',jobId:'af3fa0f3-626d-42a7-acf4-9c4dd31e7085'},
 {id:'motion-paper',title:'Turn original sound into visual rhythm.',label:'ACTUAL LOCAL COMPOSITION RENDER / saved type, cues and audio',seconds:6,kind:'video',assetId:'dcaac99a-6acc-4261-81ad-8fb4858ad789',projectId:'1659408b-f807-418b-8a67-3c2404e0d12e'},
 {id:'motion-botanical',title:'Arrange it. Render it. Keep the editable source.',label:'ACTUAL LOCAL COMPOSITION RENDER / not a generated music claim',seconds:6,kind:'video',assetId:'4fa2fbe9-1b64-442b-8e14-cf7b58481d30',projectId:'1659408b-f807-418b-8a67-3c2404e0d12e'},
 {id:'object-a',title:'Make the object explorable.',label:'ACTUAL INDEPENDENT PLAYER FRAME / real Meshy geometry and authored viewpoint',seconds:3,kind:'image',file:'artifacts/inspection-build/object-room/browser/01-silhouette.png'},
 {id:'object-b',title:'Change viewpoint. Discover the details.',label:'ACTUAL INDEPENDENT PLAYER FRAME / keyboard and pointer navigation verified',seconds:3,kind:'image',file:'artifacts/inspection-build/object-room/browser/03-light.png'},
 {id:'film',title:'One opening. More than one future.',label:'ACTUAL PRIOR BROWSER CAPTURE / saved branching film; sampled interaction',seconds:4,kind:'video',file:'artifacts/next-build/prismatic-film/Film-interaction.mp4',offset:3},
 {id:'game',title:'Build an experience that plays.',label:'ACTUAL PRIOR BROWSER CAPTURE / authored game mechanics; sampled interaction',seconds:4,kind:'video',file:'artifacts/next-build/playable-evidence/Playable-interaction.mp4',offset:3},
 {id:'closing',title:'YOUR NEXT TAKE STARTS HERE.',label:'OPEN TAKE STUDIO  /  http://127.0.0.1:4310',seconds:5,kind:'image',key:'botanical-origin'},
];
if(scenes.reduce((sum,scene)=>sum+scene.seconds,0)>120)throw new Error('Demo exceeds two minutes');
async function ownedAsset(id:string,kind:string){const file=path.join(sourceFolder,id+(kind==='video'?'.mp4':kind==='audio'?'.wav':'.png'));try{await access(file);return file;}catch{}const response=await fetch(base+'/api/assets/'+id+'/file');if(!response.ok)throw new Error('Missing owned media '+id);await writeFile(file,Buffer.from(await response.arrayBuffer()));return file;}
const manifest:any[]=[];
for(let i=0;i<scenes.length;i++){
 const scene=scenes[i]!,number=String(i+1).padStart(2,'0');
 if(scene.key){const request=production.find((row:any)=>row.key===scene.key&&row.state==='COMPLETED');if(!request)throw new Error('No completed source '+scene.key);scene.assetId=request.outputAssetIds[0];scene.projectId=request.body.projectId;scene.requestId=request.requestId;scene.takeId=request.takeId;scene.jobId=request.jobId;}
 const input=scene.assetId?await ownedAsset(scene.assetId,scene.kind):path.resolve(scene.file!);
 const bytes=await readFile(input),sha256=createHash('sha256').update(bytes).digest('hex');
 const overlay=path.join(segmentFolder,number+'-overlay.png');
 await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720"><rect x="0" y="608" width="1280" height="112" fill="#0c0d15" fill-opacity="0.96"/><rect x="30" y="629" width="5" height="60" rx="2" fill="#bf9cff"/><g font-family="Arial,sans-serif"><text x="52" y="652" font-size="28" font-weight="bold" fill="#f8f5ff">${esc(scene.title)}</text><text x="52" y="685" font-size="15" fill="#cbc3dc">${esc(scene.label)}</text><rect x="23" y="18" width="206" height="31" rx="8" fill="#0c0d15" fill-opacity="0.88"/><text x="38" y="40" font-size="15" letter-spacing="2" font-weight="bold" fill="#e7d8ff">OPEN TAKE STUDIO</text></g></svg>`)).png().toFile(overlay);
 const output=path.join(segmentFolder,number+'-'+scene.id+'.mp4');
 const probe=JSON.parse((await runMediaTool(ffprobe,['-v','error','-show_streams','-of','json',input],1024*1024,20000)).toString('utf8'));
 const hasAudio=scene.kind==='video'&&probe.streams.some((stream:any)=>stream.codec_type==='audio');
 const inputArgs=scene.kind==='image'?['-loop','1','-i',input]:[...(scene.offset?['-ss',String(scene.offset)]:[]),'-i',input];
 const args=['-nostdin','-v','error','-y',...inputArgs,'-loop','1','-i',overlay,...(!hasAudio?['-f','lavfi','-i','anullsrc=r=48000:cl=stereo']:[]),'-filter_complex','[0:v]scale=1280:608:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(608-ih)/2:color=0x0c0d15,setsar=1,fps=24[base];[base][1:v]overlay=0:0:shortest=1[v]','-map','[v]','-map',hasAudio?'0:a:0':'2:a:0','-t',String(scene.seconds),'-af','aresample=48000,apad','-c:v','libx264','-preset','fast','-crf','20','-pix_fmt','yuv420p','-c:a','aac','-b:a','160k','-ar','48000','-ac','2','-movflags','+faststart',output];
 await runMediaTool(ffmpeg,args,1024*1024,120000);
 manifest.push({...scene,index:i+1,startsAt:scenes.slice(0,i).reduce((sum,entry)=>sum+entry.seconds,0),sourceFile:path.relative(folder,input),sourceSha256:sha256,segment:path.relative(folder,output),audio:hasAudio?'actual source audio':'silence',presentation:scene.file?.endsWith('.png')?'sampled actual browser frame':scene.file?'sampled prior actual browser recording':scene.kind==='video'?'actual saved output clip':'actual saved image output'});
 await writeFile(path.join(folder,'shot-manifest.json'),JSON.stringify({title:'Open Take Studio / Inspection build',createdAt:new Date().toISOString(),sourcePolicy:'Only original studio outputs and actual browser captures. Sampled frames are labelled, not presented as a continuous UI recording.',shots:manifest},null,2));
 console.log(JSON.stringify({segment:i+1,id:scene.id,seconds:scene.seconds}));
}
const concat=path.join(segmentFolder,'all.ffconcat');await writeFile(concat,manifest.map(item=>`file '${path.resolve(folder,item.segment).replaceAll('\\','/').replaceAll("'","'\\''")}'`).join('\n'));
const final=path.join(folder,'Open-Take-Studio-Inspection-Demo.mp4');
await runMediaTool(ffmpeg,['-nostdin','-v','error','-y','-f','concat','-safe','0','-i',concat,'-c','copy','-movflags','+faststart',final],1024*1024,120000);
const probe=JSON.parse((await runMediaTool(ffprobe,['-v','error','-show_streams','-show_format','-of','json',final],1024*1024,20000)).toString('utf8'));
const expectedDuration=scenes.reduce((sum,scene)=>sum+scene.seconds,0);if(Math.abs(Number(probe.format.duration)-expectedDuration)>.1)throw new Error('Encoded duration does not match shot manifest');
await runMediaTool(ffmpeg,['-nostdin','-v','error','-i',final,'-f','null','-'],1024*1024,120000);
const bytes=await readFile(final);await writeFile(path.join(folder,'video-verification.json'),JSON.stringify({at:new Date().toISOString(),file:final,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),duration:Number(probe.format.duration),expectedDuration,completeDecodePassed:true,streams:probe.streams.map((stream:any)=>({type:stream.codec_type,codec:stream.codec_name,width:stream.width,height:stream.height,sampleRate:stream.sample_rate,channels:stream.channels})),noInferenceSubmitted:true},null,2));
console.log(JSON.stringify({file:final,duration:Number(probe.format.duration),bytes:bytes.length}));
