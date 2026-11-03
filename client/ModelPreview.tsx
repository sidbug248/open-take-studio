import { useEffect, useId, useRef, useState } from 'react';
import type { ModelViewerElement } from '@google/model-viewer';
import { ArrowLeft, ArrowRight, Box, Download, LoaderCircle, Minus, Plus, RotateCcw, Play, Pause, Image as ImageIcon } from 'lucide-react';
import type { Asset } from '../shared/types';
import { api, json } from './api';
import { acquirePlayback } from './playback';

/** Local WebGL preview only. The media remains in managed project storage. */
export function ModelPreview({ asset }: { asset: Asset }) {
  const host = useRef<HTMLDivElement>(null), viewer = useRef<ModelViewerElement | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const hintId = useId(),release=useRef<(()=>void)|null>(null);
  useEffect(()=>()=>{viewer.current?.pause();release.current?.();},[asset.id]);
  const [animations,setAnimations]=useState<string[]>([]),[animation,setAnimation]=useState(''),[playing,setPlaying]=useState(false),[posterState,setPosterState]=useState('');
  const supported = /model\/gltf-(binary|json)/i.test(asset.mimeType) || /\.(glb|gltf)$/i.test(asset.name) || /\.(glb|gltf)$/i.test(asset.fileName);

  useEffect(() => {
    if (!supported) { setState('error'); return; }
    let disposed = false;
    let element: ModelViewerElement | null = null;
    const loaded = () => { if (!disposed && element) { element.cameraTarget='auto auto auto'; element.cameraOrbit='30deg 75deg 105%'; element.fieldOfView='auto'; element.updateFraming().then(()=>element?.jumpCameraToGoal()); setAnimations(element.availableAnimations);setAnimation(element.availableAnimations[0]||'');setPlaying(false);setState('ready'); } };
    const failed = () => { if (!disposed) setState('error'); };
    setState('loading');
    async function mount() {
      // Split the renderer into a separate chunk; image/video creation never loads WebGL code.
      await import('@google/model-viewer');
      if (disposed || !host.current) return;
      element = document.createElement('model-viewer') as ModelViewerElement;
      element.src = asset.url;
      element.alt = `${asset.name}, interactive draft 3D model`;
      element.cameraControls = true;
      element.touchAction = 'pan-y';
      element.interactionPrompt = 'none';
      element.shadowIntensity = 0.6;
      element.exposure = 1;
      element.setAttribute('min-camera-orbit','auto auto 5%');
      element.setAttribute('max-camera-orbit','auto auto 300%');
      element.setAttribute('environment-image','neutral');
      element.setAttribute('aria-describedby', hintId);
      element.setAttribute('loading', 'eager');
      element.addEventListener('load', loaded);
      element.addEventListener('error', failed);
      viewer.current = element;
      host.current.replaceChildren(element);
    }
    mount().catch(failed);
    return () => {
      disposed = true;
      element?.removeEventListener('load', loaded);
      element?.removeEventListener('error', failed);
      element?.remove();
      viewer.current = null;
    };
  }, [asset.id, asset.url, asset.name, hintId, supported]);

  function orbit(direction: number) {
    const element = viewer.current; if (!element) return;
    const camera = element.getCameraOrbit();
    element.cameraOrbit = `${camera.theta + direction * Math.PI / 8}rad ${camera.phi}rad ${camera.radius}m`;
  }
  function reset() {
    const element = viewer.current; if (!element) return;
    element.cameraTarget = 'auto auto auto';
    element.cameraOrbit = '0deg 75deg 105%';
    element.fieldOfView = 'auto';
    element.updateFraming().then(()=>element.jumpCameraToGoal());
  }
  async function savePoster(){const element=viewer.current;if(!element)return;setPosterState('Saving…');try{const blob=await element.toBlob({mimeType:'image/png',idealAspect:true});const bitmap=await createImageBitmap(blob),canvas=document.createElement('canvas');const scale=Math.min(1,768/Math.max(bitmap.width,bitmap.height));canvas.width=Math.round(bitmap.width*scale);canvas.height=Math.round(bitmap.height*scale);canvas.getContext('2d')!.drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();await api(`/api/assets/${asset.id}/poster`,{method:'POST',body:json({imageDataUrl:canvas.toDataURL('image/png'),sourceSha256:asset.sha256,renderKind:'webgl',view:{orbit:element.getCameraOrbit(),target:element.getCameraTarget(),animation:element.animationName,time:element.currentTime}})});setPosterState('Poster saved');}catch(error){setPosterState(error instanceof Error?error.message:'Poster could not be saved');}}

  return <div className="model-preview">
    <div className="model-preview-label"><Box size={13} /><span>DRAFT 3D · MESH PREVIEW</span></div>
    <div ref={host} className={`model-viewer-host ${state === 'error' ? 'model-viewer-hidden' : ''}`} />
    {state === 'loading' && <div className="model-loading" role="status"><LoaderCircle size={29} className="spin" /><span>Loading saved 3D asset…</span></div>}
    {state === 'error' && <div className="model-loading model-error" role="status"><Box size={40} strokeWidth={1} /><h3>Preview unavailable</h3><p>{supported ? 'This model could not be rendered in this browser. Download the source to inspect it in a compatible 3D application.' : 'This file format does not have an embedded preview. Download the original to open it in a compatible 3D application.'}</p><a className="btn secondary" href={`${asset.url}?download=1`}><Download size={15} />Download 3D asset</a></div>}
    {animations.length>0&&<div className="model-animation-controls"><label>Animation<select value={animation} onChange={event=>{setAnimation(event.target.value);if(viewer.current){viewer.current.animationName=event.target.value;viewer.current.pause();viewer.current.currentTime=0;setPlaying(false);release.current?.();release.current=null;}}}>{animations.map(name=><option key={name}>{name}</option>)}</select></label><button className="btn secondary" onClick={()=>{if(!viewer.current)return;if(playing){viewer.current.pause();release.current?.();release.current=null;}else{release.current=acquirePlayback('model-animation:'+hintId,()=>{viewer.current?.pause();setPlaying(false);});viewer.current.play();}setPlaying(!playing);}}>{playing?<Pause size={14}/>:<Play size={14}/>} {playing?'Pause motion':'Play saved motion'}</button></div>}<div className="model-poster-action"><button className="btn quiet" disabled={state!=='ready'||posterState==='Saving…'} onClick={savePoster}><ImageIcon size={14}/>Use this view as poster</button><small role="status">{posterState}</small></div><div className="model-preview-controls"><p id={hintId}>{state === 'ready' ? 'Drag to orbit · Scroll or pinch to zoom' : 'GLB / glTF preview'}<span>A mesh asset, not a playable experience.</span></p><div><button className="icon-button" title="Orbit left" aria-label="Orbit model left" disabled={state !== 'ready'} onClick={() => orbit(-1)}><ArrowLeft size={16} /></button><button className="icon-button" title="Orbit right" aria-label="Orbit model right" disabled={state !== 'ready'} onClick={() => orbit(1)}><ArrowRight size={16} /></button><button className="icon-button" title="Zoom out" aria-label="Zoom model out" disabled={state !== 'ready'} onClick={() => viewer.current?.zoom(-1)}><Minus size={16} /></button><button className="icon-button" title="Zoom in" aria-label="Zoom model in" disabled={state !== 'ready'} onClick={() => viewer.current?.zoom(1)}><Plus size={16} /></button><button className="icon-button" title="Reset view" aria-label="Reset model view" disabled={state !== 'ready'} onClick={reset}><RotateCcw size={15} /></button><a className="icon-button" title="Download original 3D asset" href={`${asset.url}?download=1`}><Download size={16} /></a></div></div>
  </div>;
}
