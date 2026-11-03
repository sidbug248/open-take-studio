import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import type { Asset } from '../shared/types.ts';
import { uploadRouterInputAsset, type MediaTransportOptions } from '../server/media-transport.ts';
import { buildModelInput, extractModelMedia } from '../server/model-registry.ts';

const now = Date.parse('2026-11-03T01:00:00Z');
const signedUrl = 'https://media.example.com/fixture.wav?signature=test-only-signature';
const wav = Buffer.alloc(46);
wav.write('RIFF', 0); wav.writeUInt32LE(38, 4); wav.write('WAVEfmt ', 8);
wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
wav.writeUInt32LE(24000, 24); wav.writeUInt32LE(48000, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34);
wav.write('data', 36); wav.writeUInt32LE(2, 40);
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jx1sAAAAASUVORK5CYII=', 'base64');
const asset: Asset = { id: 'owned-audio', projectId: 'p', name: 'Fixture speech', kind: 'audio', mimeType: 'audio/wav', fileName: 'owned-audio.wav', size: wav.length, sha256: createHash('sha256').update(wav).digest('hex'), provenance: 'generated', createdAt: new Date(now).toISOString(), metadata: {}, url: '/api/assets/owned-audio/file' };
const record = { id: 'cloud-asset-fixture', url: signedUrl, url_expires_at: new Date(now + 6 * 3600_000).toISOString(), expires_at: new Date(now + 24 * 3600_000).toISOString() };
const unexpected = async (): Promise<never> => { throw new Error('Unexpected network call'); };
const options = (change: Partial<MediaTransportOptions> = {}): MediaTransportOptions => ({
  apiKey: 'fixture-workspace-key', now: () => now,
  fetchImpl: async () => Response.json(record), download: async () => ({ bytes: wav, mimeType: 'audio/wav' }), ...change,
});

test('asset upload puts metadata before file and verifies public bytes without forwarding workspace authorization', async () => {
  let uploads = 0, publicReads = 0;
  const reference = await uploadRouterInputAsset(asset, wav, options({
    fetchImpl: async (url, init) => {
      uploads++;
      assert.equal(url, 'https://cloud.comfy.org/api/v2/assets');
      assert.equal(init?.method, 'POST');
      assert.equal(init?.redirect, 'error');
      const headers = new Headers(init?.headers);
      assert.equal(headers.get('authorization'), 'Bearer fixture-workspace-key');
      assert.equal(headers.get('content-type'), null, 'fetch must supply the multipart boundary');
      assert.ok(init?.body instanceof FormData);
      const form = init.body;
      assert.deepEqual([...form.keys()], ['content_type', 'file_path', 'expires_in', 'file']);
      assert.equal(form.get('content_type'), 'audio/wav');
      assert.equal(form.get('file_path'), 'open-take-studio/inputs/owned-audio.wav');
      assert.equal(form.get('expires_in'), '86400');
      const file = form.get('file');
      assert.ok(file instanceof File);
      assert.deepEqual(Buffer.from(await file.arrayBuffer()), wav);
      return Response.json(record);
    },
    download: async (...args) => {
      publicReads++;
      assert.equal(args.length, 1, 'the public downloader receives only the signed URL, no credentials or headers');
      assert.equal(args[0], signedUrl);
      return { bytes: wav, mimeType: 'audio/wav' };
    },
  }));
  assert.equal(uploads, 1); assert.equal(publicReads, 1);
  assert.equal(reference.sourceAssetId, asset.id);
  assert.equal(reference.sourceSha256, asset.sha256);
  assert.equal(reference.hostedSha256, asset.sha256);
  assert.equal(reference.urlExpiresAt, record.url_expires_at);
  assert.equal(reference.assetExpiresAt, record.expires_at);
  assert.equal(reference.contentType, 'audio/wav');
  assert.equal(reference.sizeBytes, wav.length);
});

test('source integrity, supported media kind and explicit missing credential fail before upload', async () => {
  const noNetwork = options({ fetchImpl: unexpected, download: unexpected });
  await assert.rejects(uploadRouterInputAsset({ ...asset, sha256: '0'.repeat(64) }, wav, noNetwork), /integrity/);
  await assert.rejects(uploadRouterInputAsset({ ...asset, size: wav.length + 1 }, wav, noNetwork), /integrity/);
  await assert.rejects(uploadRouterInputAsset({ ...asset, kind: 'document' }, wav, noNetwork), /image, video or audio/);
  await assert.rejects(uploadRouterInputAsset(asset, wav, { ...noNetwork, apiKey: ' ' }), /COMFY_API_KEY/);
});

test('short-lived, missing or unsafe returned transport records are rejected before public retrieval', async () => {
  for (const invalid of [
    { ...record, url_expires_at: new Date(now + 29 * 60_000).toISOString() },
    { ...record, url_expires_at: 'not-a-date' },
    { ...record, url_expires_at: undefined },
    { ...record, id: '../escape' },
    { ...record, url: 'http://media.example.com/audio.wav' },
    { ...record, url: 'https://credential@media.example.com/audio.wav' },
  ]) {
    await assert.rejects(uploadRouterInputAsset(asset, wav, options({ fetchImpl: async () => Response.json(invalid), download: unexpected })), /expiry|30 minutes|unusable/);
  }
});

test('hosted audio integrity and media type are verified after unauthenticated collection', async () => {
  const changed = Buffer.from(wav); changed[44] = 1;
  await assert.rejects(uploadRouterInputAsset(asset, wav, options({ download: async () => ({ bytes: changed, mimeType: 'audio/wav' }) })), /Hosted media integrity/);
  await assert.rejects(uploadRouterInputAsset(asset, wav, options({ download: async () => ({ bytes: png, mimeType: 'image/png' }) })), /does not match/);
});

test('upload rejection reports status and never leaks the server response or proceeds to media retrieval', async () => {
  await assert.rejects(uploadRouterInputAsset(asset, wav, options({ fetchImpl: async () => new Response('private response fixture-workspace-key', { status: 422 }), download: unexpected })), (error: unknown) => {
    assert.ok(error instanceof Error);
    assert.match(error.message, /HTTP 422.*No generation/);
    assert.doesNotMatch(error.message, /private response|fixture-workspace-key/);
    assert.equal((error as Error & { httpStatus: number }).httpStatus, 422);
    return true;
  });
});

test('URL-only adapters accept server-resolved HTTPS inputs and reject data URI, blob, cleartext or embedded credentials', () => {
  const source = 'https://media.example.com/source.mp4', audio = 'https://media.example.com/speech.wav';
  const sync = buildModelInput('synclabs/sync-3', { prompt: '', settings: {}, inputData: { video: source, audio } });
  assert.deepEqual(sync.input, [{ type: 'video', url: source }, { type: 'audio', url: audio }]);
  assert.equal(Object.hasOwn(sync, 'dubParams'), false);
  assert.equal(Object.hasOwn(sync, 'model_mode'), false);
  for (const invalid of ['data:video/mp4;base64,aGVsbG8=', 'blob:example', 'http://media.example.com/a.mp4', 'https://secret@media.example.com/a.mp4', 'https://media.example.com:8443/a.mp4']) {
    assert.throws(() => buildModelInput('synclabs/sync-3', { prompt: '', settings: {}, inputData: { video: invalid, audio } }), /server-resolved/);
  }
  assert.throws(() => buildModelInput('higgsfield/higgsfield-genjutsu-motion-transfer-v1.0', { prompt: '', settings: {}, inputData: { video: `${source}?x=${'a'.repeat(2100)}`, images: ['https://media.example.com/ref.png'] } }), /2083/);
});

test('new native result adapters reject failed status, embedded errors and missing media', () => {
  const output = 'https://media.example.com/result.mp4';
  assert.equal(extractModelMedia('synclabs/sync-3', { status: 'COMPLETED', outputUrl: output })[0]?.url, output);
  assert.equal(extractModelMedia('higgsfield/higgsfield-genjutsu-motion-transfer-v1.0', { status: 'completed', video: { url: output } })[0]?.url, output);
  for (const payload of [{ status: 'FAILED', outputUrl: output }, { status: 'COMPLETED', outputUrl: output, errorCode: 'bad_input' }, { status: 'COMPLETED' }]) {
    assert.throws(() => extractModelMedia('synclabs/sync-3', payload), /failed|without an accessible/);
  }
  for (const payload of [{ status: 'failed', video: { url: output } }, { status: 'completed', video: { url: output }, error: 'bad input' }, { status: 'completed', video: {} }]) {
    assert.throws(() => extractModelMedia('higgsfield/higgsfield-genjutsu-motion-transfer-v1.0', payload), /failed|without an accessible/);
  }
});
