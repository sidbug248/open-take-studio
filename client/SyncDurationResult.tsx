import { syncDurationModeLabel, type SyncDurationCheck as Check } from '../shared/sync-duration';

export function SyncDurationResult({ check, confirmed, onConfirm }: { check: Check; confirmed: boolean; onConfirm: (confirmed: boolean) => void }) {
  return <>
    <dl><dt>Performance video</dt><dd>{check.videoSeconds.toFixed(2)} s</dd><dt>Speech track</dt><dd>{check.audioSeconds.toFixed(2)} s</dd></dl>
    {check.requiresConfirmation ? <>
      <p className="sync-duration-warning">Cut off will remove the final {check.truncatedSeconds.toFixed(2)} seconds of speech. Choose another duration mode in Model settings, use a longer video, or confirm this shorter take.</p>
      <label className="sync-duration-confirm"><input type="checkbox" checked={confirmed} onChange={event => onConfirm(event.target.checked)}/><span>Use only the first {check.videoSeconds.toFixed(2)} seconds of speech for this take.</span></label>
    </> : <p>{check.syncMode === 'cut_off' ? 'The selected video covers the speech duration.' : 'Duration mode: ' + syncDurationModeLabel(check.syncMode) + '. This mode changes how the inputs fit; review the finished take.'}</p>}
    <small>The source files stay unchanged. This check uses no Comfy credits.</small>
  </>;
}
