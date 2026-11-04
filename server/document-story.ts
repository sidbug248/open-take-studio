import { Router, type ErrorRequestHandler } from 'express';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import AdmZip from 'adm-zip';
import sharp from 'sharp';
import { z } from 'zod';
import type { Asset, Take } from '../shared/types.ts';
import type { DocumentStoryDocument, DocumentStorySaved, DocumentStoryRendered } from '../shared/document-story-types.ts';
import type { Store } from './store.ts';
import type { LocalFileStorage } from './media.ts';
import { FilmMediaTools, mediaToolPaths, runMediaTool } from './film-media.ts';

const id = z.string().min(1).max(128).regex(/^[A-Za-z0-9_-]+$/);
const finite = z.number().finite();
export const documentStorySchema = z.object({
  version: z.literal(1), name: z.string().trim().min(1).max(150),
  sourceName: z.string().trim().min(1).max(180), sourceText: z.string().trim().min(1).max(60_000),
  planningMethod: z.literal('local-paragraph-plan'),
  beats: z.array(z.object({
    id, title: z.string().trim().min(1).max(150), sourceText: z.string().max(60_000),
    prompt: z.string().max(6_000), caption: z.string().max(240),
    duration: finite.min(1).max(30), offset: finite.min(0).max(36_000), assetId: id.optional(),
    audioAssetId: id.optional(), audioOffset: finite.min(0).max(36_000),
  }).strict()).min(1).max(8),
}).strict().superRefine((document, ctx) => {
  if (new Set(document.beats.map(beat => beat.id)).size !== document.beats.length) ctx.addIssue({ code: 'custom', message: 'Each scene needs a unique identity.' });
  if (document.beats.reduce((sum, beat) => sum + beat.duration, 0) > 180) ctx.addIssue({ code: 'custom', message: 'Keep the complete story within three minutes.' });
  if (document.beats.reduce((sum, beat) => sum + beat.sourceText.length, 0) > 65_000) ctx.addIssue({ code: 'custom', message: 'Scene excerpts must fit within 65,000 characters.' });
  if (document.sourceText.includes('\0')) ctx.addIssue({ code: 'custom', message: 'The source must be plain text.' });
});
const fail = (message: string, status = 400): never => { throw Object.assign(new Error(message), { status }); };
const hash = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
const requireProject = (store: Store, projectId: string) => store.getProject(projectId) ?? fail('Project not found.', 404);
const xml = (value: string) => value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[character]!));
const allWork = new WeakMap<Store, Set<Promise<unknown>>>();
function tracked<T>(store: Store, task: () => Promise<T>): Promise<T> {
  let pending = allWork.get(store); if (!pending) { pending = new Set(); allWork.set(store, pending); }
  const promise = Promise.resolve().then(task); pending.add(promise);
  void promise.finally(() => pending!.delete(promise)).catch(() => undefined); return promise;
}
export async function drainDocumentStoryWork(store: Store): Promise<void> {
  while (allWork.get(store)?.size) await Promise.allSettled([...allWork.get(store)!]);
}
function owned(store: Store, projectId: string, assetId: string, kinds: Asset['kind'][]): Asset {
  const asset = store.getAsset(assetId);
  if (!asset || asset.projectId !== projectId || !kinds.includes(asset.kind)) fail('Every selected source must be saved in this project with the correct media type.');
  return asset!;
}
function documentSources(store: Store, projectId: string, document: DocumentStoryDocument, complete = false): Asset[] {
  requireProject(store, projectId); const assets = new Map<string, Asset>();
  for (const beat of document.beats) {
    if (complete && !beat.assetId) fail(`Choose a saved image or video for “${beat.title}”.`);
    if (beat.assetId) { const asset = owned(store, projectId, beat.assetId, ['image', 'video']); assets.set(asset.id, asset); }
    if (beat.audioAssetId) { const audio = owned(store, projectId, beat.audioAssetId, ['audio']); assets.set(audio.id, audio); }
  }
  return [...assets.values()];
}
function readPlan(store: Store, planAssetId: string): DocumentStorySaved {
  const asset = store.getAsset(planAssetId);
  if (!asset || asset.metadata.operation !== 'document-story-plan') fail('Choose a saved document story plan.', 404);
  const document = documentStorySchema.parse(asset!.metadata.documentStoryDocument);
  documentSources(store, asset!.projectId, document);
  const take = store.listTakes(asset!.projectId).find(value => value.assetIds.includes(asset!.id));
  if (!take) fail('The saved plan has no project take.', 409);
  return { asset: asset!, take: take!, document };
}
function localTake(projectId: string, name: string, asset: Asset, document: DocumentStoryDocument, inputAssetIds: Take['inputAssetIds'], parent?: Take): Take {
  const now = new Date().toISOString();
  return { id: randomUUID(), projectId, name, kind: asset.kind, parentTakeId: parent?.id,
    sourceAssetId: parent?.assetIds[0], inputAssetIds, assetIds: [asset.id],
    modelId: asset.kind === 'video' ? 'local/document-story' : 'local/document-story-plan',
    provider: 'local', prompt: '', settings: { documentStoryDocument: document }, status: 'LOCAL',
    provenance: 'local-edit', favorite: false, createdAt: now, updatedAt: now,
    changes: parent ? [{ field: 'settings.documentStoryDocument', before: parent.settings.documentStoryDocument ?? null, after: document }] : [] };
}
async function verifiedBytes(media: LocalFileStorage, asset: Asset): Promise<Buffer> {
  const bytes = await media.read(asset);
  if (bytes.length !== asset.size || hash(bytes) !== asset.sha256) fail(`Stored source failed its integrity check: ${asset.name}`, 409);
  return bytes;
}
function timestamp(seconds: number): string {
  const millis = Math.round(seconds * 1000);
  return `${String(Math.floor(millis / 3600000)).padStart(2, '0')}:${String(Math.floor(millis / 60000) % 60).padStart(2, '0')}:${String(Math.floor(millis / 1000) % 60).padStart(2, '0')}.${String(millis % 1000).padStart(3, '0')}`;
}
export function documentStoryCaptions(document: DocumentStoryDocument): string {
  let position = 0;
  return 'WEBVTT\n\n' + document.beats.map((beat, index) => {
    const start = position; position += beat.duration;
    return `${index + 1}\n${timestamp(start)} --> ${timestamp(position)}\n${beat.caption.replace(/[\r\n]+/g, ' ').replace(/-->/g, '→').replace(/[<>]/g, '')}\n`;
  }).join('\n');
}
function captionSvg(caption: string): Buffer {
  const words = caption.replace(/\s+/g, ' ').trim().split(' '), lines: string[] = []; let line = '';
  for (const word of words) {
    if ((line + ' ' + word).trim().length > 68 && line) { lines.push(line); line = word; }
    else line = (line + ' ' + word).trim();
  }
  if (line) lines.push(line);
  const rows = lines.slice(0, 4), y = 720 - rows.length * 37 - 24;
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720">${rows.length ? `<rect x="24" y="${y - 18}" width="1232" height="${rows.length * 37 + 36}" rx="14" fill="#0a0811" fill-opacity=".82"/><g fill="white" font-family="Arial,sans-serif" font-size="29">${rows.map((row, index) => `<text x="48" y="${y + 26 + index * 37}">${xml(row)}</text>`).join('')}</g>` : ''}</svg>`);
}

/** Render only explicitly selected stored media. No model or network generation occurs. */
async function renderStory(store: Store, media: LocalFileStorage, document: DocumentStoryDocument, projectId: string): Promise<Buffer> {
  const assets = documentSources(store, projectId, document, true);
  for (const asset of assets) await verifiedBytes(media, asset);
  const tools = new FilmMediaTools(store.dataDir, media), binaries = mediaToolPaths();
  await mkdir(tools.processingDir, { recursive: true });
  const scratch = await mkdtemp(path.join(tools.processingDir, 'document-story-'));
  try {
    for (const [index, beat] of document.beats.entries()) {
      const visual = owned(store, projectId, beat.assetId!, ['image', 'video']);
      let hasSourceAudio = false;
      let visualArgs: string[];
      if (visual.kind === 'video') {
        const info = await tools.inspect(visual);
        if (beat.offset + beat.duration > info.duration + .025) fail(`“${beat.title}” extends beyond its selected video. Shorten the scene or choose a longer clip.`);
        hasSourceAudio = info.hasAudio;
        visualArgs = ['-ss', String(beat.offset), '-t', String(beat.duration), '-protocol_whitelist', 'file,pipe', '-i', media.path(visual)];
      } else {
        if (beat.offset !== 0) fail('Still images start at zero seconds.');
        const still = path.join(scratch, `still-${index}.png`);
        await sharp(await media.read(visual)).rotate().resize(1280, 720, { fit: 'contain', background: '#0c0912' }).png().toFile(still);
        visualArgs = ['-loop', '1', '-framerate', '24', '-i', still];
      }
      const caption = path.join(scratch, `caption-${index}.png`);
      await sharp(captionSvg(beat.caption)).png().toFile(caption);
      const audioArgs: string[] = [];
      if (beat.audioAssetId) {
        const audio = owned(store, projectId, beat.audioAssetId, ['audio']);
        const info = JSON.parse((await runMediaTool(binaries.ffprobe, ['-v', 'error', '-protocol_whitelist', 'file,pipe', '-show_entries', 'format=duration:stream=codec_type', '-of', 'json', media.path(audio)], 1024 * 1024, 30_000)).toString());
        if (!info.streams?.some((stream: { codec_type: string }) => stream.codec_type === 'audio') || !Number.isFinite(Number(info.format?.duration))) fail('Selected narration has no decodable audio.');
        if (beat.audioOffset + beat.duration > Number(info.format.duration) + .025) fail(`“${beat.title}” extends beyond its selected audio. Adjust its audio in point or scene length.`);
        audioArgs.push('-ss', String(beat.audioOffset), '-t', String(beat.duration), '-protocol_whitelist', 'file,pipe', '-i', media.path(audio));
      }
      const audioSource = beat.audioAssetId ? '[2:a:0]' : hasSourceAudio ? '[0:a:0]' : '';
      const filters = [
        '[0:v:0]scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2:color=0x0c0912,setsar=1,fps=24[v]',
        '[v][1:v:0]overlay=0:0:shortest=1,format=yuv420p[outv]',
        audioSource ? `${audioSource}aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,apad,atrim=duration=${beat.duration},asetpts=PTS-STARTPTS[outa]` :
          `anullsrc=r=48000:cl=stereo,atrim=duration=${beat.duration},asetpts=PTS-STARTPTS[outa]`,
      ];
      await runMediaTool(binaries.ffmpeg, ['-nostdin', '-hide_banner', '-loglevel', 'error', ...visualArgs,
        '-loop', '1', '-i', caption, ...audioArgs, '-filter_complex_threads', '1', '-filter_complex', filters.join(';'),
        '-map', '[outv]', '-map', '[outa]', '-t', String(beat.duration), '-c:v', 'libx264', '-threads', '2',
        '-preset', 'veryfast', '-crf', '22', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '160k',
        '-movflags', '+faststart', '-y', path.join(scratch, `scene-${index}.mp4`)], 2 * 1024 * 1024, 180_000);
    }
    const list = path.join(scratch, 'sequence.txt'), output = path.join(scratch, 'story.mp4');
    await writeFile(list, document.beats.map((_, index) => `file 'scene-${index}.mp4'`).join('\n'));
    await runMediaTool(binaries.ffmpeg, ['-nostdin', '-hide_banner', '-loglevel', 'error', '-f', 'concat', '-safe', '1',
      '-protocol_whitelist', 'file,pipe', '-i', list, '-c', 'copy', '-movflags', '+faststart', '-y', output], 2 * 1024 * 1024, 180_000);
    return await readFile(output);
  } finally { await rm(scratch, { recursive: true, force: true }); }
}

export function createDocumentStoryRouter(store: Store, media: LocalFileStorage): Router {
  const router = Router(), pending = new Map<string, { fingerprint: string; promise: Promise<DocumentStorySaved | DocumentStoryRendered> }>();
  let rendering = false;
  function replay<T>(key: string, fingerprint: string): T | undefined {
    const receipt = store.getOperationReceipt<T>(key);
    if (receipt && receipt.fingerprint !== fingerprint) fail('This request identity already belongs to another document story version.', 409);
    return receipt?.result;
  }
  async function once<T extends DocumentStorySaved>(key: string, fingerprint: string, task: () => Promise<T>): Promise<T> {
    const existing = replay<T>(key, fingerprint); if (existing) return existing;
    const active = pending.get(key);
    if (active) { if (active.fingerprint !== fingerprint) fail('This request identity already belongs to another document story version.', 409); return await active.promise as T; }
    const promise = tracked(store, task); pending.set(key, { fingerprint, promise });
    void promise.finally(() => pending.delete(key)).catch(() => undefined); return promise;
  }
  router.post('/projects/:id/document-stories', async (req, res) => {
    const projectId = String(req.params.id); requireProject(store, projectId);
    const body = z.object({ document: documentStorySchema, parentTakeId: id.optional(), clientRequestId: id }).strict().parse(req.body);
    const document = body.document, sources = documentSources(store, projectId, document);
    const parent = body.parentTakeId ? store.getTake(body.parentTakeId) : undefined;
    if (body.parentTakeId && (!parent || parent.projectId !== projectId || parent.modelId !== 'local/document-story-plan')) fail('The parent must be a document story plan in this project.');
    const key = `document-story-save:${projectId}:${body.clientRequestId}`, fingerprint = hash(JSON.stringify([document, body.parentTakeId]));
    const result = await once(key, fingerprint, async () => {
      const sourceHashes = Object.fromEntries(sources.map(asset => [asset.id, asset.sha256]));
      const asset = await media.put({ projectId, name: `${document.name}.story-plan.json`, mimeType: 'application/json',
        bytes: Buffer.from(JSON.stringify({ format: 'open-take-document-story', version: 1, document, sourceHashes }, null, 2)),
        provenance: 'local-edit', metadata: { operation: 'document-story-plan', documentStoryDocument: document, sourceHashes, sourceTextSha256: hash(document.sourceText), planningMethod: 'local-paragraph-plan' } });
      const take = localTake(projectId, document.name, asset, document, { sources: sources.map(source => source.id) }, parent);
      const saved = { asset, take, document };
      store.transaction(() => { store.upsertAsset(asset); store.upsertTake(take); store.upsertProject({ ...requireProject(store, projectId), selectedTakeId: take.id, updatedAt: take.updatedAt }); store.putOperationReceipt({ key, fingerprint, result: saved, createdAt: take.createdAt }); });
      return saved;
    });
    res.status(201).json(result);
  });
  router.get('/assets/:id/document-story', (req, res) => res.json(readPlan(store, String(req.params.id))));
  router.post('/assets/:id/document-story/render', async (req, res) => {
    const saved = readPlan(store, String(req.params.id));
    const body = z.object({ clientRequestId: id }).strict().parse(req.body);
    const key = `document-story-render:${saved.asset.projectId}:${body.clientRequestId}`, fingerprint = hash(saved.asset.id + saved.asset.sha256);
    const result = await once<DocumentStoryRendered>(key, fingerprint, async () => {
      if (rendering) fail('A document story is already rendering in this workspace. Try again when it finishes.', 429);
      rendering = true;
      try {
        const { document } = saved, projectId = saved.asset.projectId, sources = documentSources(store, projectId, document, true);
        const bytes = await renderStory(store, media, document, projectId), duration = document.beats.reduce((sum, beat) => sum + beat.duration, 0);
        const metadata = { operation: 'document-story-render', documentStoryDocument: document, planAssetId: saved.asset.id,
          sourceAssetId: saved.asset.id, sourceHashes: Object.fromEntries(sources.map(asset => [asset.id, asset.sha256])), duration,
          assembly: 'Local composition of selected stored media; no model generation', inputAssetIds: { plan: saved.asset.id, sources: sources.map(asset => asset.id) } };
        const asset = await media.put({ projectId, name: `${document.name}.mp4`, mimeType: 'video/mp4', bytes, provenance: 'local-edit', metadata });
        const captions = await media.put({ projectId, name: `${document.name}.vtt`, mimeType: 'text/vtt',
          bytes: Buffer.from(documentStoryCaptions(document)), provenance: 'local-edit', metadata: { operation: 'document-story-captions', planAssetId: saved.asset.id, sourceAssetId: asset.id } });
        const take = localTake(projectId, `${document.name} · assembled story`, asset, document, metadata.inputAssetIds, saved.take);
        take.assetIds.push(captions.id);
        const rendered: DocumentStoryRendered = { asset, captions, take, document, planAssetId: saved.asset.id, duration };
        store.transaction(() => { store.upsertAsset(asset); store.upsertAsset(captions); store.upsertTake(take);
          store.upsertProject({ ...requireProject(store, projectId), selectedTakeId: take.id, updatedAt: take.updatedAt });
          store.putOperationReceipt({ key, fingerprint, result: rendered, createdAt: take.createdAt }); });
        return rendered;
      } finally { rendering = false; }
    });
    res.status(201).json(result);
  });
  router.get('/assets/:id/document-story/player-export', async (req, res) => {
    const asset = store.getAsset(String(req.params.id));
    if (!asset || asset.metadata.operation !== 'document-story-render') fail('Choose a rendered document story.', 404);
    const rendered = asset!, saved = readPlan(store, String(rendered.metadata.planAssetId));
    if (saved.asset.projectId !== rendered.projectId) fail('The story plan belongs to another project.');
    const bytes = await tracked(store, async () => {
      const zip = new AdmZip(), sources = documentSources(store, rendered.projectId, saved.document, true); let total = 0;
      const add = (name: string, data: Buffer) => { total += data.length; if (total > 300 * 1024 * 1024) fail('Portable story exceeds 300 MiB. Download the rendered film separately.', 413); zip.addFile(name, data); };
      add('story.mp4', await verifiedBytes(media, rendered));
      add('captions.vtt', Buffer.from(documentStoryCaptions(saved.document)));
      const sourceFiles = [];
      for (const source of sources) { const file = 'sources/' + source.fileName; add(file, await verifiedBytes(media, source)); sourceFiles.push({ assetId: source.id, file, name: source.name, sha256: source.sha256, provenance: source.provenance }); }
      add('plan.json', Buffer.from(JSON.stringify({ format: 'open-take-document-story', version: 1, document: saved.document, sourceFiles }, null, 2)));
      add('source.txt', Buffer.from(saved.document.sourceText));
      add('index.html', Buffer.from(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${xml(saved.document.name)}</title><style>body{margin:0;background:#0c0912;color:#f5f1ff;font:17px system-ui}main{max-width:1100px;margin:5vh auto;padding:24px}small{letter-spacing:.2em;color:#c7a9ff}video{width:100%;border-radius:20px;background:#000}a{color:#d7baff}p{line-height:1.6}</style><main><small>OPEN TAKE STUDIO</small><h1>${xml(saved.document.name)}</h1><video controls playsinline preload="metadata" src="story.mp4"><track kind="captions" src="captions.vtt" srclang="en" label="Story captions"></video><p>A complete story assembled from selected saved media. Captions are visible in the film. Extract the whole archive to play offline.</p><p><a href="plan.json" download>Editable scene plan</a> · <a href="source.txt" download>Original source text</a> · <a href="story.mp4" download>Download film</a></p></main></html>`));
      add('README.txt', Buffer.from('Extract this complete ZIP and open index.html in a modern browser. No account or network is needed for included playback.\n\nplan.json contains the editable scene plan and maps each selected asset to sources/. source.txt preserves the source. Captions are burned into story.mp4 and also included as captions.vtt.\n\nTo restore the full project with native editable history into Open Take Studio, use the studio\'s Project Export ZIP and Import Project controls. This player ZIP is a portable deliverable, not a replacement for the full project archive.\n\nPlanning divides paragraphs locally and requires human review. It does not infer an AI script or generate new media. Sources retain the provenance recorded in plan.json.\n'));
      return zip.toBuffer();
    });
    res.type('application/zip').attachment(saved.document.name.replace(/[^A-Za-z0-9_-]/g, '-').slice(0, 100) + '.story.zip').send(bytes);
  });
  router.use(((error, _req, res, next) => {
    if (error instanceof z.ZodError) { res.status(400).json({ error: error.issues.map(issue => issue.message).join('; ') }); return; }
    if (error.status === 429) res.setHeader('Retry-After', '3');
    next(error);
  }) as ErrorRequestHandler);
  return router;
}
