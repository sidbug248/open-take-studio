import { useMemo, useState } from 'react';
import { Check, ChevronDown, CircleHelp, GitBranch, Layers3, LoaderCircle, Play, RotateCcw } from 'lucide-react';
import type { GenerationRequest, Job, Json, ProjectDetail, Shot, Take } from '../shared/types';
import type { ModelDescriptor } from '../shared/model-types';
import { api, json, isGenerationConnectionRequiredError } from './api';

type BatchItem = {
  shotId: string;
  shotName: string;
  clientRequestId: string;
  state: 'ready' | 'submitting' | 'submitted' | 'reused' | 'error';
  /** Frozen before submission, including intended parent and input assets. */
  request?: GenerationRequest;
  reuseTakeId?: string;
  takeId?: string;
  error?: string;
};
type BatchConfig = { selectedIds: string[]; regenerate: boolean; modelId: string; settings: Json; inputAssetIds: Record<string, string | string[]> };
type BatchRun = { version: 2; modelId: string; config: BatchConfig; items: BatchItem[]; createdAt: string };
type LegacyRun = { version?: undefined; modelId: string; items: BatchItem[]; createdAt: string };
type StoredRun = BatchRun | LegacyRun;
const finished = (run: StoredRun) => run.items.every(item => item.state === 'submitted' || item.state === 'reused');

export function ShotBatch({ detail, models, draft, onRefresh, report }: { detail: ProjectDetail; models: ModelDescriptor[]; draft: { modelId: string; settings: Json; inputAssetIds: Record<string, string | string[]> }; onRefresh: () => Promise<void>; report: (e: unknown) => void }) {
  const storageKey = `ots:batch:${detail.project.id}`;
  const [run, setRun] = useState<StoredRun | null>(() => {
    try { const value = JSON.parse(localStorage.getItem(storageKey) || 'null'); return value && Array.isArray(value.items) ? value : null; } catch { return null; }
  });
  const imageModels = models.filter(m => m.kind === 'image' && m.capabilities.includes('image-generation') && m.status !== 'unavailable');
  const initialConfig = run?.version === 2 ? run.config : undefined;
  const defaultModelId = imageModels.some(m => m.id === draft.modelId) ? draft.modelId : imageModels[0]?.id || 'bfl/flux-3-image';
  const [modelId, setModelId] = useState(initialConfig?.modelId || defaultModelId);
  const [selected, setSelected] = useState<string[]>(initialConfig?.selectedIds || detail.shots.slice(0, 6).map(s => s.id));
  const [regenerate, setRegenerate] = useState(initialConfig?.regenerate || false), [busy, setBusy] = useState(false), [open, setOpen] = useState(!!run && !finished(run));
  const currentModel = imageModels.find(m => m.id === modelId);
  const orderedShots = useMemo(() => [...detail.shots].sort((a, b) => a.position - b.position).filter(s => selected.includes(s.id)), [detail.shots, selected]);
  const settings = modelId === draft.modelId ? draft.settings : {};
  const inputAssetIds = modelId === draft.modelId ? Object.fromEntries(Object.entries(draft.inputAssetIds).filter(([, value]) => Array.isArray(value) ? value.some(Boolean) : Boolean(value)).map(([key, value]) => [key, Array.isArray(value) ? value.filter(Boolean) : value])) : {};
  const completedFor = (shot: Shot) => detail.takes.find(t => t.id === shot.selectedTakeId && t.assetIds.length) || detail.takes.find(t => t.shotId === shot.id && t.assetIds.length && ['COMPLETED', 'IMPORTED', 'LOCAL'].includes(t.status));
  const priorUnfinished = !!run && !finished(run);
  const restoredConfig = run?.version === 2 ? run.config : undefined;
  const toReuse = regenerate ? [] : orderedShots.filter(shot => completedFor(shot));
  const requestCount = run ? run.items.filter(item => item.request || !item.reuseTakeId).length : orderedShots.length - toReuse.length;
  const reuseCount = run ? run.items.filter(item => item.reuseTakeId).length : toReuse.length;
  const missingDirections = orderedShots.filter(shot => (regenerate || !completedFor(shot)) && !shot.description.trim());

  function persist(next: BatchRun) {
    // Persist first. If browser storage is unavailable, no network submission starts.
    localStorage.setItem(storageKey, json(next));
    setRun(structuredClone(next));
  }
  async function processRun(snapshot: BatchRun) {
    const next = structuredClone(snapshot);
    persist(next);
    for (const item of next.items) {
      if (item.state === 'submitted' || item.state === 'reused') continue;
      try {
        if (item.reuseTakeId) {
          await api(`/api/shots/${item.shotId}`, { method: 'PATCH', body: json({ selectedTakeId: item.reuseTakeId }) });
          item.state = 'reused'; item.takeId = item.reuseTakeId; delete item.error; persist(next); continue;
        }
        if (!item.request || item.request.clientRequestId !== item.clientRequestId) throw new Error('This batch is missing its original request snapshot. No replacement request was submitted.');
        item.state = 'submitting'; delete item.error; persist(next);
        // Resume is independent of the current draft, shot descriptions, and latest take selection.
        const result = await api<{ take: Take; job: Job }>('/api/generate', { method: 'POST', body: json(item.request) });
        item.state = 'submitted'; item.takeId = result.take.id; delete item.error; persist(next);
        await api(`/api/shots/${item.shotId}`, { method: 'PATCH', body: json({ selectedTakeId: result.take.id }) });
      } catch (error) {
        if (isGenerationConnectionRequiredError(error)) {
          // Connection never admitted this request. Keep the frozen intent for an explicit resume.
          item.state = 'ready'; delete item.error; persist(next); break;
        }
        if (item.state !== 'submitted') { item.state = 'error'; item.error = error instanceof Error ? error.message : String(error); persist(next); }
        report(error); break;
      }
    }
    await onRefresh();
  }
  async function start() {
    if (busy || run || !currentModel || !orderedShots.length || orderedShots.length > 6 || missingDirections.length) return;
    setBusy(true);
    try {
      const config: BatchConfig = structuredClone({ selectedIds: orderedShots.map(s => s.id), regenerate, modelId, settings, inputAssetIds });
      const items: BatchItem[] = orderedShots.map(shot => {
        const previous = completedFor(shot), clientRequestId = crypto.randomUUID();
        if (previous && !regenerate) return { shotId: shot.id, shotName: shot.name, clientRequestId, state: 'ready', reuseTakeId: previous.id };
        const request: GenerationRequest = {
          projectId: detail.project.id, modelId, prompt: shot.description,
          settings: structuredClone(config.settings), inputAssetIds: structuredClone(config.inputAssetIds),
          shotId: shot.id, parentTakeId: previous?.id, sourceAssetId: previous?.assetIds[0],
          name: `${shot.name} · batch take`, clientRequestId,
        };
        return { shotId: shot.id, shotName: shot.name, clientRequestId, state: 'ready', request };
      });
      await processRun({ version: 2, modelId, config, items, createdAt: new Date().toISOString() });
    } catch (error) { report(error); } finally { setBusy(false); }
  }
  async function resume() {
    if (busy || !run || run.version !== 2 || finished(run)) return;
    setBusy(true);
    try { await processRun(run); } catch (error) { report(error); } finally { setBusy(false); }
  }
  function newRun() {
    if (busy || (run && !finished(run))) return;
    try { localStorage.removeItem(storageKey); setRun(null); } catch (error) { report(error); }
  }

  return <section className="shot-batch"><button className="batch-toggle" onClick={() => setOpen(!open)} aria-expanded={open}><span><Layers3 size={17} /><strong>Build a sequence</strong><span>Run a saved setup across your shots</span></span><ChevronDown size={17} className={open ? 'expanded' : ''} /></button>{open && <div className="batch-body">{priorUnfinished && <p className="batch-warning"><CircleHelp size={14} />{run.version === 2 ? 'An unfinished batch is saved. Resume uses its original prompts, settings, source assets, and request identities, even if your Create draft has changed.' : 'An older unfinished batch has no complete request snapshot. Inspect its jobs before continuing; this studio will not mint replacement requests for an unknown outcome.'}</p>}<div className="batch-options"><div><label className="field-label" htmlFor="batch-model">Image model</label><select id="batch-model" value={restoredConfig?.modelId || modelId} disabled={busy || !!run} onChange={e => setModelId(e.target.value)}>{imageModels.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}</select><p className="hint">{run ? 'This saved batch has an immutable settings and reference snapshot.' : modelId === draft.modelId ? 'Uses the supported image settings and references currently loaded in Create.' : 'Uses the documented model defaults without image references.'} Each shot direction becomes its prompt.</p><label className="batch-regenerate"><input type="checkbox" checked={restoredConfig?.regenerate ?? regenerate} disabled={busy || !!run} onChange={e => setRegenerate(e.target.checked)} /><span>Generate a new version of completed shots</span></label><p className="hint">By default, an existing selected or completed take is reused. New versions branch from that take.</p></div><div><div className="section-mini-heading"><h3>Shots in sequence order</h3><span className="subtle">Select up to 6</span></div><div className="batch-shot-list">{run ? run.items.map((item, index) => <label key={item.shotId}><input type="checkbox" checked readOnly disabled /><span className="batch-number">{String(index + 1).padStart(2, '0')}</span><span>{item.shotName || detail.shots.find(s => s.id === item.shotId)?.name || 'Saved shot'}<small>{item.reuseTakeId ? 'Reuse the saved source take' : 'Original request snapshot retained'}</small></span></label>) : [...detail.shots].sort((a, b) => a.position - b.position).map((shot, index) => <label key={shot.id}><input type="checkbox" checked={selected.includes(shot.id)} disabled={busy || (!selected.includes(shot.id) && selected.length >= 6)} onChange={e => setSelected(ids => e.target.checked ? [...ids, shot.id] : ids.filter(id => id !== shot.id))} /><span className="batch-number">{String(index + 1).padStart(2, '0')}</span><span>{shot.name}<small>{completedFor(shot) && !regenerate ? 'Reuse existing take · no generation' : shot.description.trim() ? 'Generate from shot direction' : 'Needs a shot direction'}</small></span></label>)}</div></div></div>{!run && missingDirections.length > 0 && <p className="batch-warning"><CircleHelp size={14} />Add direction to {missingDirections.map(s => s.name).join(', ')} before running.</p>}{run && <div className="batch-progress">{run.items.map(item => <div key={item.shotId}>{item.state === 'submitted' || item.state === 'reused' ? <Check size={13} /> : item.state === 'error' ? <CircleHelp size={13} /> : <span className="batch-pending-dot" />}<span>{item.shotName || detail.shots.find(s => s.id === item.shotId)?.name}</span><small>{item.state === 'submitted' ? 'Job submitted' : item.state === 'reused' ? 'Source reused' : item.state === 'error' ? item.error : item.state === 'submitting' ? 'Awaiting admission response' : 'Ready'}</small></div>)}</div>}<div className="batch-footer"><p><strong>{requestCount} billable request{requestCount === 1 ? '' : 's'}</strong> · {reuseCount} existing take{reuseCount === 1 ? '' : 's'} reused<br /><span>Uses your Comfy workspace credits. Generation jobs are tracked individually.</span></p>{run && finished(run) ? <button className="btn secondary" disabled={busy} onClick={newRun}><RotateCcw size={14} />Set up another batch</button> : priorUnfinished ? <button className="btn primary" disabled={busy || run.version !== 2} onClick={resume}>{busy ? <LoaderCircle size={15} className="spin" /> : <Play size={15} />}{busy ? 'Resuming saved batch…' : 'Resume saved batch'}</button> : <button className="btn primary" disabled={busy || !orderedShots.length || orderedShots.length > 6 || !!missingDirections.length || !currentModel} onClick={start}>{busy ? <LoaderCircle size={15} className="spin" /> : requestCount ? <Play size={15} /> : <GitBranch size={15} />}{busy ? 'Submitting sequence…' : requestCount ? `Generate ${requestCount} shot${requestCount === 1 ? '' : 's'} · uses credits` : 'Reuse selected takes'}</button>}</div><p className="hint">An interrupted batch resumes with the same frozen per-shot requests. Submitted does not mean generated: review real job outcomes in Jobs.</p></div>}</section>;
}
