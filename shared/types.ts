import type { BranchFilm } from './film-types';
import type { Scene, SceneBinding, RecipeSlot } from './scene-types';
import type { WorkflowExecution } from './workflow-types';
import type { CatalogueDemonstration } from './catalogue-types';
import type { SyncDurationReceipt } from './sync-duration';
export type MediaKind = 'image' | 'video' | 'audio' | '3d' | 'document';
export type JobState = 'PENDING' | 'SUBMITTING' | 'IN_QUEUE' | 'IN_PROGRESS' | 'COLLECTING' | 'COMPLETED' | 'FAILED' | 'BLOCKED' | 'RETRY_WAIT' | 'EXPIRED';
export type Json = Record<string, unknown>;
export interface Project { catalogueDemonstrations?:CatalogueDemonstration[]; id: string; name: string; description: string; createdAt: string; updatedAt: string; selectedTakeId?: string; coverAssetId?: string; films?:BranchFilm[]; scenes?:Scene[]; }
export type ReferenceRoles = Record<string,{assetId:string;inputKey:string;label?:string;locked?:boolean}>;
export interface Asset { id: string; projectId: string; name: string; kind: MediaKind; mimeType: string; fileName: string; size: number; sha256: string; provenance: 'generated' | 'imported' | 'local-edit'; createdAt: string; metadata: Json; url: string; }
export interface Shot { id: string; projectId: string; name: string; description: string; position: number; selectedTakeId?: string; }
export interface Take { inputDurationReview?:SyncDurationReceipt; referenceRoles?:ReferenceRoles; executionRoute?:'router'|'comfy-workflow';workflowVersionAssetId?:string; id: string; projectId: string; shotId?: string; name: string; kind: MediaKind; parentTakeId?: string; sourceAssetId?: string; inputAssetIds: Record<string, string | string[]>; assetIds: string[]; modelId: string; provider: string; prompt: string; settings: Json; status: JobState | 'IMPORTED' | 'LOCAL'; provenance: 'generated' | 'imported' | 'local-edit'; favorite: boolean; createdAt: string; updatedAt: string; jobId?: string; sceneBinding?:SceneBinding; changes: {field:string;before:unknown;after:unknown}[]; }
export interface Job { executionRoute?:'router'|'comfy-workflow'; workflow?:WorkflowExecution; id: string; projectId: string; takeId: string; modelId: string; provider: string; requestId?: string; idempotencyKey: string; inputs: Json; state: JobState; routerStatus?: string; delivery?:'queue'|'sync'; queuePosition?: number; errorType?: string; errorMessage?: string; httpStatus?:number; diagnosticRequestId?:string|null; attempts: number; collectAttempts?:number; nextPollAt?: string; createdAt: string; updatedAt: string; submittedAt?: string; completedAt?: string; result?: unknown; resultMetadata?:Json; fingerprint?:string; }
export interface RecipeIngredient {key:string;label:string;defaultValue:string;description?:string;}
export interface Recipe { slots?:RecipeSlot[]; reproductionLimits?:string[]; promptTemplate?:string;ingredients?:RecipeIngredient[];previewAssetId?:string;sourceTakeId?:string; id: string; projectId: string; name: string; modelId: string; prompt: string; settings: Json; inputAssetIds: Record<string,string|string[]>; createdAt: string; }
export interface ProjectDetail { project: Project; assets: Asset[]; takes: Take[]; jobs: Job[]; shots: Shot[]; recipes: Recipe[]; }
export interface GenerationRequest { durationConfirmation?:string; referenceRoles?:ReferenceRoles; sceneBinding?:SceneBinding; projectId:string; modelId:string; prompt:string; settings:Json; inputAssetIds?:Record<string,string|string[]>; parentTakeId?:string; sourceAssetId?:string; shotId?:string; name?:string; clientRequestId:string; }
