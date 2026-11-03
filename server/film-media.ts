import { execFile } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';
import type { Asset } from '../shared/types.ts';
import type { FilmClip } from '../shared/film-types.ts';
import { FilmError } from './film-schema.ts';
import type { LocalFileStorage } from './media.ts';

const require=createRequire(import.meta.url);
export function mediaToolPaths():{ffmpeg:string;ffprobe:string}{
  const ffmpeg=process.env.FFMPEG_PATH||(require('ffmpeg-static') as string|null);
  const ffprobe=process.env.FFPROBE_PATH||(require('ffprobe-static') as {path:string}).path;
  if(!ffmpeg||!existsSync(ffmpeg)||!ffprobe||!existsSync(ffprobe))throw new FilmError('FFmpeg media tools are unavailable. Install project dependencies, or configure FFMPEG_PATH and FFPROBE_PATH on the server.',503);
  return{ffmpeg,ffprobe};
}
/** Argument arrays only; filenames and labels never enter a shell. */
export function runMediaTool(binary:string,args:string[],maxBuffer=32*1024*1024,timeout=120_000):Promise<Buffer>{
  const childEnv={...process.env};delete childEnv.COMFY_API_KEY;
  return new Promise((resolve,reject)=>execFile(binary,args,{windowsHide:true,encoding:'buffer',maxBuffer,timeout,env:childEnv},(error,stdout,stderr)=>{
    if(error){const message=Buffer.from(stderr??'').toString('utf8').trim().split('\n').slice(-3).join(' ').slice(0,700);reject(new FilmError(`Media processing failed${message?`: ${message}`:'. Check the source clip and retry.'}`,422));return;}
    resolve(Buffer.from(stdout));
  }));
}
export interface VideoInfo {duration:number;width:number;height:number;frameRate:number;hasAudio:boolean;audioChannels?:number;videoCodec?:string;audioCodec?:string;}
export interface FrameInfo {bytes:Buffer;requestedSeconds:number;actualSeconds:number;frameIndex:number;sourceDuration:number;}
export class FilmMediaTools {
  private infoCache=new Map<string,Promise<VideoInfo>>();
  private frameCache=new Map<string,Promise<number[]>>();
  private thumbnailWork=new Map<string,Promise<string>>();
  private thumbnailActive=0;
  private thumbnailQueue:(()=>void)[]=[];
  readonly processingDir:string;
  readonly thumbnailDir:string;
  constructor(readonly dataDir:string,readonly media:LocalFileStorage){this.processingDir=path.resolve(dataDir,'processing');this.thumbnailDir=path.resolve(dataDir,'thumbnails');}
  async inspect(asset:Asset):Promise<VideoInfo>{
    if(asset.kind!=='video')throw new FilmError('Choose a video asset');
    if(!this.infoCache.has(asset.sha256)){
      const pending=(async()=>{
        const {ffprobe}=mediaToolPaths();
        const raw=await runMediaTool(ffprobe,['-v','error','-protocol_whitelist','file,pipe','-show_streams','-show_format','-of','json',this.media.path(asset)],4*1024*1024,30_000);
        const result=JSON.parse(raw.toString('utf8'));const video=result.streams?.find((s:any)=>s.codec_type==='video'),audio=result.streams?.find((s:any)=>s.codec_type==='audio');
        if(!video)throw new FilmError('This file contains no decodable video stream');
        const duration=Number(result.format?.duration??video.duration);const parts=String(video.avg_frame_rate??'24/1').split('/').map(Number);const frameRate=parts[0]/(parts[1]||1);
        const rotation=Number(video.side_data_list?.find((s:any)=>s.rotation!==undefined)?.rotation??video.tags?.rotate??0);const rotated=Math.abs(rotation)%180===90;
        if(!Number.isFinite(duration)||duration<=0||!video.width||!video.height)throw new FilmError('Video timing or dimensions could not be read');
        return {duration,width:rotated?video.height:video.width,height:rotated?video.width:video.height,frameRate:Number.isFinite(frameRate)&&frameRate>0?frameRate:24,hasAudio:!!audio,audioChannels:audio?.channels,videoCodec:video.codec_name,audioCodec:audio?.codec_name};
      })();this.infoCache.set(asset.sha256,pending);pending.catch(()=>this.infoCache.delete(asset.sha256));
    }
    return this.infoCache.get(asset.sha256)!;
  }
  private async timestamps(asset:Asset):Promise<number[]>{
    if(!this.frameCache.has(asset.sha256)){
      const pending=(async()=>{const {ffprobe}=mediaToolPaths();const raw=await runMediaTool(ffprobe,['-v','error','-protocol_whitelist','file,pipe','-select_streams','v:0','-show_entries','frame=best_effort_timestamp_time','-of','json',this.media.path(asset)],24*1024*1024,60_000);const result=JSON.parse(raw.toString('utf8'));const values=(result.frames??[]).map((f:any)=>Number(f.best_effort_timestamp_time));if(!values.length||values.length>200_000||values.some((n:number)=>!Number.isFinite(n)))throw new FilmError('Frame timestamps could not be verified for this video');const start=values[0];return values.map((n:number)=>Math.max(0,n-start));})();
      this.frameCache.set(asset.sha256,pending);pending.catch(()=>this.frameCache.delete(asset.sha256));
    }
    return this.frameCache.get(asset.sha256)!;
  }
  async extractFrame(asset:Asset,seconds:number):Promise<FrameInfo>{
    const info=await this.inspect(asset);if(!Number.isFinite(seconds)||seconds<0||seconds>info.duration+0.001)throw new FilmError(`Choose a moment between 0 and ${info.duration.toFixed(3)} seconds`);
    const timestamps=await this.timestamps(asset);let frameIndex=0;
    // Use the displayed frame at or immediately before the requested playhead time.
    for(let i=1;i<timestamps.length&&timestamps[i]<=seconds+0.000001;i++)frameIndex=i;
    const {ffmpeg}=mediaToolPaths();
    const bytes=await runMediaTool(ffmpeg,['-nostdin','-hide_banner','-loglevel','error','-protocol_whitelist','file,pipe','-i',this.media.path(asset),'-map','0:v:0','-vf',`select=eq(n\\,${frameIndex})`,'-vsync','0','-frames:v','1','-f','image2pipe','-c:v','png','pipe:1']);
    if(bytes.length<24||!bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))throw new FilmError('Video frame extraction returned no PNG image',422);
    return {bytes,requestedSeconds:seconds,actualSeconds:timestamps[frameIndex],frameIndex,sourceDuration:info.duration};
  }
  async thumbnail(asset:Asset):Promise<string>{
    const destination=path.join(this.thumbnailDir,`${asset.sha256}.png`);
    if(existsSync(destination))return destination;
    if(!this.thumbnailWork.has(asset.sha256)){
      const pending=(async()=>{if(this.thumbnailActive>=2)await new Promise<void>(resolve=>this.thumbnailQueue.push(resolve));else this.thumbnailActive++;try{const info=await this.inspect(asset);const frame=await this.extractFrame(asset,Math.min(0.5,info.duration/2));await mkdir(this.thumbnailDir,{recursive:true});const temporary=`${destination}.${process.pid}.partial`;await writeFile(temporary,frame.bytes);await rename(temporary,destination);return destination;}finally{const next=this.thumbnailQueue.shift();if(next)next();else this.thumbnailActive--;}})();
      this.thumbnailWork.set(asset.sha256,pending);pending.finally(()=>this.thumbnailWork.delete(asset.sha256)).catch(()=>undefined);
    }
    return this.thumbnailWork.get(asset.sha256)!;
  }
  async render(clips:{asset:Asset;clip:FilmClip}[]):Promise<{bytes:Buffer;info:VideoInfo;normalization:Record<string,unknown>}>{
    if(clips.length!==2)throw new FilmError('A selected path consists of the opening and one continuation');
    const infos=await Promise.all(clips.map(c=>this.inspect(c.asset)));
    const total=clips.reduce((sum,c)=>sum+c.clip.outSeconds-c.clip.inSeconds,0);if(total>300)throw new FilmError('A local selected-path export is limited to five minutes');
    const scale=Math.min(1,1920/Math.max(infos[0].width,infos[0].height));const width=Math.max(2,Math.round(infos[0].width*scale/2)*2),height=Math.max(2,Math.round(infos[0].height*scale/2)*2);
    const fps=Math.min(60,infos[0].frameRate);const filters:string[]=[];
    for(let i=0;i<clips.length;i++){
      const c=clips[i].clip,duration=c.outSeconds-c.inSeconds;
      filters.push(`[${i}:v:0]trim=start=${c.inSeconds}:end=${c.outSeconds},setpts=PTS-STARTPTS,scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1,fps=${fps}[v${i}]`);
      filters.push(infos[i].hasAudio?`[${i}:a:0]atrim=start=${c.inSeconds}:end=${c.outSeconds},asetpts=PTS-STARTPTS,aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,apad,atrim=duration=${duration}[a${i}]`:`anullsrc=r=48000:cl=stereo,atrim=duration=${duration},asetpts=PTS-STARTPTS[a${i}]`);
    }
    filters.push('[v0][a0][v1][a1]concat=n=2:v=1:a=1[v][a]');
    await mkdir(this.processingDir,{recursive:true});const scratch=await mkdtemp(path.join(this.processingDir,'film-'));const output=path.join(scratch,'selected-path.mp4');
    try{
      const {ffmpeg}=mediaToolPaths();const inputs=clips.flatMap(c=>['-protocol_whitelist','file,pipe','-i',this.media.path(c.asset)]);
      await runMediaTool(ffmpeg,['-nostdin','-hide_banner','-loglevel','error',...inputs,'-filter_complex',filters.join(';'),'-map','[v]','-map','[a]','-c:v','libx264','-crf','18','-preset','veryfast','-pix_fmt','yuv420p','-c:a','aac','-b:a','192k','-movflags','+faststart','-threads','2',output],4*1024*1024,180_000);
      const bytes=await readFile(output);if(bytes.length>300*1024*1024)throw new FilmError('Rendered path exceeds the 300 MiB media limit');
      return{bytes,info:{duration:total,width,height,frameRate:fps,hasAudio:true,audioChannels:2,videoCodec:'h264',audioCodec:'aac'},normalization:{width,height,frameRate:fps,audioSampleRate:48000,audioChannels:2,silentPaddingForClipsWithoutAudio:true,transition:'hard cut',sourceAudioPreserved:true}};
    }finally{if(path.dirname(path.resolve(scratch))!==this.processingDir)throw new Error('Unexpected processing directory');await rm(scratch,{recursive:true,force:true});}
  }
}
