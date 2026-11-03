import { isDeepStrictEqual } from 'node:util';
import type { Store } from './store.ts';
import type { CapabilityRecord } from '../shared/capability-inventory.ts';
import type { CatalogueDemonstration, CatalogueDemonstrationView } from '../shared/catalogue-types.ts';
import type { Take } from '../shared/types.ts';
import { catalogueDemonstrationSchema } from './catalogue-schema.ts';
import { redactSignedMediaLinks } from './project-routes.ts';

export const GENERATION_OPERATIONS: Record<string, string> = {
  'video-kling': 'video.generate.kling', 'video-extension': 'video.extend.native',
  'transcribe': 'audio.transcribe.text',
  'image-generate': 'image.generate.text', 'image-reference-edit': 'image.edit.reference', 'image-inpaint': 'image.edit.mask', 'image-background': 'image.background.remove', 'image-enhance': 'image.enhance', 'image-outpaint': 'image.outpaint', 'image-vector': 'image.generate.vector',
  'reference-sheet': 'cast.reference-sheet', 'product-imagery': 'product.scene-reference',
  'video-image': 'video.generate.image', 'video-text': 'video.generate.text', 'video-fast': 'video.generate.fast', 'video-keyframes': 'video.generate.keyframes', 'video-references': 'video.generate.references', 'video-regenerate': 'video.regenerate', 'video-edit': 'video.edit', 'video-enhance': 'video.enhance',
  'speech-captions': 'audio.speech.captions', 'speech-voice': 'audio.speech.directed-voice', 'lip-sync': 'video.lip-sync', 'motion-transfer': 'video.motion-transfer', 'sound-effects': 'audio.sound-effects', 'audio-cleanup': 'audio.cleanup',
  'mesh-draft': 'mesh.generate.preview', 'mesh-refine': 'mesh.generate.refine', 'mesh-rig': 'mesh.rig', 'mesh-animate': 'mesh.animate',
};
export function matchesGenerationCapability(capability: CapabilityRecord, take: Take, operationId?: string): boolean {
  if (capability.route.kind !== 'router' || !capability.modelIds.includes(take.modelId)) return false;
  const input = take.inputAssetIds;
  if (['reference-sheet', 'product-imagery'].includes(capability.id)) return Boolean(input.images) && operationId === GENERATION_OPERATIONS[capability.id];
  if (capability.id === 'image-reference-edit') return Boolean(input.images);
  if (capability.id === 'image-generate') return !input.images;
  if (capability.id === 'video-image') return Boolean(input.first_frame) && !input.last_frame && !input.base_video && !input.reference_image && !input.reference_video && !input.reference_audio;
  if (capability.id === 'video-text') return !Object.keys(input).length;
  if (capability.id === 'video-keyframes') return Boolean(input.first_frame && input.last_frame);
  if (capability.id === 'video-references') return Boolean(input.reference_image || input.reference_video || input.reference_audio) && !input.first_frame && !input.last_frame && !input.base_video;
  if (capability.id === 'video-regenerate') return Boolean(input.base_video) && !input.first_frame && !input.last_frame;
  if (capability.id === 'mesh-draft') return take.settings.mode !== 'refine';
  if (capability.id === 'mesh-refine') return take.settings.mode === 'refine';
  return true;
}
const fail = (message: string): never => { throw Object.assign(new Error(message), { status: 400 }); };
export function validateDemonstration(store: Store, value: unknown, capability: CapabilityRecord, projectId: string): CatalogueDemonstration {
  const result = catalogueDemonstrationSchema.safeParse(value);
  if (!result.success) fail('Invalid demonstration record: ' + result.error.issues.map(issue => issue.path.join('.') + ' ' + issue.message).join('; '));
  const record = result.data! as CatalogueDemonstration, project = store.getProject(projectId);
  if (!project || record.projectId !== projectId || record.capabilityId !== capability.id) fail('Demonstration must belong to this project and capability.');
  const ownAsset = (id: string) => { const asset = store.getAsset(id); if (!asset || asset.projectId !== projectId) fail('Every demonstration asset must belong to this project.'); return asset!; };
  [...record.inputAssetIds, ...record.outputAssetIds, ...(record.posterAssetId ? [record.posterAssetId] : []), ...(record.previewAssetId ? [record.previewAssetId] : []), ...(record.workflowReference?.artifactAssetId ? [record.workflowReference.artifactAssetId] : [])].forEach(ownAsset);
  if (record.posterAssetId && ownAsset(record.posterAssetId).kind !== 'image') fail('A poster must be an actual image asset.');
  if (record.previewAssetId) {
    const expected = { image: 'image', video: 'video', audio: 'audio', text: 'document', mesh: '3d' }[record.previewKind as 'image' | 'video' | 'audio' | 'text' | 'mesh'];
    if (expected && ownAsset(record.previewAssetId).kind !== expected) fail('Preview media does not match its declared kind.');
  }
  const workflow = record.workflowReference;
  if (workflow) {
    if (workflow.filmId && !project!.films?.some(item => item.id === workflow.filmId)) fail('Film reference does not belong to this project.');
    if (workflow.sceneId && !project!.scenes?.some(item => item.id === workflow.sceneId)) fail('Scene reference does not belong to this project.');
    if (workflow.recipeId && store.getRecipe(workflow.recipeId)?.projectId !== projectId) fail('Recipe reference does not belong to this project.');
    if (workflow.nativeWorkflowId && ownAsset(workflow.nativeWorkflowId).metadata.operation !== 'comfy-workflow-version') fail('Native workflow reference must identify an owned native workflow asset.');
    for (const id of workflow.takeIds ?? []) if (store.getTake(id)?.projectId !== projectId) fail('Comparison take does not belong to this project.');
  }
  if (record.verificationKind === 'concept') {
    if (record.previewKind !== 'concept' || record.attribution.source !== 'concept' || record.jobId || record.requestId) fail('Concepts must be labelled and cannot carry execution proof.');
    return { ...record, verifiedAt: undefined };
  }
  if (capability.route.kind === 'planned' || record.attribution.source === 'concept' || record.attribution.source === 'imported-example') fail('Planned capabilities and imported examples cannot be certified by a demonstration.');
  if (record.verificationKind === 'generation') {
    const take = record.takeId ? store.getTake(record.takeId) : undefined, job = take?.jobId ? store.getJob(take.jobId) : undefined;
    if (!take || take.projectId !== projectId || take.status !== 'COMPLETED' || take.provenance !== 'generated' || !job || job.state !== 'COMPLETED' || store.isArchivedJob(job.id)) fail('Generation demonstrations require a completed, owned, non-archived take and job.');
    if (capability.route.kind === 'comfy-workflow') {
      const operation = capability.id === 'video-regenerate' ? 'workflow.video.regenerate.h3' : 'workflow.execute';
      if (record.operationId !== operation || job!.executionRoute !== 'comfy-workflow' || job!.workflow?.origin === 'cloud-editor' || !job!.workflow?.executedGraphAssetId || record.workflowReference?.nativeWorkflowId !== job!.workflow?.versionAssetId || take!.workflowVersionAssetId !== job!.workflow?.versionAssetId) fail('Native demonstrations require a completed studio workflow, exact version and persisted executed graph.');
      if (capability.id === 'video-regenerate') {
        const version = ownAsset(job!.workflow!.versionAssetId).metadata.workflowVersion as { apiGraph?: Record<string, { class_type?: string; inputs?: Record<string, unknown> }> } | undefined;
        if (!Object.values(version?.apiGraph ?? {}).some(node => node.class_type === 'MinimaxHailuo03RegenerateNode' && node.inputs?.['model.resolution'] === '2K') || !record.inputAssetIds.some(id => ownAsset(id).kind === 'video') || record.outputAssetIds.some(id => ownAsset(id).kind !== 'video')) fail('H3 regeneration proof requires the exact 2K native regeneration node, a source video and video outputs.');
      }
    } else if (record.operationId !== GENERATION_OPERATIONS[capability.id] || !matchesGenerationCapability(capability, take!, record.operationId)) fail('The saved request does not implement this exact capability and operation.');
    if (record.jobId && record.jobId !== job!.id || record.modelId && record.modelId !== take!.modelId || record.provider && record.provider !== take!.provider) fail('Execution references must match the saved take.');
    const requestId = job!.requestId ?? (typeof job!.resultMetadata?.requestId === 'string' ? job!.resultMetadata.requestId : undefined);
    if (!requestId || record.requestId && record.requestId !== requestId) fail('Execution request reference must match the saved job.');
    const actualInputs = new Set(Object.values(take!.inputAssetIds).flat());
    if (record.inputAssetIds.some(id => !actualInputs.has(id)) || !record.outputAssetIds.length || record.outputAssetIds.some(id => !take!.assetIds.includes(id))) fail('Demonstration inputs and outputs must match the executed take.');
    return { ...record, takeId: take!.id, jobId: job!.id, modelId: take!.modelId, provider: take!.provider, requestId, verifiedAt: job!.completedAt ?? job!.updatedAt };
  }
  if (capability.route.kind !== 'local' || !workflow || (!record.previewAssetId && !record.posterAssetId)) fail('Local demonstrations require an implemented local route, a workflow reference and a managed visual or audio capture.');
  if (record.jobId || record.requestId) fail('Local demonstrations cannot claim remote execution references.');
  if (record.takeId && store.getTake(record.takeId)?.projectId !== projectId) fail('Local take does not belong to this project.');
  return { ...record, verifiedAt: record.verifiedAt ?? new Date().toISOString() };
}
export function expandDemonstration(store: Store, record: CatalogueDemonstration): CatalogueDemonstrationView {
  const asset = (id?: string) => id && store.getAsset(id)?.projectId === record.projectId ? store.getAsset(id) : undefined;
  const posterAsset = asset(record.posterAssetId), previewAsset = asset(record.previewAssetId),take=record.takeId?store.getTake(record.takeId):undefined;
  const sourcePrompt=take?.projectId===record.projectId?take.prompt.slice(0,4000):undefined;
  return redactSignedMediaLinks({ ...record, sourcePrompt, posterAsset, previewAsset, inputAssets: record.inputAssetIds.flatMap(id => asset(id) ?? []), outputAssets: record.outputAssetIds.flatMap(id => asset(id) ?? []), posterUrl: posterAsset?.url, previewUrl: previewAsset?.url }) as CatalogueDemonstrationView;
}
export function saveDemonstration(store: Store, projectId: string, record: CatalogueDemonstration) {
  const project = store.getProject(projectId)!;
  const existing = project.catalogueDemonstrations?.find(item => item.id === record.id);
  if (existing && !isDeepStrictEqual(existing, record)) throw Object.assign(new Error('This demonstration identity already has different content. Use a new identity for a new demonstration.'), { status: 409 });
  if (!existing) store.upsertProject({ ...project, catalogueDemonstrations: [...(project.catalogueDemonstrations ?? []), record], updatedAt: new Date().toISOString() });
  return expandDemonstration(store, existing ?? record);
}
