import { useEffect,useId,useRef,useState } from 'react';
import { Image as ImageIcon,Pause,Play } from 'lucide-react';
import type { Asset } from '../shared/types';
import type { AssetPresentation } from '../shared/presentation-contract';
import { acquirePlayback,getPlaybackOwner,motionIsReduced,pauseDiscovery,registerDiscoveryPreview } from './playback';

const displayCache=new Map<string,{request:Promise<AssetPresentation|null>;expires:number}>();
const positions=new Map<string,number>();
export function useDisplayPresentation(assetId?:string,host?:{current:Element|null}){
 const [presentation,setPresentation]=useState<AssetPresentation|null>(null);
 useEffect(()=>{let live=true,visible=!host,timer:ReturnType<typeof setTimeout>|undefined,attempt=0;setPresentation(null);if(!assetId)return;
  async function load(){if(!live||!visible||document.hidden)return;let entry=displayCache.get(assetId!);if(!entry||entry.expires<Date.now()){const request=fetch(`/api/assets/${assetId}/display`).then(response=>response.ok?response.json():null).catch(()=>null);entry={request,expires:Date.now()+60000};displayCache.set(assetId!,entry);}const value=await entry.request;if(!live)return;setPresentation(value);if(value?.state==='unprepared'&&attempt++<8){entry.expires=Date.now()+2000;timer=setTimeout(load,2500);}}
  const observer=host?new IntersectionObserver(([entry])=>{visible=entry.isIntersecting;if(visible)load();else if(timer)clearTimeout(timer);}):null;if(host?.current)observer?.observe(host.current);else load();const resume=()=>{if(!document.hidden&&visible)load();};document.addEventListener('visibilitychange',resume);
  return()=>{live=false;if(timer)clearTimeout(timer);observer?.disconnect();document.removeEventListener('visibilitychange',resume);};},[assetId,host]);return presentation;
}
export function pauseMediaTiles(){pauseDiscovery();}
export function PresentationImage({presentation,label,priority=false,className='',sizes='(max-width:760px) 50vw, 30vw',onLoad}:{presentation?:AssetPresentation|null;label:string;priority?:boolean;className?:string;sizes?:string;onLoad?:()=>void}){
 const poster=presentation?.poster,[failed,setFailed]=useState(false);useEffect(()=>setFailed(false),[poster?.url]);const unavailable=failed||presentation?.state==='failed'||(presentation?.state==='partial'&&!poster);
 return poster&&!failed?<img className={className} src={poster.url} srcSet={poster.srcSet||undefined} sizes={sizes} width={poster.width} height={poster.height} alt={label} loading={priority?'eager':'lazy'} fetchPriority={priority?'high':'auto'} decoding="async" onLoad={onLoad} onError={()=>setFailed(true)}/>:<div className={`display-pending ${className}`} role="img" aria-label={`${label} · display preview unavailable`} title={presentation?.description}><ImageIcon size={24}/><span>{unavailable?'Preview unavailable':'Preview preparing'}</span></div>;
}

/** Silent, prepared discovery renditions. Originals remain exclusively in edit/export actions. */
export function MediaTile({asset,presentation:provided,className='',label,onOpen,priority='card',scope,onFirstFrame}:{asset?:Asset;presentation?:AssetPresentation;className?:string;label?:string;onOpen?:()=>void;priority?:'hero'|'card';scope?:string;onFirstFrame?:()=>void}){
 const id=useId(),ownerId=`preview:${id}`,element=useRef<HTMLVideoElement>(null),host=useRef<HTMLDivElement>(null),registration=useRef<ReturnType<typeof registerDiscoveryPreview>|null>(null),releaseOwner=useRef<(()=>void)|null>(null),ratio=useRef(0);
 const fetched=useDisplayPresentation(provided?undefined:asset?.id,host),presentation=provided||fetched;
 const identity=presentation?.original.assetId||asset?.id||'',kind=presentation?.original.kind||asset?.kind;
 const [allowed,setAllowed]=useState(false),[mounted,setMounted]=useState(false),[playing,setPlaying]=useState(false),[framed,setFramed]=useState(false),[manualPaused,setManualPaused]=useState(false),[blocked,setBlocked]=useState(false),[explicit,setExplicit]=useState(false),[promoted,setPromoted]=useState(false);
 const playbackKey=`${presentation?.original.version||identity}:${presentation?.preview?.url||''}`;
 function remember(){if(element.current)positions.set(playbackKey,element.current.currentTime);}
 function pause(){remember();element.current?.pause();setPlaying(false);}
 function releaseExclusive(){const release=releaseOwner.current;releaseOwner.current=null;release?.();}
 useEffect(()=>{setFramed(false);setMounted(false);setBlocked(false);setManualPaused(false);setExplicit(false);},[identity,presentation?.preview?.url]);
 useEffect(()=>{
  registration.current=registerDiscoveryPreview({id,scope:scope||ownerId,priority:priority==='hero'?100:10,visibleRatio:0,eligible:false,onGrant:()=>{setMounted(true);setAllowed(true);},onRevoke:()=>{pause();setAllowed(false);}});
  const observer=new IntersectionObserver(([entry])=>{ratio.current=entry.intersectionRatio;registration.current?.update({visibleRatio:entry.intersectionRatio});if(entry.intersectionRatio<.25){pause();setExplicit(false);releaseExclusive();}},{threshold:[0,.25,.5,.75,1]});
  if(host.current)observer.observe(host.current);
  return()=>{observer.disconnect();remember();element.current?.pause();registration.current?.release();registration.current=null;releaseOwner.current?.();releaseOwner.current=null;};
 },[id,identity,playbackKey,scope]);
 useEffect(()=>{registration.current?.update({eligible:!!presentation?.preview&&!manualPaused&&!blocked,explicit,priority:(priority==='hero'?100:10)+(promoted?25:0),scope:scope||ownerId});},[presentation?.preview,manualPaused,blocked,explicit,promoted,priority,scope]);
 useEffect(()=>{
  const player=element.current;if(!player||!allowed||!mounted)return;
  let cancelled=false,frame=0;
  const showFrame=()=>{if(cancelled||player.readyState<2)return;setFramed(true);onFirstFrame?.();if(priority==='hero')window.dispatchEvent(new Event('ots:hero-frame'));};
  const decoded=()=>{if(typeof player.requestVideoFrameCallback==='function')frame=player.requestVideoFrameCallback(showFrame);else showFrame();};
  player.muted=true;player.play().then(()=>{if(cancelled){player.pause();return;}setPlaying(true);decoded();}).catch(()=>{if(!cancelled){setPlaying(false);setBlocked(true);releaseOwner.current?.();releaseOwner.current=null;}});
  player.addEventListener('loadeddata',decoded);
  return()=>{cancelled=true;player.removeEventListener('loadeddata',decoded);if(frame&&'cancelVideoFrameCallback' in player)player.cancelVideoFrameCallback(frame);player.pause();};
 },[allowed,mounted,presentation?.preview?.url]);
 useEffect(()=>{if(allowed||!mounted)return;const timer=setTimeout(()=>{if(ratio.current<.25){remember();setMounted(false);setFramed(false);}},12000);return()=>clearTimeout(timer);},[allowed,mounted]);
 function toggle(){if(playing||(!manualPaused&&allowed)){setManualPaused(true);setExplicit(false);pause();releaseExclusive();return;}setManualPaused(false);setBlocked(false);setExplicit(true);if(!scope||getPlaybackOwner()!==scope)releaseOwner.current=acquirePlayback(scope||ownerId,()=>{pause();setExplicit(false);setManualPaused(true);releaseExclusive();});}
 const title=label||asset?.name||'Saved creation';
 return <div ref={host} className={`media-tile ${className} ${playing?'is-playing':''} ${framed?'has-decoded-frame':''}`} data-preview-source={identity} data-playback-state={playing?'playing':blocked?'blocked':manualPaused?'paused':'poster'} onMouseEnter={()=>setPromoted(true)} onMouseLeave={()=>setPromoted(false)} onFocus={()=>setPromoted(true)} onBlur={event=>{if(!host.current?.contains(event.relatedTarget))setPromoted(false);}}>
  <PresentationImage presentation={presentation} className={kind==='video'?'tile-poster':''} label={title} priority={priority==='hero'} sizes={priority==='hero'?'(max-width:760px) 100vw, 62vw':'(max-width:760px) 50vw, 30vw'}/>
  {kind==='video'&&mounted&&presentation?.preview&&<video ref={element} src={presentation.preview.url} muted loop playsInline preload="none" aria-hidden="true" onLoadedMetadata={event=>{const time=positions.get(playbackKey)||0;if(time>0&&time<event.currentTarget.duration)event.currentTarget.currentTime=time;}} onPlay={()=>setPlaying(true)} onPause={()=>{remember();setPlaying(false);}} onError={()=>{setBlocked(true);setPlaying(false);setFramed(false);releaseOwner.current?.();releaseOwner.current=null;}}/>}
  {onOpen&&<button className="tile-open" aria-label={`Open ${title}`} onClick={onOpen}/>}
  {kind==='video'&&presentation?.preview&&<button className="tile-play" aria-label={playing?'Pause preview':'Play muted preview'} title={playing?'Pause preview':blocked?'Play preview':motionIsReduced()?'Play preview · motion is reduced':'Play muted preview'} onClick={event=>{event.stopPropagation();toggle();}}>{playing?<Pause size={14}/>:<Play size={14} fill="currentColor"/>}<span>{playing?'Pause':blocked?'Play preview':'Preview'}</span></button>}
 </div>;
}
