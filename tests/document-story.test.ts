import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, readFile } from 'node:fs/promises';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import express, { type ErrorRequestHandler } from 'express';
import AdmZip from 'adm-zip';
import sharp from 'sharp';
import { Store } from '../server/store.ts';
import { LocalFileStorage } from '../server/media.ts';
import { createDocumentStoryRouter, documentStorySchema, drainDocumentStoryWork } from '../server/document-story.ts';
import { createDocumentStoryPlan } from '../shared/document-story-types.ts';
import { exportProject, importProject } from '../server/project-routes.ts';
import { mediaToolPaths, runMediaTool } from '../server/film-media.ts';

test('document planning preserves source and produces bounded, explicitly local editable beats', () => {
  const source = '# The crossing\n\nA traveller reaches the shore.\n\nA boat returns at dawn.';
  const document = createDocumentStoryPlan(source, 'crossing.md');
  assert.equal(document.sourceText, source);
  assert.equal(document.name, 'The crossing');
  assert.equal(document.planningMethod, 'local-paragraph-plan');
  assert.equal(document.beats.length, 3);
  assert.ok(document.beats.every(beat => !beat.assetId && !!beat.prompt));
  documentStorySchema.parse(document);
  const long = createDocumentStoryPlan('a'.repeat(60_000), 'long.txt');
  documentStorySchema.parse(long);
  assert.ok(long.beats.length <= 8);
  assert.equal(long.beats.map(beat => beat.sourceText.replace(/\s/g, '')).join(''), 'a'.repeat(60_000));
  assert.throws(() => createDocumentStoryPlan('a'.repeat(60_001)));
  assert.throws(() => createDocumentStoryPlan(''));
  assert.throws(() => documentStorySchema.parse({ ...document, beats: [document.beats[0], document.beats[0]] }));
});

test('document story saves immutable plans, assembles actual media and audio, exports offline and restores editable history', { timeout: 180_000 }, async () => {
  const base = path.resolve('data/test-fixtures'); await mkdir(base, { recursive: true });
  const dir = await mkdtemp(path.join(base, 'document-story-'));
  const store = new Store(dir), media = new LocalFileStorage(dir), now = new Date().toISOString();
  for (const id of ['p', 'other']) store.upsertProject({ id, name: id, description: '', createdAt: now, updatedAt: now });
  const app = express(); app.use(express.json({ limit: '2mb' })); app.use('/api', createDocumentStoryRouter(store, media));
  app.use(((error, _req, res, _next) => res.status(error.status || 400).json({ error: error.message })) as ErrorRequestHandler);
  const server = await new Promise<ReturnType<typeof app.listen>>(resolve => { const running = app.listen(0, '127.0.0.1', () => resolve(running)); });
  const baseUrl = 'http://127.0.0.1:' + (server.address() as AddressInfo).port + '/api';
  const post = (route: string, body: unknown) => fetch(baseUrl + route, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  try {
    const { ffmpeg, ffprobe } = mediaToolPaths();
    const red = await media.put({ projectId: 'p', name: 'Red original.png', mimeType: 'image/png', provenance: 'imported',
      bytes: await sharp({ create: { width: 160, height: 90, channels: 3, background: '#e01010' } }).png().toBuffer() });
    const voice = await media.put({ projectId: 'p', name: 'Saved narration.wav', mimeType: 'audio/wav', provenance: 'imported',
      bytes: await runMediaTool(ffmpeg, ['-nostdin', '-v', 'error', '-f', 'lavfi', '-i', 'sine=frequency=220:duration=2', '-f', 'wav', 'pipe:1']) });
    const blueFile = path.join(dir, 'fixture-blue.mp4');
    await runMediaTool(ffmpeg, ['-nostdin', '-v', 'error', '-f', 'lavfi', '-i', 'color=c=blue:s=160x90:r=24:d=2',
      '-f', 'lavfi', '-i', 'sine=frequency=660:duration=2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', '-y', blueFile]);
    const blue = await media.put({ projectId: 'p', name: 'Blue original.mp4', mimeType: 'video/mp4', provenance: 'imported', bytes: await readFile(blueFile) });
    const foreign = await media.put({ projectId: 'other', name: 'Private other image.png', mimeType: 'image/png', provenance: 'imported', bytes: await media.read(red) });
    for (const asset of [red, voice, blue, foreign]) store.upsertAsset(asset);
    const document = createDocumentStoryPlan('First moment.\n\nSecond moment.', 'crossing.txt');
    document.name = 'Two moments <safe>';
    document.beats[0] = { ...document.beats[0], duration: 1, assetId: red.id, audioAssetId: voice.id, caption: 'The red shore.' };
    document.beats[1] = { ...document.beats[1], duration: 1, assetId: blue.id, offset: .5, caption: 'The blue crossing.' };
    const saveResponse = await post('/projects/p/document-stories', { document, clientRequestId: 'save-original' });
    assert.equal(saveResponse.status, 201, await saveResponse.clone().text()); const saved = await saveResponse.json();
    const originalBytes = await media.read(saved.asset);
    const replay = await (await post('/projects/p/document-stories', { document, clientRequestId: 'save-original' })).json();
    assert.equal(replay.asset.id, saved.asset.id);
    assert.equal((await post('/projects/p/document-stories', { document: { ...document, name: 'Changed intent' }, clientRequestId: 'save-original' })).status, 409);
    const crossProject = await post('/projects/p/document-stories', { document: { ...document, beats: [{ ...document.beats[0], assetId: foreign.id }] }, clientRequestId: 'foreign-test' });
    assert.equal(crossProject.status, 400);
    const badTiming = await (await post('/projects/p/document-stories', { document: { ...document, beats: [{ ...document.beats[1], duration: 3 }] }, clientRequestId: 'bad-timing-plan' })).json();
    assert.equal((await post('/assets/' + badTiming.asset.id + '/document-story/render', { clientRequestId: 'bad-timing-render' })).status, 400);
    const renderResponse = await post('/assets/' + saved.asset.id + '/document-story/render', { clientRequestId: 'render-original' });
    assert.equal(renderResponse.status, 201, await renderResponse.clone().text()); const rendered = await renderResponse.json();
    assert.equal(rendered.take.parentTakeId, saved.take.id);
    assert.equal(rendered.take.provider, 'local');
    const info = JSON.parse((await runMediaTool(ffprobe, ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', media.path(rendered.asset)])).toString());
    assert.ok(Math.abs(Number(info.format.duration) - 2) < .15);
    const video = info.streams.find((stream: { codec_type: string }) => stream.codec_type === 'video');
    assert.equal(video.width, 1280); assert.equal(video.height, 720);
    assert.ok(info.streams.some((stream: { codec_type: string }) => stream.codec_type === 'audio'));
    const pixel = async (seconds: number) => {
      const png = await runMediaTool(ffmpeg, ['-nostdin', '-v', 'error', '-ss', String(seconds), '-i', media.path(rendered.asset), '-frames:v', '1', '-f', 'image2pipe', '-vcodec', 'png', 'pipe:1']);
      return sharp(png).extract({ left: 100, top: 100, width: 20, height: 20 }).stats();
    };
    const first = await pixel(.4), second = await pixel(1.5);
    assert.ok(first.channels[0].mean > first.channels[2].mean + 100, 'First scene shows its red source');
    assert.ok(second.channels[2].mean > second.channels[0].mean + 100, 'Second scene shows its blue source');
    const pcm = await runMediaTool(ffmpeg, ['-nostdin', '-v', 'error', '-i', media.path(rendered.asset), '-ac', '1', '-ar', '8000', '-f', 'f32le', 'pipe:1']);
    for (const start of [.2, 1.2]) { let sum = 0; for (let i = Math.floor(start * 8000); i < (start + .4) * 8000; i++) sum += pcm.readFloatLE(i * 4) ** 2; assert.ok(sum > 1, 'Selected narration and original clip audio are audible'); }
    const captions = (await media.read(rendered.captions)).toString();
    assert.match(captions, /00:00:01\.000 --> 00:00:02\.000/);
    const again = await (await post('/assets/' + saved.asset.id + '/document-story/render', { clientRequestId: 'render-original' })).json();
    assert.equal(again.asset.id, rendered.asset.id);
    assert.deepEqual(await media.read(saved.asset), originalBytes, 'Rendering does not mutate the saved source plan');
    const portableResponse = await fetch(baseUrl + '/assets/' + rendered.asset.id + '/document-story/player-export');
    assert.equal(portableResponse.status, 200);
    const portable = new AdmZip(Buffer.from(await portableResponse.arrayBuffer()));
    for (const filename of ['index.html', 'story.mp4', 'captions.vtt', 'plan.json', 'source.txt', 'README.txt']) assert.ok(portable.getEntry(filename), filename);
    assert.match(portable.readAsText('index.html'), /Two moments &lt;safe&gt;/);
    assert.doesNotMatch(portable.readAsText('index.html'), /https?:\/\//);
    const playerPlan = JSON.parse(portable.readAsText('plan.json'));
    assert.equal(playerPlan.sourceFiles.length, 3);
    for (const source of playerPlan.sourceFiles) assert.ok(portable.getEntry(source.file));
    const packageBytes = await exportProject(store, media, 'p');
    const imported = await importProject(store, media, packageBytes);
    const restored = store.listAssets(imported.id).find(asset => asset.metadata.operation === 'document-story-plan' && asset.name === saved.asset.name)!;
    const reopened = await (await fetch(baseUrl + '/assets/' + restored.id + '/document-story')).json();
    assert.equal(reopened.document.sourceText, document.sourceText);
    for (const beat of reopened.document.beats) {
      assert.equal(store.getAsset(beat.assetId)?.projectId, imported.id);
      if (beat.audioAssetId) assert.equal(store.getAsset(beat.audioAssetId)?.projectId, imported.id);
    }
    const restoredRender = await post('/assets/' + restored.id + '/document-story/render', { clientRequestId: 'restored-render' });
    assert.equal(restoredRender.status, 201, await restoredRender.clone().text());
    assert.equal(store.listJobs().length, 0, 'No model jobs are submitted');
    const revision = await post('/projects/p/document-stories', { document: { ...document, name: 'Revised story' }, parentTakeId: saved.take.id, clientRequestId: 'save-revision' });
    assert.equal(revision.status, 201); assert.equal((await revision.json()).take.parentTakeId, saved.take.id);
    assert.deepEqual(await media.read(saved.asset), originalBytes);
  } finally {
    await drainDocumentStoryWork(store);
    await new Promise<void>(resolve => server.close(() => resolve())); store.close();
    assert.equal(path.dirname(dir), base); await rm(dir, { recursive: true, force: true });
  }
});
