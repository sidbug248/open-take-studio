import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import type { Asset } from '../shared/types.ts';
import type { WorkflowExecution } from '../shared/workflow-types.ts';
import { Store } from '../server/store.ts';
import { LocalFileStorage } from '../server/media.ts';
import { FilmMediaTools, mediaToolPaths, runMediaTool } from '../server/film-media.ts';
import { makeWorkflowVersion } from '../server/workflow-schema.ts';
import { buildAudioNativeWorkflow } from '../server/audio-native-workflows.ts';
import { buildImageTo3dWorkflow } from '../server/spatial-generation-adapters.ts';
import { validateNativeInferenceInputs } from '../server/native-inference-preflight.ts';

function pcmWave(seconds: number, sampleRate = 8000): Buffer {
  const length = Math.round(seconds * sampleRate) * 2;
  const bytes = Buffer.alloc(44 + length);
  bytes.write('RIFF', 0); bytes.writeUInt32LE(36 + length, 4); bytes.write('WAVEfmt ', 8);
  bytes.writeUInt32LE(16, 16); bytes.writeUInt16LE(1, 20); bytes.writeUInt16LE(1, 22);
  bytes.writeUInt32LE(sampleRate, 24); bytes.writeUInt32LE(sampleRate * 2, 28);
  bytes.writeUInt16LE(2, 32); bytes.writeUInt16LE(16, 34);
  bytes.write('data', 36); bytes.writeUInt32LE(length, 40);
  return bytes;
}

let directory: string;
let store: Store;
let media: LocalFileStorage;
let audio: Asset, video: Asset, silentVideo: Asset, image: Asset, foreignAudio: Asset, overlongAudio: Asset;

before(async () => {
  const parent = path.resolve('data/test-fixtures');
  await mkdir(parent, {recursive: true});
  directory = await mkdtemp(path.join(parent, 'native-preflight-'));
  store = new Store(directory);
  media = new LocalFileStorage(directory);
  const now = new Date().toISOString();
  for (const id of ['p', 'other']) store.upsertProject({id, name: id, description: '', createdAt: now, updatedAt: now});
  const save = async (input: Parameters<LocalFileStorage['put']>[0]) => {
    const asset = await media.put(input); store.upsertAsset(asset); return asset;
  };
  audio = await save({projectId: 'p', name: 'short.wav', mimeType: 'audio/wav', provenance: 'local-edit', bytes: pcmWave(.25), metadata: {duration: 99999}});
  foreignAudio = await save({projectId: 'other', name: 'other.wav', mimeType: 'audio/wav', provenance: 'local-edit', bytes: pcmWave(.25)});
  // A legal, tiny 8 Hz PCM container expresses the boundary duration without
  // generating or storing 30 minutes of ordinary-rate test audio.
  overlongAudio = await save({projectId: 'p', name: 'duration-boundary.wav', mimeType: 'audio/wav', provenance: 'local-edit', bytes: pcmWave(1800, 8), metadata: {duration: 1}});
  image = await save({projectId: 'p', name: 'source.png', mimeType: 'image/png', provenance: 'local-edit', bytes: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a3X8AAAAASUVORK5CYII=', 'base64')});
  const {ffmpeg} = mediaToolPaths();
  const videoBytes = await runMediaTool(ffmpeg, [
    '-nostdin', '-v', 'error', '-f', 'lavfi', '-i', 'color=c=blue:s=32x32:r=10:d=0.4',
    '-f', 'lavfi', '-i', 'sine=frequency=220:sample_rate=8000:duration=0.4',
    '-shortest', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-movflags', 'frag_keyframe+empty_moov', '-threads', '1', '-f', 'mp4', 'pipe:1',
  ]);
  video = await save({projectId: 'p', name: 'speech-track.mp4', mimeType: 'video/mp4', provenance: 'local-edit', bytes: videoBytes, metadata: {duration: 99999}});
  const silentBytes = await runMediaTool(ffmpeg, [
    '-nostdin', '-v', 'error', '-protocol_whitelist', 'file,pipe', '-i', media.path(video),
    '-c:v', 'copy', '-an', '-movflags', 'frag_keyframe+empty_moov', '-f', 'mp4', 'pipe:1',
  ]);
  silentVideo = await save({projectId: 'p', name: 'silent.mp4', mimeType: 'video/mp4', provenance: 'local-edit', bytes: silentBytes});
});
after(async () => {
  store?.close();
  if (directory) {
    assert.equal(path.dirname(directory), path.resolve('data/test-fixtures'));
    await rm(directory, {recursive: true, force: true});
  }
});

test('native preflight probes real short media instead of trusting stored duration metadata', async () => {
  const count = store.listAssets('p').length;
  await validateNativeInferenceInputs(makeWorkflowVersion(buildAudioNativeWorkflow('cleanup')), {audio: {assetId: audio.id}}, store, media, 'p');
  await validateNativeInferenceInputs(makeWorkflowVersion(buildAudioNativeWorkflow('dubbing')), {video: {assetId: video.id}}, store, media, 'p');
  await validateNativeInferenceInputs(makeWorkflowVersion(buildImageTo3dWorkflow()), {source_image: {assetId: image.id}}, store, media, 'p');
  assert.equal(store.listAssets('p').length, count);
  assert.equal(store.listJobs().length, 0);
});

test('dubbing refuses a real video that has no audio track before it can be uploaded', async () => {
  await assert.rejects(
    validateNativeInferenceInputs(makeWorkflowVersion(buildAudioNativeWorkflow('dubbing')), {video: {assetId: silentVideo.id}}, store, media, 'p'),
    /audio track/,
  );
});

test('native inputs require a saved asset with the binding kind in the explicit project', async () => {
  const definition = makeWorkflowVersion(buildAudioNativeWorkflow('cleanup'));
  const cases: WorkflowExecution['values'][] = [{audio: {assetId: foreignAudio.id}}, {audio: {assetId: video.id}}, {audio: {assetId: 'missing'}}, {audio: 'upload.wav'}, {}];
  for (const values of cases) {
    await assert.rejects(validateNativeInferenceInputs(definition, values, store, media, 'p'), /Choose|saved audio/);
  }
  await assert.rejects(validateNativeInferenceInputs(definition, {audio: {assetId: audio.id}}, store, media, 'missing-project'), /Project not found/);
});

test('cleanup measures and rejects an overlong audio container even when metadata says it is short', async () => {
  await assert.rejects(
    validateNativeInferenceInputs(makeWorkflowVersion(buildAudioNativeWorkflow('cleanup')), {audio: {assetId: overlongAudio.id}}, store, media, 'p'),
    /1799 seconds/,
  );
});

test('dubbing enforces its measured 599-second provider ceiling', async context => {
  const inspect = context.mock.method(FilmMediaTools.prototype, 'inspect', async () => ({
    duration: 600, width: 32, height: 32, frameRate: 10, hasAudio: true,
  }));
  try {
    await assert.rejects(
      validateNativeInferenceInputs(makeWorkflowVersion(buildAudioNativeWorkflow('dubbing')), {video: {assetId: video.id}}, store, media, 'p'),
      /599 seconds/,
    );
    assert.equal(inspect.mock.calls.length, 1);
  } finally { inspect.mock.restore(); }
});

test('Meshy validates per-run texture direction and excludes simultaneous texture-image guidance', async () => {
  const definition = makeWorkflowVersion(buildImageTo3dWorkflow());
  await assert.rejects(validateNativeInferenceInputs(definition, {source_image: {assetId: image.id}, texture_prompt: 'x'.repeat(601)}, store, media, 'p'), /600 characters/);
  const withTextureImage = structuredClone(definition);
  withTextureImage.apiGraph['2'].inputs['should_texture.texture_image'] = ['1', 0];
  await assert.rejects(validateNativeInferenceInputs(withTextureImage, {source_image: {assetId: image.id}, texture_prompt: 'copper'}, store, media, 'p'), /not both/);
  await validateNativeInferenceInputs(withTextureImage, {source_image: {assetId: image.id}, texture_prompt: ''}, store, media, 'p');
  const wrongSocket = structuredClone(definition);
  wrongSocket.apiGraph['1'].class_type = 'LoadVideo';
  wrongSocket.apiGraph['1'].inputs = {file: 'source.mp4'};
  wrongSocket.bindings[0] = {key: 'source_image', label: 'Source', nodeId: '1', inputName: 'file', kind: 'video', required: true};
  await assert.rejects(validateNativeInferenceInputs(wrongSocket, {source_image: {assetId: video.id}}, store, media, 'p'), /image loader output/);
});

test('preflight leaves transformed upstream media to workflow runtime validation', async context => {
  const definition = makeWorkflowVersion(buildAudioNativeWorkflow('dubbing'));
  definition.apiGraph['4'] = {class_type: 'CustomVideoTransform', inputs: {video: ['1', 0]}};
  definition.apiGraph['2'].inputs['model.video'] = ['4', 0];
  const inspect = context.mock.method(FilmMediaTools.prototype, 'inspect', async () => {
    throw new Error('A transformed upstream stream must not be confused with the original loader.');
  });
  try {
    await validateNativeInferenceInputs(definition, {video: {assetId: silentVideo.id}}, store, media, 'p');
    assert.equal(inspect.mock.calls.length, 0);
  } finally { inspect.mock.restore(); }
});

test('an omitted optional local binding can retain an existing Cloud source', async context => {
  const definition = makeWorkflowVersion(buildAudioNativeWorkflow('dubbing'));
  definition.bindings.find(binding => binding.key === 'video')!.required = false;
  definition.apiGraph['1'].inputs.file = 'already-uploaded-cloud-video.mp4';
  const inspect = context.mock.method(FilmMediaTools.prototype, 'inspect', async () => {
    throw new Error('There are no local source bytes to inspect for this Cloud input.');
  });
  try {
    await validateNativeInferenceInputs(definition, {}, store, media, 'p');
    assert.equal(inspect.mock.calls.length, 0);
  } finally { inspect.mock.restore(); }
});
