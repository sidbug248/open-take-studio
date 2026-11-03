import { useEffect, useRef, useState } from 'react';
import { Check, Download, Image as ImageIcon, LoaderCircle, Plus, Save, Scissors, Subtitles, Trash2 } from 'lucide-react';
import type { Asset, ProjectDetail } from '../shared/types';
import { api, downloadText, json } from './api';

type Cue = { start: number; end: number; text: string };
export function LocalTools({ detail, onSaved, report }: { detail: ProjectDetail; onSaved: () => Promise<void>; report: (e: unknown) => void }) {
  const [tab, setTab] = useState<'image' | 'subtitles'>('image');
  return <><div className="section-heading"><div><h2>A few finishing touches.</h2><p className="subtle">Useful tools that run in your browser. No generation credits required.</p></div><span className="tiny-label">LOCAL PROCESSING</span></div><div className="tools-tabs"><button className={tab === 'image' ? 'active' : ''} onClick={() => setTab('image')}><Scissors size={17} />Image composition</button><button className={tab === 'subtitles' ? 'active' : ''} onClick={() => setTab('subtitles')}><Subtitles size={17} />Subtitle editor</button></div>{tab === 'image' ? <ImageEditor detail={detail} onSaved={onSaved} report={report} /> : <SubtitleEditor detail={detail} onSaved={onSaved} report={report} />}</>;
}
function ImageEditor({ detail, onSaved, report }: { detail: ProjectDetail; onSaved: () => Promise<void>; report: (e: unknown) => void }) {
  const images = detail.assets.filter(a => a.kind === 'image');
  const [sourceId, setSourceId] = useState(images[0]?.id || ''), [overlayId, setOverlayId] = useState('');
  const [ratio, setRatio] = useState('original'), [fit, setFit] = useState('cover'), [background, setBackground] = useState('#eee9df');
  const [brightness, setBrightness] = useState(100), [contrast, setContrast] = useState(100), [saturation, setSaturation] = useState(100);
  const [zoom, setZoom] = useState(1), [positionX, setPositionX] = useState(0), [positionY, setPositionY] = useState(0);
  const [overlayOpacity, setOverlayOpacity] = useState(50), [caption, setCaption] = useState(''), [captionColor, setCaptionColor] = useState('#ffffff');
  const [busy, setBusy] = useState(false), [rendered, setRendered] = useState(false);
  const canvas = useRef<HTMLCanvasElement>(null);
  const source = images.find(a => a.id === sourceId), overlay = images.find(a => a.id === overlayId);
  useEffect(() => {
    let cancelled = false; setRendered(false);
    async function draw() {
      if (!source || !canvas.current) return;
      const img = await loadImage(source.url);
      if (cancelled || !canvas.current) return;
      const originalRatio = img.naturalWidth / img.naturalHeight;
      const outputRatio = ratio === 'original' ? originalRatio : ratio === '16:9' ? 16 / 9 : ratio === '9:16' ? 9 / 16 : ratio === '4:5' ? 4 / 5 : 1;
      const width = Math.min(2048, img.naturalWidth), height = Math.round(width / outputRatio);
      const output = canvas.current; output.width = width; output.height = height;
      const ctx = output.getContext('2d'); if (!ctx) return;
      ctx.fillStyle = background; ctx.fillRect(0, 0, width, height);
      const scale = (fit === 'cover' ? Math.max(width / img.naturalWidth, height / img.naturalHeight) : Math.min(width / img.naturalWidth, height / img.naturalHeight)) * zoom;
      const w = img.naturalWidth * scale, h = img.naturalHeight * scale;
      ctx.filter = `brightness(${brightness}%) contrast(${contrast}%) saturate(${saturation}%)`;
      ctx.drawImage(img, (width - w) / 2 + positionX / 100 * width, (height - h) / 2 + positionY / 100 * height, w, h); ctx.filter = 'none';
      if (overlay) { const second = await loadImage(overlay.url); if (cancelled) return; ctx.globalAlpha = overlayOpacity / 100; const s = Math.max(width / second.naturalWidth, height / second.naturalHeight); ctx.drawImage(second, (width - second.naturalWidth * s) / 2, (height - second.naturalHeight * s) / 2, second.naturalWidth * s, second.naturalHeight * s); ctx.globalAlpha = 1; }
      if (caption) { ctx.font = `500 ${Math.round(width / 22)}px sans-serif`; ctx.textAlign = 'center'; ctx.fillStyle = captionColor; ctx.shadowBlur = width / 80; ctx.shadowColor = '#0009'; const lines = caption.split('\n'); lines.forEach((line, index) => ctx.fillText(line, width / 2, height - width / 14 - (lines.length - index - 1) * width / 18, width * 0.85)); ctx.shadowBlur = 0; }
      setRendered(true);
    }
    draw().catch(report); return () => { cancelled = true; };
  }, [source?.url, overlay?.url, ratio, fit, background, brightness, contrast, saturation, zoom, positionX, positionY, overlayOpacity, caption, captionColor, report]);
  function reset() { setBrightness(100); setContrast(100); setSaturation(100); setZoom(1); setPositionX(0); setPositionY(0); setOverlayId(''); setCaption(''); setRatio('original'); }
  async function save() {
    if (!canvas.current || !source) return;
    setBusy(true);
    try {
      const blob = await new Promise<Blob>((resolve, reject) => canvas.current!.toBlob(b => b ? resolve(b) : reject(new Error('Could not encode image')), 'image/png'));
      const settings = { ratio, fit, background, brightness, contrast, saturation, zoom, positionX, positionY, overlayOpacity, caption, captionColor };
      const body = new FormData(); body.append('file', blob, `${source.name.replace(/\.[^.]+$/, '')}-composition.png`); body.append('provenance', 'local-edit'); body.append('metadata', json({ operation: 'canvas-composite', sourceAssetId: source.id, overlayAssetId: overlay?.id, settings }));
      const asset = await api<Asset>(`/api/projects/${detail.project.id}/assets`, { method: 'POST', body });
      await api(`/api/projects/${detail.project.id}/takes/import`, { method: 'POST', body: json({ assetId: asset.id, name: asset.name, sourceAssetId: source.id, parentTakeId: detail.takes.find(t => t.assetIds.includes(source.id))?.id }) });
      await onSaved();
    } catch (e) { report(e); } finally { setBusy(false); }
  }
  return <div className="local-editor"><section className="editor-canvas"><div className="editor-toolbar"><span><ImageIcon size={15} />Composition preview</span><span className="tiny-label">SOURCE PRESERVED</span></div><div className="editor-canvas-content">{source ? <canvas ref={canvas} aria-label="Image composition preview" /> : <div className="empty-state"><ImageIcon size={35} /><h3>Add an image to get started.</h3><p>Upload or generate an image in your project, then return here.</p></div>}</div><p className="hint">The edit is saved as a new PNG and linked to its source. Output width is capped at 2048 pixels.</p></section><aside className="editor-controls"><label className="field-label" htmlFor="editor-source">Source image</label><select id="editor-source" value={sourceId} onChange={e => { setSourceId(e.target.value); reset(); }}><option value="">Choose an image</option>{images.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select><div className="settings-grid"><div className="setting"><label htmlFor="editor-ratio">Canvas</label><select id="editor-ratio" value={ratio} onChange={e => setRatio(e.target.value)}>{['original', '1:1', '16:9', '9:16', '4:5'].map(r => <option key={r}>{r}</option>)}</select></div><div className="setting"><label htmlFor="editor-fit">Image fit</label><select id="editor-fit" value={fit} onChange={e => setFit(e.target.value)}><option value="cover">Fill / crop</option><option value="contain">Fit inside</option></select></div></div><Range name="Scale" value={zoom} min={0.25} max={3} step={0.05} onChange={setZoom} /><Range name="Horizontal position" value={positionX} min={-100} max={100} onChange={setPositionX} /><Range name="Vertical position" value={positionY} min={-100} max={100} onChange={setPositionY} /><Range name="Brightness" value={brightness} min={0} max={200} onChange={setBrightness} /><Range name="Contrast" value={contrast} min={0} max={200} onChange={setContrast} /><Range name="Saturation" value={saturation} min={0} max={200} onChange={setSaturation} /><div className="color-setting"><label htmlFor="editor-background">Background</label><input id="editor-background" type="color" value={background} onChange={e => setBackground(e.target.value)} /></div><label className="field-label" htmlFor="editor-overlay">Second image layer</label><select id="editor-overlay" value={overlayId} onChange={e => setOverlayId(e.target.value)}><option value="">No overlay</option>{images.filter(a => a.id !== sourceId).map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select>{overlayId && <Range name="Layer opacity" value={overlayOpacity} min={0} max={100} onChange={setOverlayOpacity} />}<label className="field-label" htmlFor="editor-caption">Caption</label><textarea id="editor-caption" value={caption} onChange={e => setCaption(e.target.value)} rows={2} placeholder="Add campaign copy or a title" /><div className="color-setting"><label htmlFor="editor-caption-color">Text color</label><input id="editor-caption-color" type="color" value={captionColor} onChange={e => setCaptionColor(e.target.value)} /></div><div className="inline-actions"><button className="btn quiet" onClick={reset}>Reset</button><button className="btn primary" disabled={!source || !rendered || busy} onClick={save}>{busy ? <LoaderCircle className="spin" size={16} /> : <Save size={16} />}Save new take</button></div></aside></div>;
}
function Range({ name, value, min, max, step = 1, onChange }: { name: string; value: number; min: number; max: number; step?: number; onChange: (n: number) => void }) {
  return <label className="range-setting"><span>{name}<output>{value}</output></span><input type="range" aria-label={name} min={min} max={max} step={step} value={value} onChange={e => onChange(Number(e.target.value))} /></label>;
}
function loadImage(url: string) { return new Promise<HTMLImageElement>((resolve, reject) => { const image = new Image(); image.onload = () => resolve(image); image.onerror = () => reject(new Error('Could not load source image')); image.src = url; }); }
function SubtitleEditor({ detail, onSaved, report }: { detail: ProjectDetail; onSaved: () => Promise<void>; report: (e: unknown) => void }) {
  const videos = detail.assets.filter(a => a.kind === 'video');
  const [sourceId, setSourceId] = useState(videos[0]?.id || ''), [cues, setCues] = useState<Cue[]>(() => {
    try { const saved = localStorage.getItem(`ots:subtitles:${detail.project.id}`); return saved ? JSON.parse(saved) : [{ start: 0, end: 3, text: '' }]; } catch { return [{ start: 0, end: 3, text: '' }]; }
  });
  const [busy, setBusy] = useState(false), [time, setTime] = useState(0);
  const video = useRef<HTMLVideoElement>(null), source = videos.find(a => a.id === sourceId);
  useEffect(() => { localStorage.setItem(`ots:subtitles:${detail.project.id}`, json(cues)); }, [cues, detail.project.id]);
  function content() {
    const meaningful = cues.filter(c => c.text.trim());
    if (!meaningful.length) throw new Error('Add at least one subtitle line.');
    if (meaningful.some(c => !Number.isFinite(c.start) || !Number.isFinite(c.end) || c.start < 0 || c.end <= c.start)) throw new Error('Every subtitle must end after it starts, with nonnegative times.');
    return 'WEBVTT\n\n' + [...meaningful].sort((a, b) => a.start - b.start).map((c, i) => `${i + 1}\n${vttTime(c.start)} --> ${vttTime(c.end)}\n${c.text.replace(/-->/g, '→')}\n`).join('\n');
  }
  async function save() {
    setBusy(true);
    try { const text = content(); const body = new FormData(); body.append('file', new Blob([text], { type: 'text/vtt' }), 'subtitles.vtt'); body.append('provenance', 'local-edit'); body.append('metadata', json({ operation: 'subtitle-authoring', sourceAssetId: sourceId || undefined, cues })); const asset = await api<Asset>(`/api/projects/${detail.project.id}/assets`, { method: 'POST', body }); await api(`/api/projects/${detail.project.id}/takes/import`, { method: 'POST', body: json({ assetId: asset.id, name: 'Subtitles', sourceAssetId: sourceId || undefined, parentTakeId: detail.takes.find(t => t.assetIds.includes(sourceId))?.id }) }); await onSaved(); } catch (e) { report(e); } finally { setBusy(false); }
  }
  function updateCue(index: number, patch: Partial<Cue>) { setCues(list => list.map((cue, i) => i === index ? { ...cue, ...patch } : cue)); }
  return <div className="subtitle-editor"><div className="subtitle-preview"><label className="field-label" htmlFor="subtitle-source">Video reference (optional)</label><select id="subtitle-source" value={sourceId} onChange={e => { setSourceId(e.target.value); setTime(0); }}><option value="">No video</option>{videos.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select><div className="subtitle-video">{source ? <video ref={video} src={source.url} controls onTimeUpdate={e => setTime(e.currentTarget.currentTime)} playsInline /> : <Subtitles size={48} strokeWidth={1} />}{cues.filter(c => time >= c.start && time < c.end && c.text.trim()).map((c, i) => <span key={i} className="subtitle-overlay">{c.text}</span>)}</div><p className="hint">Manual subtitle authoring with live preview. Exports a WebVTT sidecar; it does not transcribe speech or burn text into the video.</p><div className="inline-actions"><button className="btn quiet" onClick={() => { try { downloadText('subtitles.vtt', content(), 'text/vtt'); } catch (e) { report(e); } }}><Download size={15} />Download VTT</button><button className="btn primary" disabled={busy} onClick={save}>{busy ? <LoaderCircle className="spin" size={15} /> : <Save size={15} />}Save to project</button></div></div><div className="cue-list"><div className="section-mini-heading"><h3>Subtitle cues</h3><span className="subtle">Times in seconds</span></div>{cues.map((cue, index) => <div className="cue-card" key={index}><div className="cue-header"><span>{String(index + 1).padStart(2, '0')}</span><label>In <input type="number" aria-label={`Cue ${index + 1} start`} min={0} step={0.1} value={cue.start} onChange={e => updateCue(index, { start: Number(e.target.value) })} /></label><label>Out <input type="number" aria-label={`Cue ${index + 1} end`} min={0} step={0.1} value={cue.end} onChange={e => updateCue(index, { end: Number(e.target.value) })} /></label><button className="icon-button" title={`Delete cue ${index + 1}`} onClick={() => setCues(list => list.filter((_, i) => i !== index))}><Trash2 size={14} /></button></div><textarea aria-label={`Cue ${index + 1} subtitle`} rows={2} placeholder="What is being said?" value={cue.text} onChange={e => updateCue(index, { text: e.target.value })} />{source && <button className="text-button" onClick={() => { if (video.current) video.current.currentTime = cue.start; }}>Preview this cue</button>}</div>)}<button className="btn secondary" onClick={() => setCues(list => [...list, { start: list.at(-1)?.end || 0, end: (list.at(-1)?.end || 0) + 3, text: '' }])}><Plus size={16} />Add cue</button></div></div>;
}
function vttTime(value: number) { const ms = Math.round(value * 1000); return `${String(Math.floor(ms / 3600000)).padStart(2, '0')}:${String(Math.floor(ms / 60000) % 60).padStart(2, '0')}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}.${String(ms % 1000).padStart(3, '0')}`; }
