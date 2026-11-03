import type { Asset } from './types.ts';

/** Canonical media semantics. Human-facing labels never control filtering. */
export type MediaModality = 'image' | 'video' | 'audio' | 'text' | 'vector' | 'mesh' | 'scene' | 'playable';
export type CataloguePreviewKind = 'image' | 'comparison' | 'video' | 'audio' | 'text' | 'mesh' | 'scene' | 'playable' | 'workflow' | 'concept';
export interface CatalogueWorkflowReference {
  kind: 'film' | 'scene' | 'recipe' | 'comparison' | 'project' | 'package' | 'native-workflow' | 'api';
  toolView: string;
  filmId?: string;
  sceneId?: string;
  recipeId?: string;
  takeIds?: string[];
  nativeWorkflowId?: string;
  artifactAssetId?: string;
  note?: string;
}
/** Durable project-owned curation. A concept cannot certify an operation. */
export interface CatalogueDemonstration {
  id: string;
  capabilityId: string;
  operationId: string;
  title: string;
  previewKind: CataloguePreviewKind;
  projectId: string;
  posterAssetId?: string;
  previewAssetId?: string;
  inputAssetIds: string[];
  outputAssetIds: string[];
  takeId?: string;
  jobId?: string;
  modelId?: string;
  provider?: string;
  requestId?: string;
  workflowReference?: CatalogueWorkflowReference;
  verificationKind: 'generation' | 'local-operation' | 'interaction' | 'concept';
  verifiedAt?: string;
  attribution: { creator: string; source: 'studio-original' | 'user-upload' | 'imported-example' | 'concept'; licenseNote?: string };
  createdAt: string;
}
/** API presentation includes safe owned media, without paid preview work. */
export interface CatalogueDemonstrationView extends CatalogueDemonstration {
  sourcePrompt?: string;
  posterAsset?: Asset;
  previewAsset?: Asset;
  inputAssets: Asset[];
  outputAssets: Asset[];
  posterUrl?: string;
  previewUrl?: string;
}
