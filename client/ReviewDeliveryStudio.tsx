import { useEffect, useRef, useState, type ReactNode } from 'react';
import { X, Link2, Download, MessageSquare, CheckCircle2, Send, RefreshCw } from 'lucide-react';
import type { Asset, ProjectDetail } from '../shared/types';
import type { DeliveryPreset, DeliveryResult, ReviewBoardDetail, ReviewComment, ReviewRole } from '../shared/review-types';
import { api, json } from './api';
import { useDialog } from './useDialog';
import './review-delivery.css';

export interface ReviewDeliveryStudioProps {
  project: ProjectDetail;
  onChanged: () => void;
  onClose: () => void;
  publishing?: ReactNode;
}
const fileUrl = (id: string) => '/api/assets/' + encodeURIComponent(id) + '/file';
const date = (value: string) => new Date(value).toLocaleString();
export function ReviewDeliveryStudio({ project, onChanged, onClose, publishing }: ReviewDeliveryStudioProps) {
  const dialog = useDialog(onClose);
  const [tab, setTab] = useState<'review' | 'delivery' | 'publish'>('review');
  const [boards, setBoards] = useState<ReviewBoardDetail[]>([]);
  const [boardId, setBoardId] = useState('');
  const [versionNumber, setVersionNumber] = useState(1);
  const [selected, setSelected] = useState<string[]>([]);
  const [filter, setFilter] = useState('');
  const [title, setTitle] = useState(project.project.name + ' · review');
  const [versionLabel, setVersionLabel] = useState('Next version');
  const [inviteLabel, setInviteLabel] = useState('');
  const [role, setRole] = useState<ReviewRole>('commenter');
  const [days, setDays] = useState(7);
  const [workspaceExpiresAt, setWorkspaceExpiresAt] = useState<string>();
  const [inviteUrl, setInviteUrl] = useState('');
  const [commentAsset, setCommentAsset] = useState('');
  const [comment, setComment] = useState('');
  const [seconds, setSeconds] = useState('');
  const [replyId, setReplyId] = useState<string>();
  const [decisionNote, setDecisionNote] = useState('');
  const [deliveryName, setDeliveryName] = useState(project.project.name + ' · delivery');
  const [preset, setPreset] = useState<DeliveryPreset>('original');
  const [caption, setCaption] = useState('');
  const [delivery, setDelivery] = useState<DeliveryResult>();
  const [savedDeliveries, setSavedDeliveries] = useState<Asset[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const requestIdentity = useRef({ fingerprint: '', id: '' });
  const base = '/api/projects/' + encodeURIComponent(project.project.id);
  const detail = boards.find(value => value.board.id === boardId), board = detail?.board;
  const version = board?.versions.find(value => value.number === versionNumber) ?? board?.versions.at(-1);
  const snapshot = version?.assets.find(asset => asset.assetId === commentAsset) ?? version?.assets[0];
  const candidates = project.assets.filter(asset => asset.metadata.operation !== 'delivery-package' && (!filter || asset.name.toLowerCase().includes(filter.toLowerCase())));
  const selectedBytes = project.assets.filter(asset => selected.includes(asset.id)).reduce((n, asset) => n + asset.size, 0);
  const refresh = async () => {
    const [nextBoards, packages, capabilities] = await Promise.all([api<ReviewBoardDetail[]>(base + '/reviews'), api<Asset[]>(base + '/deliveries'), api<{workspaceExpiresAt?:string}>(base + '/reviews/capabilities')]);
    setBoards(nextBoards); setSavedDeliveries(packages); setWorkspaceExpiresAt(capabilities.workspaceExpiresAt);
  };
  useEffect(() => { let live = true; void Promise.all([api<ReviewBoardDetail[]>(base + '/reviews'), api<Asset[]>(base + '/deliveries'), api<{workspaceExpiresAt?:string}>(base + '/reviews/capabilities')]).then(([next, packages, capabilities]) => { if (live) { setBoards(next); setSavedDeliveries(packages); setWorkspaceExpiresAt(capabilities.workspaceExpiresAt); } }).catch(reason => { if (live) setError(reason.message); }); return () => { live = false; }; }, [base]);
  const run = async (work: () => Promise<void>) => {
    if (busy) return;
    setBusy(true); setError(''); setNotice('');
    try { await work(); } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'This operation could not finish.');
      try { await refresh(); } catch { /* Keep the current view and user draft. */ }
    } finally { setBusy(false); }
  };
  const replace = (value: ReviewBoardDetail) => setBoards(previous => [value, ...previous.filter(item => item.board.id !== value.board.id)]);
  const chooseBoard = (id: string) => {
    setBoardId(id); setInviteUrl(''); setReplyId(undefined); setCommentAsset('');
    const next = boards.find(value => value.board.id === id)?.board;
    if (next) { setTitle(next.title); setVersionNumber(next.versions.at(-1)!.number); }
  };
  const toggle = (id: string) => setSelected(previous => previous.includes(id) ? previous.filter(value => value !== id) : previous.length < 24 ? [...previous, id] : previous);
  const boardPath = base + '/reviews/' + encodeURIComponent(boardId);
  const reviewInput = () => {
    if (!board || !version || !snapshot) throw new Error('Choose a review and saved asset first.');
    return { revision: board.revision, version: version.number, assetId: snapshot.assetId, assetSha256: snapshot.sha256 };
  };
  const addComment = () => run(async () => {
    const input: Record<string, unknown> = { ...reviewInput(), text: comment, ...(replyId ? { parentId: replyId } : {}) };
    if (seconds !== '' && ['audio', 'video'].includes(snapshot!.kind)) input.timeSeconds = Number(seconds);
    replace(await api<ReviewBoardDetail>(boardPath + '/comments', { method: 'POST', body: json(input) }));
    setComment(''); setReplyId(undefined); setSeconds(''); setNotice('Comment saved.');
  });
  const decide = (decision: 'approved' | 'changes-requested') => run(async () => {
    replace(await api<ReviewBoardDetail>(boardPath + '/decisions', { method: 'POST', body: json({ ...reviewInput(), decision, note: decisionNote }) }));
    setDecisionNote(''); setNotice('Decision saved for this exact asset version.');
  });
  const resolve = (thread: ReviewComment) => run(async () => {
    replace(await api<ReviewBoardDetail>(boardPath + '/comments/' + thread.id, { method: 'PATCH', body: json({ revision: board!.revision, resolved: !thread.resolvedAt }) }));
  });
  const comments = board?.comments.filter(value => value.version === version?.number && value.assetId === snapshot?.assetId) ?? [];
  const decisions = board?.decisions.filter(value => value.version === version?.number && value.assetId === snapshot?.assetId) ?? [];

  return <div className="rd-overlay"><section className="rd-studio" ref={dialog} role="dialog" aria-modal="true" aria-labelledby="rd-title">
    <header className="rd-header"><div><span className="rd-eyebrow">OPEN TAKE / COLLABORATE</span><h2 id="rd-title">Review & deliver</h2><p>{project.project.name}</p></div><button onClick={onClose} aria-label="Close review and delivery"><X size={20}/></button></header>
    <nav className="rd-tabs" aria-label="Review and delivery sections"><button className={tab === 'review' ? 'active' : ''} onClick={() => setTab('review')}><MessageSquare size={16}/> Shared review</button><button className={tab === 'delivery' ? 'active' : ''} onClick={() => setTab('delivery')}><Download size={16}/> Delivery package</button>{publishing && <button className={tab === 'publish' ? 'active' : ''} onClick={() => setTab('publish')}><Send size={16}/> Publish</button>}</nav>
    <div className="rd-status" role="status" aria-live="polite">{busy ? 'Saving your work…' : error || notice}</div>
    {tab === 'publish' ? <div className="rd-publishing">{publishing}</div> : <div className="rd-content">
      <aside className="rd-selection"><h3>Choose saved media</h3><p className="rd-hint">Use existing work. Reviewing and preparing files use no Comfy credits.</p><input aria-label="Search saved media" placeholder="Search saved media…" value={filter} onChange={event => setFilter(event.target.value)}/>
        <div className="rd-selection-count"><span>{selected.length}/24 selected · {(selectedBytes / 1048576).toFixed(1)} MiB</span><button disabled={!selected.length || busy} onClick={() => setSelected([])}>Clear</button></div>
        <div className="rd-assets">{candidates.map(asset => <label key={asset.id} className={'rd-asset ' + (selected.includes(asset.id) ? 'selected' : '')}><input type="checkbox" disabled={busy || (!selected.includes(asset.id) && selected.length >= 24)} checked={selected.includes(asset.id)} onChange={() => toggle(asset.id)}/>{asset.kind === 'image' ? <img src={fileUrl(asset.id)} alt="" loading="lazy"/> : <span className="rd-media-kind">{asset.kind}</span>}<span>{asset.name}<small>{(asset.size / 1048576).toFixed(1)} MiB</small></span></label>)}</div>
      </aside>
      <main className="rd-main">
        {tab === 'review' ? <>
          <div className="rd-row"><label className="rd-grow">Review board<select value={boardId} onChange={event => chooseBoard(event.target.value)}><option value="">Create a new review…</option>{boards.map(value => <option key={value.board.id} value={value.board.id}>{value.board.title}{value.board.closedAt ? ' · closed' : ''}</option>)}</select></label><button onClick={() => run(refresh)} disabled={busy} aria-label="Refresh reviews"><RefreshCw size={17}/></button></div>
          <fieldset disabled={busy} className="rd-panel"><label>Review title<input value={title} maxLength={160} onChange={event => setTitle(event.target.value)}/></label>{!board ? <><p className="rd-hint">Only the selected saved assets are included. Invitation links are created separately.</p><button className="rd-primary" disabled={!selected.length || !title.trim()} onClick={() => run(async () => { const value = await api<ReviewBoardDetail>(base + '/reviews', { method: 'POST', body: json({ title, assetIds: selected }) }); replace(value); setBoardId(value.board.id); setVersionNumber(1); setNotice('Review created. Add an invitation when you are ready.'); })}>Create review from selection</button></> :
            <><div className="rd-row"><button onClick={() => run(async () => { replace(await api<ReviewBoardDetail>(boardPath, { method: 'PATCH', body: json({ revision: board.revision, title }) })); setNotice('Review title saved.'); })}>Save title</button><button onClick={() => run(async () => { replace(await api<ReviewBoardDetail>(boardPath, { method: 'PATCH', body: json({ revision: board.revision, closed: !board.closedAt }) })); })}>{board.closedAt ? 'Reopen board' : 'Close review access'}</button></div><p className="rd-hint">Closing a board stops all invitation access, including media.</p></>}
          </fieldset>
          {board && version && <>
            <fieldset disabled={busy || !!board.closedAt} className="rd-panel"><h3>Saved versions</h3><div className="rd-row"><label className="rd-grow">Current review version<select value={version.number} onChange={event => { setVersionNumber(Number(event.target.value)); setCommentAsset(''); setReplyId(undefined); }}>{board.versions.map(value => <option key={value.number} value={value.number}>{value.label} · {value.assets.length} assets</option>)}</select></label><button onClick={() => setSelected(version.assets.map(asset => asset.assetId))}>Select this version’s media</button></div><p className="rd-hint">An invitation stays on its original version. Existing approvals remain attached to the exact saved media.</p><div className="rd-row"><label className="rd-grow">New version label<input value={versionLabel} maxLength={160} onChange={event => setVersionLabel(event.target.value)}/></label><button disabled={!selected.length || !versionLabel.trim()} onClick={() => run(async () => { const value = await api<ReviewBoardDetail>(boardPath + '/versions', { method: 'POST', body: json({ revision: board.revision, label: versionLabel, assetIds: selected }) }); replace(value); setVersionNumber(value.board.versions.at(-1)!.number); setInviteUrl(''); setNotice('New version saved. Create a new invitation to share it.'); })}>Add selected media as version</button></div></fieldset>
            <fieldset disabled={busy || !!board.closedAt} className="rd-panel"><h3>Invite a reviewer</h3><div className="rd-row"><label className="rd-grow">Invitation label<input placeholder="Client or team member" value={inviteLabel} maxLength={100} onChange={event => setInviteLabel(event.target.value)}/></label><label>Permission<select value={role} onChange={event => setRole(event.target.value as ReviewRole)}><option value="viewer">View only</option><option value="commenter">View & comment</option><option value="approver">Comment & approve</option></select></label><label>Expires in (up to)<select value={days} onChange={event => setDays(Number(event.target.value))}><option value={1}>1 day</option><option value={7}>7 days</option><option value={30}>30 days</option></select></label></div><p className="rd-hint">Shares {version.label} and its {version.assets.length} selected assets. Anyone with this link can act under its label; email identity is not verified.{workspaceExpiresAt && <> This workspace expires {date(workspaceExpiresAt)}; invitations end by then.</>}</p><button className="rd-primary" disabled={!inviteLabel.trim()} onClick={() => run(async () => { const result = await api<{ relativeUrl: string }>(boardPath + '/invitations', { method: 'POST', body: json({ revision: board.revision, version: version.number, label: inviteLabel, role, expiresAt: new Date(Date.now() + days * 86400000 - 1000).toISOString() }) }); setInviteUrl(new URL(result.relativeUrl, location.origin).href); await refresh(); setNotice('Invitation ready. Copy and share it with the intended reviewer.'); })}><Link2 size={16}/> Create invitation link</button>
              {inviteUrl && <div className="rd-invite-link"><label>New invitation link<input readOnly value={inviteUrl} onFocus={event => event.currentTarget.select()}/></label><button onClick={() => run(async () => { await navigator.clipboard.writeText(inviteUrl); setNotice('Invitation copied.'); })}>Copy link</button><a href={inviteUrl} target="_blank" rel="noreferrer">Open review</a><p className="rd-hint">Copy this link now. Its secret is not retained in the review history.</p></div>}
              <div className="rd-invitations">{detail!.invitations.map(invitation => <div key={invitation.id} className="rd-invitation"><span><strong>{invitation.label}</strong><small>{invitation.role} · version {invitation.version} · {invitation.revokedAt ? 'revoked' : Date.parse(invitation.expiresAt) < Date.now() ? 'expired' : 'expires ' + date(invitation.expiresAt)}</small></span>{!invitation.revokedAt && Date.parse(invitation.expiresAt) > Date.now() && <button onClick={() => run(async () => { replace(await api<ReviewBoardDetail>(boardPath + '/invitations/' + invitation.id, { method: 'DELETE', body: json({ revision: board.revision }) })); setInviteUrl(''); setNotice('Invitation revoked.'); })}>Revoke</button>}</div>)}</div>
            </fieldset>
            <fieldset disabled={busy || !!board.closedAt} className="rd-panel"><h3>Comments & approvals</h3><label>Asset version<select value={snapshot?.assetId ?? ''} onChange={event => { setCommentAsset(event.target.value); setReplyId(undefined); }}>{version.assets.map(asset => <option key={asset.assetId} value={asset.assetId}>{asset.name}</option>)}</select></label>{snapshot && <><div className="rd-preview">{snapshot.kind === 'image' ? <img src={fileUrl(snapshot.assetId)} alt={snapshot.name}/> : snapshot.kind === 'video' ? <video src={fileUrl(snapshot.assetId)} controls preload="metadata"/> : snapshot.kind === 'audio' ? <audio src={fileUrl(snapshot.assetId)} controls preload="metadata"/> : <a href={fileUrl(snapshot.assetId) + '?download=1'}>Download selected {snapshot.kind}</a>}</div><p className="rd-hint">Version {version.number} · fingerprint {snapshot.sha256.slice(0, 16)}</p></>}
              <label>{replyId ? 'Reply to thread' : 'New comment'}<textarea value={comment} maxLength={4000} onChange={event => setComment(event.target.value)} placeholder="What works, and what should change?"/></label>{snapshot && ['audio', 'video'].includes(snapshot.kind) && <label className="rd-time">Time in seconds (optional)<input type="number" min="0" max="86400" step="0.1" value={seconds} onChange={event => setSeconds(event.target.value)}/></label>}<div className="rd-row"><button className="rd-primary" onClick={addComment} disabled={!comment.trim()}>Save comment</button>{replyId && <button onClick={() => setReplyId(undefined)}>Cancel reply</button>}</div>
              <div className="rd-threads">{comments.filter(value => !value.parentId).map(thread => <article key={thread.id} className={thread.resolvedAt ? 'resolved' : ''}><strong>{thread.author.label}</strong><small>{date(thread.createdAt)}{thread.timeSeconds !== undefined ? ' · ' + thread.timeSeconds + 's' : ''}{thread.resolvedAt ? ' · resolved' : ''}</small><p>{thread.text}</p><div className="rd-row"><button onClick={() => setReplyId(thread.id)}>Reply</button><button onClick={() => resolve(thread)}>{thread.resolvedAt ? 'Reopen' : 'Resolve'}</button></div>{comments.filter(reply => reply.parentId === thread.id).map(reply => <div key={reply.id} className="rd-reply"><strong>{reply.author.label}</strong><small>{date(reply.createdAt)}</small><p>{reply.text}</p></div>)}</article>)}</div>
              <label>Decision note<textarea value={decisionNote} maxLength={2000} onChange={event => setDecisionNote(event.target.value)} placeholder="Optional context for this decision"/></label><div className="rd-row"><button onClick={() => decide('approved')}><CheckCircle2 size={16}/> Approve this asset version</button><button onClick={() => decide('changes-requested')}>Request changes</button></div><div className="rd-decisions">{[...decisions].reverse().slice(0, 20).map(decision => <p key={decision.id}><strong>{decision.author.label}: {decision.decision === 'approved' ? 'Approved' : 'Changes requested'}</strong><small>{date(decision.createdAt)}</small>{decision.note && <span>{decision.note}</span>}</p>)}</div>
            </fieldset>
          </>}
        </> : <>
          <fieldset disabled={busy} className="rd-panel"><h3>Prepare the handoff</h3><p>Package selected saved media with a caption and a manifest of source and output fingerprints.</p><label>Delivery name<input value={deliveryName} maxLength={120} onChange={event => setDeliveryName(event.target.value)}/></label><label>Media format<select value={preset} onChange={event => setPreset(event.target.value as DeliveryPreset)}><option value="original">Original files</option><option value="square">Square · 1080 × 1080</option><option value="portrait">Portrait · 1080 × 1920</option><option value="landscape">Landscape · 1920 × 1080</option></select></label><p className="rd-hint">Formatting fits the complete image or video with padding. Originals are included too. Audio and documents retain their original bytes. Up to 128 MiB of source media; video formatting supports three clips and 180 seconds total.</p><label>Caption<textarea value={caption} maxLength={10000} onChange={event => setCaption(event.target.value)} placeholder="A caption or delivery notes for the selected work"/></label><button className="rd-primary" disabled={!selected.length || !deliveryName.trim()} onClick={() => run(async () => { const spec = { name: deliveryName, assetIds: selected, caption, preset }, fingerprint = JSON.stringify(spec); if (requestIdentity.current.fingerprint !== fingerprint) requestIdentity.current = { fingerprint, id: crypto.randomUUID() }; const result = await api<DeliveryResult>(base + '/deliveries', { method: 'POST', body: json({ spec, clientRequestId: requestIdentity.current.id }) }); setDelivery(result); await refresh(); onChanged(); setNotice('Delivery ready. Your original media is preserved.'); })}><Download size={16}/> Prepare delivery package</button></fieldset>
          {delivery && <div className="rd-panel rd-ready"><h3>Ready to deliver</h3><a className="rd-download" href={fileUrl(delivery.asset.id) + '?download=1'}><Download size={18}/> Download {delivery.asset.name}</a><p className="rd-hint">{delivery.deliveryAssets.length} media files, caption.txt and integrity manifest. Nothing has been posted to a social account.</p></div>}
          {savedDeliveries.length > 0 && <div className="rd-panel"><h3>Saved delivery packages</h3>{[...savedDeliveries].reverse().map(asset => <a className="rd-saved-package" href={fileUrl(asset.id) + '?download=1'} key={asset.id}><Download size={16}/><span>{asset.name}<small>{date(asset.createdAt)} · {(asset.size / 1048576).toFixed(1)} MiB</small></span></a>)}</div>}
        </>}
      </main>
    </div>}
  </section></div>;
}