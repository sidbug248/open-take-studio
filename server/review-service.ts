import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import type { Asset } from '../shared/types.ts';
import type { ReviewAssetVersion, ReviewAuthor, ReviewBoard, ReviewBoardDetail, ReviewComment, ReviewDecision, ReviewInvitation, ReviewRole, SharedReviewView } from '../shared/review-types.ts';
import type { Store } from './store.ts';

const BOARD = 'review-board';
const INVITE = 'review-invitation';
const idSchema = z.string().regex(/^[a-zA-Z0-9_-]{1,128}$/);
const revisionSchema = z.number().int().min(1);
const selectionSchema = z.array(idSchema).min(1).max(24);
const titleSchema = z.string().trim().min(1).max(160);
const MAX_COMMENTS = 500;
const MAX_DECISIONS = 500;
interface StoredInvitation extends ReviewInvitation { tokenHash: string; workspaceId: string; projectId: string; }
export type ReviewActor = { kind: 'owner'; id: string; label: string } | { kind: 'invitation'; token: string };
export const reviewError = (message: string, status = 400) => Object.assign(new Error(message), { status });
export const reviewHash = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
const nowIso = (now: () => Date) => now().toISOString();
const safeInvitation = ({ tokenHash: _hash, workspaceId: _workspace, projectId: _project, ...value }: StoredInvitation): ReviewInvitation => value;

/** Scoped records are independent from project exports. Invitation secrets are never persisted. */
export class ReviewService {
  constructor(readonly store: Store, readonly workspaceId: string, readonly now: () => Date = () => new Date(), readonly workspaceExpiresAt?: string) {
    idSchema.parse(workspaceId);
    if (workspaceExpiresAt !== undefined && !Number.isFinite(Date.parse(workspaceExpiresAt))) throw reviewError('Invalid workspace expiration.');
  }
  private save(board: ReviewBoard) {
    this.store.upsertScopedRecord({ id: board.id, projectId: board.projectId, kind: BOARD, data: board, createdAt: board.createdAt, updatedAt: board.updatedAt });
    return board;
  }
  private savedInvitation(invite: StoredInvitation) {
    this.store.upsertScopedRecord({ id: invite.id, projectId: invite.projectId, kind: INVITE, data: invite, createdAt: invite.createdAt, updatedAt: nowIso(this.now) });
  }
  board(id: string, projectId?: string): ReviewBoard {
    const row = this.store.getScopedRecord<ReviewBoard>(BOARD, id);
    if (!row || row.data.workspaceId !== this.workspaceId || (projectId && row.projectId !== projectId) || !this.store.getProject(row.projectId)) throw reviewError('Review not found.', 404);
    return row.data;
  }
  list(projectId: string): ReviewBoardDetail[] {
    if (!this.store.getProject(projectId)) throw reviewError('Project not found.', 404);
    return this.store.listScopedRecords<ReviewBoard>(BOARD, projectId).filter(row => row.data.workspaceId === this.workspaceId)
      .map(row => this.detail(row.data.id, projectId)).sort((a, b) => b.board.updatedAt.localeCompare(a.board.updatedAt));
  }
  detail(boardId: string, projectId?: string): ReviewBoardDetail {
    const board = this.board(boardId, projectId);
    const invitations = this.store.listScopedRecords<StoredInvitation>(INVITE, board.projectId)
      .filter(row => row.data.boardId === board.id && row.data.workspaceId === this.workspaceId).map(row => safeInvitation(row.data));
    return { board, invitations };
  }
  private selection(projectId: string, ids: string[]): ReviewAssetVersion[] {
    selectionSchema.parse(ids);
    if (new Set(ids).size !== ids.length) throw reviewError('Choose each saved asset once.');
    const assets = ids.map(id => {
      const asset = this.store.getAsset(id);
      if (!asset || asset.projectId !== projectId) throw reviewError('A selected asset does not belong to this project.', 404);
      return { assetId: asset.id, sha256: asset.sha256, name: asset.name, kind: asset.kind, mimeType: asset.mimeType, size: asset.size };
    });
    if (assets.reduce((n, asset) => n + asset.size, 0) > 256 * 1024 * 1024) throw reviewError('A review version supports up to 256 MiB of selected media.');
    return assets;
  }
  create(projectId: string, raw: unknown): ReviewBoard {
    const input = z.object({ title: titleSchema, assetIds: selectionSchema }).strict().parse(raw);
    if (!this.store.getProject(projectId)) throw reviewError('Project not found.', 404);
    const assets = this.selection(projectId, input.assetIds);
    return this.store.transaction(() => {
      if (this.list(projectId).length >= 50) throw reviewError('This project already has 50 review boards. Reuse a board with a new version.', 409);
      const now = nowIso(this.now);
      return this.save({ id: randomUUID(), projectId, workspaceId: this.workspaceId, title: input.title, revision: 1, createdAt: now, updatedAt: now, versions: [{ number: 1, label: 'Version 1', createdAt: now, assets }], comments: [], decisions: [] });
    });
  }
  private mutate<T>(boardId: string, projectId: string | undefined, revision: number, work: (board: ReviewBoard) => T): T {
    revisionSchema.parse(revision);
    return this.store.transaction(() => {
      const board = this.board(boardId, projectId);
      if (board.revision !== revision) throw reviewError('This review changed. Refresh it and retry; your draft has been kept.', 409);
      const result = work(board);
      board.revision++;
      board.updatedAt = nowIso(this.now);
      this.save(board);
      return result;
    });
  }
  update(projectId: string, boardId: string, raw: unknown): ReviewBoard {
    const input = z.object({ revision: revisionSchema, title: titleSchema.optional(), closed: z.boolean().optional() }).strict().parse(raw);
    return this.mutate(boardId, projectId, input.revision, board => {
      if (input.title !== undefined) board.title = input.title;
      if (input.closed !== undefined) board.closedAt = input.closed ? nowIso(this.now) : undefined;
      return board;
    });
  }
  addVersion(projectId: string, boardId: string, raw: unknown): ReviewBoard {
    const input = z.object({ revision: revisionSchema, label: titleSchema, assetIds: selectionSchema }).strict().parse(raw);
    const assets = this.selection(projectId, input.assetIds);
    return this.mutate(boardId, projectId, input.revision, board => {
      if (board.closedAt) throw reviewError('Reopen this board before adding a version.', 409);
      if (board.versions.length >= 20) throw reviewError('A review board supports 20 versions. Create a new board.', 409);
      board.versions.push({ number: board.versions.length + 1, label: input.label, assets, createdAt: nowIso(this.now) });
      return board;
    });
  }
  invite(projectId: string, boardId: string, raw: unknown): { invitation: ReviewInvitation; token: string; revision: number; relativeUrl: string } {
    const input = z.object({ revision: revisionSchema, label: z.string().trim().min(1).max(100), role: z.enum(['viewer', 'commenter', 'approver']), version: z.number().int().min(1), expiresAt: z.string().datetime() }).strict().parse(raw);
    const requestedExpiry = Date.parse(input.expiresAt), now = this.now().getTime();
    if (requestedExpiry <= now || requestedExpiry > now + 30 * 86_400_000) throw reviewError('Invitation expiry must be in the next 30 days.');
    const expiry = Math.min(requestedExpiry, this.workspaceExpiresAt ? Date.parse(this.workspaceExpiresAt) : Infinity);
    if (expiry <= now) throw reviewError('This workspace has expired. Start a new workspace to share a review.', 403);
    return this.mutate(boardId, projectId, input.revision, board => {
      if (board.closedAt) throw reviewError('Reopen this board before inviting someone.', 409);
      if (!board.versions.some(version => version.number === input.version)) throw reviewError('Review version not found.', 404);
      const all = this.detail(boardId, projectId).invitations;
      if (all.filter(invitation => !invitation.revokedAt && Date.parse(invitation.expiresAt) > now).length >= 30) throw reviewError('Revoke an invitation before adding another active link.', 409);
      if (all.length >= 200) throw reviewError('This board has reached its invitation history limit. Create a new board.', 409);
      const id = randomUUID(), token = id + '.' + randomBytes(32).toString('base64url');
      const invitation: StoredInvitation = { id, boardId, projectId, workspaceId: this.workspaceId, version: input.version, label: input.label, role: input.role, expiresAt: new Date(expiry).toISOString(), createdAt: nowIso(this.now), tokenHash: reviewHash(token) };
      this.savedInvitation(invitation);
      return { invitation: safeInvitation(invitation), token, revision: board.revision + 1, relativeUrl: '/review/' + encodeURIComponent(this.workspaceId) + '/' + board.id + '#invite=' + encodeURIComponent(token) };
    });
  }
  revoke(projectId: string, boardId: string, inviteId: string, revision: number): ReviewBoard {
    return this.mutate(boardId, projectId, revision, board => {
      const row = this.store.getScopedRecord<StoredInvitation>(INVITE, inviteId);
      if (!row || row.projectId !== projectId || row.data.workspaceId !== this.workspaceId || row.data.boardId !== boardId) throw reviewError('Invitation not found.', 404);
      this.savedInvitation({ ...row.data, revokedAt: nowIso(this.now) });
      return board;
    });
  }
  authenticate(boardId: string, token: string): { board: ReviewBoard; invitation: ReviewInvitation } {
    if (this.workspaceExpiresAt && Date.parse(this.workspaceExpiresAt) <= this.now().getTime()) throw reviewError('This shared workspace has expired.', 403);
    if (typeof token !== 'string' || !/^[a-f0-9-]{36}\.[A-Za-z0-9_-]{43}$/.test(token)) throw reviewError('Open a valid review invitation.', 401);
    const id = token.split('.')[0], row = this.store.getScopedRecord<StoredInvitation>(INVITE, id);
    if (!row || row.data.workspaceId !== this.workspaceId || row.data.boardId !== boardId) throw reviewError('Open a valid review invitation.', 401);
    const invitation = row.data, expected = Buffer.from(invitation.tokenHash, 'hex'), actual = Buffer.from(reviewHash(token), 'hex');
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) throw reviewError('Open a valid review invitation.', 401);
    if (invitation.revokedAt || Date.parse(invitation.expiresAt) <= this.now().getTime()) throw reviewError('This invitation has expired or was revoked. Ask the project owner for a new link.', 403);
    const board = this.board(boardId, row.projectId);
    if (board.closedAt) throw reviewError('This review is closed.', 403);
    if (!board.versions.some(version => version.number === invitation.version)) throw reviewError('Review version is unavailable.', 404);
    return { board, invitation: safeInvitation(invitation) };
  }
  view(boardId: string, token: string): SharedReviewView {
    const { board, invitation } = this.authenticate(boardId, token);
    return { title: board.title, boardId, workspaceId: this.workspaceId, revision: board.revision, invitation, version: board.versions.find(version => version.number === invitation.version)!, comments: board.comments.filter(comment => comment.version === invitation.version), decisions: board.decisions.filter(decision => decision.version === invitation.version) };
  }
  media(boardId: string, token: string, assetId: string): Asset {
    const view = this.view(boardId, token), snapshot = view.version.assets.find(asset => asset.assetId === assetId), asset = this.store.getAsset(assetId);
    if (!snapshot || !asset || asset.projectId !== this.board(boardId).projectId || asset.sha256 !== snapshot.sha256) throw reviewError('This asset is not included in your review invitation.', 404);
    return asset;
  }
  private author(board: ReviewBoard, version: number, actor: ReviewActor, capability: 'comment' | 'approve'): ReviewAuthor {
    if (actor.kind === 'owner') return { id: actor.id, label: actor.label.slice(0, 100), role: 'owner' };
    const { invitation } = this.authenticate(board.id, actor.token);
    if (invitation.version !== version) throw reviewError('This link does not grant access to that review version.', 403);
    if (invitation.role === 'viewer' || (capability === 'approve' && invitation.role !== 'approver')) throw reviewError('This invitation does not allow that action.', 403);
    return { id: invitation.id, label: invitation.label, role: invitation.role };
  }
  comment(boardId: string, projectId: string | undefined, raw: unknown, actor: ReviewActor): ReviewBoard {
    const input = z.object({ revision: revisionSchema, version: z.number().int().min(1), assetId: idSchema, assetSha256: z.string().regex(/^[a-f0-9]{64}$/), text: z.string().trim().min(1).max(4000), parentId: idSchema.optional(), timeSeconds: z.number().finite().min(0).max(86_400).optional() }).strict().parse(raw);
    return this.mutate(boardId, projectId, input.revision, board => {
      if (board.closedAt) throw reviewError('This review is closed.', 409);
      const author = this.author(board, input.version, actor, 'comment');
      const snapshot = board.versions.find(version => version.number === input.version)?.assets.find(asset => asset.assetId === input.assetId && asset.sha256 === input.assetSha256);
      if (!snapshot) throw reviewError('Choose an asset from this exact review version.', 409);
      if (input.timeSeconds !== undefined && !['video', 'audio'].includes(snapshot.kind)) throw reviewError('Time comments are available for audio and video.');
      if (board.comments.length >= MAX_COMMENTS) throw reviewError('This review has reached its 500-comment limit.', 409);
      let parent: ReviewComment | undefined;
      if (input.parentId) {
        parent = board.comments.find(comment => comment.id === input.parentId);
        if (!parent || parent.parentId || parent.version !== input.version || parent.assetId !== input.assetId || parent.assetSha256 !== input.assetSha256) throw reviewError('Reply to a thread on this exact asset version.', 409);
      }
      board.comments.push({ id: randomUUID(), version: input.version, assetId: input.assetId, assetSha256: input.assetSha256, text: input.text, parentId: parent?.id, timeSeconds: input.timeSeconds, author, createdAt: nowIso(this.now) });
      return board;
    });
  }
  resolve(boardId: string, projectId: string | undefined, commentId: string, raw: unknown, actor: ReviewActor): ReviewBoard {
    const input = z.object({ revision: revisionSchema, resolved: z.boolean() }).strict().parse(raw);
    return this.mutate(boardId, projectId, input.revision, board => {
      if (board.closedAt) throw reviewError('This review is closed.', 409);
      const comment = board.comments.find(value => value.id === commentId && !value.parentId);
      if (!comment) throw reviewError('Review thread not found.', 404);
      const author = this.author(board, comment.version, actor, 'comment');
      if (author.role !== 'owner' && author.role !== 'approver' && author.id !== comment.author.id) throw reviewError('You may resolve only your own threads.', 403);
      comment.resolvedAt = input.resolved ? nowIso(this.now) : undefined;
      comment.resolvedBy = input.resolved ? author : undefined;
      return board;
    });
  }
  decide(boardId: string, projectId: string | undefined, raw: unknown, actor: ReviewActor): ReviewBoard {
    const input = z.object({ revision: revisionSchema, version: z.number().int().min(1), assetId: idSchema, assetSha256: z.string().regex(/^[a-f0-9]{64}$/), decision: z.enum(['approved', 'changes-requested']), note: z.string().trim().max(2000).default('') }).strict().parse(raw);
    return this.mutate(boardId, projectId, input.revision, board => {
      if (board.closedAt) throw reviewError('This review is closed.', 409);
      const author = this.author(board, input.version, actor, 'approve');
      if (!board.versions.find(version => version.number === input.version)?.assets.some(asset => asset.assetId === input.assetId && asset.sha256 === input.assetSha256)) throw reviewError('Approvals must identify the exact selected asset version.', 409);
      if (board.decisions.length >= MAX_DECISIONS) throw reviewError('This review has reached its decision history limit.', 409);
      const decision: ReviewDecision = { id: randomUUID(), version: input.version, assetId: input.assetId, assetSha256: input.assetSha256, decision: input.decision, note: input.note, author, createdAt: nowIso(this.now) };
      board.decisions.push(decision);
      return board;
    });
  }
}