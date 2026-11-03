import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { MODEL_REGISTRY, buildModelInput, extractModelMedia, validateSupportedSettings } from '../server/model-registry.js';

const image = 'data:image/png;base64,aGVsbG8=';
const video = 'data:video/mp4;base64,aGVsbG8=';

// Checks request shapes against the actual cached Router schemas, including the
// provider's union/ref requirements, rather than a duplicate hand-written type.
function checkSchema(value: unknown, schema: any, document: any, at = '$'): void {
  if (schema.$ref) return checkSchema(value, schema.$ref.split('/').slice(1).reduce((node: any, key: string) => node[key], document), document, at);
  if (schema.allOf) for (const part of schema.allOf) checkSchema(value, part, document, at);
  if (schema.anyOf || schema.oneOf) {
    const matches = (schema.anyOf ?? schema.oneOf).filter((part: any) => {
      try { checkSchema(value, part, document, at); return true; } catch { return false; }
    });
    assert.ok(schema.oneOf ? matches.length === 1 : matches.length >= 1, `${at}: schema union`);
  }
  if (schema.nullable && value === null) return;
  // OpenAPI may use a required-only branch without repeating type: object.
  if (schema.required && value && typeof value === 'object' && !Array.isArray(value)) {
    for (const key of schema.required) assert.ok(Object.hasOwn(value, key), `${at}.${key}: required`);
  }
  if (schema.enum) assert.ok(schema.enum.includes(value), `${at}: enum ${String(value)}`);
  if (schema.type === 'object') {
    assert.ok(value && typeof value === 'object' && !Array.isArray(value), `${at}: object`);
    const object = value as Record<string, unknown>;
    for (const key of schema.required ?? []) assert.ok(Object.hasOwn(object, key), `${at}.${key}: required`);
    for (const [key, item] of Object.entries(object)) {
      if (schema.additionalProperties === false) assert.ok(Object.hasOwn(schema.properties ?? {}, key), `${at}.${key}: unexpected property`);
      if (schema.properties?.[key]) checkSchema(item, schema.properties[key], document, `${at}.${key}`);
    }
  }
  if (schema.type === 'array') {
    assert.ok(Array.isArray(value), `${at}: array`);
    if (schema.minItems !== undefined) assert.ok(value.length >= schema.minItems, `${at}: minItems`);
    if (schema.maxItems !== undefined) assert.ok(value.length <= schema.maxItems, `${at}: maxItems`);
    value.forEach((item, index) => checkSchema(item, schema.items, document, `${at}[${index}]`));
  }
  if (schema.type === 'string') {
    assert.equal(typeof value, 'string', `${at}: string`);
    if (schema.maxLength !== undefined) assert.ok((value as string).length <= schema.maxLength, `${at}: maxLength`);
  }
  if (schema.type === 'boolean') assert.equal(typeof value, 'boolean', `${at}: boolean`);
  if (schema.type === 'number' || schema.type === 'integer') {
    assert.equal(typeof value, 'number', `${at}: number`);
    if (schema.type === 'integer') assert.ok(Number.isInteger(value), `${at}: integer`);
    if (schema.minimum !== undefined) assert.ok((value as number) >= schema.minimum, `${at}: minimum`);
    if (schema.maximum !== undefined) assert.ok((value as number) <= schema.maximum, `${at}: maximum`);
  }
}

for (const model of MODEL_REGISTRY.filter(model => model.status !== 'unavailable')) {
  test(`${model.id}: default native body conforms to fetched Router schema`, () => {
    const document = JSON.parse(readFileSync(new URL(`../docs/schemas/${model.id.replace('/', '--')}.json`, import.meta.url), 'utf8'));
    const schema = (Object.values(document.paths)[0] as any).post.requestBody.content['application/json'].schema;
    const inputData = Object.fromEntries(model.inputs.filter(input => input.required).map(input => {const value=input.transport==='cloud-asset-url'?`https://media.example.com/input.${input.kind==='image'?'png':input.kind==='audio'?'wav':'mp4'}`:input.kind==='image'?image:input.kind==='audio'?'data:audio/wav;base64,aGVsbG8=':video;return [input.key,input.multiple?[value]:value];}));
    const settings = model.id === 'meshy/rigging' ? { input_task_id: 'completed-refine-task' } : model.id === 'meshy/animations' ? { rig_task_id: 'completed-rig-task' } : model.id === 'kling/videos-video-extend' ? { video_id: 'completed-native-video' } : {};
    const body = buildModelInput(model.id, { prompt: 'A lighthouse at dusk', settings, inputData });
    checkSchema(body, schema, document);
  });
}

test('I2V uses a real data URI at the documented first_frame content location', () => {
  const body = buildModelInput('minimax/minimax-h3', { prompt: 'Slow dolly in. Ocean waves.', settings: { duration: 5 }, inputData: { first_frame: image } });
  assert.deepEqual((body.content as any[])[1], { type: 'image_url', image_url: { url: image }, role: 'first_frame' });
  assert.equal(body.ratio, undefined, 'I2V aspect ratio follows the image');
  assert.throws(() => buildModelInput('minimax/minimax-h3', { prompt: 'Move', settings: {}, inputData: { first_frame: image, reference_image: image } }), /cannot mix/);
});

test('reference media rejects localhost and blob URLs instead of forwarding unusable input', () => {
  for (const value of ['http://localhost:3000/media/a.png', 'blob:example', 'C:\\media\\a.png']) {
    assert.throws(() => buildModelInput('bfl/flux-3-image', { prompt: 'Edit', settings: {}, inputData: { images: value } }), /data URI/);
  }
});

test('model controls reject unsupported workflow fields and invalid durations', () => {
  assert.throws(() => validateSupportedSettings('bfl/flux-3-image', { seed: 1 }), /not supported/);
  assert.throws(() => validateSupportedSettings('bfl/flux-3-image', { steps: 8 }), /not supported/);
  assert.throws(() => validateSupportedSettings('minimax/minimax-h3', { duration: 3 }), /outside/);
  assert.throws(() => validateSupportedSettings('minimax/minimax-h3', { duration: 5.5 }), /whole/);
});

test('native error outcomes and missing media cannot become completed takes', () => {
  assert.throws(() => extractModelMedia('minimax/minimax-h3', { task: { status: 'failed', error: { message: 'provider error' } } }), /provider error/);
  assert.throws(() => extractModelMedia('bfl/flux-3-image', { status: 'Ready', result: {} }), /without an accessible/);
  assert.throws(() => extractModelMedia('bria/image-edit-remove-background', { status: 'ERROR', error: { message: 'bad input' } }), /bad input/);
  assert.throws(() => extractModelMedia('meshy/meshy-6', { status: 'SUCCEEDED', model_urls: {}, thumbnail_url: 'https://example.com/preview.png' }), /without a supported mesh/);
});

test('BFL lowercase success and Meshy supported output preference preserve valid outputs', () => {
  assert.equal(extractModelMedia('bfl/flux-3-image', { status: ' ready ', result: { sample: 'https://example.com/result.png' } })[0]?.url, 'https://example.com/result.png');
  const preferred = extractModelMedia('meshy/meshy-6', { status: 'SUCCEEDED', model_urls: { glb: 'https://example.com/model.glb', fbx: 'https://example.com/model.fbx' } });
  assert.equal(preferred.length, 1);
  assert.equal(preferred[0]?.name, 'model.glb');
  assert.equal(preferred[0]?.kind, '3d');
  const fallback = extractModelMedia('meshy/meshy-6', { status: 'SUCCEEDED', model_urls: { obj: 'https://example.com/model.obj', mtl: 'https://example.com/model.mtl' } });
  assert.deepEqual(fallback.map(item => [item.name, item.kind]), [['model.obj', 'document'], ['model.mtl', 'document']]);
  assert.throws(() => extractModelMedia('meshy/meshy-6', { status: 'SUCCEEDED', model_urls: { fbx: 'https://example.com/model.fbx' } }), /supported mesh asset/);
});

test('binary audio routes explicitly opt out of Router queue', () => {
  for (const model of MODEL_REGISTRY.filter(item => item.outputFormat === 'binary')) assert.equal(model.delivery, 'sync');
});

test('Seed Audio saves inline speech and actual provider-timed VTT captions', () => {
  const result = extractModelMedia('byteplus/seed-audio-1.0-multilingual', {
    audio: Buffer.from('RIFF').toString('base64'),
    subtitle: { sentences: [{ start_time: 1250, end_time: 2700, text: 'Hello <world>.' }] },
  });
  assert.deepEqual(Buffer.from(result[0]!.bytes!), Buffer.from('RIFF'));
  assert.equal(result[1]?.kind, 'document');
  assert.match(Buffer.from(result[1]!.bytes!).toString(), /00:00:01.250 --> 00:00:02.700/);
  assert.match(Buffer.from(result[1]!.bytes!).toString(), /Hello &lt;world&gt;/);
  assert.throws(() => extractModelMedia('byteplus/seed-audio-1.0-multilingual', { code: 1, message: 'Unable to synthesize' }), /Unable to synthesize/);
});

test('Seed Audio URL-only result and missing optional subtitles are supported', () => {
  const result = extractModelMedia('byteplus/seed-audio-1.0-multilingual', { url: 'https://example.com/speech.wav' });
  assert.equal(result.length, 1);
  assert.equal(result[0]?.url, 'https://example.com/speech.wav');
  assert.throws(() => buildModelInput('byteplus/seed-audio-1.0-multilingual', { prompt: 'x'.repeat(3001), settings: {}, inputData: {} }), /3000/);
});
