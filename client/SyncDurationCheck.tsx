import { useEffect, useState } from 'react';
import { api, json } from './api';
import { type SyncDurationCheck as Check, type SyncDurationRequest, type SyncDurationReview } from '../shared/sync-duration';
import './sync-duration.css';
import { SyncDurationResult } from './SyncDurationResult';

type Props = { request: SyncDurationRequest; selection: string; onReviewChange: (review: SyncDurationReview | undefined) => void };
export function SyncDurationCheck({ request, selection, onReviewChange }: Props) {
  const [check, setCheck] = useState<Check>(), [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState(''), [attempt, setAttempt] = useState(0);
  const hasBoth = typeof request.inputAssetIds.video === 'string' && !!request.inputAssetIds.video && typeof request.inputAssetIds.audio === 'string' && !!request.inputAssetIds.audio;
  useEffect(() => {
    const controller = new AbortController();
    setCheck(undefined); setConfirmed(false); setError(''); onReviewChange(undefined);
    const timer = setTimeout(() => {
    if (hasBoth) {
      api<Check>('/api/generation/duration-check', { method: 'POST', signal: controller.signal, body: json(request) }).then(result => {
        if (controller.signal.aborted) return;
        setCheck(result); onReviewChange({ selection, check: result, confirmed: false });
      }).catch(cause => {
        if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'The input durations could not be checked.');
      });
    }
    }, 200);
    return () => { clearTimeout(timer); controller.abort(); onReviewChange(undefined); };
    // The parent remounts this component for every project, input or setting change.
  }, [selection, attempt, hasBoth, onReviewChange]);
  useEffect(() => {
    if (!check?.expiresAt) return;
    const timer = setTimeout(() => {
      setCheck(undefined); setConfirmed(false); onReviewChange(undefined);
      setError('This duration check expired. Check again before generating.');
    }, Math.max(0, Date.parse(check.expiresAt) - Date.now()));
    return () => clearTimeout(timer);
  }, [check, onReviewChange]);
  return <section className="sync-duration-check" aria-label="Speech duration review">
    <strong>Keep the complete speech</strong>
    {!hasBoth ? <p>Choose the performance video and speech track to check their lengths.</p> : error ? <><p role="alert">{error}</p><button type="button" className="btn quiet" onClick={() => setAttempt(value => value + 1)}>Check durations again</button></> : !check ? <p role="status">Checking the saved input durations…</p> : <SyncDurationResult check={check} confirmed={confirmed} onConfirm={value => { setConfirmed(value); onReviewChange({ selection, check, confirmed: value }); }}/>}
  </section>;
}
