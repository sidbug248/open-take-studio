import type { Asset, MediaKind, Take } from './types';

export type ReviewRole = 'viewer' | 'commenter' | 'approver';
export interface ReviewAssetVersion {
  assetId: string;
  sha256: string;
  name: string;
  kind: MediaKind;
  mimeType: string;
  size: number;
}
export interface ReviewVersion {
  number: number;
  label: string;
  createdAt: string;
  assets: ReviewAssetVersion[];
}
export interface ReviewAuthor {
  id: string;
  label: string;
  role: ReviewRole | 'owner';
}
export interface ReviewComment {
  id: string;
  version: number;
  assetId: string;
  assetSha256: string;
  parentId?: string;
  timeSeconds?: number;
  author: ReviewAuthor;
  text: string;
  createdAt: string;
  resolvedAt?: string;
  resolvedBy?: ReviewAuthor;
}
export interface ReviewDecision {
  id: string;
  version: number;
  assetId: string;
  assetSha256: string;
  author: ReviewAuthor;
  decision: 'approved' | 'changes-requested';
  note: string;
  createdAt: string;
}
export interface ReviewBoard {
  id: string;
  projectId: string;
  workspaceId: string;
  title: string;
  revision: number;
  createdAt: string;
  updatedAt: string;
  closedAt?: string;
  versions: ReviewVersion[];
  comments: ReviewComment[];
  decisions: ReviewDecision[];
}
export interface ReviewInvitation {
  id: string;
  boardId: string;
  version: number;
  label: string;
  role: ReviewRole;
  createdAt: string;
  expiresAt: string;
  revokedAt?: string;
}
export interface ReviewBoardDetail {
  board: ReviewBoard;
  invitations: ReviewInvitation[];
}
export interface SharedReviewView {
  title: string;
  boardId: string;
  workspaceId: string;
  revision: number;
  version: ReviewVersion;
  invitation: ReviewInvitation;
  comments: ReviewComment[];
  decisions: ReviewDecision[];
}
export type DeliveryPreset = 'original' | 'square' | 'portrait' | 'landscape';
export interface DeliverySpec {
  name: string;
  assetIds: string[];
  caption: string;
  preset: DeliveryPreset;
}
export interface DeliveryManifest {
  format: 'open-take-delivery';
  version: 1;
  projectId: string;
  name: string;
  preset: DeliveryPreset;
  createdAt: string;
  media: {
    sourceAssetId: string;
    sourceSha256: string;
    originalName: string;
    deliveredFile: string;
    deliveredSha256: string;
    deliveredBytes: number;
    processing: string;
  }[];
  publication: { state: 'not-published'; destination: 'download' };
}
export interface DeliveryResult { asset: Asset; take: Take; manifest: DeliveryManifest; deliveryAssets: Asset[]; }
