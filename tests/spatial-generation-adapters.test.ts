import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { buildImageTo3dWorkflow } from '../server/spatial-generation-adapters.ts';
import { makeWorkflowVersion } from '../server/workflow-schema.ts';
import { validateAgainstNodeInfo } from '../server/workflow-port.ts';
import { extractKlingMedia } from '../server/kling-adapter.ts';

const nodeInfo = JSON.parse(readFileSync(new URL('../docs/schemas/native-meshy-nodes.json', import.meta.url), 'utf8'));

test('image-to-3D uses the current native geometry socket and saves its real GLB output', () => {
  const template = buildImageTo3dWorkflow();
  const version = makeWorkflowVersion(template);
  const source = template.bindings.find(binding => binding.kind === 'image')!;
  assert.equal(source.inputName, 'image');
  assert.equal(template.apiGraph[source.nodeId].class_type, 'LoadImage');
  assert.equal(template.apiGraph['2'].class_type, 'MeshyImageToModelNode');
  assert.deepEqual(template.apiGraph['2'].inputs.image, [source.nodeId, 0]);
  assert.equal(Object.hasOwn(template.apiGraph['2'].inputs, 'texture_image_url'), false);
  const outputIndex = nodeInfo.MeshyImageToModelNode.output.indexOf('FILE_3D_GLB');
  assert.deepEqual(template.apiGraph['3'].inputs.mesh, ['2', outputIndex]);
  assert.equal(template.apiGraph['3'].class_type, 'SaveGLB');
  assert.equal(version.outputKind, '3d');
  assert.deepEqual(version.outputNodeIds, ['3']);
  const editor = template.editorGraph as any;
  assert.deepEqual(editor.links.find((link: any[]) => link[3] === 3), [2, 2, outputIndex, 3, 0, 'FILE_3D_GLB']);
  assert.equal(makeWorkflowVersion(JSON.parse(JSON.stringify(template))).graphSha256, version.graphSha256);
});

test('native image preset passes the recorded Cloud schema before a paid request', () => {
  for (const options of [{}, {textured: false}, {remesh: false}, {ultraMode: true, ultraResolution: '4k' as const, textureResolution: '8k' as const}]) {
    const graph = structuredClone(buildImageTo3dWorkflow(options).apiGraph);
    graph['1'].inputs.image = {__type: 'core/ASSET', info: {id: 'test-input-placeholder'}};
    const validation = validateAgainstNodeInfo(graph, nodeInfo);
    assert.equal(validation.valid, true, JSON.stringify(validation.issues));
    assert.equal(validation.nodes.find(node => node.classType === 'MeshyImageToModelNode')?.partnerNode, true);
  }
});

test('a geometry-only model does not retain texturing controls or request a texture pass', () => {
  const geometry = buildImageTo3dWorkflow({textured: false, remesh: false});
  assert.equal(geometry.apiGraph['2'].inputs.should_texture, 'false');
  assert.equal(geometry.apiGraph['2'].inputs.should_remesh, 'false');
  assert.equal(Object.keys(geometry.apiGraph['2'].inputs).some(key => key.startsWith('should_texture.') || key.startsWith('should_remesh.')), false);
  assert.equal(geometry.bindings.some(binding => binding.key === 'texture_prompt' || binding.key === 'polycount'), false);
  const editor = geometry.editorGraph as any;
  assert.deepEqual(editor.nodes.find((node: any) => node.id === 2).widgets_values, ['meshy-7.1', 'false', 'auto', 'false', '', 0, 'fixed', false, '2k']);
});

test('image geometry settings reject invalid provider limits and ignored paid controls', () => {
  for (const value of [
    {targetPolycount: 99}, {targetPolycount: 300001}, {targetPolycount: 25000.5},
    {seed: -1}, {seed: 2147483648}, {seed: 0.5},
    {texturePrompt: 'a'.repeat(601)}, {textureResolution: '16k'},
    {textured: false, enablePbr: true}, {textured: false, texturePrompt: 'copper'},
    {ultraMode: false, ultraResolution: '4k'}, {model: 'made-up-router-model'},
  ]) {
    assert.throws(() => buildImageTo3dWorkflow(value as any));
  }
});

test('workflow drafts do not share mutable graphs or binding arrays', () => {
  const first = buildImageTo3dWorkflow();
  first.apiGraph['2'].inputs.model = 'modified';
  first.bindings[0].label = 'modified';
  const next = buildImageTo3dWorkflow();
  assert.equal(next.apiGraph['2'].inputs.model, 'meshy-7.1');
  assert.equal(next.bindings[0].label, 'Source image');
});

const succeeded = (videos: unknown[]) => ({code: 0, data: {task_status: 'succeed', task_result: {videos}}});
test('Kling retains a completed video when the native result only supplies watermark_url', () => {
  const media = extractKlingMedia(succeeded([{id: 'native-video-id', duration: '10', watermark_url: 'https://cdn.example.test/completed.mp4'}]));
  assert.equal(media[0].url, 'https://cdn.example.test/completed.mp4');
  assert.equal(media[0].kind, 'video');
  assert.equal(media[0].mimeType, 'video/mp4');
  const preferred = extractKlingMedia(succeeded([{url: 'https://cdn.example.test/original.mp4', watermark_url: 'https://cdn.example.test/watermarked.mp4'}]));
  assert.equal(preferred[0].url, 'https://cdn.example.test/original.mp4');
});

test('Kling rejects unfinished tasks, empty results and non-HTTPS media', () => {
  for (const result of [
    {code: 0, data: {task_status: 'processing'}},
    {code: 0, data: {task_status: 'succeeded', task_result: {videos: [{url: 'https://cdn.example.test/result.mp4'}]}}},
    {code: 1100, message: 'provider refused', data: {task_status: 'succeed'}},
    succeeded([]), succeeded([{id: 'no-url', duration: '10'}]), succeeded([null]),
    succeeded([{url: 'http://cdn.example.test/result.mp4'}]),
    succeeded([{url: 'https://'}]),
    succeeded([{url: 'https://credential@example.test/result.mp4'}]),
    succeeded([{watermark_url: 'file:///tmp/result.mp4'}]),
  ]) assert.throws(() => extractKlingMedia(result));
});
