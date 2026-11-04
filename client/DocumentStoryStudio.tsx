import { useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, Download, FileText, Film, LoaderCircle, Plus, Save, Sparkles, Trash2, Upload } from 'lucide-react';
import { createDocumentStoryPlan, type DocumentStoryBeat, type DocumentStoryDocument, type DocumentStoryRendered, type DocumentStorySaved } from '../shared/document-story-types';
import type { Asset, ProjectDetail } from '../shared/types';
import { api, json } from './api';

export interface DocumentStoryStudioProps {
  detail: ProjectDetail;
  onRefresh: () => Promise<void>;
  report: (error: unknown) => void;
  onGenerateScene?: (beat: DocumentStoryBeat) => void;
}
interface Draft { source: string; sourceName: string; document: DocumentStoryDocument | null; parentTakeId?: string; }
function loadDraft(projectId: string): Draft {
  try { const stored = JSON.parse(localStorage.getItem('ots:document-story:' + projectId) || 'null'); if (stored && typeof stored.source === 'string') return stored; } catch {}
  return { source: '', sourceName: 'Pasted text', document: null };
}
function requestIdentity(key: string, fingerprint: string): string {
  try { const previous = JSON.parse(localStorage.getItem(key) || 'null'); if (previous?.fingerprint === fingerprint && typeof previous.id === 'string') return previous.id; } catch {}
  const id = crypto.randomUUID();
  try { localStorage.setItem(key, json({ fingerprint, id })); } catch {}
  return id;
}

export function DocumentStoryStudio({ detail, onRefresh, report, onGenerateScene }: DocumentStoryStudioProps) {
  const [draft, setDraft] = useState<Draft>(() => loadDraft(detail.project.id));
  const [draftProjectId, setDraftProjectId] = useState(detail.project.id);
  const [busy, setBusy] = useState(''), [notice, setNotice] = useState('');
  const [saved, setSaved] = useState<DocumentStorySaved | null>(null), [rendered, setRendered] = useState<DocumentStoryRendered | null>(null);
  const project = useRef(detail.project.id), fileInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (project.current !== detail.project.id) {
      project.current = detail.project.id; setDraftProjectId(detail.project.id); setDraft(loadDraft(detail.project.id)); setSaved(null); setRendered(null); setNotice('');
    }
  }, [detail.project.id]);
  useEffect(() => {
    if (draftProjectId === detail.project.id) try { localStorage.setItem('ots:document-story:' + detail.project.id, json(draft)); } catch {}
  }, [draft, draftProjectId, detail.project.id]);
  const document = draft.document, visuals = detail.assets.filter(asset => asset.kind === 'image' || asset.kind === 'video');
  const audio = detail.assets.filter(asset => asset.kind === 'audio'), versions = detail.assets.filter(asset => asset.metadata.operation === 'document-story-plan').reverse();
  function update(document: DocumentStoryDocument) { setDraft(current => ({ ...current, document })); setSaved(null); setRendered(null); }
  function changeBeat(id: string, patch: Partial<DocumentStoryBeat>) {
    if (document) update({ ...document, beats: document.beats.map(beat => beat.id === id ? { ...beat, ...patch } : beat) });
  }
  function move(index: number, direction: number) {
    if (!document || index + direction < 0 || index + direction >= document.beats.length) return;
    const beats = [...document.beats]; [beats[index], beats[index + direction]] = [beats[index + direction], beats[index]]; update({ ...document, beats });
  }
  async function importText(file?: File) {
    if (!file) return;
    if (!/\.(txt|md|markdown)$/i.test(file.name) || file.size > 240_000) { report(new Error('Choose a TXT or Markdown file, up to 60,000 text characters. PDF and Word import are not supported here.')); return; }
    try {
      const source = await file.text(); if (source.length > 60_000 || source.includes('\0')) throw new Error('Use at most 60,000 characters of plain text.');
      setDraft(current => ({ ...current, source, sourceName: file.name })); setNotice('Source loaded. Choose Plan scenes to create an editable draft.');
    } catch (error) { report(error); }
  }
  function plan() {
    try {
      const document = createDocumentStoryPlan(draft.source, draft.sourceName);
      setDraft(current => ({ ...current, document, parentTakeId: undefined })); setSaved(null); setRendered(null);
      setNotice('Paragraphs arranged into scenes. Review the text, timing and media before saving.');
    } catch (error) { report(error); }
  }
  async function save(): Promise<DocumentStorySaved | undefined> {
    if (!document) return; if (saved) return saved;
    setBusy('save');
    try {
      const payload = { document, parentTakeId: draft.parentTakeId };
      const clientRequestId = requestIdentity('ots:document-story-save:' + detail.project.id, json(payload));
      const result = await api<DocumentStorySaved>('/api/projects/' + detail.project.id + '/document-stories', { method: 'POST', body: json({ ...payload, clientRequestId }) });
      setSaved(result); setDraft(current => ({ ...current, parentTakeId: result.take.id }));
      await onRefresh(); setNotice('Editable plan saved. Your source text and earlier versions are preserved.'); return result;
    } catch (error) { report(error); } finally { setBusy(''); }
  }
  async function render() {
    const version = saved || await save(); if (!version) return;
    setBusy('render');
    try {
      const clientRequestId = requestIdentity('ots:document-story-render:' + version.asset.id, version.asset.sha256);
      const result = await api<DocumentStoryRendered>('/api/assets/' + version.asset.id + '/document-story/render', { method: 'POST', body: json({ clientRequestId }) });
      setRendered(result); await onRefresh(); setNotice('Film and timed captions saved. Download the portable player or export the whole project to preserve editable history.');
    } catch (error) { report(error); } finally { setBusy(''); }
  }
  async function open(asset: Asset) {
    setBusy('open');
    try {
      const result = await api<DocumentStorySaved>('/api/assets/' + asset.id + '/document-story');
      setDraft({ source: result.document.sourceText, sourceName: result.document.sourceName, document: result.document, parentTakeId: result.take.id });
      setSaved(result); setRendered(null); setNotice('Saved plan reopened with its original source and selected media.');
    } catch (error) { report(error); } finally { setBusy(''); }
  }
  const complete = !!document && document.beats.every(beat => !!beat.assetId);
  return <main className="content-page" aria-label="Document story studio">
    <header className="section-heading">
      <div><p className="eyebrow">FROM WORDS TO A FINISHED STORY</p><h2>Give your document a screen.</h2>
        <p className="subtle">Review an editable scene plan, choose saved media, and assemble a portable film.</p></div>
      <div className="inline-actions">
        <button className="btn secondary" disabled={!!busy || !document} onClick={save}><Save size={15}/>Save plan</button>
        <button className="btn primary" disabled={!!busy || !complete} onClick={render}>{busy === 'render' ? <LoaderCircle size={15} className="spin"/> : <Film size={15}/>}Assemble film</button>
      </div>
    </header>
    {notice && <p role="status" className="inline-notice">{notice}</p>}
    {busy === 'render' && <p role="status">Rendering your selected media. Larger stories can take a few minutes. This does not spend Comfy credits.</p>}
    <section className="panel" style={{ padding: 24, marginBottom: 24 }}>
      <div className="section-heading"><div><h3><FileText size={18}/> Your source</h3><p className="hint">Paste text or import TXT / Markdown. Planning simply groups paragraphs locally; it does not infer an AI script.</p></div>
        <button className="btn secondary" disabled={!!busy} onClick={() => fileInput.current?.click()}><Upload size={15}/>Import text</button>
      </div>
      <input ref={fileInput} type="file" accept=".txt,.md,.markdown,text/plain,text/markdown" hidden onChange={event => { void importText(event.target.files?.[0]); event.target.value = ''; }}/>
      <label className="field-label">Source name<input value={draft.sourceName} maxLength={180} disabled={!!busy} onChange={event => setDraft(current => ({ ...current, sourceName: event.target.value }))}/></label>
      <label className="field-label">Source text<textarea rows={6} style={{ width: '100%' }} maxLength={60_000} value={draft.source} disabled={!!busy} placeholder="Paste the story, treatment, article, or outline you want to adapt." onChange={event => setDraft(current => ({ ...current, source: event.target.value }))}/></label>
      <div className="inline-actions"><button className="btn primary" disabled={!!busy || !draft.source.trim()} onClick={plan}><FileText size={15}/>{document ? 'Create a new scene plan' : 'Plan scenes'}</button><span className="hint">{draft.source.length.toLocaleString()} / 60,000 characters · 1–8 scenes · up to 3 minutes</span></div>
    </section>
    {document && <section aria-label="Editable scenes">
      <label className="field-label">Story title<input value={document.name} maxLength={150} disabled={!!busy} onChange={event => update({ ...document, name: event.target.value })}/></label>
      <p className="hint">Every scene uses media you select. With a saved video, its existing sound is kept unless you select separate audio. New generation is optional and starts only in the normal generation controls.</p>
      <div style={{ display: 'grid', gap: 20 }}>
        {document.beats.map((beat, index) => {
          const visual = visuals.find(asset => asset.id === beat.assetId);
          return <article className="panel" key={beat.id} style={{ padding: 22, border: '1px solid var(--border, #3a2e4c)', borderRadius: 18 }}>
            <div className="section-heading"><h3>Scene {index + 1}</h3><div className="inline-actions">
              <button className="icon-button" disabled={!!busy || index === 0} onClick={() => move(index, -1)} aria-label={'Move scene ' + (index + 1) + ' up'}><ArrowUp size={16}/></button>
              <button className="icon-button" disabled={!!busy || index === document.beats.length - 1} onClick={() => move(index, 1)} aria-label={'Move scene ' + (index + 1) + ' down'}><ArrowDown size={16}/></button>
              <button className="icon-button" disabled={!!busy || document.beats.length === 1} onClick={() => update({ ...document, beats: document.beats.filter(item => item.id !== beat.id) })} aria-label={'Remove scene ' + (index + 1)}><Trash2 size={16}/></button>
            </div></div>
            <label className="field-label">Scene title<input value={beat.title} maxLength={150} disabled={!!busy} onChange={event => changeBeat(beat.id, { title: event.target.value })}/></label>
            <details><summary>Source excerpt</summary><p style={{ whiteSpace: 'pre-wrap' }}>{beat.sourceText}</p></details>
            <label className="field-label">Visual direction<textarea rows={3} maxLength={6000} value={beat.prompt} disabled={!!busy} onChange={event => changeBeat(beat.id, { prompt: event.target.value })}/></label>
            <label className="field-label">On-screen caption<textarea rows={2} maxLength={240} value={beat.caption} disabled={!!busy} onChange={event => changeBeat(beat.id, { caption: event.target.value })}/></label>
            <div className="inline-actions" style={{ flexWrap: 'wrap', alignItems: 'end' }}>
              <label className="field-label" style={{ flex: '1 1 260px' }}>Saved visual<select value={beat.assetId || ''} disabled={!!busy} onChange={event => changeBeat(beat.id, { assetId: event.target.value || undefined, offset: 0 })}><option value="">Choose an image or video</option>{visuals.map(asset => <option key={asset.id} value={asset.id}>{asset.kind === 'video' ? 'Video' : 'Image'} · {asset.name}</option>)}</select></label>
              <label className="field-label">Length (seconds)<input type="number" min="1" max="30" step=".1" value={beat.duration} disabled={!!busy} onChange={event => changeBeat(beat.id, { duration: Number(event.target.value) })}/></label>
              {visual?.kind === 'video' && <label className="field-label">Video in point<input type="number" min="0" step=".1" value={beat.offset} disabled={!!busy} onChange={event => changeBeat(beat.id, { offset: Number(event.target.value) })}/></label>}
            </div>
            {visual && <div style={{ maxWidth: 520, margin: '12px 0' }}>{visual.kind === 'image' ? <img alt={visual.name} src={visual.url} style={{ width: '100%', maxHeight: 260, objectFit: 'contain', borderRadius: 12 }}/> : <video src={visual.url} controls preload="metadata" playsInline style={{ width: '100%', maxHeight: 260, borderRadius: 12 }}/>}</div>}
            <div className="inline-actions" style={{ flexWrap: 'wrap', alignItems: 'end' }}>
              <label className="field-label" style={{ flex: '1 1 260px' }}>Saved audio<select value={beat.audioAssetId || ''} disabled={!!busy} onChange={event => changeBeat(beat.id, { audioAssetId: event.target.value || undefined, audioOffset: 0 })}><option value="">{visual?.kind === 'video' ? 'Keep video audio' : 'No audio'}</option>{audio.map(asset => <option key={asset.id} value={asset.id}>{asset.name}</option>)}</select></label>
              {beat.audioAssetId && <label className="field-label">Audio in point<input type="number" min="0" step=".1" value={beat.audioOffset} disabled={!!busy} onChange={event => changeBeat(beat.id, { audioOffset: Number(event.target.value) })}/></label>}
              {onGenerateScene && <button className="btn secondary" disabled={!!busy} onClick={() => onGenerateScene(beat)}><Sparkles size={15}/>Prepare new media</button>}
            </div>
          </article>;
        })}
      </div>
      <div className="inline-actions" style={{ marginTop: 18 }}>
        <button className="btn secondary" disabled={!!busy || document.beats.length >= 8} onClick={() => update({ ...document, beats: [...document.beats, { id: crypto.randomUUID(), title: 'A new scene', sourceText: '', prompt: '', caption: '', duration: 5, offset: 0, audioOffset: 0 }] })}><Plus size={15}/>Add a scene</button>
        <span className="hint">{document.beats.length} scenes · {document.beats.reduce((sum, beat) => sum + beat.duration, 0).toFixed(1)} seconds{!complete ? ' · Choose media for every scene before assembly.' : ''}</span>
      </div>
    </section>}
    {rendered && <section style={{ marginTop: 32 }}><h3>Your assembled story</h3><video controls playsInline src={rendered.asset.url} style={{ width: '100%', maxHeight: 580, borderRadius: 18 }}/><div className="inline-actions" style={{ marginTop: 16 }}><a className="btn primary" href={'/api/assets/' + rendered.asset.id + '/document-story/player-export'}><Download size={15}/>Portable player ZIP</a><a className="btn secondary" href={rendered.asset.url + '?download=1'} download>Download MP4</a><a className="btn secondary" href={rendered.captions.url + '?download=1'} download>Timed captions</a></div><p className="hint">Export the whole project from Projects to preserve the editable plan, every source and version history.</p></section>}
    {versions.length > 0 && <section style={{ marginTop: 32 }}><h3>Saved story plans</h3><div className="inline-actions" style={{ flexWrap: 'wrap' }}>{versions.map(asset => <button className="btn secondary" key={asset.id} disabled={!!busy} onClick={() => open(asset)}><FileText size={14}/>{asset.name}</button>)}</div></section>}
  </main>;
}
