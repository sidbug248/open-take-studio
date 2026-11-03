import {mkdir,readFile,writeFile,rename,stat,unlink} from 'node:fs/promises';
import {readFileSync} from 'node:fs';
import {createHash,randomUUID} from 'node:crypto';
import path from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {performance} from 'node:perf_hooks';
import sharp from 'sharp';
import type {Asset} from '../shared/types.ts';
import type {AssetPresentation,PresentationPoster,PosterVariant} from '../shared/presentation-contract.ts';
import type {Store} from './store.ts';
import type {LocalFileStorage} from './media.ts';
import {FilmMediaTools,mediaToolPaths,runMediaTool} from './film-media.ts';
export const DISPLAY_VERSION='display-v1';
const digest=(bytes:Buffer)=>createHash('sha256').update(bytes).digest('hex');
const revisionPublications=new Map<string,Promise<void>>();
/** Assets in one presentation directory share a revision file. Serialize only its
 * publication, including across DisplayMediaStore instances, while media work stays parallel. */
function publishDisplayRevision(revisionFile:string):Promise<void>{
  const absoluteDirectory=path.resolve(path.dirname(revisionFile));
  const key=process.platform==='win32'?absoluteDirectory.toLowerCase():absoluteDirectory;
  const publish=(revisionPublications.get(key)??Promise.resolve()).catch(()=>undefined).then(async()=>{
    const temporary=revisionFile+'.'+randomUUID();
    try{
      await writeFile(temporary,JSON.stringify({version:DISPLAY_VERSION,revision:randomUUID()}));
      // Windows readers/virus scanners may briefly retain a handle that disallows
      // replacement. Never unlink the published destination: readers must see old or new JSON.
      const deadline=performance.now()+5000;
      for(let attempt=0;;attempt++){
        try{await rename(temporary,revisionFile);break;}
        catch(error){
          const code=(error as NodeJS.ErrnoException).code,remaining=deadline-performance.now();
          if(!['EPERM','EBUSY'].includes(code??'')||remaining<=0)throw error;
          // Scanners can retain a no-delete-share handle for seconds under load.
          // Jitter avoids repeatedly colliding with a periodic reader at the same cadence.
          await delay(Math.min(remaining,Math.min(500,25*2**Math.min(attempt,5))+Math.floor(Math.random()*50)));
        }
      }
    }finally{await unlink(temporary).catch(error=>{if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;});}
  });
  revisionPublications.set(key,publish);
  void publish.finally(()=>{if(revisionPublications.get(key)===publish)revisionPublications.delete(key);}).catch(()=>undefined);
  return publish;
}
interface CachedDisplay {version:string;assetId:string;sourceSha256:string;posterSourceSha256?:string;preparedAt:string;optionsKey:string;presentation:AssetPresentation;files:{file:string;sha256:string;bytes:number}[];}
export class DisplayMediaStore {
  readonly root:string;readonly tools:FilmMediaTools;readonly revisionFile:string;
  constructor(readonly store:Store,readonly media:LocalFileStorage){this.root=path.resolve(store.dataDir,'presentation',DISPLAY_VERSION);this.tools=new FilmMediaTools(store.dataDir,media);this.revisionFile=path.resolve(store.dataDir,'presentation','display-revision.json');}
  publishRevision(){return publishDisplayRevision(this.revisionFile);}
  /** This tiny marker is read/opened/closed in one synchronous operation so a busy
   * image threadpool cannot hold a Windows reader handle across revision replacement. */
  readRevision():string{try{return readFileSync(this.revisionFile,'utf8');}catch{return '';}}
  directory(asset:Asset){if(!/^[A-Za-z0-9_-]+$/.test(asset.id)||!/^[a-f0-9]{64}$/.test(asset.sha256))throw new Error('Invalid presentation source identity');return path.join(this.root,asset.id,asset.sha256);}
  original(asset:Asset):AssetPresentation['original']{return{assetId:asset.id,projectId:asset.projectId,sha256:asset.sha256,version:asset.sha256,kind:asset.kind,mimeType:asset.mimeType,url:asset.url,bytes:asset.size};}
  async describe(asset:Asset):Promise<AssetPresentation>{try{const saved=JSON.parse(await readFile(path.join(this.directory(asset),'index.json'),'utf8')) as CachedDisplay;if(saved.version===DISPLAY_VERSION&&saved.assetId===asset.id&&saved.sourceSha256===asset.sha256)return{...saved.presentation,original:this.original(asset)};}catch{}try{const failure=JSON.parse(await readFile(path.join(this.directory(asset),'failure.json'),'utf8'));if(failure.assetId===asset.id&&failure.sourceSha256===asset.sha256)return{original:this.original(asset),presentationVersion:DISPLAY_VERSION,state:'failed',description:failure.description};}catch{}return{original:this.original(asset),presentationVersion:DISPLAY_VERSION,state:'unprepared'};}
  async recordFailure(asset:Asset,error:unknown){const directory=this.directory(asset);await mkdir(directory,{recursive:true});const temporary=path.join(directory,`failure-${randomUUID()}.json`);await writeFile(temporary,JSON.stringify({assetId:asset.id,sourceSha256:asset.sha256,description:`Local preview preparation failed: ${error instanceof Error?error.message.slice(0,500):'Unable to decode this media.'}`}));await rename(temporary,path.join(directory,'failure.json'));await this.publishRevision();}
  async prepare(asset:Asset,options:{hero?:boolean;sourceInSeconds?:number;sourceOutSeconds?:number}={}):Promise<AssetPresentation>{
    const source=await this.media.read(asset);if(digest(source)!==asset.sha256)throw new Error('Original media hash changed; display preparation stopped');
    const savedPoster=this.store.getAsset(String(asset.metadata.posterAssetId??'')),poster=savedPoster?.projectId===asset.projectId&&savedPoster.kind==='image'&&savedPoster.metadata.sourceSha256===asset.sha256?savedPoster:undefined;
    const optionsKey=JSON.stringify(options),prior=await this.describe(asset);try{const record=JSON.parse(await readFile(path.join(this.directory(asset),'index.json'),'utf8')) as CachedDisplay;if(record.optionsKey===optionsKey&&['ready','partial'].includes(prior.state)&&(!poster||prior.poster?.sourceSha256===poster.sha256))return prior;}catch{}
    const directory=this.directory(asset);await mkdir(directory,{recursive:true});const files:CachedDisplay['files']=[];
    const put=async(bytes:Buffer,extension:string)=>{const sha256=digest(bytes),file=`${sha256}.${extension}`;await writeFile(path.join(directory,file),bytes,{flag:'wx'}).catch(error=>{if(error.code!=='EEXIST')throw error;});files.push({file,sha256,bytes:bytes.length});return `/api/display/${asset.id}/${asset.sha256}/${DISPLAY_VERSION}/${file}`;};
    const result:AssetPresentation={original:this.original(asset),presentationVersion:DISPLAY_VERSION,state:'partial'};
    let posterBytes:Buffer|undefined,posterId=asset.id,posterHash=asset.sha256,posterKind:PresentationPoster['kind']='source';
    if(asset.kind==='image')posterBytes=source;
    else if(poster){posterBytes=await this.media.read(poster);if(digest(posterBytes)!==poster.sha256)throw new Error('Saved poster integrity check failed');posterId=poster.id;posterHash=poster.sha256;posterKind=(poster.metadata.posterKind??'rendered') as PresentationPoster['kind'];}
    else if(asset.kind==='video'){posterBytes=await readFile(await this.tools.thumbnail(asset));posterKind='rendered';}
    if(asset.kind==='audio'){
      const existing=poster?.metadata.waveform,duration=poster?.metadata.duration;
      if(Array.isArray(existing)&&typeof duration==='number')result.waveform={peaks:existing as number[],duration};
      else{const {ffmpeg,ffprobe}=mediaToolPaths(),raw=await runMediaTool(ffmpeg,['-nostdin','-v','error','-i',this.media.path(asset),'-t','600','-vn','-ac','1','-ar','8000','-f','f32le','pipe:1'],24*1024*1024),probe=JSON.parse((await runMediaTool(ffprobe,['-v','error','-show_entries','format=duration','-of','json',this.media.path(asset)])).toString()),samples=raw.length/4,peaks=Array.from({length:120},(_,i)=>{let peak=0;for(let n=Math.floor(i*samples/120);n<Math.floor((i+1)*samples/120);n++)peak=Math.max(peak,Math.abs(raw.readFloatLE(n*4)));return Math.min(1,peak);});result.waveform={peaks,duration:Number(probe.format.duration)};}
      if(!posterBytes){const peaks=result.waveform.peaks,max=Math.max(.001,...peaks);posterBytes=await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="960" height="600"><rect width="960" height="600" fill="#181522"/>${peaks.map((n,i)=>`<rect x="${i*8}" y="${300-n/max*120}" width="5" height="${Math.max(2,n/max*240)}" rx="2" fill="#b69aff"/>`).join('')}</svg>`)).png().toBuffer();posterKind='waveform';}
    }
    if(posterBytes){const variants:PosterVariant[]=[];for(const width of [320,640,960,1440]){const rendered=await sharp(posterBytes,{limitInputPixels:64_000_000}).rotate().resize({width,withoutEnlargement:true}).webp({quality:78,effort:4}).toBuffer({resolveWithObject:true});if(variants.some(v=>v.width===rendered.info.width))continue;variants.push({url:await put(rendered.data,'webp'),width:rendered.info.width,height:rendered.info.height,bytes:rendered.data.length,mimeType:'image/webp' as const});}const preferred=variants.find(v=>v.width>=960)??variants.at(-1)!;result.poster={...preferred,srcSet:variants.map(v=>`${v.url} ${v.width}w`).join(', '),variants,kind:posterKind,sourceAssetId:posterId,sourceSha256:posterHash};}
    if(asset.kind==='video'){const info=await this.tools.inspect(asset),start=Math.max(0,Math.min(options.sourceInSeconds??0,info.duration-.1)),end=Math.min(info.duration,options.sourceOutSeconds??start+4),duration=Math.min(4,end-start);if(duration<=0)throw new Error('Preview clip boundary must contain video');const processing=path.join(this.store.dataDir,'processing');await mkdir(processing,{recursive:true});const temporary=path.join(processing,`display-${randomUUID()}.mp4`),bound=options.hero?960:640;await runMediaTool(mediaToolPaths().ffmpeg,['-nostdin','-hide_banner','-loglevel','error','-ss',String(start),'-i',this.media.path(asset),'-t',String(duration),'-map','0:v:0','-an','-sn','-dn','-vf',`scale=w='min(${bound},iw)':h='min(${bound},ih)':force_original_aspect_ratio=decrease:force_divisible_by=2,fps=24`,'-c:v','libx264','-preset','fast','-crf','27','-pix_fmt','yuv420p','-movflags','+faststart','-threads','2',temporary],4*1024*1024,180000);const bytes=await readFile(temporary),probe=JSON.parse((await runMediaTool(mediaToolPaths().ffprobe,['-v','error','-show_streams','-show_format','-of','json',temporary])).toString()),video=probe.streams.find((s:any)=>s.codec_type==='video');if(probe.streams.some((s:any)=>s.codec_type==='audio'))throw new Error('Discovery preview unexpectedly contains audio');const url=await put(bytes,'mp4');await unlink(temporary);result.preview={url,width:video.width,height:video.height,duration:Number(probe.format.duration),bytes:bytes.length,mimeType:'video/mp4',silent:true,sourceInSeconds:start,sourceOutSeconds:start+duration,sourceAssetId:asset.id,sourceSha256:asset.sha256};}
    if(asset.mimeType==='model/gltf-binary'){const {reduceDisplayMesh}=await import('./display-mesh.ts'),reduced=await reduceDisplayMesh(source);result.mesh={url:await put(reduced.bytes,'glb'),bytes:reduced.bytes.length,mimeType:'model/gltf-binary',sourceAssetId:asset.id,sourceSha256:asset.sha256,purpose:'discovery-only',triangles:reduced.triangles,textureMaxSize:reduced.textureMaxSize};}
    result.state=result.poster&&(!(asset.kind==='video')||result.preview)&&(!(asset.kind==='3d')||result.mesh)?'ready':'partial';
    const record:CachedDisplay={version:DISPLAY_VERSION,assetId:asset.id,sourceSha256:asset.sha256,posterSourceSha256:poster?.sha256,preparedAt:new Date().toISOString(),optionsKey,presentation:result,files},temporaryIndex=path.join(directory,`index-${randomUUID()}.json`);await writeFile(temporaryIndex,JSON.stringify(record));await rename(temporaryIndex,path.join(directory,'index.json'));await this.publishRevision();return result;
  }
  async file(asset:Asset,version:string,file:string){if(version!==DISPLAY_VERSION||!/^[a-f0-9]{64}\.(?:webp|jpg|mp4|glb)$/.test(file))throw Object.assign(new Error('Unknown display rendition'),{status:404});const destination=path.join(this.directory(asset),file);await stat(destination);return destination;}
}
