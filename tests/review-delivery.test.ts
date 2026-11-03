import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import express from 'express';
import sharp from 'sharp';
import AdmZip from 'adm-zip';
import { Store } from '../server/store.ts';
import { LocalFileStorage } from '../server/media.ts';
import { ReviewService, reviewHash, type ReviewActor } from '../server/review-service.ts';
import { createReviewRouter, createSharedReviewRouter } from '../server/review-routes.ts';
import { createDeliveryPackage } from '../server/delivery-package.ts';
import { setAccess, type AccessContext } from '../server/auth-access.ts';
import { FilmMediaTools, mediaToolPaths, runMediaTool } from '../server/film-media.ts';
import type { Asset } from '../shared/types.ts';

const now = '2026-11-03T10:00:00.000Z';
const owner: ReviewActor = { kind: 'owner', id: 'owner', label: 'Project owner' };
const fails = (status: number) => (error: unknown) => (error as { status?: number }).status === status;
async function fixture() {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'ots-review-test-'));
  let store = new Store(directory);
  const media = new LocalFileStorage(directory), projectId = randomUUID(), otherProject = randomUUID();
  for (const id of [projectId, otherProject]) store.upsertProject({ id, name: id === projectId ? 'Test film' : 'Private other project', description: '', createdAt: now, updatedAt: now });
  const bytes = await sharp({ create: { width: 80, height: 40, channels: 4, background: '#c792fa' } }).png().toBuffer();
  const assets: Asset[] = [];
  for (const [index, project] of [projectId, projectId, otherProject].entries()) {
    const asset = await media.put({ projectId: project, name: 'Image ' + index + '.png', mimeType: 'image/png', bytes, provenance: 'local-edit', metadata: { privateNote: 'not shared' } });
    store.upsertAsset(asset); assets.push(asset);
  }
  let clock = new Date(now);
  const service = () => new ReviewService(store, 'owner', () => clock);
  const board = service().create(projectId, { title: 'Client review', assetIds: [assets[0].id] });
  const invite = (role: 'viewer' | 'commenter' | 'approver' = 'commenter', version = 1) => service().invite(projectId, board.id, { revision: service().board(board.id).revision, role, version, label: role + ' link', expiresAt: new Date(clock.getTime() + 86_400_000).toISOString() });
  const input = () => ({ revision: service().board(board.id).revision, version: 1, assetId: assets[0].id, assetSha256: assets[0].sha256, text: 'A useful comment' });
  return { directory, media, projectId, otherProject, assets, bytes, board, service, invite, input, get store() { return store; }, setClock: (value: Date) => { clock = value; }, reopen: () => { store.close(); store = new Store(directory); }, cleanup: async () => { store.close(); await rm(directory, { recursive: true, force: true }); } };
}
test('review invitations persist only a hash, survive restart, and expose selected versions without private asset metadata', async () => {
  const f = await fixture();
  try {
    const invitation = f.invite();
    assert.ok(invitation.relativeUrl.includes('#invite='));
    const records = JSON.stringify(f.store.listScopedRecords('review-invitation'));
    assert.ok(records.includes(reviewHash(invitation.token)));
    assert.ok(!records.includes(invitation.token));
    const publicText = JSON.stringify(f.service().view(f.board.id, invitation.token));
    assert.ok(!publicText.includes('privateNote'));
    assert.ok(!publicText.includes(f.assets[1].id));
    assert.ok(!publicText.includes(f.assets[0].fileName));
    f.reopen();
    assert.equal(f.service().view(f.board.id, invitation.token).version.assets[0].assetId, f.assets[0].id);
    assert.equal(f.store.listJobs().length, 0);
  } finally { await f.cleanup(); }
});
test('viewer/commenter/approver permissions apply to comments, decisions and thread resolution', async () => {
  const f = await fixture();
  try {
    const viewer = f.invite('viewer'), commenter = f.invite('commenter'), otherCommenter = f.invite('commenter'), approver = f.invite('approver');
    assert.throws(() => f.service().comment(f.board.id, undefined, f.input(), { kind: 'invitation', token: viewer.token }), fails(403));
    let board = f.service().comment(f.board.id, undefined, f.input(), { kind: 'invitation', token: commenter.token });
    assert.equal(board.comments[0].author.label, 'commenter link');
    const root = board.comments[0];
    board = f.service().comment(f.board.id, undefined, { ...f.input(), text: 'Reply', parentId: root.id }, { kind: 'invitation', token: otherCommenter.token });
    assert.equal(board.comments[1].parentId, root.id);
    assert.throws(() => f.service().resolve(f.board.id, undefined, root.id, { revision: board.revision, resolved: true }, { kind: 'invitation', token: otherCommenter.token }), fails(403));
    board = f.service().resolve(f.board.id, undefined, root.id, { revision: board.revision, resolved: true }, { kind: 'invitation', token: approver.token });
    assert.ok(board.comments[0].resolvedAt);
    board = f.service().resolve(f.board.id, f.projectId, root.id, { revision: board.revision, resolved: false }, owner);
    assert.equal(board.comments[0].resolvedAt, undefined);
    const decision = { revision: board.revision, version: 1, assetId: f.assets[0].id, assetSha256: f.assets[0].sha256, decision: 'approved', note: 'Ready' };
    assert.throws(() => f.service().decide(f.board.id, undefined, decision, { kind: 'invitation', token: commenter.token }), fails(403));
    board = f.service().decide(f.board.id, undefined, decision, { kind: 'invitation', token: approver.token });
    assert.equal(board.decisions[0].assetSha256, f.assets[0].sha256);
    assert.equal(f.store.listJobs().length, 0);
  } finally { await f.cleanup(); }
});
test('invitations reject different workspaces, unrelated projects, expiry, closure and revocation', async () => {
  const f = await fixture();
  try {
    const invitation = f.invite();
    assert.throws(() => new ReviewService(f.store, 'different-workspace', () => new Date(now)).view(f.board.id, invitation.token), fails(401));
    assert.throws(() => f.service().board(f.board.id, f.otherProject), fails(404));
    assert.throws(() => f.service().media(f.board.id, invitation.token, f.assets[2].id), fails(404));
    assert.throws(() => f.service().create(f.projectId, { title: 'Bad cross-project selection', assetIds: [f.assets[2].id] }), fails(404));
    f.service().update(f.projectId, f.board.id, { revision: f.service().board(f.board.id).revision, closed: true });
    assert.throws(() => f.service().view(f.board.id, invitation.token), fails(403));
    f.service().update(f.projectId, f.board.id, { revision: f.service().board(f.board.id).revision, closed: false });
    f.setClock(new Date('2026-11-05T10:00:00Z'));
    assert.throws(() => f.service().view(f.board.id, invitation.token), fails(403));
    f.setClock(new Date(now));
    f.service().revoke(f.projectId, f.board.id, invitation.invitation.id, f.service().board(f.board.id).revision);
    assert.throws(() => f.service().media(f.board.id, invitation.token, f.assets[0].id), fails(403));
  } finally { await f.cleanup(); }
});
test('new review versions never expand existing links and decisions require the exact asset fingerprint', async () => {
  const f = await fixture();
  try {
    const old = f.invite('approver');
    let board = f.service().addVersion(f.projectId, f.board.id, { revision: f.service().board(f.board.id).revision, label: 'Version 2', assetIds: [f.assets[1].id] });
    assert.equal(f.service().view(f.board.id, old.token).version.number, 1);
    assert.throws(() => f.service().media(f.board.id, old.token, f.assets[1].id), fails(404));
    const next = f.invite('approver', 2);
    assert.throws(() => f.service().comment(f.board.id, undefined, { ...f.input(), version: 2, assetId: f.assets[1].id }, { kind: 'invitation', token: old.token }), fails(403));
    assert.throws(() => f.service().decide(f.board.id, undefined, { revision: f.service().board(f.board.id).revision, version: 2, assetId: f.assets[1].id, assetSha256: '0'.repeat(64), decision: 'approved' }, { kind: 'invitation', token: next.token }), fails(409));
    board = f.service().decide(f.board.id, undefined, { revision: f.service().board(f.board.id).revision, version: 2, assetId: f.assets[1].id, assetSha256: f.assets[1].sha256, decision: 'changes-requested', note: 'Adjust framing' }, { kind: 'invitation', token: next.token });
    assert.equal(board.decisions[0].version, 2);
    assert.equal(f.service().view(f.board.id, old.token).decisions.length, 0);
  } finally { await f.cleanup(); }
});
test('stale revisions cannot overwrite comments or duplicate a successful edit', async () => {
  const f = await fixture();
  try {
    const invitation = f.invite(), input = f.input();
    const board = f.service().comment(f.board.id, undefined, input, { kind: 'invitation', token: invitation.token });
    assert.equal(board.revision, input.revision + 1);
    assert.throws(() => f.service().comment(f.board.id, undefined, { ...input, text: 'Stale write' }, { kind: 'invitation', token: invitation.token }), fails(409));
    assert.equal(f.service().board(f.board.id).comments.length, 1);
    const next = f.input();
    assert.throws(() => f.service().comment(f.board.id, undefined, { ...next, text: 'x'.repeat(4001) }, owner));
    assert.equal(f.service().board(f.board.id).revision, board.revision);
  } finally { await f.cleanup(); }
});
test('HTTP review uses scoped HttpOnly cookies, exact selected media bytes, range support and CSRF checks', async () => {
  const f = await fixture(), app = express();
  let generateCalls = 0;
  app.use(createSharedReviewRouter(f.store, f.media, { workspaceId: 'owner', secureCookies: false, now: () => new Date(now) }));
  app.post('/api/generate', (_req, res) => { generateCalls++; res.sendStatus(500); });
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  const origin = 'http://127.0.0.1:' + (server.address() as { port: number }).port;
  const base = origin + '/api/shared-review/owner/' + f.board.id;
  try {
    const invitation = f.invite('commenter');
    const page = await fetch(origin + '/review/owner/' + f.board.id);
    assert.equal(page.status, 200); assert.match(page.headers.get('content-security-policy')!, /default-src 'none'/);
    const html = await page.text(); assert.match(html, /history.replaceState/); assert.ok(!html.includes(invitation.token));
    assert.equal((await fetch(base)).status, 401);
    assert.equal((await fetch(base + '/session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: invitation.token }) })).status, 403);
    const session = await fetch(base + '/session', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Review-Request': '1', Origin: origin }, body: JSON.stringify({ token: invitation.token }) });
    assert.equal(session.status, 200);
    const header = session.headers.get('set-cookie')!;
    assert.match(header, /HttpOnly/i); assert.match(header, /SameSite=Lax/i); assert.ok(header.includes('Path=/api/shared-review/owner/' + f.board.id));
    const cookie = header.split(';')[0], headers = { Cookie: cookie };
    assert.equal((await fetch(base, { headers })).status, 200);
    const mediaResponse = await fetch(base + '/assets/' + f.assets[0].id, { headers });
    assert.equal(mediaResponse.status, 200); assert.deepEqual(Buffer.from(await mediaResponse.arrayBuffer()), f.bytes);
    const partial = await fetch(base + '/assets/' + f.assets[0].id, { headers: { ...headers, Range: 'bytes=0-7' } });
    assert.equal(partial.status, 206); assert.deepEqual(Buffer.from(await partial.arrayBuffer()), f.bytes.subarray(0, 8));
    assert.equal((await fetch(base + '/assets/' + f.assets[1].id, { headers })).status, 404);
    assert.equal((await fetch(base + '?token=' + invitation.token)).status, 401);
    const wrongOrigin = await fetch(base + '/comments', { method: 'POST', headers: { ...headers, Origin: 'https://elsewhere.invalid', 'Content-Type': 'application/json', 'X-Review-Request': '1' }, body: JSON.stringify(f.input()) });
    assert.equal(wrongOrigin.status, 403);
    const comment = await fetch(base + '/comments', { method: 'POST', headers: { ...headers, Origin: origin, 'Content-Type': 'application/json', 'X-Review-Request': '1' }, body: JSON.stringify(f.input()) });
    assert.equal(comment.status, 201);
    f.service().revoke(f.projectId, f.board.id, invitation.invitation.id, f.service().board(f.board.id).revision);
    assert.equal((await fetch(base + '/assets/' + f.assets[0].id, { headers })).status, 403);
    assert.equal(generateCalls, 0);
  } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); await f.cleanup(); }
});
test('private route enforces project and share permission rather than trusting route IDs', async () => {
  const f = await fixture(), app = express();
  let access: AccessContext = { kind: 'scoped-token', subjectId: 'test-scope', projectIds: [f.projectId], permissions: ['read', 'write'] };
  app.use(express.json()); app.use((req, _res, next) => { setAccess(req, access); next(); });
  app.use('/api', createReviewRouter(f.store, f.media, { workspaceId: 'owner', now: () => new Date(now) }));
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  const origin = 'http://127.0.0.1:' + (server.address() as { port: number }).port;
  try {
    const body = { title: 'Scope test', assetIds: [f.assets[0].id] }, request = { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
    assert.equal((await fetch(origin + '/api/projects/' + f.projectId + '/reviews', request)).status, 403);
    access = { ...access, permissions: ['read', 'write', 'share'] };
    assert.equal((await fetch(origin + '/api/projects/' + f.projectId + '/reviews', request)).status, 201);
    assert.equal((await fetch(origin + '/api/projects/' + f.otherProject + '/reviews')).status, 403);
  } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); await f.cleanup(); }
});
test('original delivery contains exact bytes, caption and integrity manifest, with restart-safe idempotency', async () => {
  const f = await fixture();
  try {
    const spec = { name: 'Client handoff', assetIds: [f.assets[0].id], caption: 'A saved original', preset: 'original' as const };
    const id = randomUUID(), result = await createDeliveryPackage(f.store, f.media, f.projectId, spec, id);
    const zip = new AdmZip(await f.media.read(result.asset));
    assert.deepEqual(zip.readFile(result.manifest.media[0].deliveredFile), f.bytes);
    assert.equal(zip.readAsText('caption.txt'), spec.caption);
    const manifest = JSON.parse(zip.readAsText('delivery-manifest.json'));
    assert.equal(manifest.media[0].deliveredSha256, reviewHash(f.bytes));
    assert.equal(manifest.publication.state, 'not-published');
    assert.equal(result.deliveryAssets[0].id, f.assets[0].id);
    f.reopen();
    const replay = await createDeliveryPackage(f.store, f.media, f.projectId, spec, id);
    assert.equal(replay.asset.id, result.asset.id);
    assert.equal(replay.take.id, result.take.id);
    await assert.rejects(createDeliveryPackage(f.store, f.media, f.projectId, { ...spec, caption: 'Changed inputs' }, id), fails(409));
    assert.equal(f.store.listJobs().length, 0);
    assert.equal(f.store.listTakes(f.projectId).length, 1);
  } finally { await f.cleanup(); }
});
test('square delivery saves real formatted images while preserving original bytes and package originals', async () => {
  const f = await fixture();
  try {
    const spec = { name: 'Square delivery', assetIds: [f.assets[0].id], caption: '', preset: 'square' as const };
    const id = randomUUID();
    const [result, replay] = await Promise.all([createDeliveryPackage(f.store, f.media, f.projectId, spec, id), createDeliveryPackage(f.store, f.media, f.projectId, spec, id)]);
    assert.equal(result.asset.id, replay.asset.id);
    assert.notEqual(result.deliveryAssets[0].id, f.assets[0].id);
    const info = await sharp(await f.media.read(result.deliveryAssets[0])).metadata();
    assert.equal(info.width, 1080); assert.equal(info.height, 1080);
    assert.deepEqual(await f.media.read(f.assets[0]), f.bytes);
    const zip = new AdmZip(await f.media.read(result.asset));
    const original = zip.getEntries().find(entry => entry.entryName.startsWith('originals/'))!;
    assert.deepEqual(original.getData(), f.bytes);
    assert.equal(f.store.getAsset(result.deliveryAssets[0].id)?.metadata.operation, 'delivery-format');
    assert.equal(f.store.listJobs().length, 0);
  } finally { await f.cleanup(); }
});
test('delivery rejects cross-project media and rechecks source file integrity', async () => {
  const f = await fixture();
  try {
    await assert.rejects(createDeliveryPackage(f.store, f.media, f.projectId, { name: 'Forbidden', assetIds: [f.assets[2].id], caption: '', preset: 'original' }, randomUUID()), fails(404));
    f.store.upsertAsset({ ...f.assets[0], sha256: '0'.repeat(64) });
    await assert.rejects(createDeliveryPackage(f.store, f.media, f.projectId, { name: 'Changed bytes', assetIds: [f.assets[0].id], caption: '', preset: 'original' }, randomUUID()), fails(409));
    assert.equal(f.store.listTakes(f.projectId).length, 0);
  } finally { await f.cleanup(); }
});
test('portrait video delivery produces an actual playable MP4 with the requested dimensions and preserves its source', async () => {
  const f = await fixture();
  try {
    const videoPath = path.join(f.directory, 'synthetic-test.mp4');
    await runMediaTool(mediaToolPaths().ffmpeg, ['-nostdin', '-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=purple:s=160x90:r=10:d=0.3', '-an', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', videoPath], 1024 * 1024, 30_000);
    const original = await readFile(videoPath), asset = await f.media.put({ projectId: f.projectId, name: 'Local clip.mp4', mimeType: 'video/mp4', bytes: original, provenance: 'local-edit' });
    f.store.upsertAsset(asset);
    const result = await createDeliveryPackage(f.store, f.media, f.projectId, { name: 'Portrait clip', assetIds: [asset.id], caption: 'Local processing test', preset: 'portrait' }, randomUUID());
    const info = await new FilmMediaTools(f.directory, f.media).inspect(result.deliveryAssets[0]);
    assert.equal(info.width, 1080); assert.equal(info.height, 1920);
    assert.ok(info.duration > 0);
    assert.deepEqual(await f.media.read(asset), original);
    assert.equal(f.store.listJobs().length, 0);
  } finally { await f.cleanup(); }
});

test('failed delivery removes unpublished transformed files and leaves original project media intact', async () => {
  const f = await fixture();
  try {
    const { readdir } = await import('node:fs/promises');
    const before = (await readdir(f.media.root)).sort();
    f.store.upsertAsset({ ...f.assets[1], sha256: '0'.repeat(64) });
    await assert.rejects(createDeliveryPackage(f.store, f.media, f.projectId, { name: 'Incomplete handoff', assetIds: [f.assets[0].id, f.assets[1].id], caption: '', preset: 'square' }, randomUUID()), fails(409));
    assert.deepEqual((await readdir(f.media.root)).sort(), before);
    assert.deepEqual(await f.media.read(f.assets[0]), f.bytes);
    assert.equal(f.store.listTakes(f.projectId).length, 0);
  } finally { await f.cleanup(); }
});

test('hosted review invitations are capped to workspace lifetime and expire with it', async () => {
  const f = await fixture();
  try {
    let time = new Date(now);
    const ends = new Date(time.getTime() + 6 * 3600000).toISOString();
    const service = new ReviewService(f.store, 'owner', () => time, ends);
    const result = service.invite(f.projectId, f.board.id, { revision: service.board(f.board.id).revision, label: 'Limited workspace', role: 'commenter', version: 1, expiresAt: new Date(time.getTime() + 7 * 86400000).toISOString() });
    assert.equal(result.invitation.expiresAt, ends);
    assert.equal(service.view(f.board.id, result.token).invitation.expiresAt, ends);
    time = new Date(Date.parse(ends) + 1);
    assert.throws(() => service.view(f.board.id, result.token), fails(403));
  } finally { await f.cleanup(); }
});

test('delivery shutdown seals admission and drains in-flight writes before the store closes', { timeout: 10_000 }, async () => {
  const f = await fixture();
  try {
    const { drainDeliveryWork } = await import('../server/delivery-package.ts');
    let entered!: () => void, release!: () => void;
    const reading = new Promise<void>(resolve => { entered = resolve; });
    const released = new Promise<void>(resolve => { release = resolve; });
    const read = f.media.read.bind(f.media);
    f.media.read = async asset => { entered(); await released; return read(asset); };
    const spec = { name: 'Graceful delivery', assetIds: [f.assets[0].id], caption: 'Finish safely', preset: 'original' as const };
    const pending = createDeliveryPackage(f.store, f.media, f.projectId, spec, randomUUID());
    await reading;
    let finished = false;
    const draining = drainDeliveryWork(f.store).then(() => { finished = true; });
    await new Promise<void>(resolve => setImmediate(resolve));
    assert.equal(finished, false, 'Drain must wait while the source read is still active');
    await assert.rejects(createDeliveryPackage(f.store, f.media, f.projectId, spec, randomUUID()), fails(503));
    release();
    const result = await pending;
    await draining;
    assert.equal(finished, true);
    assert.ok(f.store.getAsset(result.asset.id));
    assert.equal(new AdmZip(await read(result.asset)).readAsText('caption.txt'), 'Finish safely');
    await assert.rejects(createDeliveryPackage(f.store, f.media, f.projectId, spec, randomUUID()), fails(503));
    await drainDeliveryWork(f.store);
    f.reopen();
    assert.ok(f.store.getAsset(result.asset.id), 'Completed package survives the following database reopen');
  } finally { await f.cleanup(); }
});
