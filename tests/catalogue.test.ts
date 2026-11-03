import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { Store } from '../server/store.ts';
import { buildCatalogue, CAPABILITY_INVENTORY } from '../server/catalogue-routes.ts';
import { CAPABILITY_FAMILIES } from '../shared/capability-inventory.ts';
import { buildModelInput, extractModelMedia, MODEL_REGISTRY, validateSupportedSettings } from '../server/model-registry.ts';
import { listModelDependencies, validateModelDependencies } from '../server/model-dependencies.ts';
import { audioDuration, validateAssetConstraints } from '../server/input-validation.ts';
import type { Asset } from '../shared/types.ts';
import type { Job, Take } from '../shared/types.ts';
import { validateDemonstration, saveDemonstration } from '../server/catalogue-demonstrations.ts';
import type { CatalogueDemonstration } from '../shared/catalogue-types.ts';

const base = path.resolve('data/test-fixtures');
function fixture() {
  mkdirSync(base, { recursive: true });
  const dir = mkdtempSync(path.join(base, 'catalogue-'));
  const store = new Store(dir);
  const now = new Date().toISOString();
  for (const id of ['project-a', 'project-b']) store.upsertProject({ id, name: id, description: '', createdAt: now, updatedAt: now });
  function completed(modelId: string, result: unknown, settings: Record<string, unknown> = {}, projectId = 'project-a', inputAssetIds: Record<string, string> = {}) {
    const take: Take = { id: randomUUID(), projectId, name: 'Saved generated take', modelId, provider: modelId.split('/')[0]!, prompt: 'Fixture', settings, inputAssetIds, assetIds: [], status: 'COMPLETED', kind: MODEL_REGISTRY.find(model => model.id === modelId)!.kind, provenance: 'generated', favorite: false, createdAt: now, updatedAt: now, changes: [] };
    const job: Job = { id: randomUUID(), projectId, takeId: take.id, modelId, provider: take.provider, requestId: randomUUID(), idempotencyKey: randomUUID(), inputs: {}, state: 'COMPLETED', attempts: 1, createdAt: now, updatedAt: now, result };
    take.jobId = job.id;
    const assetId = randomUUID();
    take.assetIds = [assetId];
    store.upsertAsset({ id: assetId, projectId, name: 'Fixture asset', kind: take.kind, mimeType: take.kind === '3d' ? 'model/gltf-binary' : 'video/mp4', fileName: `${assetId}.glb`, size: 20, sha256: 'a'.repeat(64), provenance: 'generated', createdAt: now, metadata: {}, url: `/media/${assetId}.glb` });
    store.saveTakeAndJob(take, job);
    return { take, job };
  }
  return { store, completed, close() { store.close(); assert.ok(dir.startsWith(base + path.sep)); rmSync(dir, { recursive: true, force: true }); } };
}

test('catalogue covers every family, separates schema discovery from execution and exposes no launch for unadapted models', () => {
  const f = fixture();
  try {
    const result = buildCatalogue(f.store);
    assert.equal(CAPABILITY_FAMILIES.length, 12);
    assert.equal(new Set(CAPABILITY_INVENTORY.map(item => item.id)).size, CAPABILITY_INVENTORY.length);
    for (const family of CAPABILITY_FAMILIES) assert.ok(result.capabilities.some(item => item.family === family.id));
    assert.equal(result.models.length, result.snapshot.modelCount);
    assert.ok(result.models.length >= 253);
    for (const model of result.models.filter(model => !model.adapterAvailable)) {
      assert.equal(model.readiness, 'planned');
      assert.deepEqual(model.capabilityIds, []);
      assert.ok(model.schemaUrl.startsWith('https://api.comfy.org/v2/models/'));
    }
    for (const item of result.capabilities.filter(item => item.route.kind === 'planned')) { assert.ok(item.requirements.length); assert.equal(item.route.modelId, undefined); }
    const filtered = buildCatalogue(f.store, { q: 'rigging', provider: 'meshy', media: '3d' });
    assert.ok(filtered.models.some(model => model.id === 'meshy/rigging'));
    assert.ok(filtered.models.every(model => model.provider === 'meshy'));
    assert.equal(buildCatalogue(f.store, { q: 'no-such-outcome-002939' }).models.length, 0);
  } finally { f.close(); }
});

test('saved I2V proof does not claim text-to-video, bridging or archived-generation readiness', () => {
  const f = fixture();
  try {
    const first = f.completed('minimax/minimax-h3', {}, {}, 'project-a', { first_frame: 'selected-frame' });
    let catalog = buildCatalogue(f.store);
    assert.equal(catalog.capabilities.find(item => item.id === 'video-image')?.lastVerified?.kind, 'live-generation');
    for (const id of ['video-text', 'video-keyframes', 'video-references']) assert.equal(catalog.capabilities.find(item => item.id === id)?.readiness, 'experimental');
    assert.equal(catalog.capabilities.find(item => item.id === 'video-regenerate')?.readiness, 'experimental');
    assert.equal(catalog.capabilities.find(item => item.id === 'video-image')?.examples[0]?.requestId, first.job.requestId);
    f.store.archiveJob(first.job.id);
    catalog = buildCatalogue(f.store);
    assert.equal(catalog.capabilities.find(item => item.id === 'video-image')?.readiness, 'experimental');
    const sync = f.completed('elevenlabs/eleven_sfx_v2', { kind: 'binary' });
    f.store.upsertJob({ ...sync.job, requestId: undefined, delivery: 'sync', resultMetadata: { requestId: 'actual-sync-http-reference' } });
    const sound = buildCatalogue(f.store).capabilities.find(item => item.id === 'sound-effects');
    assert.equal(sound?.lastVerified?.kind, 'live-generation');
    assert.equal(sound?.examples[0]?.requestId, 'actual-sync-http-reference');
  } finally { f.close(); }
});

test('canonical catalogue modalities and explicit intention prevent unrelated proof from certifying outcomes', () => {
  const f = fixture();
  try {
    f.completed('synclabs/sync-3', {}, {}, 'project-a', { video: 'performance', audio: 'speech' });
    const reference = f.completed('bfl/flux-3-image', {}, {}, 'project-a', { images: 'reference-image' });
    const full = buildCatalogue(f.store);
    assert.equal(full.capabilities.find(item => item.id === 'dubbing')!.examples.length, 0);
    for (const id of ['reference-sheet', 'product-imagery']) assert.equal(full.capabilities.find(item => item.id === id)!.examples.length, 0);
    assert.equal(full.capabilities.find(item => item.id === 'image-reference-edit')!.examples[0]!.takeId, reference.take.id);
    assert.ok(buildCatalogue(f.store, { media: 'mesh' }).capabilities.some(item => item.id === 'mesh-draft'));
    assert.ok(buildCatalogue(f.store, { media: 'vector' }).capabilities.some(item => item.id === 'image-vector'));
    assert.ok(buildCatalogue(f.store, { media: 'playable' }).capabilities.some(item => item.id === 'interactive-film'));
    assert.ok(buildCatalogue(f.store, { media: 'text' }).capabilities.some(item => item.id === 'speech-captions'));
    assert.ok(buildCatalogue(f.store, { media: 'audio' }).capabilities.some(item => item.id === 'speech-captions'));
    assert.ok(!buildCatalogue(f.store, { media: 'image' }).capabilities.some(item => item.id === 'video-image'));
    for (const item of full.capabilities) assert.ok(item.inputModalities && item.outputModalities && item.demonstrations);
  } finally { f.close(); }
});

test('curated generation demos retain exact execution, reject cross-project previews and survive store reopen', () => {
  const f = fixture();
  try {
    const source = f.completed('bfl/flux-3-image', {}), output = f.completed('bfl/flux-3-image', {}, {}, 'project-a', { images: source.take.assetIds[0]! });
    const foreign = f.completed('bfl/flux-3-image', {}, {}, 'project-b');
    const capability = CAPABILITY_INVENTORY.find(item => item.id === 'reference-sheet')!;
    const draft: CatalogueDemonstration = { id: 'reference-study-demo', projectId: 'project-a', capabilityId: 'reference-sheet', operationId: 'cast.reference-sheet', title: 'Intentional wardrobe reference sheet', previewKind: 'image', previewAssetId: output.take.assetIds[0], inputAssetIds: source.take.assetIds, outputAssetIds: output.take.assetIds, takeId: output.take.id, verificationKind: 'generation', attribution: { creator: 'Studio fixture', source: 'studio-original' }, createdAt: new Date().toISOString() };
    const record = validateDemonstration(f.store, draft, capability, 'project-a');
    assert.equal(record.requestId, output.job.requestId); assert.equal(record.jobId, output.job.id);
    saveDemonstration(f.store, 'project-a', record);
    assert.equal(saveDemonstration(f.store, 'project-a', record).id, record.id);
    assert.throws(() => saveDemonstration(f.store, 'project-a', { ...record, title: 'Different intent' }), /different content/);
    assert.equal(buildCatalogue(f.store).capabilities.find(item => item.id === 'reference-sheet')!.demonstrations[0]!.previewAsset!.id, output.take.assetIds[0]);
    assert.throws(() => validateDemonstration(f.store, { ...draft, posterAssetId: foreign.take.assetIds[0] }, capability, 'project-a'), /belong to this project/);
    assert.throws(() => validateDemonstration(f.store, { ...draft, operationId: 'image.edit.reference' }, capability, 'project-a'), /exact capability/);
    assert.throws(() => validateDemonstration(f.store, { ...draft, requestId: 'forged' }, capability, 'project-a'), /request reference/);
    const reopened = new Store(f.store.dataDir); try { assert.equal(reopened.getProject('project-a')!.catalogueDemonstrations![0]!.id, draft.id); } finally { reopened.close(); }
    f.store.archiveJob(output.job.id);
    assert.equal(buildCatalogue(f.store).capabilities.find(item => item.id === 'reference-sheet')!.demonstrations.length, 0);
  } finally { f.close(); }
});

test('Meshy stage snapshots contain only the fields sent for that mode', () => {
  const preview = buildModelInput('meshy/meshy-7.1', { prompt: 'A standing toy explorer', settings: {}, inputData: {} });
  assert.equal(preview.mode, 'preview');
  assert.equal(preview.geometry_resolution, 'standard');
  assert.equal(preview.texture_resolution, undefined);
  assert.equal(preview.preview_task_id, undefined);
  const settings = validateSupportedSettings('meshy/meshy-7.1', { mode: 'refine', preview_task_id: 'native-preview', geometry_resolution: '4k', texture_resolution: '4k', enable_pbr: true });
  assert.equal(settings.geometry_resolution, undefined);
  const refine = buildModelInput('meshy/meshy-7.1', { prompt: 'Warm yellow raincoat', settings, inputData: { texture_image_url: 'data:image/png;base64,YQ==' } });
  assert.deepEqual(refine, { mode: 'refine', preview_task_id: 'native-preview', texture_resolution: '4k', enable_pbr: true, moderation: false, texture_prompt: 'Warm yellow raincoat', texture_image_url: 'data:image/png;base64,YQ==' });
  assert.throws(() => buildModelInput('meshy/meshy-7.1', { prompt: '', settings: {}, inputData: {} }), /needs a prompt/);
  assert.throws(() => buildModelInput('meshy/meshy-7.1', { prompt: 'Preview', settings: {}, inputData: { texture_image_url: 'data:image/png;base64,YQ==' } }), /only supported in refine/);
  assert.throws(() => buildModelInput('meshy/meshy-7.1', { prompt: '', settings: { mode: 'refine' }, inputData: {} }), /preview task ID/);
});

test('original local comic compositions are discoverable without treating arbitrary or imported edits as page-render proof', () => {
  const f = fixture();
  try {
    const generated = f.completed('bfl/flux-3-image', {}), asset = f.store.getAsset(generated.take.assetIds[0]!)!;
    f.store.upsertAsset({ ...asset, provenance: 'local-edit' });
    const page = { ...generated.take, modelId: 'local/manual-edit', provider: 'local', jobId: undefined, status: 'LOCAL' as const, provenance: 'local-edit' as const, settings: { operation: 'storyboard-page' } };
    f.store.upsertTake(page);
    let capability = buildCatalogue(f.store).capabilities.find(item => item.id === 'story-pages')!;
    assert.equal(capability.examples[0]?.takeId, page.id); assert.equal(capability.lastVerified?.kind, 'local-validation');
    f.store.upsertTake({ ...page, settings: { operation: 'other-edit' } });
    assert.equal(buildCatalogue(f.store).capabilities.find(item => item.id === 'story-pages')!.examples.length, 0);
    f.store.upsertTake({ ...page, provenance: 'imported' });
    assert.equal(buildCatalogue(f.store).capabilities.find(item => item.id === 'story-pages')!.examples.length, 0);
  } finally { f.close(); }
});

test('Meshy predecessor validation rejects cross-project, archived, failed, wrong-stage and forged IDs', () => {
  const f = fixture();
  try {
    const preview = f.completed('meshy/meshy-7.1', { status: 'SUCCEEDED', type: 'text-to-3d-preview', id: 'preview-id' }, { art_style: 'sculpture' });
    const request = { modelId: 'meshy/meshy-7.1', projectId: 'project-a', settings: { mode: 'refine', preview_task_id: 'preview-id' } };
    assert.equal(validateModelDependencies(f.store, request)?.takeId, preview.take.id);
    assert.throws(() => validateModelDependencies(f.store, { ...request, projectId: 'project-b' }), /from this project/);
    assert.throws(() => validateModelDependencies(f.store, { ...request, settings: { ...request.settings, preview_task_id: preview.job.requestId } }), /from this project/);
    assert.throws(() => validateModelDependencies(f.store, { ...request, settings: { ...request.settings, enable_pbr: true } }), /sculpture/);
    assert.throws(() => validateModelDependencies(f.store, { ...request, modelId: 'meshy/rigging', settings: { input_task_id: 'preview-id' } }), /refine/);
    assert.throws(() => validateModelDependencies(f.store, { ...request, parentTakeId: 'other' }), /parent take/);
    assert.throws(() => validateModelDependencies(f.store, { ...request, sourceAssetId: 'other' }), /Source asset/);
    f.store.upsertJob({ ...preview.job, state: 'FAILED' });
    assert.deepEqual(listModelDependencies(f.store, 'project-a'), []);
    f.store.upsertJob(preview.job); f.store.archiveJob(preview.job.id);
    assert.deepEqual(listModelDependencies(f.store, 'project-a'), []);
    f.completed('meshy/meshy-7.1', { status: 'SUCCEEDED', type: 'text-to-3d-preview', id: 'expired-id', expires_at: Date.now() - 1 });
    assert.deepEqual(listModelDependencies(f.store, 'project-a'), []);
  } finally { f.close(); }
});

test('Meshy refine, rig and animation preserve native task boundaries and GLB output kinds', () => {
  const f = fixture();
  try {
    const refined = f.completed('meshy/meshy-7.1', { status: 'SUCCEEDED', type: 'text-to-3d-refine', id: 'refined' });
    const rig = f.completed('meshy/rigging', { status: 'SUCCEEDED', type: 'rig', id: 'rigged' });
    assert.equal(validateModelDependencies(f.store, { modelId: 'meshy/rigging', projectId: 'project-a', settings: { input_task_id: 'refined' } })?.takeId, refined.take.id);
    assert.equal(validateModelDependencies(f.store, { modelId: 'meshy/animations', projectId: 'project-a', settings: { rig_task_id: 'rigged' } })?.takeId, rig.take.id);
    assert.deepEqual(buildModelInput('meshy/rigging', { prompt: '', settings: { input_task_id: 'refined' }, inputData: {} }), { input_task_id: 'refined', height_meters: 1.7 });
    const files = extractModelMedia('meshy/rigging', { status: 'SUCCEEDED', result: { rigged_character_glb_url: 'https://example.com/rig.glb', basic_animations: { walking_glb_url: 'https://example.com/walk.glb', running_glb_url: 'https://example.com/run.glb' } } });
    assert.deepEqual(files.map(file => [file.name, file.kind]), [['rigged-character.glb', '3d'], ['walking.glb', '3d'], ['running.glb', '3d']]);
    assert.equal(extractModelMedia('meshy/animations', { status: 'SUCCEEDED', result: { animation_glb_url: 'https://example.com/action.glb' } })[0]?.kind, '3d');
    assert.throws(() => extractModelMedia('meshy/animations', { status: 'SUCCEEDED', result: { animation_fbx_url: 'https://example.com/action.fbx' } }), /without a supported GLB/);
    assert.throws(() => extractModelMedia('meshy/rigging', { status: 'FAILED', task_error: { message: 'Not a humanoid' } }), /Not a humanoid/);
  } finally { f.close(); }
});

test('LTX exact native response and error states are respected', () => {
  assert.deepEqual(buildModelInput('ltx/ltx-2-5-fast', { prompt: 'A ribbon of light', settings: {}, inputData: {} }), { prompt: 'A ribbon of light', duration: 4, fps: 25, resolution: '1280x720', generate_audio: true });
  assert.equal(extractModelMedia('ltx/ltx-2-5-fast', { status: 'completed', result: { video_url: 'https://example.com/motion.mp4' } })[0]?.mimeType, 'video/mp4');
  assert.throws(() => extractModelMedia('ltx/ltx-2-5-fast', { status: 'failed', error: { type: 'invalid_duration', message: 'Unsupported duration at this resolution' } }), /Unsupported duration/);
  assert.throws(() => buildModelInput('ltx/ltx-2-5-fast', { prompt: 'Move', settings: {}, inputData: { image: 'data:image/png;base64,YQ==' } }), /not a supported input/);
});

test('Kling extension uses a successful same-project native video ID, never task or request IDs', () => {
  const f = fixture();
  try {
    const result = { code: 0, data: { task_id: 'task-123', task_status: 'succeed', task_result: { videos: [{ id: 'video-123', url: 'https://example.com/clip.mp4', duration: '5' }] } } };
    const generated = f.completed('kling/kling-v2-6', result);
    assert.equal(extractModelMedia('kling/kling-v2-6', result)[0]!.kind, 'video');
    const body = buildModelInput('kling/kling-v2-6', { prompt: 'A forest at dawn', settings: { camera_movement: 'forward_up' }, inputData: {} });
    assert.deepEqual(body.camera_control, { type: 'forward_up' }); assert.equal(body.camera_movement, undefined); assert.equal(body.model_name, undefined);
    const request = { modelId: 'kling/videos-video-extend', projectId: 'project-a', settings: { video_id: 'video-123' } };
    assert.equal(validateModelDependencies(f.store, request)!.takeId, generated.take.id);
    for (const wrong of ['task-123', generated.job.requestId]) assert.throws(() => validateModelDependencies(f.store, { ...request, settings: { video_id: wrong } }), /from this project/);
    assert.throws(() => validateModelDependencies(f.store, { ...request, projectId: 'project-b' }), /from this project/);
    assert.throws(() => extractModelMedia('kling/videos-video-extend', { code: 0, data: { task_status: 'failed', task_status_msg: 'Cannot extend this model' } }), /Cannot extend/);
    f.store.archiveJob(generated.job.id); assert.throws(() => validateModelDependencies(f.store, request), /from this project/);
  } finally { f.close(); }
});

test('H3 preflight preserves distinct keyframe, reference and 2K regeneration modes', () => {
  const image = 'data:image/png;base64,YQ==', video = 'data:video/mp4;base64,YQ==', audio = 'data:audio/wav;base64,YQ==';
  assert.throws(() => buildModelInput('minimax/minimax-h3', { prompt: 'Scene', settings: {}, inputData: { reference_audio: audio } }), /requires an image or video/);
  assert.throws(() => buildModelInput('minimax/minimax-h3', { prompt: 'Scene', settings: {}, inputData: { reference_image: Array(10).fill(image) } }), /at most 9/);
  assert.throws(() => buildModelInput('minimax/minimax-h3', { prompt: 'Scene', settings: {}, inputData: { base_video: video } }), /regeneration is unavailable/);
  assert.throws(() => buildModelInput('minimax/minimax-h3', { prompt: 'Scene', settings: { resolution: '2K' }, inputData: { base_video: video, reference_image: image } }), /regeneration is unavailable/);
});

test('transcription uses exact inline audio and stores only complete final text, never safety or thought content', () => {
  const body = buildModelInput('vertexai/gemini-3.1-flash-lite', { prompt: '', settings: {}, inputData: { audio: 'data:audio/wav;base64,YQ==' } });
  assert.deepEqual((body.contents as any[])[0].parts[0], { inlineData: { mimeType: 'audio/wav', data: 'YQ==' } });
  assert.deepEqual((body.generationConfig as any).responseModalities, ['TEXT']);
  const media = extractModelMedia('vertexai/gemini-3.1-flash-lite', { candidates: [{ finishReason: 'STOP', content: { parts: [{ thought: true, text: 'Internal draft' }, { text: 'The sea gate is open.' }] } }] });
  assert.equal(media[0]!.kind, 'document'); assert.equal(Buffer.from(media[0]!.bytes!).toString(), 'The sea gate is open.\n');
  assert.throws(() => extractModelMedia('vertexai/gemini-3.1-flash-lite', { promptFeedback: { blockReason: 'SAFETY' }, usageMetadata: {} }), /SAFETY/);
  assert.throws(() => extractModelMedia('vertexai/gemini-3.1-flash-lite', { candidates: [{ finishReason: 'MAX_TOKENS', content: { parts: [{ text: 'A partial' }] } }] }), /MAX_TOKENS/);
});

test('native regeneration proof requires the exact owned 2K partner node, not an unrelated native graph', () => {
  const f = fixture();
  try {
    const source = f.completed('minimax/minimax-h3', {}), output = f.completed('minimax/minimax-h3', {}, {}, 'project-a', { video: source.take.assetIds[0]! });
    const asset = f.store.getAsset(output.take.assetIds[0]!)!, versionId = randomUUID(), executedId = randomUUID();
    const version = { ...asset, id: versionId, kind: 'document' as const, metadata: { operation: 'comfy-workflow-version', workflowVersion: { apiGraph: { '2': { class_type: 'MinimaxHailuo03RegenerateNode', inputs: { 'model.resolution': '2K' } } } } } };
    f.store.upsertAsset(version); f.store.upsertAsset({ ...asset, id: executedId, kind: 'document' });
    f.store.upsertTake({ ...output.take, workflowVersionAssetId: versionId });
    f.store.upsertJob({ ...output.job, executionRoute: 'comfy-workflow', workflow: { versionAssetId: versionId, graphSha256: 'a'.repeat(64), target: 'comfy-cloud', values: {}, executedGraphAssetId: executedId } });
    const capability = CAPABILITY_INVENTORY.find(item => item.id === 'video-regenerate')!;
    const draft = { id: 'native-regeneration-proof', capabilityId: capability.id, operationId: 'workflow.video.regenerate.h3', title: 'Native regeneration proof', previewKind: 'video', projectId: 'project-a', previewAssetId: asset.id, inputAssetIds: source.take.assetIds, outputAssetIds: output.take.assetIds, takeId: output.take.id, jobId: output.job.id, workflowReference: { kind: 'native-workflow', toolView: 'workflow', nativeWorkflowId: versionId }, verificationKind: 'generation', attribution: { creator: 'Test fixture', source: 'studio-original' }, createdAt: output.take.createdAt };
    const record = validateDemonstration(f.store, draft, capability, 'project-a');
    assert.equal(record.requestId, output.job.requestId);
    assert.throws(() => validateDemonstration(f.store, { ...draft, operationId: 'workflow.execute' }, capability, 'project-a'), /exact version/);
    f.store.upsertAsset({ ...version, metadata: { ...version.metadata, workflowVersion: { apiGraph: { '2': { class_type: 'ImageScale', inputs: {} } } } } });
    assert.throws(() => validateDemonstration(f.store, draft, capability, 'project-a'), /exact 2K native regeneration node/);
  } finally { f.close(); }
});

test('outpainting uses schema margins and cleanup collects the native audio envelope', () => {
  const expansion = buildModelInput('bfl/flux-pro-1.0-expand', { prompt: 'Extend the sea', settings: { left: 128 }, inputData: { image: 'data:image/png;base64,YQ==' } });
  assert.equal(expansion.image, 'YQ=='); assert.equal(expansion.left, 128); assert.equal(expansion.top, 256);
  assert.throws(() => buildModelInput('bfl/flux-pro-1.0-expand', { prompt: '', settings: { top: 0 }, inputData: { image: 'data:image/png;base64,YQ==' } }), /positive expansion/);
  assert.throws(() => buildModelInput('bfl/flux-pro-1.0-expand', { prompt: '', settings: { right: 2049 }, inputData: { image: 'data:image/png;base64,YQ==' } }), /outside/);
  assert.throws(() => buildModelInput('veed/clean-audio', { prompt: '', settings: {}, inputData: { audio_url: 'https://example.com/input.wav' } }), /unavailable.*not served/);
  const audio = extractModelMedia('veed/clean-audio', { data: { status: 'COMPLETED', result: { audio: { url: 'https://example.com/clean.wav', content_type: 'audio/wav' } } } });
  assert.equal(audio[0]?.kind, 'audio'); assert.equal(audio[0]?.mimeType, 'audio/wav');
  assert.throws(() => extractModelMedia('veed/clean-audio', { data: { status: 'FAILED', error: { message: 'Recording too long' } } }), /Recording too long/);
});

test('exact Recraft variant omits controls admitted only by its shared Router schema', () => {
  const input = buildModelInput('recraft/recraftv4_1_vector', { prompt: 'A geometric seed', settings: {}, inputData: {} });
  assert.equal(input.controls, undefined);
  assert.throws(() => buildModelInput('recraft/recraftv4_1_vector', { prompt: 'A geometric seed', settings: { no_text: true }, inputData: {} }), /not supported/);
});

test('VEED preflight measures actual WAV duration instead of trusting browser metadata', async () => {
  function wav(seconds: number) {
    const size = 8000 * seconds, bytes = Buffer.alloc(44 + size, 128);
    bytes.write('RIFF', 0); bytes.writeUInt32LE(36 + size, 4); bytes.write('WAVEfmt ', 8); bytes.writeUInt32LE(16, 16); bytes.writeUInt16LE(1, 20); bytes.writeUInt16LE(1, 22); bytes.writeUInt32LE(8000, 24); bytes.writeUInt32LE(8000, 28); bytes.writeUInt16LE(1, 32); bytes.writeUInt16LE(8, 34); bytes.write('data', 36); bytes.writeUInt32LE(size, 40); return bytes;
  }
  const asset = { kind: 'audio', mimeType: 'audio/wav', metadata: { duration: 2 } } as unknown as Asset;
  assert.equal(await audioDuration(wav(2)), 2);
  await validateAssetConstraints('veed/clean-audio', { audio_url: asset }, async () => wav(2));
  await assert.rejects(validateAssetConstraints('veed/clean-audio', { audio_url: asset }, async () => wav(1801)), /thirty minutes/);
  await assert.rejects(audioDuration(Buffer.from('not an audio file')), /Media processing failed|no verifiable/);
});
