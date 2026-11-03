// Bounded production through the local studio API only. The user authorized
// original portfolio production; no direct provider calls or database writes.
import { mkdir, readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import os from 'node:os';
import sharp from 'sharp';
import { mediaToolPaths, runMediaTool } from '../server/film-media.ts';
const base = 'http://127.0.0.1:4310/api';
const folder = 'artifacts/next-build/catalogue-production';
const file = `${folder}/submissions.json`;
await mkdir(folder, { recursive: true });
type Receipt = { key: string; body: any; takeId?: string; jobId?: string; state?: string; requestId?: string; assetIds?: string[]; creditsUsed?: unknown; servingProvider?: string | null; error?: string; submittedAt?: string };
let receipts: Receipt[] = [];
try { receipts = JSON.parse(await readFile(file, 'utf8')); } catch { /* First bounded run. */ }
async function api(route: string, method = 'GET', body?: unknown): Promise<any> {
  const response = await fetch(base + route, { method, headers: { 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const result = await response.json();
  if (!response.ok) throw new Error(`${route}: HTTP ${response.status}: ${String((result as any).error ?? 'Request failed').slice(0, 400)}`);
  return result;
}
async function save() { await writeFile(file, JSON.stringify(receipts, null, 2)); }
async function submit(key: string, body: Record<string, unknown>) {
  let receipt = receipts.find(item => item.key === key);
  if (receipt?.jobId || receipt?.error) return;
  if (!receipt) { receipt = { key, body: { ...body, clientRequestId: `next-build-20261103-catalogue-${key}` } }; receipts.push(receipt); await save(); }
  // A lost HTTP response reuses the exact persisted intended request identity.
  try { const result = await api('/generate', 'POST', receipt.body); Object.assign(receipt, { takeId: result.take.id, jobId: result.job.id, state: result.job.state, submittedAt: new Date().toISOString() }); }
  catch (error) { receipt.error = error instanceof Error ? error.message : 'Submission failed'; await save(); throw error; }
  await save(); console.log(JSON.stringify({ key, takeId: receipt.takeId, jobId: receipt.jobId, state: receipt.state }));
}
const subjects = [
  { key: 'amber-bottle', projectId: '1bec0508-6565-4cf8-9666-f07d224351a1', title: 'Liquid daylight / sculptural amber vessel', prompt: 'A single luxury perfume bottle as an original sculptural object. Rounded rectangular thick glass body with gently bevelled shoulders, short cylindrical neck and an oversized polished black spherical cap. Perfectly centered vertical silhouette, flat stable bottom, restrained elegant industrial design, no label, no lettering, no logo, no surrounding scene, no platform. Watertight complete object with strong visible depth. Amber tinted glass will be added in the texture stage.', texture: 'Rich translucent-looking honey amber glass bottle body, warm golden optical depth, smooth polished thick glass, a glossy near-black spherical cap and subtle brass collar. No labels, no lettering, no embossed logo. Luxurious clean product finish.' },
  { key: 'prismatic-seed', projectId: '456f5fdb-e79b-4946-9122-dc17e7a291e3', title: 'Prismatic garden / the faceted seed', prompt: 'An original gallery sculpture: one upright elongated seed pod twisting gracefully around a vertical axis, with five broad faceted spiral ribs and a smoothly rounded point at its top. Compact connected watertight geometry with a stable subtly flattened base. Elegant biomorphic asymmetry, sophisticated prismatic facets, no thin detached elements, no environment, no plinth, no lettering. A tangible three dimensional glass-seed shape, not a flat icon.', texture: 'Polished dichroic glass-like material with violet, cyan, lime and molten-orange gradients across the five broad faceted ribs. Glossy elegant sculptural surface, translucent-looking iridescent depths, crisp edges, no words or graphics.' },
  { key: 'fox-courier', projectId: 'fceaf455-9ba2-4763-a3fa-d0eabf4e3b4a', title: 'Midnight on wheels / fox courier', prompt: 'An original stylized upright biped humanoid fox courier character for an animation. Exactly two arms and two legs, human-like body proportions, clear separated limbs, standing straight in a symmetric A-pose, arms angled down and away from torso, palms facing forward. Short rounded orange fox head, two pointed ears, small muzzle, expressive simple face. Wearing a fitted teal zip jacket, charcoal trousers and simple dark sneakers. Short compact tail close behind the hips. Full body, complete fingers and feet, no skateboard, no props, no base, no scenery. Clean smooth sculptural toy-like geometry, strong readable silhouette.', texture: 'Orange fox fur, cream muzzle and inner ears, expressive dark eyes, teal jacket with subtle lime zipper, charcoal trousers and dark indigo sneakers with pale soles. Clean original stylized game character surface. No logos or text.' },
];
async function refresh() {
  const details = new Map<string, any>();
  for (const receipt of receipts.filter(item => item.jobId)) {
    const projectId = receipt.body.projectId;
    if (!details.has(projectId)) details.set(projectId, await api('/projects/' + projectId));
    const detail = details.get(projectId), job = detail.jobs.find((item: any) => item.id === receipt.jobId), take = detail.takes.find((item: any) => item.id === receipt.takeId);
    Object.assign(receipt, { state: job?.state, requestId: job?.requestId ?? job?.resultMetadata?.requestId, assetIds: take?.assetIds, creditsUsed: job?.resultMetadata?.creditsUsed ?? null, servingProvider: job?.resultMetadata?.servingProvider ?? null, error: job?.errorMessage });
  }
  await save();
  return details;
}
const phase = process.argv[2] ?? 'status';
if (phase === 'preview-first' || phase === 'previews') {
  if (phase === 'previews') { await refresh(); if (receipts.find(item => item.key === 'preview-amber-bottle')?.state !== 'COMPLETED') throw new Error('Validate the first Meshy preview before expanding production.'); }
  for (const subject of phase === 'preview-first' ? subjects.slice(0, 1) : subjects.slice(1)) await submit('preview-' + subject.key, { projectId: subject.projectId, modelId: 'meshy/meshy-7.1', prompt: subject.prompt, settings: { mode: 'preview', art_style: 'realistic', geometry_resolution: 'standard', should_remesh: true, topology: 'triangle', target_polycount: 30000, ...(subject.key === 'fox-courier' ? { pose_mode: 'a-pose' } : {}) }, inputAssetIds: {}, name: subject.title + ' · geometry' });
}
if (phase === 'refine' || phase === 'rig' || phase === 'animate') {
  await refresh();
  for (const subject of phase === 'refine' ? subjects : subjects.filter(item => item.key === 'fox-courier')) {
    const predecessorKey = (phase === 'refine' ? 'preview-' : phase === 'rig' ? 'refine-' : 'rig-') + subject.key;
    const predecessor = receipts.find(item => item.key === predecessorKey);
    if (predecessor?.state !== 'COMPLETED') { console.log(JSON.stringify({ key: predecessorKey, state: predecessor?.state ?? 'not-submitted', waiting: true })); continue; }
    const { dependencies } = await api('/projects/' + subject.projectId + '/model-dependencies');
    const dependency = dependencies.find((item: any) => item.takeId === predecessor.takeId && item.stage === (phase === 'refine' ? 'preview' : phase === 'rig' ? 'refine' : 'rig'));
    if (!dependency) throw new Error('Completed predecessor lacks an eligible native task; no replacement request was submitted.');
    await submit(phase + '-' + subject.key, { projectId: subject.projectId, modelId: phase === 'refine' ? 'meshy/meshy-7.1' : phase === 'rig' ? 'meshy/rigging' : 'meshy/animations', prompt: phase === 'refine' ? subject.texture : '', settings: phase === 'refine' ? { mode: 'refine', preview_task_id: dependency.taskId, texture_resolution: '2k', enable_pbr: true } : phase === 'rig' ? { input_task_id: dependency.taskId, height_meters: 1.7 } : { rig_task_id: dependency.taskId, action_id: 30 }, inputAssetIds: {}, parentTakeId: predecessor.takeId, sourceAssetId: predecessor.assetIds?.[0], name: subject.title + (phase === 'refine' ? ' · textured' : phase === 'rig' ? ' · rigged' : ' · casual walk') });
  }
}
if (phase === 'motion') {
  const projectId = '8836985f-6d32-4686-bf0b-d5d7bcfe4118';
  const detail = await api('/projects/' + projectId);
  const source = detail.assets.find((asset: any) => asset.id === 'e345c212-2347-46ef-aff5-07259bc14eaa');
  const referenceTake = detail.takes.find((take: any) => /signal study/i.test(take.name) && take.kind === 'image' && take.status === 'COMPLETED');
  const reference = referenceTake?.assetIds?.[0];
  if (!source || !reference) throw new Error('Mara source video and completed Signal study reference must both exist in the same project.');
  await submit('mara-motion-transfer', { projectId, modelId: 'higgsfield/higgsfield-genjutsu-motion-transfer-v1.0', prompt: 'Keep the original lighthouse keeper performance, movement, timing and camera motion. Recast the scene with the appearance, raincoat, warm signal light and coastal palette of the supplied reference image. Natural physically plausible motion, tactile wet cloth and storm wind. Preserve the composition and emotional quiet of the source.', settings: { resolution: '720p' }, inputAssetIds: { video: source.id, images: [reference] }, parentTakeId: '116394cb-a032-44a7-897f-039741448ef3', sourceAssetId: source.id, name: 'Mara / the signal carries · motion transfer' });
}
if (phase === 'motion-clay') {
  const projectId = '8fa4b332-af41-4dd8-8027-45d2ced245af', sourceAssetId = 'e783d3ed-bead-4cd3-9e52-a03ed695b88c', reference = 'c0a70678-da35-499b-b6a4-e7c7440dcdbc';
  const detail = await api('/projects/' + projectId), parent = detail.takes.find((take: any) => take.assetIds.includes(sourceAssetId));
  if (!parent || !detail.assets.some((asset: any) => asset.id === reference && asset.kind === 'image')) throw new Error('Both original performance and selected sculpted reference must exist in Electric bodies.');
  await submit('electric-bodies-clay-performance', { projectId, modelId: 'higgsfield/higgsfield-genjutsu-motion-transfer-v1.0', prompt: 'Transform the source performance into the tactile handmade clay character and miniature set from the supplied image. Preserve the source dancer choreography, body timing, hand gestures, weight shifts and camera composition throughout the complete shot. The performer has sculpted dark curls, a warm expressive clay face, a lime tracksuit with violet piping and white sneakers, with visible handmade material texture. Replace the scene appearance with the violet miniature cyclorama and large orange disk from the reference. Animate the clay character with the actual source performance and natural continuous contact with the floor. Strong coherent sculpted appearance across every frame, no return to live-action skin, no cuts, no text.', settings: { resolution: '720p' }, inputAssetIds: { video: sourceAssetId, images: [reference] }, parentTakeId: parent.id, sourceAssetId, name: 'Electric bodies / clay keeps the beat · motion transfer' });
}
if (phase === 'support') {
  const liquid = '1bec0508-6565-4cf8-9666-f07d224351a1', image = 'e5ebae2e-4573-49e8-96af-61b7c472fa2c';
  const detail = await api('/projects/' + liquid);
  const parent = detail.takes.find((take: any) => take.assetIds.includes(image));
  if (!parent) throw new Error('The original product source must exist in Liquid daylight.');
  await submit('product-outpaint', { projectId: liquid, modelId: 'bfl/flux-pro-1.0-expand', prompt: 'Extend the original luxurious amber studio environment seamlessly into the new side margins. Preserve the centered perfume bottle, elegant warm reflections and dramatic shadow. Leave generous clean negative space for an advertising layout. No text, no additional products.', settings: { top: 0, bottom: 0, left: 256, right: 256, output_format: 'png' }, inputAssetIds: { image }, parentTakeId: parent.id, sourceAssetId: image, name: 'Liquid daylight / wide campaign canvas · outpaint' });
  await submit('product-cutout', { projectId: liquid, modelId: 'bria/image-edit-remove-background', prompt: '', settings: { preserve_alpha: true }, inputAssetIds: { image }, parentTakeId: parent.id, sourceAssetId: image, name: 'Liquid daylight / the isolated vessel · cutout' });
  await submit('product-upscale', { projectId: liquid, modelId: 'bria/image-edit-increase-resolution', prompt: '', settings: { desired_increase: 2, preserve_alpha: true }, inputAssetIds: { image }, parentTakeId: parent.id, sourceAssetId: image, name: 'Liquid daylight / material detail · 2× upscale' });
  const projects = await api('/projects'), performance = projects.find((project: any) => project.name === 'Electric bodies');
  if (!performance) throw new Error('Electric bodies project is missing.');
  await submit('performance-speech', { projectId: performance.id, modelId: 'byteplus/seed-audio-1.0-multilingual', prompt: 'A calm, warm adult narrator speaks clearly, with a quiet sense of momentum: We move through color. We make our own rhythm. One small gesture changes the whole room.', settings: { format: 'wav', sample_rate: 24000, speech_rate: 0, loudness_rate: 0, pitch_rate: 0, enable_subtitle: true }, inputAssetIds: {}, name: 'Electric bodies / a room in motion · original voiceover' });
  await submit('coastal-ambience', { projectId: '8836985f-6d32-4686-bf0b-d5d7bcfe4118', modelId: 'elevenlabs/eleven_sfx_v2', prompt: 'An intimate cinematic storm coast ambience: steady cold ocean wind, foaming waves washing over dark rocks, distant seabirds and one soft metallic lighthouse mechanism creak. Spacious natural stereo, no music, no speech, no sudden impact.', settings: { duration_seconds: 8, loop: true, prompt_influence: 0.4 }, inputAssetIds: {}, name: 'Mara / shore and signal · original ambience' });
}
if (phase === 'cleanup') {
  await refresh();
  const speech = receipts.find(item => item.key === 'performance-speech');
  if (speech?.state !== 'COMPLETED') throw new Error('Wait for the saved speech before its cleanup stage.');
  const detail = await api('/projects/' + speech.body.projectId);
  const audio = detail.assets.find((asset: any) => speech.assetIds?.includes(asset.id) && asset.kind === 'audio');
  if (!audio) throw new Error('Completed speech has no saved audio.');
  await submit('performance-cleanup', { projectId: speech.body.projectId, modelId: 'veed/clean-audio', prompt: '', settings: { strength: 0.5, normalize_loudness: true, target_lufs: -19, output_format: 'wav' }, inputAssetIds: { audio_url: audio.id }, parentTakeId: speech.takeId, sourceAssetId: audio.id, name: 'Electric bodies / clear voice · cleanup' });
}
if (phase === 'vector') await submit('prismatic-vector', { projectId: '456f5fdb-e79b-4946-9122-dc17e7a291e3', modelId: 'recraft/recraftv4_1_vector', prompt: 'Original editorial vector artwork of a twisting faceted seed pod, constructed from elegant simple geometric paths in vivid coral, violet, turquoise and acid lime on a warm cream background. One central sculptural silhouette with five spiral facets, a few small radiating diamond shapes and generous negative space. Refined contemporary poster design, flat solid shapes with a small number of smooth linear gradients, crisp clean bezier outlines. No text, no lettering, no logos, no raster imagery.', settings: { n: 1, size: '1024x1024', no_text: true }, inputAssetIds: {}, name: 'Prismatic garden / the seed language · editable vector' });
if (phase === 'vector-corrected') {
  await refresh();
  const original = receipts.find(item => item.key === 'prismatic-vector');
  if (original?.state !== 'FAILED') throw new Error('The earlier rejected request must remain preserved before a corrected variant is submitted.');
  await submit('prismatic-vector-native-controls', { ...original.body, settings: { n: 1, size: '1024x1024' }, name: 'Prismatic garden / the seed language · native vector controls' });
}
if (phase === 'ltx') await submit('prismatic-ltx-native-audio', { projectId: '456f5fdb-e79b-4946-9122-dc17e7a291e3', modelId: 'ltx/ltx-2-5-fast', prompt: 'A slow elegant orbit around an original luminous faceted glass seed sculpture in a dark gallery. Its five spiralling ribs catch cyan, violet and amber light as a soft ribbon of caustic reflections moves across the polished black floor. One continuous cinematic shot, tangible glass with precise edges, calm intentional camera movement and no cuts. A quiet spacious crystalline soundscape: one delicate glass chime and a low warm atmospheric hum, no speech, no music melody, no text.', settings: { duration: 4, fps: 25, resolution: '1280x720', generate_audio: true }, inputAssetIds: {}, name: 'Prismatic garden / light finds a rhythm · LTX original' });
if (phase === 'video-enhance') {
  const projectId = '8836985f-6d32-4686-bf0b-d5d7bcfe4118', sourceAssetId = 'e345c212-2347-46ef-aff5-07259bc14eaa';
  const detail = await api('/projects/' + projectId), parent = detail.takes.find((take: any) => take.assetIds.includes(sourceAssetId));
  if (!parent) throw new Error('The original saved Mara video must exist before enhancement.');
  await submit('mara-video-enhancement', { projectId, modelId: 'bfl/video-upscale-v1', prompt: '', settings: { upscale_factor: 2, creativity: 0, safety_tolerance: 2 }, inputAssetIds: { input_video: sourceAssetId }, parentTakeId: parent.id, sourceAssetId, name: 'Mara / coastal detail · 2× video enhancement' });
}
if (phase === 'amber-alternate') {
  await refresh();
  const failed = receipts.find(item => item.key === 'refine-amber-bottle'), preview = receipts.find(item => item.key === 'preview-amber-bottle');
  if (failed?.state !== 'FAILED' || preview?.state !== 'COMPLETED') throw new Error('Alternate finish is only for the preserved failed PBR refinement.');
  const { dependencies } = await api('/projects/' + preview.body.projectId + '/model-dependencies');
  const predecessor = dependencies.find((item: any) => item.takeId === preview.takeId && item.stage === 'preview');
  if (!predecessor) throw new Error('The original preview is no longer an eligible provider predecessor.');
  await submit('refine-amber-opaque', { projectId: preview.body.projectId, modelId: 'meshy/meshy-7.1', prompt: 'Opaque polished honey-amber lacquer on the bottle body, a glossy dark charcoal spherical cap and a slim warm brass neck collar. Smooth elegant premium product finish with a warm amber gradient. No transparency, no lettering, no labels, no logos.', settings: { mode: 'refine', preview_task_id: predecessor.taskId, texture_resolution: '2k', enable_pbr: false }, inputAssetIds: {}, parentTakeId: preview.takeId, sourceAssetId: preview.assetIds?.[0], name: 'Liquid daylight / amber lacquer · alternate texture' });
}
if (phase === 'status') { await refresh(); for (const { key, state, requestId, takeId, assetIds, creditsUsed, error } of receipts) console.log(JSON.stringify({ key, state, requestId, takeId, assetIds, creditsUsed, error })); }
if (phase === 'summary') {
  await refresh();
  const states = Object.fromEntries([...new Set(receipts.map(item => item.state ?? 'unsubmitted'))].map(state => [state, receipts.filter(item => item.state === state).length]));
  const known = receipts.filter(item => item.creditsUsed !== null && item.creditsUsed !== undefined && Number.isFinite(Number(item.creditsUsed)));
  const report = { verifiedAt: new Date().toISOString(), intendedRequests: receipts.length, states, savedAssets: receipts.reduce((sum, item) => sum + (item.assetIds?.length ?? 0), 0), availableReportedCreditsSubtotal: Number(known.reduce((sum, item) => sum + Number(item.creditsUsed), 0).toFixed(2)), requestsWithReportedCredits: known.length, requestsWithoutReportedCredits: receipts.length - known.length, billingBoundary: 'Incomplete subtotal of reported Comfy credits only, not an account bill, price estimate, balance, or proof that unreported requests were free.', executions: receipts.map(item => ({ key: item.key, modelId: item.body.modelId, requestedProvider: item.body.modelId.split('/')[0], servingProvider: item.servingProvider ?? null, state: item.state, requestId: item.requestId, takeId: item.takeId, assetIds: item.assetIds, creditsUsed: item.creditsUsed ?? null, error: item.error })) };
  await writeFile(`${folder}/production-summary.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ...report, executions: undefined }));
}
if (phase === 'verify') {
  const details = await refresh(), results: Record<string, unknown>[] = [];
  for (const receipt of receipts.filter(item => item.state === 'COMPLETED')) {
    const detail = details.get(receipt.body.projectId);
    for (const assetId of receipt.assetIds ?? []) {
      const asset = detail.assets.find((item: any) => item.id === assetId);
      const url = new URL(asset.url, 'http://127.0.0.1:4310');
      if (url.origin !== 'http://127.0.0.1:4310') throw new Error('Verification accepts only the managed local asset URL');
      const response = await fetch(url);
      if (!response.ok) throw new Error('Saved media did not reopen');
      const bytes = Buffer.from(await response.arrayBuffer());
      if (bytes.length !== asset.size) throw new Error('Saved media size differs from its asset record');
      if (createHash('sha256').update(bytes).digest('hex') !== asset.sha256) throw new Error('Saved media hash differs from its asset record');
      const result: Record<string, unknown> = { key: receipt.key, assetId, kind: asset.kind, bytes: bytes.length, reopened: true, sha256Verified: true, verifiedAt: new Date().toISOString() };
      if (asset.kind === 'image') { const info = await sharp(bytes).metadata(); Object.assign(result, { width: info.width, height: info.height, hasAlpha: info.hasAlpha, format: info.format }); }
      if (asset.kind === 'video' || asset.kind === 'audio') {
        const temporaryRoot = path.resolve(os.tmpdir()), temporary = await mkdtemp(path.join(temporaryRoot, 'ots-catalogue-verify-'));
        try {
          const mediaPath = path.join(temporary, 'output'); await writeFile(mediaPath, bytes);
          const { ffprobe } = mediaToolPaths();
          const info = JSON.parse((await runMediaTool(ffprobe, ['-v', 'error', '-protocol_whitelist', 'file,pipe', '-show_streams', '-show_format', '-of', 'json', mediaPath], 4 * 1024 * 1024, 30000)).toString());
          const video = info.streams?.find((stream: any) => stream.codec_type === 'video'), audio = info.streams?.find((stream: any) => stream.codec_type === 'audio');
          if (!(asset.kind === 'video' ? video : audio)) throw new Error('Saved media lacks its expected stream');
          Object.assign(result, { duration: Number(info.format?.duration), width: video?.width, height: video?.height, videoCodec: video?.codec_name, hasAudio: !!audio, audioCodec: audio?.codec_name, audioChannels: audio?.channels, frameRate: video?.avg_frame_rate });
        } finally { if (path.dirname(temporary) !== temporaryRoot || !path.basename(temporary).startsWith('ots-catalogue-verify-')) throw new Error('Unexpected verification directory'); await rm(temporary, { recursive: true, force: true }); }
      }
      if (asset.mimeType === 'image/svg+xml') { if (!response.headers.get('content-disposition')?.startsWith('attachment')) throw new Error('SVG must be served as an attachment'); Object.assign(result, { attachmentOnly: true, sanitizedVector: true }); }
      if (asset.kind === '3d') {
        if (bytes.toString('ascii', 0, 4) !== 'glTF' || bytes.readUInt32LE(4) !== 2 || bytes.readUInt32LE(8) !== bytes.length) throw new Error('Output is not a valid GLB v2 container');
        const jsonLength = bytes.readUInt32LE(12), gltf = JSON.parse(bytes.toString('utf8', 20, 20 + jsonLength));
        if (!gltf.meshes?.length || !gltf.accessors?.length) throw new Error('GLB has no actual mesh geometry');
        Object.assign(result, { meshes: gltf.meshes.length, materials: gltf.materials?.length ?? 0, textures: gltf.textures?.length ?? 0, animations: gltf.animations?.length ?? 0, skins: gltf.skins?.length ?? 0, embeddedImages: gltf.images?.filter((image: any) => image.bufferView !== undefined || image.uri?.startsWith('data:')).length ?? 0, externalImages: gltf.images?.filter((image: any) => image.uri && !image.uri.startsWith('data:')).length ?? 0 });
      }
      results.push(result); console.log(JSON.stringify(result));
    }
  }
  await writeFile(`${folder}/media-verification.json`, JSON.stringify(results, null, 2));
}
