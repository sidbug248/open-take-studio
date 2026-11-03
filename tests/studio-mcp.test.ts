import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createServer, type Server } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomBytes, randomUUID } from 'node:crypto';
import { createStudioRuntime } from '../server/studio-runtime.ts';
import { createStudioPublicRouter } from '../server/studio-public.ts';
import { createReviewerSystem } from '../server/reviewer-system.ts';
import { ReviewerCredentials } from '../server/reviewer-credentials.ts';
import { AuthSessions } from '../server/auth-session.ts';
import { readRuntimeConfig } from '../server/runtime-config.ts';
import { securityBoundary } from '../server/runtime-security.ts';
import sharp from 'sharp';
import AdmZip from 'adm-zip';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { StudioMcpTokenCreated, StudioMcpTokenList } from '../shared/studio-mcp-types.ts';
import { createStore } from '../server/store.ts';
import { LocalFileStorage } from '../server/media.ts';
import { setAccess } from '../server/auth-access.ts';
import { setRequestOrigin } from '../server/request-origin.ts';
import { StudioMcpService, matchStudioMcpPath } from '../server/studio-mcp.ts';
import { saveProductionGraph } from '../server/production-graph.ts';

const textResult = (value: unknown) => {
  const content = (value as { content: { type: string; text?: string }[] }).content;
  return JSON.parse(content.find(item => item.type === 'text')!.text!);
};
async function stop(server: Server) {
  await new Promise<void>(resolve => { server.close(() => resolve()); server.closeAllConnections(); });
}
async function fixture(workspaceLifetimeMs?: number) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'ots-mcp-test-'));
  let store = createStore(dir), clock = Date.now();
  const workspaceExpiresAt = workspaceLifetimeMs === undefined ? undefined : new Date(clock + workspaceLifetimeMs).toISOString();
  const media = new LocalFileStorage(dir), workspaceId = 'mcp-test-workspace';
  let service = new StudioMcpService(store, media, { workspaceId, workspaceExpiresAt, now: () => clock });
  const time = new Date(clock).toISOString();
  const project = { id: randomUUID(), name: 'MCP selected project', description: 'Public creative brief', createdAt: time, updatedAt: time };
  const otherProject = { ...project, id: randomUUID(), name: 'PRIVATE OTHER PROJECT' };
  store.upsertProject(project); store.upsertProject(otherProject);
  const bytes = await sharp({ create: { width: 40, height: 30, channels: 4, background: '#b38ce8' } }).png().toBuffer();
  const asset = await media.put({ projectId: project.id, name: 'Saved original.png', mimeType: 'image/png', bytes, provenance: 'imported' });
  const otherAsset = await media.put({ projectId: otherProject.id, name: 'PRIVATE OTHER ASSET.png', mimeType: 'image/png', bytes, provenance: 'imported' });
  store.upsertAsset(asset); store.upsertAsset(otherAsset);
  store.upsertRecipe({ id: randomUUID(), projectId: project.id, name: 'Saved creative recipe', modelId: 'fixture', prompt: 'Purple glass', settings: { resolution: '1K', apiKey: 'SHOULD_NOT_LEAK', nested: { Authorization: 'Bearer NEVER_RETURN', image: 'https://example.test/media?token=PRIVATE_QUERY' } }, inputAssetIds: { image: asset.id }, createdAt: time });
  const app = express();
  app.use((req, _res, next) => { setRequestOrigin(req, { origin: req.header('x-test-public-origin') || req.protocol + '://' + req.get('host'), proxied: false, clientIp: '127.0.0.1', ipSource: 'render-hop' }); next(); });
  app.all('/api/mcp/:workspaceId/:tokenId', async (req, res) => { await service.handleTransport(req, res); });
  app.use(express.json({ limit: '128kb' }));
  app.use((req, _res, next) => {
    const role = req.header('x-test-role');
    if (role !== 'anonymous') setAccess(req, { kind: role === 'scoped-token' ? 'scoped-token' : role === 'reviewer' ? 'reviewer' : 'local-owner', workspaceId, subjectId: 'test-owner', projectIds: [project.id], permissions: ['read', 'write', 'generate', 'share'] });
    next();
  });
  app.use('/api', (req, res, next) => service.managementRouter()(req, res, next));
  app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => { res.status((error as { status?: number }).status ?? 500).json({ error: error instanceof Error ? error.message : 'Error' }); });
  const server = createServer(app);
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = 'http://127.0.0.1:' + (server.address() as { port: number }).port;
  const management = base + '/api/projects/' + project.id + '/mcp-tokens';
  const clients: Client[] = [];
  async function issue(write = false, expiresInHours = 24, role = 'local-owner'): Promise<StudioMcpTokenCreated> {
    const response = await fetch(management, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-test-role': role }, body: JSON.stringify({ name: 'Test assistant', permissions: write ? ['read', 'local-write'] : ['read'], expiresInHours }) });
    assert.equal(response.status, 201, await response.clone().text());
    return response.json() as Promise<StudioMcpTokenCreated>;
  }
  async function connect(issued: StudioMcpTokenCreated, endpoint = issued.token.endpoint, bearer = issued.bearerToken) {
    const client = new Client({ name: 'studio-mcp-test-client', version: '1.0.0' }, { capabilities: {} });
    clients.push(client);
    const transport = new StreamableHTTPClientTransport(new URL(endpoint), { requestInit: { headers: { Authorization: 'Bearer ' + bearer } } });
    await client.connect(transport);
    return client;
  }
  return { dir, media, project, otherProject, asset, otherAsset, base, management, issue, connect, workspaceExpiresAt,
    get store() { return store; }, get service() { return service; },
    advance(ms: number) { clock += ms; },
    restart() { store.close(); store = createStore(dir); service = new StudioMcpService(store, media, { workspaceId, workspaceExpiresAt, now: () => clock }); },
    async close() { for (const client of clients) await client.close().catch(() => undefined); await stop(server); store.close(); await rm(dir, { recursive: true, force: true }); }
  };
}

test('real MCP SDK initialize/list/call is project scoped, redacts credential fields and reads saved bytes', async () => {
  const f = await fixture();
  try {
    const issued = await f.issue(), client = await f.connect(issued);
    assert.equal(client.getServerVersion()?.name, 'open-take-studio');
    const tools = (await client.listTools()).tools;
    assert.ok(tools.some(tool => tool.name === 'get_project'));
    assert.ok(tools.some(tool => tool.name === 'read_asset'));
    assert.ok(!tools.some(tool => /generate|publish|fetch|resize|delivery/.test(tool.name)));
    assert.ok(tools.every(tool => tool.annotations?.readOnlyHint === true));
    const project = textResult(await client.callTool({ name: 'get_project', arguments: {} }));
    assert.equal(project.project.id, f.project.id);
    assert.equal(JSON.stringify(project).includes('PRIVATE OTHER'), false);
    const assets = textResult(await client.callTool({ name: 'list_assets', arguments: { limit: 1 } }));
    assert.equal(assets.assets.length, 1);
    assert.equal(assets.assets[0].id, f.asset.id);
    const recipes = JSON.stringify(await client.callTool({ name: 'list_recipes', arguments: {} }));
    assert.doesNotMatch(recipes, /SHOULD_NOT_LEAK|NEVER_RETURN|PRIVATE_QUERY/);
    const binary = await client.callTool({ name: 'read_asset', arguments: { assetId: f.asset.id } });
    const resource = (binary.content as { type: string; resource?: { blob?: string; mimeType?: string } }[])[0].resource!;
    assert.equal(resource.mimeType, 'image/png');
    assert.deepEqual(Buffer.from(resource.blob!, 'base64'), await f.media.read(f.asset));
    const foreign = await client.callTool({ name: 'get_asset', arguments: { assetId: f.otherAsset.id } });
    assert.equal(foreign.isError, true); assert.doesNotMatch(JSON.stringify(foreign), /PRIVATE OTHER/);
    const traversal = await client.callTool({ name: 'get_asset', arguments: { assetId: '../../.env' } });
    assert.equal(traversal.isError, true);
    const extraProject = await client.callTool({ name: 'get_project', arguments: { projectId: f.otherProject.id } });
    assert.equal(extraProject.isError, true);
    assert.equal(f.store.listJobs().length, 0);
  } finally { await f.close(); }
});

test('raw token is returned only at issue, survives restart hashed, and invalid/workspace-swapped bearer fails', async () => {
  const f = await fixture();
  try {
    const issued = await f.issue();
    const stored = f.store.getScopedRecord<{ tokenHash: string }>('studio-mcp-token', issued.token.id)!;
    assert.match(stored.data.tokenHash, /^[a-f0-9]{64}$/);
    assert.equal(JSON.stringify(stored).includes(issued.bearerToken), false);
    const listed = await (await fetch(f.management)).json() as StudioMcpTokenList;
    assert.equal(listed.tokens[0].endpoint, issued.token.endpoint);
    assert.equal(JSON.stringify(listed).includes('tokenHash'), false);
    assert.equal(JSON.stringify(listed).includes(issued.bearerToken), false);
    const vercel = await (await fetch(f.management, { headers: { 'x-test-public-origin': 'https://open-take-studio-review.vercel.app' } })).json() as StudioMcpTokenList;
    assert.ok(vercel.tokens[0].endpoint.startsWith('https://open-take-studio-review.vercel.app/api/mcp/'));
    assert.equal(new URL(vercel.tokens[0].endpoint).pathname, new URL(issued.token.endpoint).pathname);
    f.restart();
    const client = await f.connect(issued);
    assert.equal(textResult(await client.callTool({ name: 'get_project', arguments: {} })).project.id, f.project.id);
    await assert.rejects(f.connect(issued, issued.token.endpoint, 'otsmcp_' + 'A'.repeat(43)), /401|valid active|Unauthorized/);
    await assert.rejects(f.connect(issued, issued.token.endpoint.replace('mcp-test-workspace', 'other-workspace')), /401|valid active|Unauthorized/);
    const other = await f.issue();
    await assert.rejects(f.connect(issued, other.token.endpoint), /401|valid active|Unauthorized/);
  } finally { await f.close(); }
});

test('reviewer tokens expire with their workspace and expired workspaces cannot issue connections', async () => {
  const f = await fixture(30 * 60 * 1000);
  try {
    const issued = await f.issue(false, 24, 'reviewer');
    assert.equal(issued.token.expiresAt, f.workspaceExpiresAt);
    const stored = f.store.getScopedRecord<{ expiresAt: string }>('studio-mcp-token', issued.token.id)!;
    assert.equal(stored.data.expiresAt, f.workspaceExpiresAt);
    f.restart();
    const client = await f.connect(issued);
    assert.equal(textResult(await client.callTool({ name: 'get_project', arguments: {} })).project.id, f.project.id);
    f.advance(30 * 60 * 1000 + 1);
    await assert.rejects(client.listTools(), /401|valid active|Unauthorized/);
    const listed = await (await fetch(f.management)).json() as StudioMcpTokenList;
    assert.equal(listed.tokens[0].status, 'expired');
    const denied = await fetch(f.management, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-test-role': 'reviewer' }, body: JSON.stringify({ name: 'Too late', permissions: ['read'] }) });
    assert.equal(denied.status, 410);
    assert.match(await denied.text(), /workspace has expired/i);
    assert.equal(f.store.listScopedRecords('studio-mcp-token', f.project.id).length, 1);
  } finally { await f.close(); }
  const expired = await fixture(-1);
  try {
    const denied = await fetch(expired.management, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-test-role': 'reviewer' }, body: JSON.stringify({ name: 'Already expired', permissions: ['read'] }) });
    assert.equal(denied.status, 410);
    assert.match(await denied.text(), /workspace has expired/i);
    assert.equal(expired.store.listScopedRecords('studio-mcp-token', expired.project.id).length, 0);
  } finally { await expired.close(); }
});

test('revocation and expiry apply on every transport request, including an already connected SDK client', async () => {
  const f = await fixture();
  try {
    const issued = await f.issue(), client = await f.connect(issued);
    const revoked = await fetch(f.management + '/' + issued.token.id, { method: 'DELETE' });
    assert.equal(revoked.status, 200);
    await assert.rejects(client.listTools(), /401|valid active|Unauthorized/);
    const second = await f.issue(false, 1), secondClient = await f.connect(second);
    f.advance(60 * 60 * 1000 + 1);
    await assert.rejects(secondClient.callTool({ name: 'get_project', arguments: {} }), /401|valid active|Unauthorized/);
  } finally { await f.close(); }
});

test('local-write MCP tools create idempotent derivatives and a real delivery archive without model jobs', async () => {
  const f = await fixture();
  try {
    const issued = await f.issue(true), client = await f.connect(issued);
    const tools = (await client.listTools()).tools;
    const resize = tools.find(tool => tool.name === 'resize_image')!;
    assert.equal(resize.annotations?.readOnlyHint, false);
    assert.equal(resize.annotations?.idempotentHint, true);
    assert.equal(resize.annotations?.openWorldHint, false);
    const args = { assetId: f.asset.id, width: 64, height: 48, clientRequestId: 'resize-fixture-01' };
    const output = textResult(await client.callTool({ name: 'resize_image', arguments: args }));
    assert.equal(output.asset.provenance, 'local-edit');
    const created = f.store.getAsset(output.asset.id)!;
    const metadata = await sharp(await f.media.read(created)).metadata();
    assert.equal(metadata.width, 64); assert.equal(metadata.height, 48);
    assert.notEqual(created.id, f.asset.id);
    const replay = textResult(await client.callTool({ name: 'resize_image', arguments: args }));
    assert.equal(replay.asset.id, created.id); assert.equal(replay.reused, true);
    assert.equal((await client.callTool({ name: 'resize_image', arguments: { ...args, width: 128 } })).isError, true);
    assert.equal((await client.callTool({ name: 'resize_image', arguments: { ...args, assetId: f.otherAsset.id, clientRequestId: 'resize-foreign-01' } })).isError, true);
    const deliveryArgs = { assetIds: [created.id], name: 'Client handoff', caption: 'Ready for review', preset: 'original', clientRequestId: 'delivery-fixture-01' };
    const delivery = textResult(await client.callTool({ name: 'build_delivery_package', arguments: deliveryArgs }));
    const zip = new AdmZip(await f.media.read(f.store.getAsset(delivery.asset.id)!));
    assert.equal(zip.readAsText('caption.txt'), 'Ready for review');
    assert.equal(JSON.parse(zip.readAsText('delivery-manifest.json')).publication.state, 'not-published');
    const duplicate = textResult(await client.callTool({ name: 'build_delivery_package', arguments: deliveryArgs }));
    assert.equal(duplicate.asset.id, delivery.asset.id);
    assert.equal(f.store.listJobs().length, 0);
    assert.deepEqual(await f.media.read(f.asset), await f.media.read(f.otherAsset));
    const readonly = await f.connect(await f.issue());
    assert.equal((await readonly.callTool({ name: 'resize_image', arguments: args })).isError, true);
  } finally { await f.close(); }
});

test('MCP inspects and runs only same-project local production graphs', async () => {
  const f = await fixture();
  try {
    const graph = { version: 1, kind: 'production-graph', name: 'Assistant local graph', nodes: [
      { id: 'source', kind: 'asset', label: 'Original', x: 0, y: 0, assetId: f.asset.id },
      { id: 'resize', kind: 'resize', label: 'Resize', x: 260, y: 0, width: 80, height: 80, fit: 'contain', background: '#111114' }
    ], edges: [{ id: 'edge-1', from: 'source', fromPort: 'output', to: 'resize', toPort: 'image' }] };
    const saved = await saveProductionGraph(f.store, f.media, f.project.id, graph);
    const client = await f.connect(await f.issue(true));
    const inspected = textResult(await client.callTool({ name: 'inspect_graph', arguments: { assetId: saved.asset.id } }));
    assert.equal(inspected.localOnly, true);
    const run = textResult(await client.callTool({ name: 'run_local_graph', arguments: { assetId: saved.asset.id, clientRequestId: 'graph-fixture-001' } }));
    assert.equal(run.run.state, 'complete');
    assert.ok(run.assets.some((asset: { id: string }) => asset.id !== f.asset.id));
    const replay = textResult(await client.callTool({ name: 'run_local_graph', arguments: { assetId: saved.asset.id, clientRequestId: 'graph-fixture-001' } }));
    assert.equal(replay.run.id, run.run.id);
    assert.equal(f.store.listJobs().length, 0);
    const generationRecipe = { id: randomUUID(), projectId: f.project.id, name: 'Requires Comfy', modelId: 'bfl/flux-3-image', prompt: 'An original glass sculpture', settings: { resolution: '1k' }, inputAssetIds: {}, createdAt: new Date().toISOString() };
    f.store.upsertRecipe(generationRecipe);
    const generationGraph = await saveProductionGraph(f.store, f.media, f.project.id, { version: 1, kind: 'production-graph', name: 'Generation intentionally excluded', nodes: [{ id: 'generate', kind: 'recipe', label: 'Generate', x: 0, y: 0, recipeId: generationRecipe.id }], edges: [] });
    const denied = await client.callTool({ name: 'run_local_graph', arguments: { assetId: generationGraph.asset.id, clientRequestId: 'graph-no-generating' } });
    assert.equal(denied.isError, true);
    assert.match(JSON.stringify(denied), /without recipe or generation nodes/);
    assert.equal(f.store.listJobs().length, 0);
    const foreign = await saveProductionGraph(f.store, f.media, f.otherProject.id, { ...graph, nodes: [{ ...graph.nodes[0], assetId: f.otherAsset.id }], edges: [] });
    assert.equal((await client.callTool({ name: 'run_local_graph', arguments: { assetId: foreign.asset.id, clientRequestId: 'graph-foreign-001' } })).isError, true);
  } finally { await f.close(); }
});

test('token management requires project sharing rights and never lets scoped tokens mint credentials', async () => {
  const f = await fixture();
  try {
    const input = { name: 'Forbidden', permissions: ['read'], expiresInHours: 24 };
    for (const [role, status] of [['anonymous', 401], ['scoped-token', 403]] as const) {
      const response = await fetch(f.management, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-test-role': role }, body: JSON.stringify(input) });
      assert.equal(response.status, status);
    }
    const reviewer = await f.issue(false, 8, 'reviewer');
    assert.equal(reviewer.token.projectId, f.project.id);
    const wrongProject = await fetch(f.base + '/api/projects/' + f.otherProject.id + '/mcp-tokens/' + reviewer.token.id, { method: 'DELETE' });
    assert.equal(wrongProject.status, 404);
    const invalid = await fetch(f.management, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...input, permissions: ['generate'], expiresInHours: 25 }) });
    assert.equal(invalid.status, 400);
  } finally { await f.close(); }
});

test('exact MCP endpoint denies browser origin mismatch, query-token authentication and oversized requests', async () => {
  const f = await fixture();
  try {
    const issued = await f.issue();
    assert.equal(matchStudioMcpPath('/api/mcp/a/b/extra'), undefined);
    assert.equal(matchStudioMcpPath('/api/mcp/../../.env'), undefined);
    assert.deepEqual(matchStudioMcpPath('/api/mcp/workspace/token'), { workspaceId: 'workspace', tokenId: 'token' });
    const headers = { Authorization: 'Bearer ' + issued.bearerToken, 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' };
    const origin = await fetch(issued.token.endpoint, { method: 'POST', headers: { ...headers, Origin: 'https://attacker.invalid' }, body: '{}' });
    assert.equal(origin.status, 403);
    const query = await fetch(issued.token.endpoint + '?token=' + issued.bearerToken, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    assert.equal(query.status, 401);
    const oversized = await fetch(issued.token.endpoint, { method: 'POST', headers, body: JSON.stringify({ jsonrpc: '2.0', method: 'tools/call', id: 1, params: { value: 'x'.repeat(129 * 1024) } }) });
    assert.equal(oversized.status, 413);
    const get = await fetch(issued.token.endpoint, { headers });
    assert.equal(get.status, 405);
  } finally { await f.close(); }
});

test('global hosted MCP route supports Render and Vercel without browser cookies and rejects scope/origin fallback', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'ots-mcp-hosted-'));
  const renderOrigin = 'https://studio.onrender.com', vercelOrigin = 'https://submitted.vercel.app', proof = 'q'.repeat(43);
  const settings = { ...readRuntimeConfig({}, dir), mode: 'hosted' as const, dataDir: dir, publicOrigin: renderOrigin, vercelProxyOrigin: vercelOrigin, vercelProxySecret: proof, trustProxyHops: 1, ownerPasswordHash: 'fixture-only-owner', minFreeDiskBytes: 0 };
  const credentials = { available: () => false, resolve: () => { throw new Error('No generation credentials may be accessed.'); } };
  const owner = createStudioRuntime({ dataDir: path.join(dir, 'owner'), settings, credentials, workspaceId: 'owner', startWorkers: false });
  let vaultNow = Date.now();
  const vault = new ReviewerCredentials(path.join(dir, 'private'), randomBytes(32).toString('base64url'), { now: () => vaultNow, probe: async () => { throw new Error('No provider probe is permitted.'); } });
  const session = vault.createSession();
  const reviewers = createReviewerSystem({ vault, owner, settings, runtimeFactory: options => createStudioRuntime({ ...options, credentials, startWorkers: false }) });
  const reviewer = reviewers.getRuntime(session.id), projectId = randomUUID(), time = new Date().toISOString();
  reviewer.store.upsertProject({ id: projectId, name: 'Isolated reviewer MCP project', description: '', createdAt: time, updatedAt: time });
  const privateProjectId = randomUUID();
  owner.store.upsertProject({ id: privateProjectId, name: 'Private owner data', description: '', createdAt: time, updatedAt: time });
  const app = express(), sessions = new AuthSessions(owner.store, settings);
  app.set('trust proxy', 1);
  app.use((req, _res, next) => { req.headers.host = 'studio.onrender.com'; next(); });
  app.use(securityBoundary(settings));
  app.use(sessions.identify());
  app.use(createStudioPublicRouter({ owner, reviewerRuntime: id => reviewers.getRuntime(id) }));
  app.use(reviewers.identify); app.use(reviewers.router); app.use(reviewers.dispatch); app.use(sessions.gate()); app.use(owner.router);
  const server = createServer(app);
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = 'http://127.0.0.1:' + (server.address() as { port: number }).port;
  const direct = { 'X-Forwarded-Proto': 'https' }, proxy = { ...direct, 'X-OTS-Proxy-Secret': proof, 'X-Vercel-Forwarded-For': '203.0.113.8' };
  const clients: Client[] = [];
  try {
    const managementPath = '/api/projects/' + projectId + '/mcp-tokens';
    const issuedResponse = await fetch(base + managementPath, { method: 'POST', headers: { ...proxy, Origin: vercelOrigin, Cookie: '__Host-ots_reviewer=' + session.token, 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Hosted assistant', permissions: ['read'] }) });
    assert.equal(issuedResponse.status, 201, await issuedResponse.clone().text());
    const issued = await issuedResponse.json() as StudioMcpTokenCreated;
    assert.ok(issued.token.endpoint.startsWith(vercelOrigin + '/api/mcp/' + session.id + '/'));
    const endpointPath = new URL(issued.token.endpoint).pathname, authorization = 'Bearer ' + issued.bearerToken;
    for (const [network, origin] of [[direct, renderOrigin], [proxy, vercelOrigin]] as const) {
      const client = new Client({ name: 'hosted-reviewer-test', version: '1.0.0' }, { capabilities: {} });
      clients.push(client);
      await client.connect(new StreamableHTTPClientTransport(new URL(base + endpointPath), { requestInit: { headers: { ...network, Authorization: authorization } } }));
      assert.ok((await client.listTools()).tools.some(tool => tool.name === 'get_project'));
      const project = textResult(await client.callTool({ name: 'get_project', arguments: {} }));
      assert.equal(project.project.id, projectId);
      assert.doesNotMatch(JSON.stringify(project), /Private owner data/);
      const wrongOrigin = await fetch(base + endpointPath, { method: 'POST', headers: { ...network, Authorization: authorization, Origin: origin === vercelOrigin ? renderOrigin : vercelOrigin, 'Content-Type': 'application/json' }, body: '{}' });
      assert.equal(wrongOrigin.status, 403);
      const invalidToken = await fetch(base + endpointPath, { method: 'POST', headers: { ...network, Authorization: 'Bearer otsmcp_' + 'A'.repeat(43), 'Content-Type': 'application/json' }, body: '{}' });
      assert.equal(invalidToken.status, 401);
    }
    const requestHeaders = { ...direct, Authorization: authorization, 'Content-Type': 'application/json' };
    assert.equal((await fetch(base + endpointPath.replace(session.id, 'owner'), { method: 'POST', headers: requestHeaders, body: '{}' })).status, 401);
    assert.equal((await fetch(base + endpointPath.replace(session.id, randomUUID()), { method: 'POST', headers: requestHeaders, body: '{}' })).status, 404);
    assert.equal((await fetch(base + endpointPath + '/extra', { method: 'POST', headers: requestHeaders, body: '{}' })).status, 403);
    assert.equal((await fetch(base + managementPath, { method: 'POST', headers: requestHeaders, body: '{}' })).status, 403, 'Bearer does not exempt other routes from Origin checking');
    assert.equal((await fetch(base + '/api/projects/' + privateProjectId, { headers: direct })).status, 401);
    assert.equal(vault.listSessions().length, 1, 'MCP never allocates an anonymous workspace');
    assert.equal(owner.store.listJobs().length + reviewer.store.listJobs().length, 0);
    vaultNow += 8 * 86400000;
    assert.equal((await fetch(base + endpointPath, { method: 'POST', headers: requestHeaders, body: '{}' })).status, 404);
  } finally {
    for (const client of clients) await client.close().catch(() => undefined);
    await stop(server); await reviewers.close(); await owner.close(); vault.close(); await rm(dir, { recursive: true, force: true });
  }
});

test('MCP shutdown waits for admitted local work and refuses new writes', async () => {
  const f = await fixture();
  let started!: () => void, release!: () => void;
  const operationStarted = new Promise<void>(resolve => { started = resolve; });
  const heldRead = new Promise<void>(resolve => { release = resolve; });
  const read = f.media.read.bind(f.media);
  f.media.read = async asset => { started(); await heldRead; return read(asset); };
  let pending: Promise<unknown> | undefined;
  try {
    const client = await f.connect(await f.issue(true));
    const args = { assetId: f.asset.id, width: 96, height: 64, clientRequestId: 'shutdown-resize-001' };
    pending = client.callTool({ name: 'resize_image', arguments: args });
    await operationStarted;
    let drained = false;
    const draining = f.service.drain().then(() => { drained = true; });
    const denied = await client.callTool({ name: 'resize_image', arguments: { ...args, clientRequestId: 'shutdown-rejected-002' } });
    assert.equal(denied.isError, true);
    assert.match(JSON.stringify(denied), /Studio is stopping/);
    assert.equal(drained, false, 'Drain must wait while admitted media work is in flight');
    release();
    const saved = textResult(await pending);
    await draining;
    assert.equal(drained, true);
    const asset = f.store.getAsset(saved.asset.id)!;
    assert.ok(asset);
    const metadata = await sharp(await read(asset)).metadata();
    assert.equal(metadata.width, 96); assert.equal(metadata.height, 64);
    const stillDenied = await client.callTool({ name: 'resize_image', arguments: { ...args, clientRequestId: 'shutdown-rejected-003' } });
    assert.equal(stillDenied.isError, true);
    assert.match(JSON.stringify(stillDenied), /Studio is stopping/);
    await f.service.drain();
    assert.equal(f.store.listAssets(f.project.id).length, 2);
    assert.equal(f.store.listJobs().length, 0);
  } finally {
    release(); await pending?.catch(() => undefined); await f.close();
  }
});
