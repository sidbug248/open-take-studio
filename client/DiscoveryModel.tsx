import { useEffect,useId,useRef,useState } from 'react';
import type { AssetPresentation } from '../shared/presentation-contract';
import type { DiscoveryEngine } from './discovery-engine';
import { ArrowLeft,ArrowRight,Box,Minus,Plus } from 'lucide-react';
import { PresentationImage } from './MediaTile';
import { acquirePlayback,motionIsReduced,registerDiscoveryPreview } from './playback';

export function DiscoveryModel({presentation,label,onOpen}:{presentation:AssetPresentation;label:string;onOpen:()=>void}){
 const host=useRef<HTMLDivElement>(null),mount=useRef<HTMLDivElement>(null),engine=useRef<DiscoveryEngine|null>(null),id=useId(),release=useRef<(()=>void)|null>(null),activePointer=useRef<number|null>(null),registration=useRef<ReturnType<typeof registerDiscoveryPreview>|null>(null);
 const [allowed,setAllowed]=useState(false),[mayLoad,setMayLoad]=useState(false),[ready,setReady]=useState(false),[failed,setFailed]=useState(false),[loadRequested,setLoadRequested]=useState(false),[manual,setManual]=useState(false),[reduced,setReduced]=useState(motionIsReduced);
 useEffect(()=>{const permit=()=>setMayLoad(true);window.addEventListener('ots:hero-frame',permit,{once:true});const timer=setTimeout(permit,1800);return()=>{clearTimeout(timer);window.removeEventListener('ots:hero-frame',permit);};},[]);
 useEffect(()=>{const entry=registerDiscoveryPreview({id,scope:`model:${id}`,priority:40,visibleRatio:0,eligible:!!presentation.mesh,onGrant:()=>setAllowed(true),onRevoke:()=>setAllowed(false)});registration.current=entry;const observer=new IntersectionObserver(([item])=>entry.update({visibleRatio:item.intersectionRatio}),{threshold:[0,.25,.5,1]});if(host.current)observer.observe(host.current);return()=>{observer.disconnect();entry.release();release.current?.();};},[id,presentation.mesh?.url]);
 useEffect(()=>{registration.current?.update({explicit:manual});if((allowed&&mayLoad)||manual)setLoadRequested(true);},[allowed,mayLoad,manual]);
 useEffect(()=>{if(!loadRequested||!presentation.mesh)return;let cancelled=false;async function load(){try{const {DiscoveryEngine}=await import('./discovery-engine');if(cancelled||!mount.current)return;const viewer=new DiscoveryEngine(mount.current,label);engine.current=viewer;await viewer.load(presentation.mesh!.url);if(!cancelled)setReady(true);}catch{if(!cancelled)setFailed(true);}}load();return()=>{cancelled=true;engine.current?.dispose();engine.current=null;};},[loadRequested,presentation.mesh?.url,label]);
 useEffect(()=>{const preference=matchMedia('(prefers-reduced-motion: reduce)'),changed=()=>setReduced(motionIsReduced());window.addEventListener('ots:motion-preference',changed);preference.addEventListener('change',changed);return()=>{window.removeEventListener('ots:motion-preference',changed);preference.removeEventListener('change',changed);};},[]);
 useEffect(()=>{engine.current?.setActive(allowed&&!reduced);},[allowed,ready,reduced]);
 useEffect(()=>{const end=(event:PointerEvent)=>{if(activePointer.current===event.pointerId)finish();};const blur=()=>finish();window.addEventListener('pointerup',end);window.addEventListener('pointercancel',end);window.addEventListener('blur',blur);return()=>{window.removeEventListener('pointerup',end);window.removeEventListener('pointercancel',end);window.removeEventListener('blur',blur);finish();};},[]);
 function interact(pointerId:number){activePointer.current=pointerId;setMayLoad(true);setManual(true);release.current=acquirePlayback(`model:${id}`,()=>{engine.current?.setActive(false);finish();});}
 function finish(){activePointer.current=null;const relinquish=release.current;release.current=null;relinquish?.();}
 return <div ref={host} className={`discovery-model ${ready&&!failed?'is-ready':''}`} data-original-asset={presentation.original.assetId} onPointerDown={event=>interact(event.pointerId)} onPointerUp={finish} onPointerCancel={finish}>
  <PresentationImage presentation={presentation} label={label}/><div ref={mount} className="discovery-model-canvas"/>
  <span className="discovery-model-label"><Box size={12}/>{ready?'DRAG TO DIRECT':'REAL OBJECT · SAVED VIEW'}</span>
  {!ready&&presentation.mesh&&<button className="discovery-model-fallback" onClick={()=>setManual(true)}>Orbit this object<ArrowRight size={14}/></button>}
  {ready&&<div className="discovery-model-controls"><button aria-label="Orbit object left" onClick={()=>engine.current?.orbit(-.3)}><ArrowLeft size={14}/></button><button aria-label="Orbit object right" onClick={()=>engine.current?.orbit(.3)}><ArrowRight size={14}/></button><button aria-label="Move away from object" onClick={()=>engine.current?.orbit(0,1.12)}><Minus size={14}/></button><button aria-label="Move closer to object" onClick={()=>engine.current?.orbit(0,.88)}><Plus size={14}/></button></div>}
  {(failed||!presentation.mesh)&&<button className="discovery-model-fallback" onClick={onOpen}>Open the original object<ArrowRight size={14}/></button>}
 </div>;
}
