import './config.ts';
import { createHash } from 'node:crypto';
import type { Asset } from '../shared/types.ts';
import { downloadMedia } from './download.ts';
import { identifyMedia } from './media.ts';

const CLOUD_ASSETS = 'https://cloud.comfy.org/api/v2/assets';
/** Server-only transport evidence. url contains a temporary signed credential:
 * retain it only in protected execution storage, never logs or public audit text. */
export interface HostedMediaReference {
  host: 'comfy-cloud';
  assetId: string;
  sourceAssetId: string;
  sourceSha256: string;
  hostedSha256: string;
  url: string;
  urlExpiresAt: string;
  assetExpiresAt?: string;
  contentType: string;
  sizeBytes: number;
  uploadedAt: string;
  verifiedAt: string;
}
export type MediaTransportOptions = {
  apiKey?: string;
  fetchImpl?: typeof fetch;
  download?: typeof downloadMedia;
  now?: () => number;
};

/** Uploads one explicitly selected owned asset. No workflow or inference endpoint
 * is used. The caller must establish project ownership before calling this. */
export async function uploadRouterInputAsset(asset: Asset, bytes: Uint8Array, options: MediaTransportOptions = {}): Promise<HostedMediaReference> {
  if (!['image', 'video', 'audio'].includes(asset.kind)) throw new Error('Remote model inputs must be image, video or audio assets.');
  const original = Buffer.from(bytes);
  const sourceHash = createHash('sha256').update(original).digest('hex');
  if (sourceHash !== asset.sha256 || original.length !== asset.size) throw new Error('Source media integrity check failed before upload.');
  const key = (options.apiKey ?? process.env.COMFY_API_KEY)?.trim();
  if (!key) throw new Error('Project COMFY_API_KEY is required for temporary media hosting.');
  const now = options.now ?? Date.now;
  const form = new FormData();
  // The streaming multipart API requires metadata before the file part.
  form.append('content_type', asset.mimeType);
  form.append('file_path', `open-take-studio/inputs/${asset.fileName}`);
  form.append('expires_in', '86400');
  form.append('file', new Blob([new Uint8Array(original)], { type: asset.mimeType }), asset.fileName);
  const response = await (options.fetchImpl ?? fetch)(CLOUD_ASSETS, {
    method: 'POST', headers: { Authorization: `Bearer ${key}` }, body: form,
    redirect: 'error', signal: AbortSignal.timeout(180_000),
  });
  if (!response.ok) {
    await response.body?.cancel();
    throw Object.assign(new Error(`Temporary Comfy media upload failed (HTTP ${response.status}). No generation was submitted.`), { httpStatus: response.status });
  }
  const record = await response.json() as Record<string, unknown>;
  if (typeof record.id !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(record.id) || typeof record.url !== 'string' || typeof record.url_expires_at !== 'string') throw new Error('Comfy asset response is missing a signed media URL or expiry. No generation was submitted.');
  const remote = new URL(record.url);
  if (remote.protocol !== 'https:' || remote.username || remote.password) throw new Error('Comfy returned an unusable temporary media URL.');
  const expiry = Date.parse(record.url_expires_at);
  if (!Number.isFinite(expiry) || expiry - now() < 30 * 60_000) throw new Error('Temporary media URL has less than 30 minutes remaining. No generation was submitted.');
  // This GET deliberately carries NO workspace credential. downloadMedia checks
  // public addresses, pins DNS and revalidates redirects before reading bytes.
  const publicFile = await (options.download ?? downloadMedia)(record.url);
  const detected = identifyMedia(publicFile.bytes, asset.mimeType);
  if (detected.kind !== asset.kind) throw new Error('Hosted media does not match the selected asset type.');
  const hostedHash = createHash('sha256').update(publicFile.bytes).digest('hex');
  // Cloud can strip image location metadata. Audio/video must remain byte-identical.
  if (asset.kind !== 'image' && hostedHash !== sourceHash) throw new Error('Hosted media integrity check failed. No generation was submitted.');
  return {
    host: 'comfy-cloud', assetId: record.id, sourceAssetId: asset.id, sourceSha256: sourceHash,
    hostedSha256: hostedHash, url: record.url, urlExpiresAt: record.url_expires_at,
    assetExpiresAt: typeof record.expires_at === 'string' ? record.expires_at : undefined,
    contentType: detected.mimeType, sizeBytes: publicFile.bytes.length,
    uploadedAt: new Date(now()).toISOString(), verifiedAt: new Date(now()).toISOString(),
  };
}
