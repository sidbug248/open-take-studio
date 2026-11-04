import type { Json } from './types';

export const SYNC_DURATION_MODEL = 'synclabs/sync-3';
export type SyncDurationRequest = {
  projectId: string;
  modelId: string;
  settings: Json;
  inputAssetIds: Record<string, string | string[]>;
};
export interface SyncDurationCheck {
  videoAssetId: string;
  audioAssetId: string;
  videoSeconds: number;
  audioSeconds: number;
  syncMode: string;
  truncatedSeconds: number;
  requiresConfirmation: boolean;
  confirmationToken?: string;
  expiresAt?: string;
}
export interface SyncDurationReview {
  selection: string;
  check: SyncDurationCheck;
  confirmed: boolean;
}
export interface SyncDurationReceipt {
  videoSha256: string;
  audioSha256: string;
  videoSeconds: number;
  audioSeconds: number;
  syncMode: string;
  truncatedSeconds: number;
  cutoffConfirmed: boolean;
  checkedAt: string;
}
function canonical(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.entries(value).filter(([, v]) => v !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([key, v]) => JSON.stringify(key) + ':' + canonical(v)).join(',') + '}';
  return JSON.stringify(value) ?? 'null';
}
/** A confirmation never travels with a recipe or a persisted creation draft. */
export function syncDurationSelection(request: SyncDurationRequest): string {
  return canonical({ projectId: request.projectId, modelId: request.modelId, settings: request.settings, inputAssetIds: request.inputAssetIds });
}
export function syncDurationReady(review: SyncDurationReview | undefined, selection: string, now = Date.now()): boolean {
  if (!review || review.selection !== selection) return false;
  if (!review.check.requiresConfirmation) return true;
  return review.confirmed && !!review.check.confirmationToken && !!review.check.expiresAt && Date.parse(review.check.expiresAt) > now;
}

export function syncDurationModeLabel(mode: string): string {
  return ({cut_off: 'Cut off at the shorter input', bounce: 'Bounce', loop: 'Loop', silence: 'Silence', remap: 'Remap'} as Record<string,string>)[mode] ?? mode;
}
