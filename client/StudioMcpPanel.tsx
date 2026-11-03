import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Check, Copy, KeyRound, LoaderCircle, Plug, ShieldCheck, Trash2, X } from 'lucide-react';
import type { ProjectDetail } from '../shared/types';
import type { StudioMcpTokenCreated, StudioMcpTokenList, StudioMcpTokenView } from '../shared/studio-mcp-types';
import { api, json } from './api';
import './studio-mcp.css';

export interface StudioMcpPanelProps { project: ProjectDetail; onClose: () => void; }
export function StudioMcpPanel({ project, onClose }: StudioMcpPanelProps) {
  const [tokens, setTokens] = useState<StudioMcpTokenView[]>([]);
  const [issued, setIssued] = useState<StudioMcpTokenCreated>();
  const [name, setName] = useState('My creative assistant');
  const [write, setWrite] = useState(false);
  const [hours, setHours] = useState(24);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState('');
  const dialog = useRef<HTMLDialogElement>(null);
  const path = '/api/projects/' + encodeURIComponent(project.project.id) + '/mcp-tokens';
  useEffect(() => {
    const node = dialog.current; node?.showModal();
    return () => node?.close();
  }, []);
  useEffect(() => {
    let live = true;
    setLoading(true); setIssued(undefined); setError('');
    api<StudioMcpTokenList>(path).then(data => { if (live) setTokens(data.tokens); }).catch(value => { if (live) setError(value instanceof Error ? value.message : 'Could not load connections.'); }).finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [path]);
  async function copy(value: string, key: string) {
    try { await navigator.clipboard.writeText(value); setCopied(key); window.setTimeout(() => setCopied(''), 1800); }
    catch { setError('Clipboard access is unavailable. Select and copy the text below.'); }
  }
  async function create(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const value = await api<StudioMcpTokenCreated>(path, { method: 'POST', body: json({ name, permissions: write ? ['read', 'local-write'] : ['read'], expiresInHours: hours }) });
      setIssued(value); setTokens(current => [value.token, ...current]);
    } catch (value) { setError(value instanceof Error ? value.message : 'Could not create the connection.'); }
    finally { setBusy(false); }
  }
  async function revoke(token: StudioMcpTokenView) {
    setBusy(true); setError('');
    try {
      const value = await api<{ token: StudioMcpTokenView }>(path + '/' + encodeURIComponent(token.id), { method: 'DELETE' });
      setTokens(current => current.map(item => item.id === token.id ? value.token : item));
      if (issued?.token.id === token.id) setIssued(undefined);
    } catch (value) { setError(value instanceof Error ? value.message : 'Could not revoke the connection.'); }
    finally { setBusy(false); }
  }
  const config = issued ? JSON.stringify({ mcpServers: { open_take_studio: { type: 'http', url: issued.token.endpoint, headers: { Authorization: 'Bearer ' + issued.bearerToken } } } }, null, 2) : '';
  return <dialog ref={dialog} className="studio-mcp-dialog" aria-labelledby="studio-mcp-title" onCancel={event => { event.preventDefault(); onClose(); }}>
    <header className="studio-mcp-header"><div><span className="studio-mcp-eyebrow"><Plug size={15} /> CREATIVE CONNECTIONS</span><h2 id="studio-mcp-title">Bring your assistant into the project.</h2><p>{project.project.name}</p></div><button type="button" className="studio-mcp-close" aria-label="Close assistant connections" onClick={onClose}><X size={20} /></button></header>
    <div className="studio-mcp-body">
      <div className="studio-mcp-note"><ShieldCheck size={21} /><p>Your assistant can inspect this project's saved work. Optional local editing creates new versions and delivery downloads. Generation and social posting stay in your hands.</p></div>
      {error && <p role="alert" className="studio-mcp-error">{error}</p>}
      {loading ? <p className="studio-mcp-loading"><LoaderCircle size={18} /> Loading connections…</p> : <>
        <form onSubmit={create} className="studio-mcp-form">
          <label>Connection name<input value={name} onChange={event => setName(event.target.value)} maxLength={80} required disabled={busy} /></label>
          <label>Expires after<select value={hours} onChange={event => setHours(Number(event.target.value))} disabled={busy}><option value={1}>1 hour</option><option value={8}>8 hours</option><option value={24}>24 hours</option></select></label>
          <label className="studio-mcp-toggle"><input type="checkbox" checked={write} onChange={event => setWrite(event.target.checked)} disabled={busy} /><span><strong>Allow local editing</strong><small>Resize images, run local production graphs and prepare delivery packages. Originals are preserved.</small></span></label>
          <button className="studio-mcp-primary" type="submit" disabled={busy || !name.trim()}>{busy ? <LoaderCircle size={17} /> : <KeyRound size={17} />} Create project connection</button>
        </form>
        {issued && <section className="studio-mcp-created" aria-labelledby="studio-mcp-created-title">
          <h3 id="studio-mcp-created-title"><Check size={19} /> Connection ready</h3>
          <p>Add this Streamable HTTP server in an MCP client that accepts bearer authentication. The secret appears only now. Copy it before closing this panel; you can revoke and replace it anytime.</p>
          <label>Server URL<div className="studio-mcp-copy-row"><input readOnly value={issued.token.endpoint} aria-label="MCP server URL" /><button type="button" onClick={() => void copy(issued.token.endpoint, 'url')}><Copy size={15} /> {copied === 'url' ? 'Copied' : 'Copy URL'}</button></div></label>
          <label>Bearer token<div className="studio-mcp-copy-row"><input readOnly type="password" value={issued.bearerToken} autoComplete="off" aria-label="MCP bearer token" /><button type="button" onClick={() => void copy(issued.bearerToken, 'token')}><Copy size={15} /> {copied === 'token' ? 'Copied' : 'Copy token'}</button></div></label>
          <details><summary>JSON configuration</summary><p>Configuration format varies by client. Use the URL and Authorization header above if it asks for separate fields.</p><pre tabIndex={0}>{config}</pre><button type="button" onClick={() => void copy(config, 'config')}><Copy size={15} /> {copied === 'config' ? 'Copied' : 'Copy configuration'}</button></details>
          <p className="studio-mcp-small">This token grants access only to {project.project.name}. It is separate from your Comfy API key and does not authorize generation.</p>
        </section>}
        <section className="studio-mcp-connections" aria-labelledby="studio-mcp-connections-title"><h3 id="studio-mcp-connections-title">Project connections</h3>
          {!tokens.length ? <p className="studio-mcp-empty">No assistants connected yet.</p> : <ul>{tokens.map(token => <li key={token.id}><div><strong>{token.name}</strong><span className={'studio-mcp-state studio-mcp-state-' + token.status}>{token.status}</span><p>{token.permissions.includes('local-write') ? 'Read + local editing' : 'Read saved work'} · Expires {new Date(token.expiresAt).toLocaleString()}</p>{token.lastUsedAt && <small>Last used {new Date(token.lastUsedAt).toLocaleString()}</small>}</div>{token.status === 'active' && <button type="button" disabled={busy} onClick={() => void revoke(token)} aria-label={'Revoke ' + token.name}><Trash2 size={15} /> Revoke</button>}</li>)}</ul>}
        </section>
      </>}
    </div>
  </dialog>;
}
