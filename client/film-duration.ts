import type { Asset } from '../shared/types';

const positive=(value:unknown)=>{const number=typeof value==='number'||typeof value==='string'?Number(value):NaN;return Number.isFinite(number)&&number>0?number:undefined;};
const record=(value:unknown):Record<string,unknown>=>value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{};

/** Original-file metadata only. Requested generation and shortened preview durations are excluded. */
export function storedVideoDuration(asset:Pick<Asset,'metadata'>):number|undefined{
 const meta=asset.metadata,probe=record(meta.probe);
 for(const value of [meta.duration,record(meta.videoInfo).duration,record(meta.mediaInfo).duration,record(meta.video).duration,record(meta.format).duration,record(probe.format).duration]){const duration=positive(value);if(duration!==undefined)return duration;}
 return undefined;
}

const measured=new Map<string,number>();
export async function originalVideoDuration(asset:Asset):Promise<number>{
 const key=asset.id+':'+asset.sha256,known=measured.get(key)??storedVideoDuration(asset);if(known!==undefined)return known;
 return new Promise<number>((resolve,reject)=>{
  const video=document.createElement('video');let settled=false;
  const cleanup=()=>{clearTimeout(timer);video.removeEventListener('loadedmetadata',ready);video.removeEventListener('error',failed);video.removeAttribute('src');video.load();};
  const done=(error?:Error,duration?:number)=>{if(settled)return;settled=true;cleanup();if(error)reject(error);else{measured.set(key,duration!);resolve(duration!);}};
  const ready=()=>{const duration=positive(video.duration);duration===undefined?done(new Error('This original video has no readable duration.')):done(undefined,duration);};
  const failed=()=>done(new Error('The original video could not be opened. Reopen the take before adding it to the film.'));
  const timer=setTimeout(()=>done(new Error('The original video is taking too long to open. Try adding it again.')),20000);
  video.preload='metadata';video.addEventListener('loadedmetadata',ready);video.addEventListener('error',failed);video.src=asset.url;video.load();
 });
}
