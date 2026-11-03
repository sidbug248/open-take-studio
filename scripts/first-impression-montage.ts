/**
 * Offline renderer for actual screenshots and saved output clips. No browser or inference calls.
 * npx tsx scripts/first-impression-montage.ts path/to/manifest.json [--check]
 * Paths in the manifest are workspace-relative or absolute. Every run gets its own output folder.
 */
import {createHash} from 'node:crypto';
import {mkdir,mkdtemp,readFile,stat,writeFile} from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import {z} from 'zod';
import {mediaToolPaths,runMediaTool} from '../server/film-media.ts';

const shotSchema=z.object({
 id:z.string().regex(/^[a-z0-9_-]+$/),label:z.string().min(1).max(140),
 type:z.enum(['screenshot','saved-image','output-video','ui-recording']),
 file:z.string().min(1),duration:z.number().positive().max(30),start:z.number().min(0).default(0),
 audio:z.enum(['source','mute']).default('mute'),capturedAt:z.string().datetime({offset:true}).optional(),
 sourceSha256:z.string().regex(/^[a-f0-9]{64}$/).optional(),
 provenance:z.object({note:z.string().min(1),projectId:z.string().optional(),takeId:z.string().optional(),assetId:z.string().optional(),requestId:z.string().optional(),captureManifest:z.string().optional()}).strict(),
 crop:z.object({left:z.number().int().min(0),top:z.number().int().min(0),width:z.number().int().positive(),height:z.number().int().positive()}).strict().optional(),
}).strict();
const schema=z.object({
 title:z.string().min(1).max(120),resolution:z.enum(['1280x720','1920x1080']).default('1920x1080'),
 outputDirectory:z.string().default('artifacts/first-impression/walkthrough'),
 shots:z.array(shotSchema).min(1).max(50),
}).strict().refine(value=>new Set(value.shots.map(shot=>shot.id)).size===value.shots.length,{message:'Shot IDs must be unique'}).refine(value=>value.shots.reduce((sum,shot)=>sum+shot.duration,0)<=180,{message:'Keep the walkthrough at or below three minutes'});
type Shot=z.infer<typeof shotSchema>;
type Probe={streams:{codec_type:string;width?:number;height?:number;codec_name?:string;sample_rate?:string;channels?:number}[];format:{duration?:string}};
const input=process.argv.slice(2).find(argument=>!argument.startsWith('--'));
if(!input||process.argv.includes('--help')){
 console.log('Usage: npx tsx scripts/first-impression-montage.ts manifest.json [--check]\nManifest: {title, resolution?:"1920x1080", shots:[{id,label,type:"screenshot"|"saved-image"|"output-video"|"ui-recording",file,duration,start?:0,audio?:"mute"|"source",capturedAt?:ISO,sourceSha256?,provenance:{note,projectId?,takeId?,assetId?,requestId?,captureManifest?},crop?:{left,top,width,height}}]}\n--check verifies original files, hashes, dimensions and clip boundaries without rendering. No downloads or application mutations occur.');
 process.exit(0);
}
const manifestPath=path.resolve(input),manifest=schema.parse(JSON.parse(await readFile(manifestPath,'utf8'))),fps=24;
const [width,height]=manifest.resolution.split('x').map(Number),scale=width/1280,header=Math.round(96*scale),footer=Math.round(52*scale),contentHeight=height-header-footer;
const {ffmpeg,ffprobe}=mediaToolPaths();
const escape=(value:string)=>value.replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[char]!));
function wrap(value:string,limit:number,maxLines=2){const lines:string[]=[];for(const word of value.split(/\s+/)){if(!lines.length||lines.at(-1)!.length+word.length+1>limit)lines.push(word);else lines[lines.length-1]+=' '+word;}if(lines.length>maxLines)throw new Error('Shorten the visible label so it stays readable: '+value);return lines;}
const kindLabel=(shot:Shot)=>shot.type==='screenshot'?'ACTUAL UI SCREENSHOT · STILL HOLD':shot.type==='ui-recording'?'ACTUAL RECORDED UI · EXCERPT':shot.type==='saved-image'?'ACTUAL SAVED IMAGE · STILL HOLD':'ACTUAL SAVED OUTPUT · EXCERPT';
const verified=[] as {shot:Shot;file:string;sha256:string;bytes:number;fileModifiedAt:string;probe:Probe;frames:number;seconds:number;hasAudio:boolean}[];
for(const shot of manifest.shots){
 const file=path.resolve(shot.file),info=await stat(file);if(!info.isFile())throw new Error('Source is not a regular file: '+shot.id);
 const bytes=await readFile(file),sha256=createHash('sha256').update(bytes).digest('hex');if(shot.sourceSha256&&shot.sourceSha256!==sha256)throw new Error('Source hash changed: '+shot.id);
 const probe:Probe=JSON.parse((await runMediaTool(ffprobe,['-v','error','-show_streams','-show_format','-of','json',file],2*1024*1024,30000)).toString()),video=probe.streams.find(stream=>stream.codec_type==='video');
 if(!video?.width||!video.height)throw new Error('Source has no decodable picture: '+shot.id);
 const motion=shot.type==='output-video'||shot.type==='ui-recording',duration=Number(probe.format.duration),frames=Math.round(shot.duration*fps),seconds=frames/fps;
 if(!motion&&shot.start!==0)throw new Error('A screenshot/image cannot have a source time offset: '+shot.id);
 if(motion&&(!Number.isFinite(duration)||shot.start+seconds>duration+.04))throw new Error('Clip excerpt exceeds the actual original duration: '+shot.id);
 if(shot.crop&&(shot.crop.left+shot.crop.width>video.width||shot.crop.top+shot.crop.height>video.height))throw new Error('Crop is outside the actual source: '+shot.id);
 wrap(shot.label,68);verified.push({shot,file,sha256,bytes:info.size,fileModifiedAt:info.mtime.toISOString(),probe,frames,seconds,hasAudio:motion&&probe.streams.some(stream=>stream.codec_type==='audio')});
}
if(process.argv.includes('--check')){console.log(JSON.stringify({manifest:manifestPath,sourceCount:verified.length,duration:verified.reduce((sum,item)=>sum+item.seconds,0),resolution:manifest.resolution,validated:true,rendered:false,sources:verified.map(item=>({id:item.shot.id,sha256:item.sha256,seconds:item.seconds,sourceAudio:item.hasAudio}))},null,2));process.exit(0);}

const parent=path.resolve(manifest.outputDirectory);await mkdir(parent,{recursive:true});const folder=await mkdtemp(path.join(parent,'render-')),segments=path.join(folder,'segments');await mkdir(segments);
const receipt={title:manifest.title,createdAt:new Date().toISOString(),manifestFile:manifestPath,manifestSha256:createHash('sha256').update(await readFile(manifestPath)).digest('hex'),resolution:manifest.resolution,fps,policy:'Actual UI screenshots are labelled still holds. Moving segments are actual source clips, never fabricated browser interaction. Originals remain unchanged. Only selected source audio or silence is used.',shots:[] as Record<string,unknown>[]};
let elapsed=0;
for(const [index,item] of verified.entries()){
 const {shot}=item,number=String(index+1).padStart(2,'0'),overlay=path.join(segments,number+'-titles.png'),destination=path.join(segments,number+'-'+shot.id+'.mp4');
 const lines=wrap(shot.label,68),labelSize=lines.length===1?29:24,timestamp=shot.capturedAt?'CAPTURED '+shot.capturedAt.replace('T',' ').replace(/\.\d+Z$/,'Z'):shot.type==='screenshot'||shot.type==='ui-recording'?'CAPTURE TIME NOT RECORDED':'SOURCE '+(shot.provenance.assetId?.slice(0,16)||shot.id);
 const subtitle=kindLabel(shot)+(shot.audio==='source'&&item.hasAudio?' · SOURCE AUDIO':' · SILENT');
 const artwork=`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 1280 720"><rect width="1280" height="96" fill="#0c0912"/><rect y="668" width="1280" height="52" fill="#0c0912"/><rect x="28" y="24" width="4" height="50" rx="2" fill="#c7afff"/><g font-family="Arial,sans-serif">${lines.map((line,i)=>`<text x="48" y="${lines.length===1?47:36+i*27}" fill="#f8f3ff" font-size="${labelSize}" font-weight="bold">${escape(line)}</text>`).join('')}<text x="48" y="83" fill="#bca7d2" font-size="12" letter-spacing="1">${escape(subtitle)}</text><text x="28" y="691" fill="#c9b6df" font-size="12" letter-spacing="1.2">OPEN TAKE STUDIO / ACTUAL UI WALKTHROUGH MONTAGE</text><text x="28" y="709" fill="#8f7da3" font-size="10">${escape(timestamp)}</text><text x="1252" y="700" text-anchor="end" fill="#ad95c6" font-size="12">${number} / ${String(verified.length).padStart(2,'0')}</text></g></svg>`;
 await sharp(Buffer.from(artwork)).png().toFile(overlay);
 const motion=shot.type==='output-video'||shot.type==='ui-recording',sourceAudio=item.hasAudio&&shot.audio==='source';
 const args=['-nostdin','-v','error','-y',...(motion?[...(shot.start?['-ss',String(shot.start)]:[]),'-i',item.file]:['-loop','1','-framerate',String(fps),'-i',item.file]),'-loop','1','-framerate',String(fps),'-i',overlay,...(!sourceAudio?['-f','lavfi','-i','anullsrc=r=48000:cl=stereo']:[])];
 const crop=shot.crop?`crop=${shot.crop.width}:${shot.crop.height}:${shot.crop.left}:${shot.crop.top},`:'';
 args.push('-filter_complex',`[0:v]${crop}scale=${width}:${contentHeight}:force_original_aspect_ratio=decrease:force_divisible_by=2,pad=${width}:${height}:(ow-iw)/2:${header}+(${contentHeight}-ih)/2:color=0x0c0912,setsar=1,fps=${fps}[base];[base][1:v]overlay=0:0:shortest=1[v]`,'-map','[v]','-map',sourceAudio?'0:a:0':'2:a:0','-t',String(item.seconds),'-af','aresample=48000,apad','-c:v','libx264','-preset','fast','-crf','20','-pix_fmt','yuv420p','-threads','2','-c:a','aac','-b:a','160k','-ar','48000','-ac','2','-movflags','+faststart',destination);
 await runMediaTool(ffmpeg,args,2*1024*1024,180000);
 receipt.shots.push({index:index+1,...shot,sourceFile:item.file,sourceSha256:item.sha256,sourceBytes:item.bytes,sourceFileModifiedAt:item.fileModifiedAt,captureTimeKnown:!!shot.capturedAt,startsAt:elapsed,encodedSeconds:item.seconds,sourceRange:motion?{start:shot.start,end:shot.start+item.seconds}:undefined,audio:sourceAudio?'actual source audio':'silence',segment:path.relative(folder,destination)});elapsed+=item.seconds;
 await writeFile(path.join(folder,'shot-manifest.json'),JSON.stringify(receipt,null,2));console.log(JSON.stringify({segment:index+1,id:shot.id,seconds:item.seconds}));
}
const concat=path.join(segments,'all.ffconcat');await writeFile(concat,'ffconcat version 1.0\n'+receipt.shots.map(shot=>`file '${path.resolve(folder,String(shot.segment)).replaceAll('\\','/').replaceAll("'","'\\''")}'`).join('\n'));
const output=path.join(folder,'Open-Take-Studio-First-Impression-Walkthrough.mp4');
await runMediaTool(ffmpeg,['-nostdin','-v','error','-y','-f','concat','-safe','0','-i',concat,'-c','copy','-movflags','+faststart',output],2*1024*1024,120000);
const probe:Probe=JSON.parse((await runMediaTool(ffprobe,['-v','error','-show_streams','-show_format','-of','json',output],2*1024*1024,30000)).toString());
if(Math.abs(Number(probe.format.duration)-elapsed)>.25)throw new Error('Final encoded duration differs from the verified segment manifest. Inspect before sharing.');
await runMediaTool(ffmpeg,['-nostdin','-v','error','-i',output,'-f','null','-'],2*1024*1024,180000);
const bytes=await readFile(output),verification={output,createdAt:new Date().toISOString(),bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),duration:Number(probe.format.duration),expectedDuration:elapsed,completeDecodePassed:true,streams:probe.streams,noInferenceSubmitted:true,applicationDataModified:false};
await writeFile(path.join(folder,'video-verification.json'),JSON.stringify(verification,null,2));await writeFile(path.join(parent,'latest.json'),JSON.stringify({folder,output,verification:path.join(folder,'video-verification.json'),manifest:path.join(folder,'shot-manifest.json')},null,2));console.log(JSON.stringify(verification,null,2));
