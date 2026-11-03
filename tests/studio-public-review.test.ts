import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { randomBytes, randomUUID } from 'node:crypto';
import { once } from 'node:events';
import express from 'express';
import type { StudioRuntime } from '../server/studio-runtime.ts';
import { createStudioRuntime } from '../server/studio-runtime.ts';
import { createStudioPublicRouter } from '../server/studio-public.ts';
import { createReviewerSystem } from '../server/reviewer-system.ts';
import { ReviewerCredentials } from '../server/reviewer-credentials.ts';
import { AuthSessions } from '../server/auth-session.ts';
import { readRuntimeConfig } from '../server/runtime-config.ts';
import { securityBoundary } from '../server/runtime-security.ts';
import { ReviewService } from '../server/review-service.ts';

const renderOrigin = 'https://studio.onrender.com', vercelOrigin = 'https://submitted.vercel.app', proxySecret = 'q'.repeat(43);
const unavailable = { available: () => false, resolve: () => { throw new Error('Generation is forbidden in this test.'); } };
async function seed(runtime: StudioRuntime, workspaceId: string, label: string) {
  const projectId = randomUUID(), now = new Date().toISOString();
  runtime.store.upsertProject({ id: projectId, name: label, description: '', createdAt: now, updatedAt: now });
  const bytes = Buffer.from(label), asset = await runtime.media.put({ projectId, name: label + '.txt', mimeType: 'text/plain', bytes, provenance: 'local-edit', metadata: { ownerPrivate: label } });
  runtime.store.upsertAsset(asset);
  const service = new ReviewService(runtime.store, workspaceId), board = service.create(projectId, { title: label + ' review', assetIds: [asset.id] });
  const invitation = service.invite(projectId, board.id, { revision: board.revision, version: 1, label: 'Client', role: 'approver', expiresAt: new Date(Date.now() + 86_400_000).toISOString() });
  return { projectId, board, invitation, asset, bytes };
}

test('full hosted runtime shares exact reviewer workspace on Render and Vercel without owner fallback', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'ots-shared-integration-'));
  const settings = { ...readRuntimeConfig({}, directory), mode: 'hosted' as const, dataDir: directory, publicOrigin: renderOrigin, vercelProxyOrigin: vercelOrigin, vercelProxySecret: proxySecret, trustProxyHops: 1, ownerPasswordHash: 'fixture-owner-hash', minFreeDiskBytes: 0 };
  const owner = createStudioRuntime({ dataDir: path.join(directory, 'owner'), settings, credentials: unavailable, workspaceId: 'owner', startWorkers: false });
  let vaultNow = Date.now();
  const vault = new ReviewerCredentials(path.join(directory, 'private'), randomBytes(32).toString('base64url'), { now: () => vaultNow, probe: async () => { throw new Error('No credential probe permitted.'); } });
  const session = vault.createSession();
  const reviewers = createReviewerSystem({ vault, owner, settings, runtimeFactory: options => createStudioRuntime({ ...options, credentials: unavailable, startWorkers: false }) });
  const reviewer = reviewers.getRuntime(session.id), ownerData = await seed(owner, 'owner', 'Owner private original'), reviewerData = await seed(reviewer, session.id, 'Reviewer selected file');
  const app = express(), auth = new AuthSessions(owner.store, settings);
  app.set('trust proxy', 1);
  app.use((req, _res, next) => { req.headers.host = 'studio.onrender.com'; next(); });
  app.use(securityBoundary(settings));
  app.use(auth.identify());
  app.use(createStudioPublicRouter({ owner, reviewerRuntime: id => reviewers.getRuntime(id) }));
  app.use(reviewers.identify); app.use(reviewers.router); app.use(reviewers.dispatch); app.use(auth.gate());
  app.use(owner.router);
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  const local = 'http://127.0.0.1:' + (server.address() as { port: number }).port;
  const direct = { 'X-Forwarded-Proto': 'https' };
  const proxy = { ...direct, 'X-OTS-Proxy-Secret': proxySecret, 'X-Vercel-Forwarded-For': '203.0.113.8' };
  try {
    const base = '/api/shared-review/' + session.id + '/' + reviewerData.board.id;
    const page = await fetch(local + '/review/' + session.id + '/' + reviewerData.board.id, { headers: proxy });
    assert.equal(page.status, 200);
    const html = await page.text(), csp = page.headers.get('Content-Security-Policy')!;
    const nonce = /script-src 'nonce-([^']+)'/.exec(csp)![1];
    assert.ok(html.includes('script nonce="' + nonce + '"'));
    assert.ok(html.includes('style nonce="' + nonce + '"'));
    assert.equal(page.headers.get('Referrer-Policy'), 'no-referrer');
    assert.equal(page.headers.get('Vercel-CDN-Cache-Control'), 'no-store');
    for (const [network, origin] of [[direct, renderOrigin], [proxy, vercelOrigin]] as const) {
      const connected = await fetch(local + base + '/session', { method: 'POST', headers: { ...network, Origin: origin, 'Content-Type': 'application/json', 'X-Review-Request': '1' }, body: JSON.stringify({ token: reviewerData.invitation.token }) });
      assert.equal(connected.status, 200);
      const setCookie = connected.headers.get('set-cookie')!;
      assert.match(setCookie, /Secure/); assert.match(setCookie, /HttpOnly/);
      assert.ok(setCookie.includes('Path=' + base));
      const cookie = setCookie.split(';')[0];
      const view = await fetch(local + base, { headers: { ...network, Cookie: cookie } });
      assert.equal(view.status, 200);
      assert.equal((await view.json()).title, 'Reviewer selected file review');
      const media = await fetch(local + base + '/assets/' + reviewerData.asset.id, { headers: { ...network, Cookie: cookie } });
      assert.deepEqual(Buffer.from(await media.arrayBuffer()), reviewerData.bytes);
      assert.equal((await fetch(local + base + '/assets/' + ownerData.asset.id, { headers: { ...network, Cookie: cookie } })).status, 404);
      const foreign = await fetch(local + base + '/comments', { method: 'POST', headers: { ...network, Origin: origin === vercelOrigin ? renderOrigin : vercelOrigin, 'Content-Type': 'application/json', 'X-Review-Request': '1', Cookie: cookie }, body: '{}' });
      assert.equal(foreign.status, 403);
    }
    const unknown = randomUUID();
    const wrongWorkspace = await fetch(local + '/api/shared-review/' + unknown + '/' + ownerData.board.id + '/session', { method: 'POST', headers: { ...direct, Origin: renderOrigin, 'Content-Type': 'application/json', 'X-Review-Request': '1' }, body: JSON.stringify({ token: ownerData.invitation.token }) });
    assert.equal(wrongWorkspace.status, 404);
    assert.equal((await fetch(local + '/api/projects/' + ownerData.projectId, { headers: direct })).status, 401);
    assert.equal(owner.store.listJobs().length, 0); assert.equal(reviewer.store.listJobs().length, 0);
    const reviewerHeaders = { ...direct, Origin: renderOrigin, 'Content-Type': 'application/json', Cookie: '__Host-ots_reviewer=' + session.token };
    const capabilityResponse = await fetch(local + '/api/projects/' + reviewerData.projectId + '/reviews/capabilities', { headers: reviewerHeaders });
    assert.equal(capabilityResponse.status, 200);
    assert.equal((await capabilityResponse.json()).workspaceExpiresAt, session.expiresAt);
    const cappedResponse = await fetch(local + '/api/projects/' + reviewerData.projectId + '/reviews/' + reviewerData.board.id + '/invitations', { method: 'POST', headers: reviewerHeaders, body: JSON.stringify({ revision: new ReviewService(reviewer.store, session.id).board(reviewerData.board.id).revision, version: 1, label: 'Long request', role: 'viewer', expiresAt: new Date(Date.now() + 29 * 86400000).toISOString() }) });
    assert.equal(cappedResponse.status, 201);
    assert.equal((await cappedResponse.json()).invitation.expiresAt, session.expiresAt);
    vaultNow += 8 * 86_400_000;
    assert.equal((await fetch(local + base, { headers: direct })).status, 404, 'Expired reviewer workspace never falls through to owner');
  } finally {
    server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve()));
    await reviewers.close(); await owner.close(); vault.close(); await rm(directory, { recursive: true, force: true });
  }
});

test('Vercel native rewrite includes public invitation pages, session APIs and shared media', async () => {
  const config = JSON.parse(await readFile(new URL('../reviewer/vercel.json', import.meta.url), 'utf8')) as { routes: { src: string; dest?: string; methods?: string[]; headers?: Record<string, string> }[] };
  for (const [path, method] of [['/review/owner/board-id', 'GET'], ['/api/shared-review/owner/board-id/session', 'POST'], ['/api/shared-review/owner/board-id/assets/asset-id', 'GET']]) {
    const route = config.routes.find(value => (!value.methods || value.methods.includes(method)) && new RegExp(value.src, 'i').test(path));
    assert.ok(route?.dest);
    assert.equal(path.replace(new RegExp(route.src, 'i'), route.dest), 'https://open-take-studio.onrender.com' + path);
    assert.equal(route.headers?.['x-vercel-enable-rewrite-caching'], '0');
  }
});