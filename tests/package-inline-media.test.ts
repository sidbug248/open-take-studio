import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import AdmZip from 'adm-zip';
import { createStore } from '../server/store.ts';
import { LocalFileStorage } from '../server/media.ts';
import { exportProject, importProject } from '../server/project-routes.ts';
import { packInlineMedia, unpackInlineMedia } from '../server/package-inline-media.ts';
import type { Job, Project, Take } from '../shared/types.ts';

test('large repeated Router media inputs export once and restore exactly with archived jobs and redacted signed URLs', async () => {
  const base = path.resolve('data/test-fixtures'); await mkdir(base, { recursive: true });
  const dir = await mkdtemp(path.join(base, 'inline-history-')), store = createStore(dir), media = new LocalFileStorage(dir);
  try {
    const now = new Date().toISOString();
    const project: Project = { id: randomUUID(), name: 'Large input history', description: '', createdAt: now, updatedAt: now }; store.upsertProject(project);
    const binary = Buffer.alloc(1536 * 1024); for (let i = 0; i < binary.length; i++) binary[i] = i % 251;
    const encoded = binary.toString('base64'), uri = `data:image/png;base64,${encoded}`;
    const take: Take = { id: randomUUID(), projectId: project.id, name: 'Recorded generation', kind: 'image', inputAssetIds: {}, assetIds: [], modelId: 'bfl/flux-3-image', provider: 'bfl', prompt: 'A studio image', settings: {}, status: 'COMPLETED', provenance: 'generated', favorite: false, createdAt: now, updatedAt: now, jobId: randomUUID(), changes: [] };
    const job: Job = { id: take.jobId!, projectId: project.id, takeId: take.id, modelId: take.modelId, provider: take.provider, requestId: 'recorded-router-request', idempotencyKey: randomUUID(), inputs: { images: Array(18).fill(uri), nested: { base64: encoded }, url: 'https://media.example.test/input.png?X-Goog-Signature=secret-token&Expires=999' }, state: 'COMPLETED', attempts: 1, createdAt: now, updatedAt: now };
    store.saveTakeAndJob(take, job);
    assert.ok(Buffer.byteLength(JSON.stringify(job.inputs)) > 32 * 1024 * 1024);
    const bytes = await exportProject(store, media, project.id), zip = new AdmZip(bytes), packed = JSON.parse(zip.readAsText('manifest.json'));
    assert.equal(packed.version, 2); assert.equal(packed.inlineMedia.entries.length, 19);
    assert.equal(zip.getEntries().filter(e => e.entryName.startsWith('inputs/')).length, 2);
    assert.ok(Buffer.byteLength(zip.readAsText('manifest.json')) < 32000);
    assert.ok(!zip.getEntries().some(entry => entry.getData().includes(Buffer.from('secret-token'))));
    const imported = await importProject(store, media, bytes), detail = store.projectDetail(imported.id)!;
    assert.equal(detail.jobs.length, 1); assert.ok(store.isArchivedJob(detail.jobs[0].id));
    assert.equal(detail.jobs[0].requestId, job.requestId);
    assert.deepEqual(detail.jobs[0].inputs.images, job.inputs.images);
    assert.deepEqual(detail.jobs[0].inputs.nested, job.inputs.nested);
    assert.deepEqual(Buffer.from((detail.jobs[0].inputs.nested as {base64:string}).base64, 'base64'), binary);
    assert.equal(detail.jobs[0].inputs.url, 'https://media.example.test/input.png');
    assert.equal(store.getJob(job.id)!.inputs.url, job.inputs.url, 'Original server request remains unchanged');
    const reopened = createStore(dir); assert.deepEqual(reopened.projectDetail(imported.id)!.jobs[0].inputs.images, job.inputs.images); reopened.close();
    for (const corruption of ['missing', 'hash', 'traversal', 'unused'] as const) {
      const bad = new AdmZip(bytes), blob = bad.getEntries().find(e => e.entryName.startsWith('inputs/'))!;
      if (corruption === 'missing') bad.deleteFile(blob.entryName);
      if (corruption === 'hash') { const wrong = blob.getData(); wrong[wrong.length - 1] ^= 1; bad.updateFile(blob.entryName, wrong); }
      if (corruption === 'traversal') { const changed = JSON.parse(bad.readAsText('manifest.json')); changed.inlineMedia.entries[0].sha256 = '../outside'; bad.updateFile('manifest.json', Buffer.from(JSON.stringify(changed))); }
      if (corruption === 'unused') bad.addFile(`inputs/${'a'.repeat(64)}.txt`, Buffer.from('unused'));
      const count = store.listProjects().length;
      await assert.rejects(importProject(store, media, bad.toBuffer()), /Missing inline|integrity|Invalid inline|unreferenced/);
      assert.equal(store.listProjects().length, count, 'Corrupt archive must not create records');
    }
  } finally { store.close(); await rm(dir, { recursive: true, force: true }); }
});

test('version1 remains unchanged; inline paths and repeated expansion are bounded', () => {
  const original = { format: 'open-take-studio', version: 1, jobs: [{ inputs: { prompt: 'A small ordinary prompt' } }] };
  const packed = packInlineMedia(original); assert.deepEqual(packed.manifest, original); assert.equal(packed.blobs.size, 0);
  assert.deepEqual(unpackInlineMedia(structuredClone(original), new AdmZip()).manifest, original);
  const large = Buffer.alloc(1024 * 1024, 10).toString('base64');
  assert.throws(() => packInlineMedia({ version: 1, inputs: { image: `data:image/\uD800;base64,${large}` } }), /not valid Unicode/);
  assert.throws(() => packInlineMedia({ version: 1, inputs: { ['x'.repeat(1001)]: large } }), /path key exceeds/);
  const good = packInlineMedia({ version: 1, jobs: [{ inputs: { images: [large] } }] });
  const zip = new AdmZip(); for (const [sha, data] of good.blobs) zip.addFile(`inputs/${sha}.txt`, data);
  const badPath = structuredClone(good.manifest) as any; badPath.inlineMedia.entries[0].path = ['__proto__', 'polluted'];
  assert.throws(() => unpackInlineMedia(badPath, zip), /path does not exist/);
  assert.equal(({} as any).polluted, undefined);
  const expanded = structuredClone(good.manifest) as any;
  expanded.jobs[0].inputs.images = Array(240).fill(null);
  expanded.inlineMedia.entries = Array.from({ length: 240 }, (_, index) => ({ ...expanded.inlineMedia.entries[0], path: ['jobs', '0', 'inputs', 'images', String(index)] }));
  assert.throws(() => unpackInlineMedia(expanded, zip), /Expanded input history exceeds/);
});
