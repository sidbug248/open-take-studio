import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PIKA_MUSIC_MODEL, buildAudioGenerationInput, extractAudioGenerationMedia } from '../server/audio-generation-adapters.ts';
import { buildAudioNativeWorkflow, DUBBING_STANDARD_LANGUAGES, AUDIO_NATIVE_CONSTRAINTS } from '../server/audio-native-workflows.ts';
import { makeWorkflowVersion, rejectWorkflowSecrets } from '../server/workflow-schema.ts';
import { validateAgainstNodeInfo } from '../server/workflow-port.ts';

const musicSchema = JSON.parse(fs.readFileSync(new URL('../docs/schemas/pika--pika-music.json', import.meta.url), 'utf8'));
const nativeInfo = JSON.parse(fs.readFileSync(new URL('../docs/schemas/native-audio-nodes.json', import.meta.url), 'utf8'));
const modelId = 'pika/pika-music';
function boundNativeGraph(definition: ReturnType<typeof buildAudioNativeWorkflow>) {
  const graph = structuredClone(definition.apiGraph);
  for (const binding of definition.bindings) if (['image', 'video', 'audio'].includes(binding.kind)) graph[binding.nodeId]!.inputs[binding.inputName] = { __type: 'core/ASSET', info: { id: `fixture-${binding.key}` } };
  return graph;
}
const compose = (settings: Record<string, unknown> = {}, prompt = 'A gentle piano theme', inputData: Record<string, string | string[]> = {}) => buildAudioGenerationInput(modelId, { prompt, settings, inputData });

test('music uses a bounded explicit composition without hidden reference or rewriting calls', () => {
  assert.deepEqual(compose(), { prompt: 'A gentle piano theme', duration: 10, seed: -1, mode: 'text_to_music', rewrite_prompt: false });
  assert.equal(PIKA_MUSIC_MODEL.status, 'experimental');
  assert.equal(PIKA_MUSIC_MODEL.delivery, 'queue');
  assert.equal(PIKA_MUSIC_MODEL.inputs.length, 0);
  const inputSchema = musicSchema.paths['/v2/models/pika/pika-music'].post.requestBody.content['application/json'].schema;
  const request = compose({ duration: 360, lyrics: '  [Verse] An original line  ', seed: 2147483647 });
  for (const key of Object.keys(request)) assert.ok(Object.hasOwn(inputSchema.properties, key), key);
  for (const key of inputSchema.required) assert.ok(Object.hasOwn(request, key), key);
  assert.equal(request.lyrics, '[Verse] An original line');
  assert.ok(inputSchema.properties.mode.enum.includes(request.mode));
  assert.equal(inputSchema.properties.duration.maximum, 360);
  assert.equal(inputSchema.properties.duration.minimum, 10);
});

test('music rejects invalid cost-driving duration, seed and direction before submission', () => {
  for (const duration of [0, 9, 10.5, 361, Infinity, NaN, '30']) assert.throws(() => compose({ duration }), /duration/i);
  for (const seed of [-2, 1.1, 2147483648, NaN, '1']) assert.throws(() => compose({ seed }), /seed/i);
  assert.throws(() => compose({}, '  '), /direction/);
  assert.throws(() => compose({}, 'x'.repeat(4001)), /direction/);
  assert.throws(() => compose({ lyrics: 'x'.repeat(2001) }), /lyrics/);
  assert.throws(() => compose({ lyrics: ['not text'] }), /lyrics/);
});

test('music cannot silently escalate into references, covers or rewriting', () => {
  for (const settings of [{ mode: 'music_cover' }, { rewrite_prompt: true }, { reference_audio: 'https://example.invalid/private.wav' }, { source_audio: 'https://example.invalid/song.wav' }]) {
    assert.throws(() => compose(settings), /not supported/);
  }
  assert.throws(() => compose({}, 'A piano song', { reference_audio: 'data:audio/wav;base64,AAAA' }), /references/);
  assert.throws(() => buildAudioGenerationInput('veed/clean-audio', { prompt: '', settings: {}, inputData: {} }), /Unsupported/);
  assert.ok(!Object.hasOwn(compose({ lyrics: '   ' }), 'lyrics'));
});

const complete = (audio: Record<string, unknown> = { url: 'https://media.example.test/music.mp3', content_type: 'audio/mpeg' }) =>
  ({ id: 'media_fixture', status: 'completed', output: { media_type: 'audio', audio } });

test('music collects the documented native result envelope as durable audio', () => {
  assert.deepEqual(extractAudioGenerationMedia(modelId, complete()), [{
    url: 'https://media.example.test/music.mp3', mimeType: 'audio/mpeg', name: 'pika-music.mp3', kind: 'audio',
  }]);
  const path = musicSchema.paths['/v2/models/pika/pika-music'].post.responses['200'].content['application/json'].schema;
  const example = path.example;
  assert.equal(extractAudioGenerationMedia(modelId, example)[0]!.kind, 'audio');
  const missingMime = extractAudioGenerationMedia(modelId, complete({ url: 'https://media.example.test/output' }))[0]!;
  assert.equal(missingMime.mimeType, undefined);
  assert.equal(missingMime.name, 'pika-music-audio');
});

test('music never treats queued, failed, empty or wrong-media results as successful tracks', () => {
  for (const result of [
    { status: 'queued' }, { ...complete(), status: 'failed' }, { ...complete(), error: { code: 'provider_error' } },
    { status: 'completed', output: null }, { status: 'completed', output: { audio: {} } },
    { ...complete(), output: { media_type: 'video', audio: complete().output.audio } }, null, [],
  ]) assert.throws(() => extractAudioGenerationMedia(modelId, result));
  assert.throws(() => extractAudioGenerationMedia('other/model', complete()), /Unsupported/);
});

test('music result validation refuses credentialed or insecure URLs and non-audio MIME', () => {
  for (const url of ['http://media.example.test/music.mp3', 'https://user:password@media.example.test/music.mp3', 'https://media.example.test:8443/music.mp3', 'data:audio/wav;base64,AAAA', '', 42]) {
    assert.throws(() => extractAudioGenerationMedia(modelId, complete({ url, content_type: 'audio/mpeg' })));
  }
  assert.throws(() => extractAudioGenerationMedia(modelId, complete({ url: 'https://media.example.test/music.mp3', content_type: 'text/html' })), /content type/);
});

test('native audio presets retain editable nodes, typed media links and project-owned input bindings', () => {
  for (const kind of ['dubbing', 'cleanup'] as const) {
    const definition = buildAudioNativeWorkflow(kind);
    const version = makeWorkflowVersion(definition);
    assert.equal(version.target, 'comfy-cloud');
    assert.equal(version.outputNodeIds.join(','), '3');
    assert.equal(version.bindings.filter(binding => ['audio', 'video'].includes(binding.kind)).length, 1);
    assert.equal(validateAgainstNodeInfo(boundNativeGraph(version), nativeInfo).valid, true);
    const editor = version.editorGraph as Record<string, any>;
    assert.equal(editor.nodes.length, 3);
    assert.equal(editor.links.length, 2);
    assert.deepEqual(editor.nodes.map((node: any) => node.type), Object.values(version.apiGraph).map(node => node.class_type));
    for (const node of editor.nodes) {
      assert.deepEqual(node.outputs.map((output: any) => output.type), nativeInfo[node.type].output, `${node.type} output types`);
      assert.deepEqual(node.outputs.map((output: any) => output.name), nativeInfo[node.type].output_name, `${node.type} output names`);
    }
    // Derive the active save-widget sequence from the actual nested V3 schema,
    // including h264's encoding choice but excluding the legacy hidden codec.
    const save = editor.nodes.find((node: any) => node.id === 3);
    const saveInputs = version.apiGraph['3']!.inputs;
    const expectedSaveWidgets: unknown[] = [];
    const visitWidgets = (groups: any, prefix = '') => {
      for (const group of ['required', 'optional']) for (const [name, value] of Object.entries(groups?.[group] ?? {})) {
        const spec = value as any[], field = prefix + name;
        if (!Object.hasOwn(saveInputs, field) || spec[1]?.hidden || Array.isArray(saveInputs[field])) continue;
        expectedSaveWidgets.push(saveInputs[field]);
        if (spec[0] === 'COMFY_DYNAMICCOMBO_V3') {
          const selected = spec[1].options.find((option: any) => option.key === saveInputs[field]);
          assert.ok(selected, `Unsupported save widget ${field}`);
          visitWidgets(selected.inputs, field + '.');
        }
      }
    };
    visitWidgets(nativeInfo[save.type].input);
    assert.deepEqual(save.widgets_values, expectedSaveWidgets);
    const type = kind === 'dubbing' ? 'VIDEO' : 'AUDIO';
    assert.ok(editor.links.every((link: any[]) => link[5] === type));
    assert.doesNotThrow(() => rejectWorkflowSecrets(definition));
    const source = version.bindings.find(binding => binding.nodeId === '1')!;
    assert.equal(source.required, true);
    assert.equal(source.defaultValue, undefined);
  }
});

test('dubbing targets automatic translation rather than substituting supplied text or a lip-sync-only model', () => {
  const definition = buildAudioNativeWorkflow('dubbing', { targetLanguage: 'Urdu', sourceLanguage: 'English', seed: 7 });
  assert.equal(definition.apiGraph['2']!.class_type, 'VeedDubbingNode');
  assert.deepEqual(definition.apiGraph['2']!.inputs, {
    model: 'standard', 'model.video': ['1', 0], 'model.target_language': 'Urdu', 'model.source_language': 'English', 'model.seed': 7,
  });
  assert.equal(definition.outputKind, 'video');
  assert.equal(definition.apiGraph['3']!.inputs.format, 'mp4');
  assert.equal(definition.apiGraph['3']!.inputs['format.codec'], 'h264');
  assert.equal(AUDIO_NATIVE_CONSTRAINTS.dubbing.maxDurationSeconds, 599);
  assert.equal(AUDIO_NATIVE_CONSTRAINTS.dubbing.requiresAudioTrack, true);
});

test('dubbing language choices match the official Standard-mode schema and reject Pro-only accents', () => {
  const standard = nativeInfo.VeedDubbingNode.input.required.model[1].options.find((option: any) => option.key === 'standard');
  assert.deepEqual([...DUBBING_STANDARD_LANGUAGES], standard.inputs.required.target_language[1].options);
  for (const options of [
    { targetLanguage: 'English (US)' }, { sourceLanguage: 'invented-language' },
    { targetLanguage: 'English', sourceLanguage: 'English' }, { seed: .5 }, { seed: -1 },
  ]) assert.throws(() => buildAudioNativeWorkflow('dubbing', options));
});

test('cleanup keeps original-input loudness mode free of inactive normalization controls', () => {
  const definition = buildAudioNativeWorkflow('cleanup', { normalizeLoudness: false, strength: .5 });
  assert.equal(definition.apiGraph['2']!.class_type, 'VeedCleanAudioNode');
  assert.deepEqual(definition.apiGraph['2']!.inputs, { audio: ['1', 0], strength: .5, loudness: 'keep input level' });
  assert.ok(!definition.bindings.some(binding => binding.key === 'target_lufs'));
  assert.equal(definition.apiGraph['3']!.class_type, 'SaveAudioAdvanced');
  assert.equal(definition.apiGraph['3']!.inputs.format, 'flac');
  assert.equal(definition.outputKind, 'audio');
  assert.equal(AUDIO_NATIVE_CONSTRAINTS.cleanup.maxDurationSeconds, 1799);
  assert.equal(validateAgainstNodeInfo(boundNativeGraph(definition), nativeInfo).valid, true);
});

test('cleanup rejects out-of-range speech processing options', () => {
  for (const options of [{ strength: -1 }, { strength: 1.1 }, { strength: NaN }, { targetLufs: -41 }, { targetLufs: -7 }]) {
    assert.throws(() => buildAudioNativeWorkflow('cleanup', options));
  }
  assert.throws(() => buildAudioNativeWorkflow('cleanup', { normalizeLoudness: 'yes' as any }));
  const definition = buildAudioNativeWorkflow('cleanup', { strength: 0, targetLufs: -40 });
  assert.equal(definition.apiGraph['2']!.inputs.strength, 0);
  assert.equal(definition.apiGraph['2']!.inputs['loudness.target_lufs'], -40);
});

test('native schema fixture contains no workspace-specific loader file lists', () => {
  assert.deepEqual(nativeInfo.LoadAudio.input.required.audio[1].options, []);
  assert.deepEqual(nativeInfo.LoadVideo.input.required.file[1].options, []);
});
