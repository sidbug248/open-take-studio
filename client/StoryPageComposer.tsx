import { useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, Download, Image as ImageIcon, LoaderCircle, Plus, Save, Trash2, X } from 'lucide-react';
import type { Asset, ProjectDetail } from '../shared/types';
import { api, json } from './api';

type StoryPanel = { id: string; shotId?: string; assetId: string; caption: string };
type PageAspect = 'portrait' | 'landscape' | 'square';

/** Browser-native page composition. Original panel images and full captions remain in metadata. */
export function StoryPageComposer({ detail, onClose, onSaved, report }: { detail: ProjectDetail; onClose: () => void; onSaved: () => Promise<void>; report: (e: unknown) => void }) {
  const images = detail.assets.filter(a => a.kind === 'image');
  const [panels, setPanels] = useState<StoryPanel[]>(() => [...detail.shots].sort((a, b) => a.position - b.position).slice(0, 6).map(shot => {
    const selected = detail.takes.find(t => t.id === shot.selectedTakeId && t.kind === 'image' && t.assetIds.length) || detail.takes.find(t => t.shotId === shot.id && t.kind === 'image' && t.assetIds.length);
    return { id: crypto.randomUUID(), shotId: shot.id, assetId: selected?.assetIds[0] || '', caption: shot.name };
  }));
  const [title, setTitle] = useState(detail.project.name), [columns, setColumns] = useState(2), [aspect, setAspect] = useState<PageAspect>('portrait');
  const [theme, setTheme] = useState<'paper' | 'charcoal'>('paper'), [fit, setFit] = useState<'cover' | 'contain'>('cover'), [captions, setCaptions] = useState(true);
  const [rendered, setRendered] = useState(false), [busy, setBusy] = useState(false);
  const canvas = useRef<HTMLCanvasElement>(null);
  const incomplete = panels.some(panel => !images.some(a => a.id === panel.assetId));
  const settings = { title, columns, pageAspect: aspect, theme, fit, captions, panels: panels.map(({ assetId, caption, shotId }) => ({ assetId, caption, shotId })) };

  useEffect(() => {
    let cancelled = false; setRendered(false);
    const target = canvas.current; if (!target) return;
    async function render() {
      const loaded = await Promise.all(panels.map(async panel => { const asset = images.find(a => a.id === panel.assetId); return asset ? loadImage(asset.url) : null; }));
      if (cancelled || !target) return;
      const width = 1600, height = aspect === 'portrait' ? 2263 : aspect === 'landscape' ? 1131 : 1600;
      target.width = width; target.height = height;
      const ctx = target.getContext('2d'); if (!ctx) throw new Error('Canvas rendering is not available in this browser.');
      const paper = theme === 'paper', background = paper ? '#f3f0e8' : '#171b18', ink = paper ? '#30382e' : '#e5ebdf', secondary = paper ? '#7d8577' : '#8f9e86';
      ctx.fillStyle = background; ctx.fillRect(0, 0, width, height);
      ctx.fillStyle = ink; ctx.font = '600 46px sans-serif'; ctx.textBaseline = 'top';
      fitLine(ctx, title || 'Untitled sequence', 64, 55, width - 128);
      ctx.fillStyle = secondary; ctx.font = '400 14px sans-serif'; ctx.fillText('A SEQUENCE IN PROGRESS', 66, 114);
      const margin = 64, gap = 28, top = 164, bottom = 80;
      const rowCount = Math.max(1, Math.ceil(panels.length / columns));
      const panelWidth = (width - 2 * margin - gap * (columns - 1)) / columns;
      const panelHeight = (height - top - bottom - gap * (rowCount - 1)) / rowCount;
      const captionHeight = captions ? Math.min(118, panelHeight * 0.28) : 0;
      panels.forEach((panel, index) => {
        const x = margin + (index % columns) * (panelWidth + gap), y = top + Math.floor(index / columns) * (panelHeight + gap), imageHeight = panelHeight - captionHeight;
        ctx.fillStyle = paper ? '#dfe3d6' : '#2b3427'; ctx.fillRect(x, y, panelWidth, imageHeight);
        const image = loaded[index];
        if (image) {
          const scale = fit === 'cover' ? Math.max(panelWidth / image.naturalWidth, imageHeight / image.naturalHeight) : Math.min(panelWidth / image.naturalWidth, imageHeight / image.naturalHeight);
          const w = image.naturalWidth * scale, h = image.naturalHeight * scale;
          ctx.save(); ctx.beginPath(); ctx.rect(x, y, panelWidth, imageHeight); ctx.clip(); ctx.drawImage(image, x + (panelWidth - w) / 2, y + (imageHeight - h) / 2, w, h); ctx.restore();
        } else {
          ctx.fillStyle = secondary; ctx.font = '400 24px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('Choose a saved image', x + panelWidth / 2, y + imageHeight / 2 - 12); ctx.textAlign = 'left';
        }
        ctx.fillStyle = '#111810bf'; ctx.fillRect(x + 14, y + 14, 45, 31); ctx.fillStyle = '#edf3e6'; ctx.font = '500 16px sans-serif'; ctx.fillText(String(index + 1).padStart(2, '0'), x + 25, y + 21);
        if (captions) {
          ctx.fillStyle = ink; const fontSize = Math.max(16, Math.min(22, panelWidth / 25)); ctx.font = `400 ${fontSize}px sans-serif`;
          wrapText(ctx, panel.caption, x + 2, y + imageHeight + 17, panelWidth - 4, fontSize * 1.4, Math.max(1, Math.floor((captionHeight - 22) / (fontSize * 1.4))));
        }
      });
      ctx.fillStyle = secondary; ctx.font = '400 13px sans-serif'; ctx.fillText('OPEN TAKE STUDIO', 64, height - 42); ctx.textAlign = 'right'; ctx.fillText(`${panels.length} PANELS  /  PRODUCTION PAGE`, width - 64, height - 42); ctx.textAlign = 'left';
      if (!cancelled) setRendered(true);
    }
    render().catch(error => { if (!cancelled) report(error); });
    return () => { cancelled = true; };
  }, [panels, title, columns, aspect, theme, fit, captions, detail.assets, report]);

  function updatePanel(id: string, patch: Partial<StoryPanel>) { setPanels(list => list.map(p => p.id === id ? { ...p, ...patch } : p)); }
  function movePanel(index: number, offset: number) { setPanels(list => { const target = index + offset; if (target < 0 || target >= list.length) return list; const next = [...list]; [next[index], next[target]] = [next[target], next[index]]; return next; }); }
  const fileName = `${title.trim().replace(/[^\p{L}\p{N}_-]+/gu, '-').slice(0, 80) || 'story-page'}.png`;
  async function blob() { if (!canvas.current || !rendered) throw new Error('Wait for the page preview to finish rendering.'); return new Promise<Blob>((resolve, reject) => canvas.current!.toBlob(value => value ? resolve(value) : reject(new Error('Could not encode this page')), 'image/png')); }
  async function download() {
    try { const file = await blob(); const url = URL.createObjectURL(file); const link = document.createElement('a'); link.href = url; link.download = fileName; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); } catch (e) { report(e); }
  }
  async function save() {
    setBusy(true);
    try {
      const output = await blob(), assetIds = panels.map(p => p.assetId);
      const body = new FormData(); body.append('file', output, fileName); body.append('provenance', 'local-edit'); body.append('metadata', json({ operation: 'storyboard-page', sourceAssetId: assetIds[0], inputAssetIds: { panel_images: assetIds }, settings }));
      const asset = await api<Asset>(`/api/projects/${detail.project.id}/assets`, { method: 'POST', body });
      await api(`/api/projects/${detail.project.id}/takes/import`, { method: 'POST', body: json({ assetId: asset.id, name: `${title || 'Untitled'} · story page`, sourceAssetId: assetIds[0], parentTakeId: detail.takes.find(t => t.assetIds.includes(assetIds[0]))?.id }) });
      await onSaved();
    } catch (e) { report(e); } finally { setBusy(false); }
  }

  return <section className="story-page-composer"><header><div><p className="eyebrow">SEQUENTIAL STORYTELLING</p><h2>Give the sequence a page.</h2></div><button className="icon-button" title="Close story page composer" onClick={onClose}><X size={19} /></button></header><div className="story-page-layout"><div className="story-page-preview"><div className="story-canvas-wrap"><canvas ref={canvas} aria-label="Rendered storyboard or comic page" /></div><p className="hint">Native image composition · {aspect === 'portrait' ? '1600 × 2263' : aspect === 'landscape' ? '1600 × 1131' : '1600 × 1600'} px PNG. Captions wrap to fit each panel; full text remains in the saved settings.</p><div className="inline-actions"><button className="btn quiet" disabled={!rendered || !panels.length || incomplete} onClick={download}><Download size={15} />Download page</button><button className="btn primary" disabled={busy || !rendered || !panels.length || incomplete} onClick={save}>{busy ? <LoaderCircle size={15} className="spin" /> : <Save size={15} />}Save to project</button></div>{incomplete && <p className="story-page-warning">Choose an image for every panel before saving.</p>}</div><div className="story-page-settings"><label className="field-label" htmlFor="story-page-title">Page title</label><input id="story-page-title" value={title} onChange={e => setTitle(e.target.value)} maxLength={120} /><div className="settings-grid"><div className="setting"><label htmlFor="story-page-columns">Layout</label><select id="story-page-columns" value={columns} onChange={e => setColumns(Number(e.target.value))}><option value={1}>One column</option><option value={2}>Two columns</option><option value={3}>Three columns</option></select></div><div className="setting"><label htmlFor="story-page-aspect">Page shape</label><select id="story-page-aspect" value={aspect} onChange={e => setAspect(e.target.value as PageAspect)}><option value="portrait">Portrait</option><option value="landscape">Landscape</option><option value="square">Square</option></select></div><div className="setting"><label htmlFor="story-page-theme">Page color</label><select id="story-page-theme" value={theme} onChange={e => setTheme(e.target.value as 'paper' | 'charcoal')}><option value="paper">Warm paper</option><option value="charcoal">Charcoal</option></select></div><div className="setting"><label htmlFor="story-page-fit">Panel images</label><select id="story-page-fit" value={fit} onChange={e => setFit(e.target.value as 'cover' | 'contain')}><option value="cover">Fill / crop</option><option value="contain">Fit inside</option></select></div></div><label className="story-captions-toggle"><input type="checkbox" checked={captions} onChange={e => setCaptions(e.target.checked)} />Show captions</label><div className="section-mini-heading"><h3>Panels</h3><span className="subtle">{panels.length} / 9</span></div>{panels.map((panel, index) => <div className="story-panel-editor" key={panel.id}><div className="story-panel-heading"><strong>{String(index + 1).padStart(2, '0')}</strong>{panel.shotId && <span>{detail.shots.find(s => s.id === panel.shotId)?.name}</span>}<button className="icon-button" title={`Move panel ${index + 1} earlier`} disabled={index === 0} onClick={() => movePanel(index, -1)}><ArrowUp size={13} /></button><button className="icon-button" title={`Move panel ${index + 1} later`} disabled={index === panels.length - 1} onClick={() => movePanel(index, 1)}><ArrowDown size={13} /></button><button className="icon-button" title={`Remove panel ${index + 1}`} onClick={() => setPanels(list => list.filter(p => p.id !== panel.id))}><Trash2 size={13} /></button></div><label className="sr-only" htmlFor={`panel-image-${panel.id}`}>Panel {index + 1} image</label><select id={`panel-image-${panel.id}`} value={panel.assetId} onChange={e => updatePanel(panel.id, { assetId: e.target.value })}><option value="">Choose saved image</option>{images.map(image => <option key={image.id} value={image.id}>{image.name}</option>)}</select><label className="sr-only" htmlFor={`panel-caption-${panel.id}`}>Panel {index + 1} caption</label><textarea id={`panel-caption-${panel.id}`} value={panel.caption} onChange={e => updatePanel(panel.id, { caption: e.target.value })} placeholder="Panel caption or dialogue" rows={2} /></div>)}<button className="btn secondary" disabled={panels.length >= 9} onClick={() => setPanels(list => [...list, { id: crypto.randomUUID(), assetId: '', caption: '' }])}><Plus size={15} />Add panel</button>{!images.length && <p className="hint">Import or generate image assets first. Your original images remain unchanged.</p>}</div></div></section>;
}
function loadImage(url: string) { return new Promise<HTMLImageElement>((resolve, reject) => { const image = new Image(); image.onload = () => resolve(image); image.onerror = () => reject(new Error('Could not load a story panel image')); image.src = url; }); }
function fitLine(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number) { let line = text; while (line.length > 1 && ctx.measureText(line).width > maxWidth) line = line.slice(0, -1); if (line !== text) line = line.slice(0, -1) + '…'; ctx.fillText(line, x, y); }
function wrapText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number, lineHeight: number, maxLines: number) {
  const words = text.replace(/\s+/g, ' ').trim().split(' '), lines: string[] = []; let line = '';
  for (const word of words) { const next = line ? `${line} ${word}` : word; if (ctx.measureText(next).width <= maxWidth || !line) line = next; else { lines.push(line); line = word; } }
  if (line) lines.push(line);
  lines.slice(0, maxLines).forEach((value, index) => { const visible = index === maxLines - 1 && lines.length > maxLines ? value + '…' : value; fitLine(ctx, visible, x, y + index * lineHeight, maxWidth); });
}
