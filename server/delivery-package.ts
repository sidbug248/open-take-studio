import AdmZip from 'adm-zip';
import sharp from 'sharp';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Asset, Take } from '../shared/types.ts';
import type { DeliveryManifest, DeliveryResult, DeliverySpec } from '../shared/review-types.ts';
import type { Store } from './store.ts';
import type { LocalFileStorage } from './media.ts';
import { FilmMediaTools, mediaToolPaths, runMediaTool } from './film-media.ts';
import { reviewError, reviewHash } from './review-service.ts';

export const deliverySpecSchema = z.object({
  name: z.string().trim().min(1).max(120),
  assetIds: z.array(z.string().regex(/^[a-zA-Z0-9_-]{1,128}$/)).min(1).max(24),
  caption: z.string().max(10_000).default(''),
  preset: z.enum(['original', 'square', 'portrait', 'landscape']).default('original'),
}).strict();
const sizes = { square: [1080, 1080], portrait: [1080, 1920], landscape: [1920, 1080] } as const;
const MAX_SOURCE = 128 * 1024 * 1024;
const MAX_OUTPUT = 192 * 1024 * 1024;
const active = new WeakMap<Store, { key: string; fingerprint: string; work: Promise<DeliveryResult> }>();
const closing = new WeakSet<Store>();
/** Seal admission first, then finish the existing delivery and its cleanup before SQLite closes. */
export async function drainDeliveryWork(store: Store): Promise<void> {
  closing.add(store);
  const pending = active.get(store);
  if (pending) await pending.work.catch(() => undefined);
}

const safeName = (name: string) => name.replace(/[^a-zA-Z0-9._ -]/g, '_').replace(/^\.+/, '').slice(0, 100) || 'media';
interface Receipt { assetId: string; takeId: string; deliveryAssetIds: string[]; manifest: DeliveryManifest; }
function fromReceipt(store: Store, receipt: Receipt): DeliveryResult {
  const asset = store.getAsset(receipt.assetId), take = store.getTake(receipt.takeId);
  const deliveryAssets = receipt.deliveryAssetIds.map(id => store.getAsset(id));
  if (!asset || !take || deliveryAssets.some(value => !value)) throw reviewError('Saved delivery media is missing.', 409);
  return { asset, take, manifest: receipt.manifest, deliveryAssets: deliveryAssets as Asset[] };
}

/** Local media processing only. This module never creates model jobs or posts to a destination. */
export async function createDeliveryPackage(store: Store, media: LocalFileStorage, projectId: string, raw: DeliverySpec, clientRequestId: string): Promise<DeliveryResult> {
  if (closing.has(store)) throw reviewError('This workspace is restarting. Retry the delivery when it is available.', 503);
  const spec = deliverySpecSchema.parse(raw);
  z.string().regex(/^[a-zA-Z0-9_-]{8,128}$/).parse(clientRequestId);
  if (!store.getProject(projectId)) throw reviewError('Project not found.', 404);
  if (new Set(spec.assetIds).size !== spec.assetIds.length) throw reviewError('Choose each delivery asset once.');
  const key = 'review-delivery:' + projectId + ':' + clientRequestId, fingerprint = reviewHash(JSON.stringify(spec));
  const saved = store.getOperationReceipt<Receipt>(key);
  if (saved) {
    if (saved.fingerprint !== fingerprint) throw reviewError('This delivery request already belongs to different inputs.', 409);
    return fromReceipt(store, saved.result);
  }
  const pending = active.get(store);
  if (pending) {
    if (pending.key === key && pending.fingerprint === fingerprint) return pending.work;
    throw reviewError('A delivery is processing in this workspace. Try again when it finishes.', 409);
  }
  const work = build(store, media, projectId, spec, key, fingerprint).finally(() => active.delete(store));
  active.set(store, { key, fingerprint, work });
  return work;
}
async function build(store: Store, media: LocalFileStorage, projectId: string, spec: DeliverySpec, key: string, fingerprint: string): Promise<DeliveryResult> {
  const assets = spec.assetIds.map(id => {
    const value = store.getAsset(id);
    if (!value || value.projectId !== projectId) throw reviewError('A selected delivery asset does not belong to this project.', 404);
    return value;
  });
  if (assets.reduce((n, value) => n + value.size, 0) > MAX_SOURCE) throw reviewError('A delivery supports up to 128 MiB of source media. Export a smaller selection.');
  const formattedVideos = spec.preset === 'original' ? [] : assets.filter(asset => asset.kind === 'video');
  if (formattedVideos.length > 3) throw reviewError('Format up to three video clips in one delivery.');
  const film = new FilmMediaTools(store.dataDir, media);
  let duration = 0;
  for (const video of formattedVideos) {
    const info = await film.inspect(video);
    duration += info.duration;
    if (duration > 180 || info.width * info.height > 33_177_600) throw reviewError('Video formatting supports up to 180 seconds total and 8K source frames. Original delivery preserves larger files.');
  }
  const zip = new AdmZip(), deliveryAssets: Asset[] = [], createdAssets: Asset[] = [];
  const manifest: DeliveryManifest = { format: 'open-take-delivery', version: 1, projectId, name: spec.name, preset: spec.preset, createdAt: new Date().toISOString(), media: [], publication: { state: 'not-published', destination: 'download' } };
  const directory = await mkdtemp(path.join(os.tmpdir(), 'ots-delivery-'));
  let bytesTotal = 0, committed = false;
  let packageAsset: Asset | undefined;
  try {
    for (const [index, asset] of assets.entries()) {
      const info = await stat(media.path(asset));
      if (!info.isFile() || info.size !== asset.size || info.size > MAX_SOURCE) throw reviewError('A source file changed or exceeded the delivery size limit.', 409);
      let bytes = await media.read(asset), extension = path.extname(asset.fileName), processing = 'Original bytes';
      if (reviewHash(bytes) !== asset.sha256) throw reviewError('A source file failed its saved integrity check.', 409);
      const prefix = String(index + 1).padStart(2, '0') + '-' + safeName(asset.name.replace(/\.[a-z0-9]{1,8}$/i, ''));
      let delivered = asset;
      if (spec.preset !== 'original' && ['image', 'video'].includes(asset.kind)) {
        zip.addFile('originals/' + prefix + extension, bytes);
        bytesTotal += bytes.length;
        const [width, height] = sizes[spec.preset];
        if (asset.kind === 'image') {
          const image = sharp(bytes, { limitInputPixels: 40_000_000 });
          const metadata = await image.metadata();
          if ((metadata.pages ?? 1) > 1) throw reviewError('Animated images must use Original delivery to preserve animation.');
          bytes = await image.rotate().resize(width, height, { fit: 'contain', background: '#111114' }).png().toBuffer();
          extension = '.png';
        } else {
          const output = path.join(directory, index + '.mp4');
          await runMediaTool(mediaToolPaths().ffmpeg, ['-nostdin', '-hide_banner', '-loglevel', 'error', '-y', '-protocol_whitelist', 'file,pipe', '-i', media.path(asset), '-map', '0:v:0', '-map', '0:a:0?', '-vf', 'scale=' + width + ':' + height + ':force_original_aspect_ratio=decrease:force_divisible_by=2,pad=' + width + ':' + height + ':(ow-iw)/2:(oh-ih)/2:color=0x111114,setsar=1', '-threads', '1', '-filter_threads', '1', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '21', '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart', '-fs', String(MAX_OUTPUT), output], 4 * 1024 * 1024, 240_000);
          const outputInfo = await stat(output);
          if (outputInfo.size >= MAX_OUTPUT) throw reviewError('Formatted video exceeded the delivery size limit.');
          bytes = await readFile(output);
          extension = '.mp4';
        }
        processing = 'Fit within ' + width + '×' + height + '; original framing preserved with padding';
        delivered = await media.put({ projectId, name: asset.name + ' · ' + spec.preset + extension, mimeType: asset.kind === 'image' ? 'image/png' : 'video/mp4', kind: asset.kind, bytes, provenance: 'local-edit', metadata: { operation: 'delivery-format', preset: spec.preset, sourceAssetId: asset.id, sourceSha256: asset.sha256, inputAssetIds: { sources: [asset.id] } } });
        createdAssets.push(delivered);
      }
      bytesTotal += bytes.length;
      if (bytesTotal > MAX_OUTPUT) throw reviewError('This delivery exceeds 192 MiB including originals. Choose fewer assets.');
      const deliveredFile = 'media/' + prefix + extension;
      zip.addFile(deliveredFile, bytes);
      deliveryAssets.push(delivered);
      manifest.media.push({ sourceAssetId: asset.id, sourceSha256: asset.sha256, originalName: asset.name, deliveredFile, deliveredSha256: reviewHash(bytes), deliveredBytes: bytes.length, processing });
    }
    zip.addFile('caption.txt', Buffer.from(spec.caption, 'utf8'));
    zip.addFile('delivery-manifest.json', Buffer.from(JSON.stringify(manifest, null, 2), 'utf8'));
    zip.addFile('README.txt', Buffer.from('OPEN TAKE STUDIO — DELIVERY\n\nSelected media, caption and integrity manifest are included. Formatted images/videos preserve the complete framing with padding; their originals are in originals/.\n\nThis is a downloaded delivery, not a social publication. No model generation or external account was used.\n', 'utf8'));
    const bytes = zip.toBuffer();
    if (bytes.length > MAX_OUTPUT) throw reviewError('The completed package exceeds the 192 MiB delivery limit.');
    const output = await media.put({ projectId, name: spec.name + '.zip', mimeType: 'application/zip', kind: 'document', bytes, provenance: 'local-edit', metadata: { operation: 'delivery-package', deliverySpec: spec, inputAssetIds: { sources: spec.assetIds }, deliveryAssetIds: deliveryAssets.map(asset => asset.id), manifest } });
    packageAsset = output;
    const now = new Date().toISOString();
    const take: Take = { id: randomUUID(), projectId, name: spec.name + ' · delivery', kind: 'document', inputAssetIds: { sources: spec.assetIds }, sourceAssetId: spec.assetIds[0], assetIds: [output.id, ...createdAssets.map(asset => asset.id)], modelId: 'local/delivery-package', provider: 'local', prompt: '', settings: { operation: 'delivery-package', preset: spec.preset }, status: 'LOCAL', provenance: 'local-edit', favorite: false, createdAt: now, updatedAt: now, changes: [] };
    const result = store.transaction(() => {
      for (const asset of createdAssets) store.upsertAsset(asset);
      store.upsertAsset(output);
      store.upsertTake(take);
      store.putOperationReceipt<Receipt>({ key, fingerprint, result: { assetId: output.id, takeId: take.id, deliveryAssetIds: deliveryAssets.map(asset => asset.id), manifest }, createdAt: now });
      return { asset: output, take, manifest, deliveryAssets };
    });
    committed = true;
    return result;
  } finally {
    if (!committed) for (const asset of [...createdAssets, ...(packageAsset ? [packageAsset] : [])]) {
      if (!store.getAsset(asset.id)) await rm(media.path(asset), { force: true }).catch(() => undefined);
    }
    await rm(directory, { recursive: true, force: true });
  }
}