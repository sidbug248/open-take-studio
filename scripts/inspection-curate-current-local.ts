import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { mediaToolPaths, runMediaTool } from '../server/film-media.ts';

const base = 'http://127.0.0.1:4310';
const folder = path.resolve('artifacts/inspection-build/current-local-proofs');
await mkdir(folder, { recursive: true });
async function api(route: string, body?: unknown) {
  const response = await fetch(base + '/api' + route, body instanceof FormData ? { method: 'POST', body } : body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : undefined);
  if (!response.ok) throw new Error(await response.text()); return response.json();
}
const camera = JSON.parse(await readFile(path.join(folder, 'camera-proof.json'), 'utf8'));
const batch = JSON.parse(await readFile(path.join(folder, 'batch-proof.json'), 'utf8'));
const after = JSON.parse(await readFile(path.join(folder, 'batch-after-api.json'), 'utf8'));
if (!camera.after.endsWith('Slow dolly in toward the subject, a steady camera, gentle parallax.') || !after.noNewJobs || !after.selectedTakesUnchanged) throw new Error('Current browser evidence missing');
const room = JSON.parse(await readFile('artifacts/inspection-build/object-room/receipt.json', 'utf8'));
const capture = [
  { id: 'camera-presets', projectId: camera.projectId, title: 'Prismatic bloom / choose a camera intention', tool: 'studio', files: ['camera-before.png', 'camera-after.png'], note: 'Actual browser frames, 2026-11-03: Move closer appended the visible slow-dolly phrase to the editable prompt. Original draft restored; no generation submitted. This proves prompt-guided presets, not a model-enforced camera path.' },
  { id: 'batch-shots', projectId: batch.projectId, title: 'Mara / reuse two shots and reopen the saved batch', tool: 'shots', files: ['batch-before.png', 'batch-completed.png', 'batch-reopened.png'], takeIds: batch.reusedTakeIds as string[], note: 'Actual browser frames, 2026-11-03: preview showed zero billable requests; both existing imported-example takes were reused. Reload restored the immutable batch and both Source reused outcomes. API job count stayed11 and shot selections were unchanged. This check did not induce a mid-flight inference interruption.' },
];
const saved: unknown[] = [];
async function upload(project: any, filename: string, mime: string, capabilityId: string) {
  const bytes = await readFile(filename), sha256 = createHash('sha256').update(bytes).digest('hex');
  const prior = project.assets.find((asset: any) => asset.sha256 === sha256 && asset.metadata.operation === 'catalogue-local-demonstration'); if (prior) return prior;
  const body = new FormData(); body.set('file', new Blob([bytes], { type: mime }), path.basename(filename)); body.set('name', path.basename(filename)); body.set('provenance', 'local-edit'); body.set('metadata', JSON.stringify({ operation: 'catalogue-local-demonstration', capabilityId, captureKind: 'actual-browser-frames', capturedAt: new Date().toISOString() }));
  const asset = await api('/projects/' + project.project.id + '/assets', body); project.assets.push(asset); return asset;
}
for (const item of capture) {
  const project = await api('/projects/' + item.projectId), id = 'inspection-current-' + item.id;
  const prior = project.project.catalogueDemonstrations?.find((demo: any) => demo.id === id); if (prior) { saved.push(prior); continue; }
  const files = item.files.map(file => path.join(folder, file));
  const manifest = files.flatMap(file => [`file '${file.replaceAll('\\', '/').replaceAll("'", "'\\''")}'`, 'duration 2']).concat(`file '${files.at(-1)!.replaceAll('\\', '/')}'`).join('\n');
  const sequence = path.join(folder, item.id + '.ffconcat'), movie = path.join(folder, item.id + '.mp4'); await writeFile(sequence, manifest);
  await runMediaTool(mediaToolPaths().ffmpeg, ['-nostdin','-v','error','-y','-f','concat','-safe','0','-i',sequence,'-vf','scale=1280:900:force_original_aspect_ratio=decrease,pad=1280:900:(ow-iw)/2:(oh-ih)/2,setsar=1','-r','24','-t',String(files.length*2),'-an','-c:v','libx264','-crf','20','-pix_fmt','yuv420p','-movflags','+faststart',movie],1024*1024,60000);
  const preview = await upload(project, movie, 'video/mp4', item.id), poster = await upload(project, files.at(-1)!, 'image/png', item.id), now = new Date().toISOString();
  const inputs = (item.takeIds ?? []).flatMap(id => project.takes.find((take: any) => take.id === id)?.assetIds ?? []);
  saved.push(await api('/projects/' + item.projectId + '/catalogue-demonstrations', { id, capabilityId:item.id, operationId:'local.'+item.id+'.browser-observed',title:item.title,previewKind:'workflow',projectId:item.projectId,previewAssetId:preview.id,posterAssetId:poster.id,inputAssetIds:inputs,outputAssetIds:[preview.id],workflowReference:{kind:'project',toolView:item.tool,...(item.takeIds ? {takeIds:item.takeIds}:{}),note:item.note},verificationKind:'interaction',verifiedAt:now,createdAt:now,attribution:{creator:'Open Take Studio',source:'studio-original'} }));
}
const project = await api('/projects/' + room.projectId), id = 'inspection-object-room-three-viewpoints';
const prior = project.project.catalogueDemonstrations?.find((demo: any) => demo.id === id);
if (prior) saved.push(prior);
else {
  const poster = await upload(project, path.resolve('artifacts/inspection-build/object-room/browser/03-light.png'), 'image/png', 'object-room');
  const now = new Date().toISOString();
  saved.push(await api('/projects/' + room.projectId + '/catalogue-demonstrations', { id, capabilityId:'object-room',operationId:'local.object-room.guided-viewpoints',title:'Afterlight / explore the actual object',previewKind:'playable',projectId:room.projectId,previewAssetId:poster.id,posterAssetId:poster.id,inputAssetIds:[room.sceneAssetId,room.refinedModelAssetId,room.optionalAudioAssetId,room.imageCueAssetId],outputAssetIds:[room.roomAssetId],takeId:room.roomTakeId,workflowReference:{kind:'project',toolView:'object-room',artifactAssetId:room.roomAssetId,note:'Actual independent browser player4322: three view buttons, keyboard3 and pointer orbit verified. Saved room reopens; all17 exported runtime/media files returned200 with matching hashes. Actual Meshy geometry, authored scene and annotations; no inference in the player.'},verificationKind:'interaction',verifiedAt:now,createdAt:now,attribution:{creator:'Open Take Studio',source:'studio-original'} }));
}
await writeFile(path.join(folder,'demonstrations.json'),JSON.stringify({at:new Date().toISOString(),records:saved},null,2));
console.log(JSON.stringify({registered:saved.length,capabilities:['camera-presets','batch-shots','object-room']}));
