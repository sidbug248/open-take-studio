import { Router, json as parseJson, type Request, type Response, type NextFunction } from 'express';
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import type { Store } from './store.ts';
import type { LocalFileStorage } from './media.ts';
import { accessFor, requireProjectAccess } from './auth-access.ts';
import { clientAddress, requestOrigin } from './request-origin.ts';
import { ReviewService, reviewError, type ReviewActor } from './review-service.ts';
import { createDeliveryPackage } from './delivery-package.ts';
import { reviewPage } from './review-page.ts';

export interface ReviewRouterOptions { workspaceId: string; secureCookies?: boolean; now?: () => Date; workspaceExpiresAt?: string; }
const routeError = (error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (res.headersSent) return;
  if (error instanceof z.ZodError) { res.status(400).json({ error: 'Check the review fields and try again.', details: error.issues.map(issue => ({ path: issue.path.join('.'), message: issue.message })) }); return; }
  const status = Number((error as { status?: number }).status) || 500;
  res.status(status).json({ error: status < 500 ? (error as Error).message : 'This review operation could not finish. Try again.' });
};
const wrap = (work: (req: Request, res: Response) => unknown) => (req: Request, res: Response, next: NextFunction) => { Promise.resolve().then(() => work(req, res)).catch(next); };
const parameter = (req: Request, name: string) => String(req.params[name] ?? '');
function ownerActor(req: Request): ReviewActor {
  const access = accessFor(req);
  if (!access) throw reviewError('Sign in before changing a project review.', 401);
  return { kind: 'owner', id: access.subjectId, label: access.kind === 'reviewer' ? 'Workspace owner' : 'Project owner' };
}
export function createReviewRouter(store: Store, media: LocalFileStorage, options: ReviewRouterOptions) {
  const router = Router(), reviews = new ReviewService(store, options.workspaceId, options.now, options.workspaceExpiresAt);
  const base = '/projects/:projectId/reviews';
  const authorize = (req: Request, permission: 'read' | 'write' | 'share' = 'share') => { requireProjectAccess(store, req, parameter(req, 'projectId'), permission); return parameter(req, 'projectId'); };
  const detail = (req: Request) => reviews.detail(parameter(req, 'boardId'), parameter(req, 'projectId'));
  router.get(base, wrap((req, res) => res.json(reviews.list(authorize(req, 'read')))));
  router.post(base, wrap((req, res) => {
    const board = reviews.create(authorize(req), req.body);
    res.status(201).json(reviews.detail(board.id, board.projectId));
  }));
  router.get(base + '/capabilities', wrap((req, res) => { authorize(req, 'read'); res.json({ workspaceId: options.workspaceId, workspaceExpiresAt: options.workspaceExpiresAt, maxInvitationDays: 30, maxVersionAssets: 24 }); }));
  router.get(base + '/:boardId', wrap((req, res) => { authorize(req, 'read'); res.json(detail(req)); }));
  router.patch(base + '/:boardId', wrap((req, res) => { reviews.update(authorize(req), parameter(req, 'boardId'), req.body); res.json(detail(req)); }));
  router.post(base + '/:boardId/versions', wrap((req, res) => { reviews.addVersion(authorize(req), parameter(req, 'boardId'), req.body); res.status(201).json(detail(req)); }));
  router.post(base + '/:boardId/invitations', wrap((req, res) => {
    const result = reviews.invite(authorize(req), parameter(req, 'boardId'), req.body);
    res.setHeader('Cache-Control', 'private, no-store');
    res.status(201).json({ invitation: result.invitation, revision: result.revision, relativeUrl: result.relativeUrl });
  }));
  router.delete(base + '/:boardId/invitations/:inviteId', wrap((req, res) => { reviews.revoke(authorize(req), parameter(req, 'boardId'), parameter(req, 'inviteId'), req.body?.revision); res.json(detail(req)); }));
  router.post(base + '/:boardId/comments', wrap((req, res) => { reviews.comment(parameter(req, 'boardId'), authorize(req, 'write'), req.body, ownerActor(req)); res.status(201).json(detail(req)); }));
  router.patch(base + '/:boardId/comments/:commentId', wrap((req, res) => { reviews.resolve(parameter(req, 'boardId'), authorize(req, 'write'), parameter(req, 'commentId'), req.body, ownerActor(req)); res.json(detail(req)); }));
  router.post(base + '/:boardId/decisions', wrap((req, res) => { reviews.decide(parameter(req, 'boardId'), authorize(req, 'write'), req.body, ownerActor(req)); res.status(201).json(detail(req)); }));
  router.get('/projects/:projectId/deliveries', wrap((req, res) => { const projectId = authorize(req, 'read'); res.json(store.listAssets(projectId).filter(asset => asset.metadata.operation === 'delivery-package')); }));
  router.post('/projects/:projectId/deliveries', wrap(async (req, res) => {
    const projectId = authorize(req, 'write');
    const input = z.object({ spec: z.unknown(), clientRequestId: z.string() }).strict().parse(req.body);
    const result = await createDeliveryPackage(store, media, projectId, input.spec as Parameters<typeof createDeliveryPackage>[3], input.clientRequestId);
    res.status(201).json(result);
  }));
  router.use(routeError);
  return router;
}

function cookieName(boardId: string) { return 'ots_review_' + boardId.replace(/-/g, ''); }
function cookie(req: Request, name: string) {
  for (const part of String(req.headers.cookie ?? '').split(';')) {
    const split = part.indexOf('=');
    if (split >= 0 && part.slice(0, split).trim() === name) { try { return decodeURIComponent(part.slice(split + 1)); } catch { return ''; } }
  }
  return '';
}
/** Mounted before owner/reviewer auth; the caller must resolve the literal workspace path without fallback. */
export function createSharedReviewRouter(store: Store, media: LocalFileStorage, options: ReviewRouterOptions) {
  const router = Router(), reviews = new ReviewService(store, options.workspaceId, options.now, options.workspaceExpiresAt), clock = options.now ?? (() => new Date());
  const base = '/api/shared-review/:workspaceId/:boardId';
  const buckets = new Map<string, { starts: number; count: number }>();
  const limit = (req: Request, count: number, suffix: string) => {
    const now = clock().getTime(), key = clientAddress(req) + ':' + parameter(req, 'boardId') + ':' + suffix;
    let bucket = buckets.get(key);
    if (!bucket || now - bucket.starts > 60_000) {
      if (buckets.size >= 2000) for (const [id, value] of buckets) if (now - value.starts > 60_000) buckets.delete(id);
      if (buckets.size >= 2000) throw reviewError('Review traffic is busy. Try again in a minute.', 429);
      bucket = { starts: now, count: 0 }; buckets.set(key, bucket);
    }
    if (++bucket.count > count) throw reviewError('Too many review requests. Try again in a minute.', 429);
  };
  const boundary = (req: Request, res: Response, next: NextFunction) => {
    try {
      if (parameter(req, 'workspaceId') !== options.workspaceId || !/^[a-f0-9-]{36}$/.test(parameter(req, 'boardId'))) throw reviewError('Review not found.', 404);
      res.setHeader('Cache-Control', 'private, no-store');
      res.setHeader('Referrer-Policy', 'no-referrer');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
        limit(req, req.path.endsWith('/session') ? 15 : 40, 'write');
        if (req.header('X-Review-Request') !== '1') throw reviewError('Use the review page to perform this action.', 403);
        const origin = req.header('Origin'), expected = requestOrigin(req)?.origin ?? req.protocol + '://' + req.get('host');
        if (origin && origin !== expected) throw reviewError('This review request came from a different site.', 403);
        if (req.header('Sec-Fetch-Site') === 'cross-site') throw reviewError('This review request came from a different site.', 403);
      } else limit(req, 240, 'read');
      next();
    } catch (error) { next(error); }
  };
  const tokenFor = (req: Request) => cookie(req, cookieName(parameter(req, 'boardId')));
  const actor = (req: Request): ReviewActor => ({ kind: 'invitation', token: tokenFor(req) });
  const publicView = (req: Request) => reviews.view(parameter(req, 'boardId'), tokenFor(req));
  router.get('/review/:workspaceId/:boardId', boundary, wrap((req, res) => {
    const nonce = randomBytes(18).toString('base64');
    res.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'nonce-" + nonce + "'; style-src 'nonce-" + nonce + "'; img-src 'self' blob:; media-src 'self' blob:; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
    res.type('html').send(reviewPage(options.workspaceId, parameter(req, 'boardId'), nonce));
  }));
  router.use(base, boundary, parseJson({ limit: '24kb' }));
  router.post(base + '/session', wrap((req, res) => {
    const input = z.object({ token: z.string().max(100) }).strict().parse(req.body), boardId = parameter(req, 'boardId');
    const { invitation } = reviews.authenticate(boardId, input.token);
    const secure = options.secureCookies ?? (requestOrigin(req)?.origin ?? req.protocol + '://' + req.get('host')).startsWith('https://');
    res.cookie(cookieName(boardId), input.token, { httpOnly: true, secure, sameSite: 'lax', path: '/api/shared-review/' + options.workspaceId + '/' + boardId, maxAge: Math.min(Date.parse(invitation.expiresAt) - clock().getTime(), 7 * 86_400_000) });
    res.json({ connected: true });
  }));
  router.delete(base + '/session', wrap((req, res) => {
    res.clearCookie(cookieName(parameter(req, 'boardId')), { httpOnly: true, secure: options.secureCookies ?? req.secure, sameSite: 'lax', path: '/api/shared-review/' + options.workspaceId + '/' + parameter(req, 'boardId') });
    res.json({ disconnected: true });
  }));
  router.get(base, wrap((req, res) => res.json(publicView(req))));
  router.get(base + '/assets/:assetId', wrap((req, res) => {
    const asset = reviews.media(parameter(req, 'boardId'), tokenFor(req), parameter(req, 'assetId'));
    res.type(asset.mimeType);
    const inline = ['image', 'video', 'audio'].includes(asset.kind) && asset.mimeType !== 'image/svg+xml';
    if (!inline || req.query.download === '1') res.attachment(asset.name);
    res.sendFile(media.path(asset), { acceptRanges: true, cacheControl: false, lastModified: false }, error => {
      if (error && !res.headersSent) res.status((error as { status?: number }).status ?? 404).end();
    });
  }));
  router.post(base + '/comments', wrap((req, res) => { publicView(req); reviews.comment(parameter(req, 'boardId'), undefined, req.body, actor(req)); res.status(201).json(publicView(req)); }));
  router.patch(base + '/comments/:commentId', wrap((req, res) => { publicView(req); reviews.resolve(parameter(req, 'boardId'), undefined, parameter(req, 'commentId'), req.body, actor(req)); res.json(publicView(req)); }));
  router.post(base + '/decisions', wrap((req, res) => { publicView(req); reviews.decide(parameter(req, 'boardId'), undefined, req.body, actor(req)); res.status(201).json(publicView(req)); }));
  router.use(routeError);
  return router;
}