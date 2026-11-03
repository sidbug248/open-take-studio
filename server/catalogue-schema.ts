import { z } from 'zod';
const id = z.string().min(1).max(128).regex(/^[A-Za-z0-9_-]+$/);
export const catalogueDemonstrationSchema = z.object({
  id, capabilityId: id, operationId: z.string().min(1).max(128).regex(/^[A-Za-z0-9_.-]+$/), title: z.string().trim().min(1).max(240),
  previewKind: z.enum(['image', 'comparison', 'video', 'audio', 'text', 'mesh', 'scene', 'playable', 'workflow', 'concept']),
  projectId: id, posterAssetId: id.optional(), previewAssetId: id.optional(), inputAssetIds: z.array(id).max(100), outputAssetIds: z.array(id).max(100),
  takeId: id.optional(), jobId: id.optional(), modelId: z.string().max(300).optional(), provider: z.string().max(100).optional(), requestId: z.string().max(200).optional(),
  workflowReference: z.object({ kind: z.enum(['film', 'scene', 'recipe', 'comparison', 'project', 'package', 'native-workflow', 'api']), toolView: z.string().min(1).max(80), filmId: id.optional(), sceneId: id.optional(), recipeId: id.optional(), takeIds: z.array(id).max(20).optional(), nativeWorkflowId: id.optional(), artifactAssetId: id.optional(), note: z.string().max(2000).optional() }).strict().optional(),
  verificationKind: z.enum(['generation', 'local-operation', 'interaction', 'concept']), verifiedAt: z.string().datetime().optional(),
  attribution: z.object({ creator: z.string().min(1).max(160), source: z.enum(['studio-original', 'user-upload', 'imported-example', 'concept']), licenseNote: z.string().max(2000).optional() }).strict(),
  createdAt: z.string().datetime(),
}).strict();
