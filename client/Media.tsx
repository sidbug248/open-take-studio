import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { Box, FileText, Film, Image as ImageIcon, Music2, Pause, Play, RotateCcw, Volume2, VolumeX } from 'lucide-react';
import type { Asset, Take } from '../shared/types';
import { DocumentPreview } from './DocumentPreview';
import { ModelPreview } from './ModelPreview';
import { AudioPreview, MediaPoster } from './MediaPresentation';
import { acquirePlayback } from './playback';
const SpatialPreview=lazy(()=>import('./SpatialStage').then(module=>({default:module.SpatialPreview})));


export function Media({ asset, controls = false, className = '' }: { asset?: Asset; controls?: boolean; className?: string }) {
  if (!asset) return <div className={`media-placeholder ${className}`}><ImageIcon size={30} strokeWidth={1} /></div>;
  if (asset.kind === 'image') return <img className={className} src={asset.url} alt={asset.name} loading="lazy" />;
  if (asset.kind === 'video') return controls ? <SavedVideo asset={asset} className={className}/> : <img className={className} src={`/api/assets/${asset.id}/thumbnail?v=2`} alt={asset.name} loading="lazy"/>;
  if (asset.kind === 'document'&&controls) return <DocumentPreview asset={asset}/>;
  if (asset.kind === 'audio') return controls ? <AudioPreview asset={asset}/> : <MediaPoster asset={asset} className={className}/>;
  if(asset.kind==='3d'&&controls&&asset.metadata.spatialScene)return <Suspense fallback={<div className="media-placeholder"><Box size={35}/></div>}><SpatialPreview asset={asset} interactive/></Suspense>;
  if (asset.kind === '3d' && controls) return <ModelPreview asset={asset} />;
  return <MediaPoster asset={asset} className={className} showType={controls}/>;
}
function SavedVideo({asset,className}:{asset:Asset;className:string}){
  const player=useRef<HTMLVideoElement>(null),lastSaved=useRef(0),release=useRef<(()=>void)|null>(null);
  useEffect(()=>()=>{player.current?.pause();release.current?.();},[asset.id]);
  useEffect(()=>{const pause=()=>{if(document.hidden)player.current?.pause();};document.addEventListener('visibilitychange',pause);return()=>document.removeEventListener('visibilitychange',pause);},[]);
  return <video ref={player} className={className} src={asset.url} poster={`/api/assets/${asset.id}/thumbnail?v=2`} controls playsInline preload="metadata" onPlay={()=>{release.current=acquirePlayback(`saved-video:${asset.id}`,()=>player.current?.pause());}} onPause={()=>{release.current?.();release.current=null;}} onEnded={()=>{release.current?.();release.current=null;}} onLoadedMetadata={event=>{try{const value=Number(localStorage.getItem(`ots:playback:${asset.id}`)||0);if(value>0&&value<event.currentTarget.duration-.1)event.currentTarget.currentTime=value;}catch{}}} onTimeUpdate={event=>{if(Date.now()-lastSaved.current>1000){try{localStorage.setItem(`ots:playback:${asset.id}`,String(event.currentTarget.currentTime));lastSaved.current=Date.now();}catch{}}}}/>;
}
export function KindIcon({ kind, size = 15 }: { kind: string; size?: number }) {
  if (kind === 'video') return <Film size={size} />;
  if (kind === 'audio') return <Music2 size={size} />;
  if (kind === 'document') return <FileText size={size}/>;
  if (kind === '3d') return <Box size={size} />;
  return <ImageIcon size={size} />;
}
export function Status({ state, label }: { state: string; label?: string }) {
  const labels: Record<string, string> = { COMPLETED: 'Completed', IMPORTED: 'Imported', LOCAL: 'Local edit', PENDING: 'Waiting to submit', SUBMITTING: 'Submitting', IN_QUEUE: 'In queue', IN_PROGRESS: 'Generating', COLLECTING: 'Saving media', BLOCKED: 'Action needed', FAILED: 'Failed', EXPIRED: 'Expired', RETRY_WAIT: 'Waiting to retry' };
  return <span className={`status status-${state.toLowerCase()}`}><span />{label || labels[state] || state}</span>;
}
export { Comparison } from './Comparison';
