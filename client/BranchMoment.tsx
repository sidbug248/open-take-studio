import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Check, GitBranch, LoaderCircle, Pause, Play, X } from 'lucide-react';
import type { Asset, Take } from '../shared/types';
import { api, json } from './api';
import { useDialog } from './useDialog';
import { acquirePlayback } from './playback';

export function BranchMoment({ asset, take, onClose, onFrame, report }: { asset: Asset; take: Take; onClose: () => void; onFrame: (asset: Asset, take: Take, seconds: number, direction: string) => void; report: (e: unknown) => void }) {
  const video = useRef<HTMLVideoElement>(null),release=useRef<(()=>void)|null>(null);
  useEffect(()=>()=>{video.current?.pause();release.current?.();},[asset.id]);
  const dialog=useDialog(onClose);
  const [time, setTime] = useState(0), [duration, setDuration] = useState(0), [playing, setPlaying] = useState(false), [direction, setDirection] = useState(''), [busy, setBusy] = useState(false);
  useEffect(()=>{const pause=()=>{if(document.hidden)video.current?.pause();};document.addEventListener('visibilitychange',pause);return()=>document.removeEventListener('visibilitychange',pause);},[]);
  function seek(value: number) { if (video.current) { video.current.pause(); video.current.currentTime = Math.max(0, Math.min(value, duration)); } setTime(value); setPlaying(false); }
  async function capture() {
    if (!video.current) return; setBusy(true); video.current.pause();
    const pausedTime = video.current.currentTime;
    try { const result = await api<{ asset: Asset; take: Take; actualSeconds: number }>(`/api/takes/${take.id}/frame`, { method: 'POST', body: json({ seconds: pausedTime, name: `${take.name} · frame at ${pausedTime.toFixed(2)}s` }) }); onFrame(result.asset, result.take, result.actualSeconds, direction); }
    catch (error) { report(error); } finally { setBusy(false); }
  }
  return <div className="moment-backdrop"><section ref={dialog} className="moment-dialog" role="dialog" aria-modal="true" aria-label="Branch from a video moment"><header><div><span className="eyebrow">ONE MOMENT. A NEW DIRECTION.</span><h2>What happens from here?</h2></div><button className="icon-button" onClick={onClose} aria-label="Close frame branching"><X size={21} /></button></header><div className="moment-video"><video ref={video} src={asset.url} poster={`/api/assets/${asset.id}/thumbnail?v=2`} playsInline preload="metadata" onLoadedMetadata={event => setDuration(event.currentTarget.duration)} onTimeUpdate={event => setTime(event.currentTarget.currentTime)} onPause={() => {setPlaying(false);release.current?.();release.current=null;}} onPlay={() => {release.current=acquirePlayback('branch-frame:'+take.id,()=>video.current?.pause());setPlaying(true);}} /></div><div className="moment-scrub"><button className="icon-button" aria-label={playing ? 'Pause source video' : 'Play source video'} onClick={() => { if (!video.current) return; playing ? video.current.pause() : video.current.play().catch(report); }}>{playing ? <Pause size={18} /> : <Play size={18} />}</button><input type="range" aria-label="Choose source moment" min={0} max={Math.max(0, duration - 0.04)} step={0.01} value={Math.min(time, Math.max(0, duration - 0.04))} onChange={event => seek(Number(event.target.value))} /><label><input aria-label="Source time in seconds" type="number" min={0} max={Math.max(0, duration - 0.04)} step={0.01} value={Number(time.toFixed(2))} onChange={event => seek(Number(event.target.value))} />s <span>/ {duration.toFixed(2)}s</span></label></div><div className="moment-direction"><label className="field-label" htmlFor="branch-direction">A different direction</label><textarea id="branch-direction" rows={3} value={direction} onChange={event => setDirection(event.target.value)} placeholder="The camera turns toward the sea. A distant light appears. What changes in this version?" /><div><p><Check size={13} />The original stays intact. This saves a real frame and its exact source time.</p><button className="btn primary" disabled={busy || !duration} onClick={capture}>{busy ? <LoaderCircle size={16} className="spin" /> : <GitBranch size={16} />}Use this moment <ArrowRight size={16} /></button></div><span className="hint">Scrubbing and saving a frame do not generate video. Review the new take setup, then choose Generate.</span></div></section></div>;
}
