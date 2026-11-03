import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { Router, type ErrorRequestHandler, type Request, type Response } from 'express';
import sharp from 'sharp';
import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { Asset, Take } from '../shared/types.ts';
import type { StudioMcpPermission, StudioMcpToken, StudioMcpTokenCreated, StudioMcpTokenView } from '../shared/studio-mcp-types.ts';
import type { Store } from './store.ts';
import type { LocalFileStorage } from './media.ts';
import { accessFor, requireProjectAccess } from './auth-access.ts';
import { requestOrigin } from './request-origin.ts';
import { createDeliveryPackage } from './delivery-package.ts';
import { runProductionGraph, validateProductionGraph } from './production-graph.ts';

const KIND = 'studio-mcp-token';
const ID = /^[A-Za-z0-9_-]{1,128}$/;
const id = z.string().regex(ID);
const requestId = z.string().regex(/^[A-Za-z0-9_-]{8,100}$/);
const MAX_BODY = 128 * 1024;
const MAX_INLINE_ASSET = 512 * 1024;
const MAX_SOURCE = 32 * 1024 * 1024;
const MAX_EXPIRY_HOURS = 24;
const READ = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } as const;
const WRITE = { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false } as const;
const digest = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
const issueSchema = z.object({
  name: z.string().trim().min(1).max(80),
  permissions: z.array(z.enum(['read', 'local-write'])).min(1).max(2),
  expiresInHours: z.number().int().min(1).max(MAX_EXPIRY_HOURS).default(MAX_EXPIRY_HOURS),
}).strict();
type StoredToken = StudioMcpToken & { tokenHash: string };
class StudioMcpError extends Error {
  constructor(message: string, readonly status = 400) { super(message); }
}
export interface StudioMcpOptions { workspaceId: string; workspaceExpiresAt?: string; now?: () => number; }
export function matchStudioMcpPath(pathname: string): { workspaceId: string; tokenId: string } | undefined {
  const match = /^\/api\/mcp\/([A-Za-z0-9_-]{1,128})\/([A-Za-z0-9_-]{1,128})$/.exec(pathname.split('?')[0]);
  return match ? { workspaceId: match[1], tokenId: match[2] } : undefined;
}

/** Only creative data crosses the MCP boundary. Credential stores and raw job inputs never do. */
function safeValue(value: unknown, depth = 0): unknown {
  if (depth > 10) return '[Nested content omitted]';
  if (typeof value === 'string') {
    if (/^data:/i.test(value)) return '[Embedded media omitted; use read_asset]';
    return value.slice(0, 20000)
      .replace(/\b(?:otsmcp_[A-Za-z0-9_-]+|sk-[A-Za-z0-9_-]{16,})\b/g, '[Credential omitted]')
      .replace(/https?:\/\/[^\s<>"']+/g, raw => { try { const url = new URL(raw); url.search = ''; url.hash = ''; url.username = ''; url.password = ''; return url.href; } catch { return '[URL omitted]'; } });
  }
  if (Array.isArray(value)) return value.slice(0, 200).map(v => safeValue(v, depth + 1));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).slice(0, 200)
    .filter(([key]) => !/secret|credential|token|password|api.?key|authorization|headers|cookie|environment/i.test(key))
    .map(([key, v]) => [key, safeValue(v, depth + 1)]));
  return value;
}
function assetView(asset: Asset) {
  return { id: asset.id, projectId: asset.projectId, name: asset.name, kind: asset.kind, mimeType: asset.mimeType, size: asset.size, sha256: asset.sha256, provenance: asset.provenance, createdAt: asset.createdAt, metadata: safeValue(asset.metadata), studioPath: asset.url };
}
function result(value: unknown): CallToolResult {
  const text = JSON.stringify(safeValue(value), null, 2);
  if (Buffer.byteLength(text) > 768 * 1024) throw new StudioMcpError('This result is too large. Request a smaller page or a single item.');
  return { content: [{ type: 'text', text }] };
}
function toolFailure(error: unknown): CallToolResult {
  const message = error instanceof StudioMcpError ? error.message : error instanceof z.ZodError ? 'The tool arguments did not match the supported fields.' : 'The local operation could not complete. Open the project in Studio to inspect the selected media.';
  return { isError: true, content: [{ type: 'text', text: message }] };
}

/** One immutable workspace, one scoped token on every request, no generation client. */
export class StudioMcpService {
  readonly workspaceId: string;
  private readonly now: () => number;
  private readonly workspaceExpiresAt?: number;
  private readonly buckets = new Map<string, { count: number; until: number }>();
  private activeRequests = 0;
  private stopping = false;
  private localWrite?: { tokenId: string; work: Promise<unknown> };
  constructor(readonly store: Store, readonly media: LocalFileStorage, options: StudioMcpOptions) {
    if (!ID.test(options.workspaceId)) throw new Error('MCP requires an explicit valid workspace identity.');
    this.workspaceId = options.workspaceId;
    this.now = options.now ?? Date.now;
    if (options.workspaceExpiresAt !== undefined) {
      const expiry = Date.parse(options.workspaceExpiresAt);
      if (!Number.isFinite(expiry)) throw new Error('MCP requires a valid workspace expiry.');
      this.workspaceExpiresAt = expiry;
    }
  }
  private tokenExpiry(token: StoredToken): number {
    return Math.min(Date.parse(token.expiresAt), this.workspaceExpiresAt ?? Infinity);
  }
  private readToken(tokenId: string): StoredToken | undefined {
    const record = this.store.getScopedRecord<StoredToken>(KIND, tokenId);
    if (!record || record.data.projectId !== record.projectId || record.data.workspaceId !== this.workspaceId) return;
    return record.data;
  }
  private publicToken(token: StoredToken, origin: string): StudioMcpTokenView {
    const { tokenHash: _tokenHash, ...publicFields } = token;
    const expiry = this.tokenExpiry(token);
    return { ...publicFields, expiresAt: new Date(expiry).toISOString(), endpoint: origin + '/api/mcp/' + this.workspaceId + '/' + token.id,
      status: token.revokedAt ? 'revoked' : expiry <= this.now() ? 'expired' : 'active' };
  }
  private origin(req: Request): string {
    const trusted = requestOrigin(req)?.origin;
    if (trusted) return new URL(trusted).origin;
    const value = new URL(req.protocol + '://' + req.get('host'));
    if (!['localhost', '127.0.0.1', '[::1]'].includes(value.hostname)) throw new StudioMcpError('The server could not establish its public origin.', 503);
    return value.origin;
  }
  private manage(req: Request, projectId: string) {
    if (accessFor(req)?.kind === 'scoped-token') throw new StudioMcpError('A scoped credential cannot create or revoke other credentials.', 403);
    requireProjectAccess(this.store, req, projectId, 'share');
  }
  managementRouter(): Router {
    const router = Router();
    router.get('/projects/:id/mcp-tokens', (req, res) => {
      const projectId = id.parse(String(req.params.id)); this.manage(req, projectId);
      const origin = this.origin(req);
      res.setHeader('Cache-Control', 'no-store');
      res.json({ workspaceId: this.workspaceId, projectId, maxExpiryHours: MAX_EXPIRY_HOURS,
        tokens: this.store.listScopedRecords<StoredToken>(KIND, projectId).map(record => this.publicToken(record.data, origin)).sort((a, b) => b.createdAt.localeCompare(a.createdAt)) });
    });
    router.post('/projects/:id/mcp-tokens', (req, res) => {
      const projectId = id.parse(String(req.params.id)); this.manage(req, projectId);
      const body = issueSchema.parse(req.body), origin = this.origin(req);
      if (!body.permissions.includes('read')) throw new StudioMcpError('Every connection needs read access.');
      const existing = this.store.listScopedRecords<StoredToken>(KIND, projectId);
      if (existing.filter(record => !record.data.revokedAt && this.tokenExpiry(record.data) > this.now()).length >= 12) throw new StudioMcpError('This project already has twelve active connections. Revoke one first.', 409);
      if (existing.length >= 200) throw new StudioMcpError('This project has reached its connection history limit.', 409);
      const time = this.now(), expiry = Math.min(time + body.expiresInHours * 3600000, this.workspaceExpiresAt ?? Infinity);
      if (expiry <= time) throw new StudioMcpError('This reviewer workspace has expired. Open a new Studio workspace before creating a connection.', 410);
      const bearerToken = 'otsmcp_' + randomBytes(32).toString('base64url');
      const token: StoredToken = { id: randomUUID(), projectId, workspaceId: this.workspaceId, name: body.name,
        permissions: [...new Set(body.permissions)] as StudioMcpPermission[], createdAt: new Date(time).toISOString(), expiresAt: new Date(expiry).toISOString(), tokenHash: digest(bearerToken) };
      this.store.upsertScopedRecord({ id: token.id, projectId, kind: KIND, data: token, createdAt: token.createdAt, updatedAt: token.createdAt });
      res.setHeader('Cache-Control', 'no-store');
      res.status(201).json({ token: this.publicToken(token, origin), bearerToken } satisfies StudioMcpTokenCreated);
    });
    router.delete('/projects/:id/mcp-tokens/:tokenId', (req, res) => {
      const projectId = id.parse(String(req.params.id)); this.manage(req, projectId);
      const token = this.readToken(id.parse(String(req.params.tokenId)));
      if (!token || token.projectId !== projectId) throw new StudioMcpError('Connection not found.', 404);
      token.revokedAt ??= new Date(this.now()).toISOString();
      this.store.upsertScopedRecord({ id: token.id, projectId, kind: KIND, data: token, createdAt: token.createdAt, updatedAt: token.revokedAt });
      res.setHeader('Cache-Control', 'no-store'); res.json({ token: this.publicToken(token, this.origin(req)) });
    });
    router.use(((error, _req, res, next) => {
      if (error instanceof StudioMcpError || error instanceof z.ZodError) { res.status(error instanceof StudioMcpError ? error.status : 400).json({ error: error instanceof StudioMcpError ? error.message : 'Check the connection name, permissions and expiry.' }); return; }
      next(error);
    }) as ErrorRequestHandler);
    return router;
  }
  private authenticate(req: Request): StoredToken | undefined {
    const target = matchStudioMcpPath(req.originalUrl || req.url);
    const authorization = req.headers.authorization;
    if (!target || target.workspaceId !== this.workspaceId || typeof authorization !== 'string' || !/^Bearer otsmcp_[A-Za-z0-9_-]{43}$/.test(authorization)) return;
    const token = this.readToken(target.tokenId);
    if (!token || token.revokedAt || this.tokenExpiry(token) <= this.now() || !token.permissions.includes('read') || !this.store.getProject(token.projectId)) return;
    const expected = Buffer.from(token.tokenHash, 'hex'), actual = Buffer.from(digest(authorization.slice(7)), 'hex');
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return;
    return token;
  }
  private assertActive(token: StoredToken, write = false) {
    const current = this.readToken(token.id);
    if (!current || current.revokedAt || this.tokenExpiry(current) <= this.now() || current.projectId !== token.projectId || !this.store.getProject(token.projectId)) throw new StudioMcpError('This connection is no longer active.', 401);
    if (write && !current.permissions.includes('local-write')) throw new StudioMcpError('This connection has read access only.', 403);
  }
  private asset(token: StoredToken, assetId: string) {
    const asset = this.store.getAsset(assetId);
    if (!asset || asset.projectId !== token.projectId) throw new StudioMcpError('Asset not found in this project.', 404);
    return asset;
  }
  /** Stop admitting local work before waiting, so the runtime can safely close its store. */
  async drain(): Promise<void> {
    this.stopping = true;
    await this.localWrite?.work.catch(() => undefined);
  }
  private async write<T>(token: StoredToken, action: () => Promise<T>): Promise<T> {
    if (this.stopping) throw new StudioMcpError('Studio is stopping. Retry this operation after it restarts.', 503);
    this.assertActive(token, true);
    if (this.localWrite) throw new StudioMcpError('A local MCP operation is already running in this workspace. Retry the same request ID after it completes.', 409);
    const work = action(); this.localWrite = { tokenId: token.id, work };
    try { return await work; } finally { if (this.localWrite?.work === work) this.localWrite = undefined; }
  }
  private createServer(token: StoredToken): McpServer {
    const server = new McpServer({ name: 'open-take-studio', version: '1.0.0' }, { maxToolInputElements: 2000, instructions: 'This connection can access only its selected Open Take Studio project. Read saved creative work and, if granted, make local derivatives. No tool invokes a generative model, spends Comfy credits, accesses arbitrary files or publishes externally. Reuse clientRequestId when retrying a local operation.' });
    const guarded = async (fn: () => unknown | Promise<unknown>) => { try { this.assertActive(token); return result(await fn()); } catch (error) { return toolFailure(error); } };
    server.registerTool('get_project', { title: 'Read project', description: 'Read the connected project and saved take summaries. No other workspace or project can be selected.', inputSchema: z.object({}).strict(), annotations: READ }, async () => guarded(() => {
      const project = this.store.getProject(token.projectId)!;
      return { project, assets: this.store.listAssets(project.id).length, recipes: this.store.listRecipes(project.id).length,
        takes: this.store.listTakes(project.id).slice(-100).map(take => ({ id: take.id, name: take.name, kind: take.kind, status: take.status, modelId: take.modelId, provider: take.provider, assetIds: take.assetIds, parentTakeId: take.parentTakeId })),
        permission: token.permissions, generationAvailable: false };
    }));
    server.registerTool('list_assets', { title: 'List saved media', description: 'Page through saved project assets without generating new media.', inputSchema: z.object({ kind: z.enum(['image', 'video', 'audio', '3d', 'document']).optional(), offset: z.number().int().min(0).max(100000).default(0), limit: z.number().int().min(1).max(50).default(25) }).strict(), annotations: READ },
      async ({ kind, offset, limit }) => guarded(() => { const assets = this.store.listAssets(token.projectId).filter(asset => !kind || asset.kind === kind); return { total: assets.length, nextOffset: offset + limit < assets.length ? offset + limit : null, assets: assets.slice(offset, offset + limit).map(assetView) }; }));
    server.registerTool('get_asset', { title: 'Inspect saved media', description: 'Read metadata for one asset in the connected project. Studio paths require the Studio browser session.', inputSchema: z.object({ assetId: id }).strict(), annotations: READ },
      async ({ assetId }) => guarded(() => assetView(this.asset(token, assetId))));
    server.registerTool('read_asset', { title: 'Read a small media file', description: 'Read exact saved bytes of an asset up to 512 KiB, with an integrity check. Larger originals remain downloadable in Studio.', inputSchema: z.object({ assetId: id }).strict(), annotations: READ },
      async ({ assetId }) => { try {
        this.assertActive(token); const asset = this.asset(token, assetId);
        if (asset.size > MAX_INLINE_ASSET) throw new StudioMcpError('This file is larger than the 512 KiB MCP inline limit. Use its saved asset in local tools or download it in Studio.');
        const bytes = await this.media.read(asset);
        if (bytes.length !== asset.size || bytes.length > MAX_INLINE_ASSET || digest(bytes) !== asset.sha256) throw new StudioMcpError('Saved media failed its integrity check.', 409);
        return { content: [{ type: 'resource', resource: { uri: 'opentake://project/' + token.projectId + '/assets/' + asset.id, mimeType: asset.mimeType, blob: bytes.toString('base64') } }] };
      } catch (error) { return toolFailure(error); } });
    server.registerTool('list_recipes', { title: 'Read saved recipes', description: 'Read creative inputs and settings of saved recipes. This does not execute a recipe or return provider credentials.', inputSchema: z.object({ offset: z.number().int().min(0).max(10000).default(0), limit: z.number().int().min(1).max(20).default(10) }).strict(), annotations: READ },
      async ({ offset, limit }) => guarded(() => { const recipes = this.store.listRecipes(token.projectId); return { total: recipes.length, nextOffset: offset + limit < recipes.length ? offset + limit : null, recipes: recipes.slice(offset, offset + limit) }; }));
    server.registerTool('inspect_graph', { title: 'Inspect production graph', description: 'Validate and inspect a saved production graph in this project. Recipe nodes are reported, never executed.', inputSchema: z.object({ assetId: id }).strict(), annotations: READ },
      async ({ assetId }) => guarded(() => { const asset = this.asset(token, assetId); if (asset.metadata.operation !== 'production-graph-document') throw new StudioMcpError('This asset is not a saved production graph.'); const document = validateProductionGraph(this.store, token.projectId, asset.metadata.productionGraphDocument); return { assetId, document, localOnly: document.nodes.every(node => node.kind !== 'recipe') }; }));
    if (token.permissions.includes('local-write')) {
      server.registerTool('resize_image', { title: 'Resize a saved image', description: 'Create a new PNG derivative, preserving the original. This is local image processing with no model call. Same request ID and inputs reuse the result.', inputSchema: z.object({ assetId: id, width: z.number().int().min(16).max(4096), height: z.number().int().min(16).max(4096), fit: z.enum(['contain', 'cover']).default('contain'), clientRequestId: requestId }).strict(), annotations: WRITE },
        async (input) => guarded(() => this.write(token, () => this.resize(token, input))));
      server.registerTool('build_delivery_package', { title: 'Build a delivery download', description: 'Package selected saved media and a caption, optionally fitting images/video into a social format. Creates a saved ZIP. Never posts to an external account.', inputSchema: z.object({ assetIds: z.array(id).min(1).max(12), name: z.string().trim().min(1).max(120), caption: z.string().max(4000).default(''), preset: z.enum(['original', 'square', 'portrait', 'landscape']).default('original'), clientRequestId: requestId }).strict(), annotations: WRITE },
        async ({ clientRequestId, ...spec }) => guarded(() => this.write(token, async () => {
          for (const assetId of spec.assetIds) this.asset(token, assetId);
          const delivery = await createDeliveryPackage(this.store, this.media, token.projectId, spec, 'mcp-' + digest(token.id + ':' + clientRequestId).slice(0,60));
          return { asset: assetView(delivery.asset), takeId: delivery.take.id, manifest: delivery.manifest, publication: 'not-published' };
        })));
      server.registerTool('run_local_graph', { title: 'Run a saved local graph', description: 'Run a saved graph containing only assets, resize, storyboard and delivery nodes. Graphs containing any recipe/generation node are rejected. Repeated request IDs resume the existing local run.', inputSchema: z.object({ assetId: id, clientRequestId: requestId }).strict(), annotations: WRITE },
        async ({ assetId, clientRequestId }) => guarded(() => this.write(token, async () => {
          const asset = this.asset(token, assetId);
          if (asset.metadata.operation !== 'production-graph-document') throw new StudioMcpError('This asset is not a saved production graph.');
          const graph = validateProductionGraph(this.store, token.projectId, asset.metadata.productionGraphDocument);
          if (graph.nodes.some(node => node.kind === 'recipe')) throw new StudioMcpError('MCP can only run graphs without recipe or generation nodes. Use Studio for an explicit Generate action.');
          const run = await runProductionGraph(this.store, this.media, asset.id, 'mcp-' + digest(token.id + ':' + clientRequestId).slice(0,60));
          return { run, assets: [...new Set(run.nodes.flatMap(node => node.assetIds))].map(id => assetView(this.asset(token, id))) };
        })));
    }
    return server;
  }
  private async resize(token: StoredToken, input: { assetId: string; width: number; height: number; fit: 'contain' | 'cover'; clientRequestId: string }) {
    const asset = this.asset(token, input.assetId);
    if (asset.kind !== 'image' || asset.size > MAX_SOURCE) throw new StudioMcpError('Choose a saved image no larger than 32 MiB.');
    const key = 'mcp-resize:' + token.projectId + ':' + token.id + ':' + input.clientRequestId;
    const fingerprint = digest(JSON.stringify({ assetId: asset.id, sha256: asset.sha256, width: input.width, height: input.height, fit: input.fit }));
    const receipt = this.store.getOperationReceipt<{ assetId: string; takeId: string }>(key);
    if (receipt) {
      if (receipt.fingerprint !== fingerprint) throw new StudioMcpError('This request ID already belongs to different resize inputs.', 409);
      return { asset: assetView(this.asset(token, receipt.result.assetId)), takeId: receipt.result.takeId, reused: true };
    }
    const source = await this.media.read(asset);
    if (source.length !== asset.size || source.length > MAX_SOURCE || digest(source) !== asset.sha256) throw new StudioMcpError('Saved source media failed its integrity check.', 409);
    const image = sharp(source, { limitInputPixels: 32_000_000, sequentialRead: true });
    if (((await image.metadata()).pages ?? 1) > 1) throw new StudioMcpError('Animated images must remain animated. Use a still image for this tool.');
    const bytes = await image.rotate().resize(input.width, input.height, { fit: input.fit, background: '#111114' }).png().toBuffer();
    this.assertActive(token, true);
    const output = await this.media.put({ projectId: token.projectId, name: asset.name + ' · ' + input.width + '×' + input.height + '.png', kind: 'image', mimeType: 'image/png', bytes, provenance: 'local-edit',
      metadata: { operation: 'mcp-resize', sourceAssetId: asset.id, inputAssetIds: { source: asset.id }, width: input.width, height: input.height, fit: input.fit } });
    const now = new Date(this.now()).toISOString();
    const take: Take = { id: randomUUID(), projectId: token.projectId, name: output.name, kind: 'image', inputAssetIds: { source: asset.id }, sourceAssetId: asset.id, assetIds: [output.id], modelId: 'local/mcp-resize', provider: 'local', prompt: '', settings: { width: input.width, height: input.height, fit: input.fit }, status: 'LOCAL', provenance: 'local-edit', favorite: false, createdAt: now, updatedAt: now, changes: [] };
    this.store.transaction(() => { this.store.upsertAsset(output); this.store.upsertTake(take); this.store.putOperationReceipt({ key, fingerprint, result: { assetId: output.id, takeId: take.id }, createdAt: now }); const project = this.store.getProject(token.projectId)!; this.store.upsertProject({ ...project, updatedAt: now }); });
    return { asset: assetView(output), takeId: take.id, reused: false };
  }
  /** Root dispatches this exact path to its immutable workspace before the ordinary session gate. */
  async handleTransport(req: Request, res: Response): Promise<void> {
    res.setHeader('Cache-Control', 'no-store');
    const token = this.authenticate(req);
    if (!token) { res.setHeader('WWW-Authenticate', 'Bearer realm="Open Take Studio MCP"'); res.status(401).json({ error: 'A valid active project MCP token is required.' }); return; }
    const origin = req.headers.origin;
    if (origin && origin !== this.origin(req)) { res.status(403).json({ error: 'The request origin is not allowed.' }); return; }
    if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); res.status(405).json({ error: 'This stateless MCP endpoint accepts POST.' }); return; }
    if (req.body !== undefined && Buffer.byteLength(JSON.stringify(req.body)) > MAX_BODY) { res.status(413).json({ error: 'MCP request is too large.' }); return; }
    const now = this.now();
    for (const [key, value] of this.buckets) if (value.until <= now) this.buckets.delete(key);
    const bucket = this.buckets.get(token.id) ?? { count: 0, until: now + 60000 };
    if (bucket.count >= 90 || this.activeRequests >= 4) { res.setHeader('Retry-After', '30'); res.status(429).json({ error: 'This MCP workspace is busy. Retry shortly.' }); return; }
    bucket.count++; this.buckets.set(token.id, bucket); this.activeRequests++;
    const server = this.createServer(token);
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true, maxRequestBodySize: MAX_BODY });
    let closed = false;
    const close = () => { if (closed) return; closed = true; this.activeRequests--; void server.close().catch(() => undefined); };
    res.once('finish', close); res.once('close', close);
    try {
      token.lastUsedAt = new Date(now).toISOString();
      this.store.upsertScopedRecord({ id: token.id, projectId: token.projectId, kind: KIND, data: token, createdAt: token.createdAt, updatedAt: token.lastUsedAt });
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch {
      if (!res.headersSent) res.status(500).json({ error: 'The MCP request could not be completed.' });
      else if (!res.writableEnded) res.end();
      close();
    }
  }
}
