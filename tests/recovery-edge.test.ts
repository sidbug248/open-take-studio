import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { createStore } from '../server/store.ts';
import { LocalFileStorage } from '../server/media.ts';
import { GenerationWorker } from '../server/worker.ts';
import type { RouterPort } from '../server/router-port.ts';
import type { Job, Take } from '../shared/types.ts';
import { downloadMedia, isPrivateAddress } from '../server/download.ts';

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jx1sAAAAASUVORK5CYII=', 'base64');
const unexpected = async (): Promise<never> => { throw new Error('Router must not be contacted'); };
const offlineRouter: RouterPort = { submit: unexpected, status: unexpected, result: unexpected, cancel: unexpected, run: unexpected };

async function fixture(t: test.TestContext) {
  const base = path.resolve('data/test-fixtures');
  await mkdir(base, { recursive: true });
  const dir = await mkdtemp(path.join(base, 'recovery-'));
  let store = createStore(dir);
  const media = new LocalFileStorage(dir);
  const now = new Date().toISOString();
  store.upsertProject({ id: 'p', name: 'Recovery edge', description: '', createdAt: now, updatedAt: now });
  const take: Take = { id: 't', projectId: 'p', name: 'Recovered take', kind: 'image', inputAssetIds: {}, assetIds: [], modelId: 'bfl/flux-3-image', provider: 'bfl', prompt: 'Lighthouse', settings: {}, status: 'IN_PROGRESS', provenance: 'generated', favorite: false, createdAt: now, updatedAt: now, jobId: 'j', changes: [] };
  const job: Job = { id: 'j', takeId: 't', projectId: 'p', modelId: take.modelId, provider: take.provider, requestId: 'original-router-request', idempotencyKey: randomUUID(), inputs: { prompt: take.prompt }, state: 'IN_PROGRESS', attempts: 1, delivery: 'queue', createdAt: now, updatedAt: now };
  store.saveTakeAndJob(take, job);
  t.after(async () => {
    store.close();
    // The recursive cleanup is restricted to the explicitly created fixture directory.
    assert.equal(path.dirname(path.resolve(dir)), base);
    await rm(dir, { recursive: true, force: true });
  });
  return { get store() { return store; }, media, take, job, reopen() { store.close(); store = createStore(dir); return store; } };
}

test('cached native JSON collects after Router expiry and restart without credentials or Router requests', async t => {
  const f = await fixture(t);
  const old = new Date(Date.now() - 30 * 3600_000).toISOString();
  f.store.patchJob('j', { state: 'RETRY_WAIT', createdAt: old, submittedAt: old, result: { status: 'Ready', result: { sample: 'https://provider.example/original.png' } }, resultMetadata: { servingProvider: 'bfl', requestId: 'diagnostic-request' } });
  let downloads = 0;
  const worker = new GenerationWorker(f.reopen(), f.media, offlineRouter, { keyConfigured: () => false, download: async url => { downloads++; assert.equal(url, 'https://provider.example/original.png'); return { bytes: png, mimeType: 'image/png' }; } });
  await worker.process('j');
  assert.equal(f.store.getJob('j')?.state, 'COMPLETED');
  assert.equal(downloads, 1);
  assert.equal(f.store.getJob('j')?.requestId, 'original-router-request');
  assert.equal(f.store.getJob('j')?.idempotencyKey, f.job.idempotencyKey);
  const asset = f.store.getAsset(f.store.getTake('t')!.assetIds[0]!)!;
  assert.deepEqual(await f.media.read(asset), png);
  assert.equal(asset.metadata.servingProvider, 'bfl');
});

test('SDK httpStatus 410 becomes EXPIRED and cannot dispatch or retry the completed identity', async t => {
  const f = await fixture(t);
  let polls = 0;
  const router: RouterPort = { ...offlineRouter, status: async () => { polls++; throw Object.assign(new Error('Request retention expired'), { httpStatus: 410, errorType: 'request_expired', requestId: 'diagnostic-expiry' }); } };
  const worker = new GenerationWorker(f.store, f.media, router, { keyConfigured: () => true });
  await worker.process('j');
  await worker.tick();
  assert.equal(polls, 1);
  assert.equal(f.store.getJob('j')?.state, 'EXPIRED');
  assert.equal(f.store.getJob('j')?.httpStatus, 410);
  assert.equal(f.store.getJob('j')?.diagnosticRequestId, 'diagnostic-expiry');
  assert.equal(f.store.getTake('t')?.status, 'EXPIRED');
  assert.throws(() => worker.retry('j'), /cannot be retried/);
});

test('a native model failure inside a successful queue result is terminal with no media collection', async t => {
  const f = await fixture(t);
  f.store.upsertTake({ ...f.take, kind: 'video', modelId: 'minimax/minimax-h3', provider: 'minimax' });
  f.store.upsertJob({ ...f.job, modelId: 'minimax/minimax-h3', provider: 'minimax' });
  let polls = 0, results = 0;
  const response = { task: { status: 'failed', error: { message: 'Provider refused source media' } } };
  const router: RouterPort = { ...offlineRouter, status: async () => { polls++; return { status: 'COMPLETED', errorType: null, queuePosition: null, retryAfterMs: null }; }, result: async () => { results++; return { kind: 'json', data: response }; } };
  const worker = new GenerationWorker(f.store, f.media, router, { keyConfigured: () => true, download: unexpected });
  await worker.process('j');
  await worker.tick();
  assert.equal(polls, 1);
  assert.equal(results, 1);
  assert.equal(f.store.getJob('j')?.state, 'FAILED');
  assert.equal(f.store.getJob('j')?.errorType, 'provider_output_error');
  assert.match(f.store.getJob('j')!.errorMessage!, /Provider refused/);
  assert.deepEqual(f.store.getJob('j')?.result, response);
  assert.deepEqual(f.store.listAssets('p'), []);
  assert.throws(() => worker.retry('j'), /terminal failure/);
});

test('Seed Audio inline WAV and real timed caption sidecar persist and reopen as distinct media kinds', async t => {
  const f = await fixture(t);
  const wav = Buffer.alloc(46);
  wav.write('RIFF', 0); wav.writeUInt32LE(38, 4); wav.write('WAVEfmt ', 8);
  wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(24000, 24); wav.writeUInt32LE(48000, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34);
  wav.write('data', 36); wav.writeUInt32LE(2, 40);
  f.store.upsertTake({ ...f.take, kind: 'audio', modelId: 'byteplus/seed-audio-1.0-multilingual', provider: 'byteplus' });
  f.store.upsertJob({ ...f.job, modelId: 'byteplus/seed-audio-1.0-multilingual', provider: 'byteplus', result: { audio: wav.toString('base64'), subtitle: { sentences: [{ start_time: 250, end_time: 1250, text: 'The light is on.' }] } } });
  const worker = new GenerationWorker(f.store, f.media, offlineRouter, { keyConfigured: () => false, download: unexpected });
  await worker.process('j');
  assert.equal(f.store.getJob('j')?.state, 'COMPLETED');
  f.reopen();
  const take = f.store.getTake('t')!;
  assert.equal(take.assetIds.length, 2);
  const [audio, captions] = take.assetIds.map(id => f.store.getAsset(id)!);
  assert.equal(audio!.kind, 'audio'); assert.equal(audio!.mimeType, 'audio/wav');
  assert.equal(captions!.kind, 'document'); assert.equal(captions!.mimeType, 'text/vtt');
  assert.deepEqual(await f.media.read(audio!), wav);
  assert.match((await f.media.read(captions!)).toString(), /00:00:00.250 --> 00:00:01.250\nThe light is on\./);
  assert.equal(audio!.metadata.requestId, f.job.requestId);
  assert.equal(captions!.metadata.outputIndex, 1);
  assert.equal(f.store.getProject('p')?.selectedTakeId, 't');
});

test('media download refuses private and disguised loopback URLs before opening a connection', async () => {
  for (const url of [
    'https://127.0.0.1/file', 'https://10.0.0.1/file', 'https://192.168.1.2/file',
    'https://169.254.169.254/latest/meta-data', 'https://[::1]/file',
    'https://[::ffff:127.0.0.1]/file', 'https://2130706433/file', 'https://0x7f000001/file',
  ]) await assert.rejects(downloadMedia(url), /Private network/);
  for (const url of ['http://192.0.2.1/file', 'https://user:password@192.0.2.1/file', 'https://192.0.2.1:8443/file']) {
    await assert.rejects(downloadMedia(url), /public HTTPS/);
  }
  assert.equal(isPrivateAddress('172.31.0.1'), true);
  assert.equal(isPrivateAddress('100.64.0.1'), true);
  assert.equal(isPrivateAddress('fd00::1'), true);
  assert.equal(isPrivateAddress('8.8.8.8'), false);
});
