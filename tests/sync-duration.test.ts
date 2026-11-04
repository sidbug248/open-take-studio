import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import express, { type ErrorRequestHandler } from 'express';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { Asset } from '../shared/types.ts';
import { SYNC_DURATION_MODEL, syncDurationReady, syncDurationSelection, type SyncDurationCheck, type SyncDurationRequest } from '../shared/sync-duration.ts';
import { SyncDurationGuard, SyncDurationConfirmationRequired } from '../server/sync-duration.ts';
import { SyncDurationResult } from '../client/SyncDurationResult.tsx';
import { Store } from '../server/store.ts';
import { LocalFileStorage } from '../server/media.ts';
import { mediaToolPaths, runMediaTool } from '../server/film-media.ts';
import { createGenerationRouter } from '../server/generation-routes.ts';
import type { GenerationWorker } from '../server/worker.ts';

function wav(seconds: number) {
  const rate = 16000, size = Math.round(seconds * rate) * 2, bytes = Buffer.alloc(44 + size);
  bytes.write('RIFF'); bytes.writeUInt32LE(36 + size, 4); bytes.write('WAVEfmt ', 8);
  bytes.writeUInt32LE(16, 16); bytes.writeUInt16LE(1, 20); bytes.writeUInt16LE(1, 22);
  bytes.writeUInt32LE(rate, 24); bytes.writeUInt32LE(rate * 2, 28); bytes.writeUInt16LE(2, 32); bytes.writeUInt16LE(16, 34);
  bytes.write('data', 36); bytes.writeUInt32LE(size, 40);
  for (let n = 0; n < size / 2; n++) bytes.writeInt16LE(Math.round(8000 * Math.sin(2 * Math.PI * 300 * n / rate)), 44 + n * 2);
  return bytes;
}
let folder: string, store: Store, media: LocalFileStorage, guard: SyncDurationGuard;
let video: Asset, audio: Asset, alternateAudio: Asset, shortAudio: Asset, foreignAudio: Asset;
let clock = Date.parse('2026-11-04T20:00:00Z'), ticks = 0, credentialReads = 0, credentialsAvailable = true;
let listener: ReturnType<ReturnType<typeof express>['listen']>, base: string, request: SyncDurationRequest;
let outgoing: string[] = [];
const originalFetch = globalThis.fetch;
const credential = { apiKey: 'isolated-duration-fixture-key-never-sent', id: 'duration-fixture' };
before(async () => {
  const parent = path.resolve('data/test-fixtures'); await mkdir(parent, { recursive: true });
  folder = await mkdtemp(path.join(parent, 'sync-duration-')); store = new Store(folder); media = new LocalFileStorage(folder);
  for (const id of ['p', 'other']) store.upsertProject({ id, name: id, description: '', createdAt: new Date(clock).toISOString(), updatedAt: new Date(clock).toISOString() });
  const save = async (projectId: string, name: string, bytes: Buffer, mimeType: string, duration: number) => {
    const saved = await media.put({ projectId, name, bytes, mimeType, provenance: 'local-edit', metadata: { duration } }); store.upsertAsset(saved); return saved;
  };
  const { ffmpeg } = mediaToolPaths(), file = path.join(folder, 'performance.mp4');
  // Deliberately make the container/audio longer than the real video stream.
  // The duration guard must measure the performance, not trust the container.
  await runMediaTool(ffmpeg, ['-nostdin', '-v', 'error', '-f', 'lavfi', '-i', 'color=c=blue:s=32x32:r=10:d=0.5', '-f', 'lavfi', '-i', 'sine=frequency=220:sample_rate=16000:duration=1.2', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-movflags', '+faststart', '-threads', '1', file]);
  video = await save('p', 'performance.mp4', await readFile(file), 'video/mp4', 9999);
  audio = await save('p', 'speech.wav', wav(1), 'audio/wav', .1);
  alternateAudio = await save('p', 'same-bytes-new-selection.wav', wav(1), 'audio/wav', .1);
  shortAudio = await save('p', 'short-speech.wav', wav(.2), 'audio/wav', 9999);
  foreignAudio = await save('other', 'private.wav', wav(1), 'audio/wav', .1);
  guard = new SyncDurationGuard(store, media, () => clock);
  request = { projectId: 'p', modelId: SYNC_DURATION_MODEL, settings: {}, inputAssetIds: { video: video.id, audio: audio.id } };
  const scope = createHash('sha256').update(credential.id).digest('hex'), cache = path.join(folder, 'hosted-inputs', scope);
  await mkdir(cache, { recursive: true });
  for (const asset of [video, audio, alternateAudio, shortAudio]) await writeFile(path.join(cache, asset.sha256 + '.json'), JSON.stringify({
    sourceSha256: asset.sha256, credentialScopeId: credential.id, urlExpiresAt: new Date(Date.now() + 86400_000).toISOString(), url: 'https://media.invalid/' + asset.fileName,
  }));
  const app = express(); app.use(express.json());
  app.use('/api', createGenerationRouter(store, media, { tick: async () => { ticks++; } } as unknown as GenerationWorker, {
    available: () => credentialsAvailable,
    resolve: () => { credentialReads++; if (!credentialsAvailable) throw new Error('No credential in this fixture'); return credential; },
  }, guard));
  app.use(((error, _req, res, _next) => res.status(error.status ?? 400).json({ error: error.message })) as ErrorRequestHandler);
  listener = await new Promise(resolve => { const server = app.listen(0, '127.0.0.1', () => resolve(server)); });
  base = 'http://127.0.0.1:' + (listener.address() as AddressInfo).port + '/api';
  globalThis.fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (!url.startsWith(base)) { outgoing.push(url); throw new Error('External network disabled by duration test'); }
    return originalFetch(input, init);
  };
});
after(async () => {
  globalThis.fetch = originalFetch;
  if (listener) await new Promise<void>((resolve, reject) => listener.close(error => error ? reject(error) : resolve()));
  store?.close();
  if (folder) { assert.equal(path.dirname(folder), path.resolve('data/test-fixtures')); await rm(folder, { recursive: true, force: true }); }
});
const post = (route: string, body: unknown) => fetch(base + route, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

test('duration preflight measures actual performance and speech streams without credentials, jobs or uploads', async () => {
  credentialsAvailable = false;
  const reads = credentialReads, assets = store.listAssets('p').length;
  try {
    const result = await post('/generation/duration-check', request);
    assert.equal(result.status, 200); assert.equal(result.headers.get('cache-control'), 'no-store');
    const check = await result.json() as SyncDurationCheck;
    assert.ok(Math.abs(check.videoSeconds - .5) < .01, 'A 1.2-second container must not hide the 0.5-second video.');
    assert.ok(Math.abs(check.audioSeconds - 1) < .01);
    assert.equal(check.requiresConfirmation, true); assert.equal(check.syncMode, 'cut_off');
    assert.ok(Math.abs(check.truncatedSeconds - .5) < .01); assert.ok(check.confirmationToken); assert.ok(check.expiresAt);
    assert.equal(credentialReads, reads); assert.equal(ticks, 0); assert.equal(store.listJobs().length, 0);
    assert.equal(store.listAssets('p').length, assets); assert.deepEqual(outgoing, []);
  } finally { credentialsAvailable = true; }
});

test('generation refuses default cutoff and arbitrary setting flags before any job or provider call', async () => {
  for (const settings of [{}, { sync_mode: 'cut_off' }, { sync_mode: 'cut_off', acknowledge_cutoff: true }]) {
    const response = await post('/generate', { ...request, settings, clientRequestId: 'unacknowledged-speech' });
    assert.ok([400, 409].includes(response.status));
    const result = await response.json(); assert.match(result.error, /speech|not supported/i);
  }
  assert.equal(ticks, 0); assert.equal(store.listJobs().length, 0); assert.deepEqual(outgoing, []);
});

test('cutoff confirmation is bound to the actual media, project and all settings, and expires', async () => {
  const check = await guard.review(request), token = check.confirmationToken!;
  const receipt = await guard.validate(request, token);
  assert.equal(receipt.cutoffConfirmed, true); assert.equal(receipt.audioSha256, audio.sha256);
  for (const changed of [
    { ...request, inputAssetIds: { ...request.inputAssetIds, audio: alternateAudio.id } },
    { ...request, settings: { temperature: .6 } },
  ]) await assert.rejects(guard.validate(changed, token), SyncDurationConfirmationRequired);
  await assert.rejects(guard.validate(request, token.slice(0, -1) + (token.endsWith('a') ? 'b' : 'a')), SyncDurationConfirmationRequired);
  await assert.rejects(guard.validate({ ...request, inputAssetIds: { ...request.inputAssetIds, audio: foreignAudio.id } }, token), /from this project/);
  await assert.rejects(new SyncDurationGuard(store, media, () => clock).validate(request, token), SyncDurationConfirmationRequired);
  const before = clock; clock += 16 * 60_000;
  try {
    await assert.rejects(guard.validate(request, token), SyncDurationConfirmationRequired);
    const expired = await post('/generate', { ...request, clientRequestId: 'expired-duration-choice', durationConfirmation: token });
    assert.equal(expired.status, 409); assert.equal((await expired.json()).code, 'duration_confirmation_required');
  } finally { clock = before; }
  const changedResponse = await post('/generate', { ...request, settings: { temperature: .6 }, clientRequestId: 'changed-duration-choice', durationConfirmation: token });
  assert.equal(changedResponse.status, 409);
  assert.equal(store.listJobs().length, 0); assert.equal(ticks, 0); assert.deepEqual(outgoing, []);
});

test('shorter speech or an explicitly chosen alternative mode needs no cutoff acknowledgement', async () => {
  const short = await guard.validate({ ...request, inputAssetIds: { ...request.inputAssetIds, audio: shortAudio.id } });
  assert.equal(short.cutoffConfirmed, false); assert.equal(short.truncatedSeconds, 0);
  const loop = await guard.validate({ ...request, settings: { sync_mode: 'loop' } });
  assert.equal(loop.syncMode, 'loop'); assert.equal(loop.cutoffConfirmed, false);
  assert.equal(request.settings.sync_mode, undefined, 'Checking must not silently change the user\'s duration mode.');
  assert.deepEqual(outgoing, []);
});

test('client acknowledgement resets for changed media/settings and cannot outlive its check', async () => {
  const check = await guard.review(request), selection = syncDurationSelection(request);
  const review = { selection, check, confirmed: false };
  assert.equal(syncDurationReady(review, selection, clock), false);
  review.confirmed = true; assert.equal(syncDurationReady(review, selection, clock), true);
  assert.equal(syncDurationReady(review, syncDurationSelection({ ...request, settings: { temperature: .6 } }), clock), false);
  assert.equal(syncDurationReady(review, syncDurationSelection({ ...request, inputAssetIds: { video: video.id, audio: alternateAudio.id } }), clock), false);
  assert.equal(syncDurationReady(review, selection, clock + 16 * 60_000), false);
  const html = renderToStaticMarkup(createElement(SyncDurationResult, { check, confirmed: false, onConfirm: () => {} }));
  assert.match(html, /0\.50/); assert.match(html, /1\.00/); assert.match(html, /final .*0\.50.* seconds of speech/);
  assert.match(html, /type="checkbox"/); assert.doesNotMatch(html, /checked=/);
});

test('explicit confirmed admission is idempotent, records its duration decision, and preserves source bytes', async () => {
  const check = await guard.review(request), body = { ...request, clientRequestId: 'intentional-shorter-take', durationConfirmation: check.confirmationToken };
  const originals = await Promise.all([media.read(video), media.read(audio)]);
  const result = await post('/generate', body); assert.equal(result.status, 202, await result.clone().text());
  const admitted = await result.json();
  assert.equal(admitted.take.inputDurationReview.cutoffConfirmed, true);
  assert.equal(admitted.take.inputDurationReview.audioSha256, audio.sha256);
  assert.ok(Math.abs(admitted.take.inputDurationReview.videoSeconds - .5) < .01);
  assert.equal(admitted.job.inputs.options.sync_mode, 'cut_off');
  assert.ok(!JSON.stringify(admitted.take).includes(check.confirmationToken!));
  assert.equal(store.listJobs().length, 1); assert.equal(ticks, 1);
  clock += 16 * 60_000;
  const retry = await post('/generate', body); assert.equal(retry.status, 200);
  assert.equal((await retry.json()).job.id, admitted.job.id);
  assert.equal(store.listJobs().length, 1); assert.equal(ticks, 1);
  assert.deepEqual(await media.read(video), originals[0]); assert.deepEqual(await media.read(audio), originals[1]);
  assert.deepEqual(outgoing, []);
});
