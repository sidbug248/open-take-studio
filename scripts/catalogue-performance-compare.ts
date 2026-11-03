// Read-only saved-media review: no inference, database mutation, or API uploads.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp, { type OverlayOptions } from 'sharp';
import { config } from '../server/config.ts';
import { FilmMediaTools, mediaToolPaths, runMediaTool } from '../server/film-media.ts';
import { LocalFileStorage } from '../server/media.ts';
import type { Asset } from '../shared/types.ts';

const folder = path.resolve('artifacts/next-build/catalogue-production');
const receipts = JSON.parse(await readFile(path.join(folder, 'submissions.json'), 'utf8'));
const receipt = receipts.find((item: any) => item.key === 'electric-bodies-clay-performance');
if (!receipt?.jobId) throw new Error('The intended performance request has not been admitted.');
const response = await fetch(`http://127.0.0.1:4310/api/projects/${receipt.body.projectId}`);
if (!response.ok) throw new Error('Cannot read saved project.');
const detail = await response.json() as any, job = detail.jobs.find((item: any) => item.id === receipt.jobId), take = detail.takes.find((item: any) => item.id === receipt.takeId);
if (job?.state !== 'COMPLETED') { console.log(JSON.stringify({ state: job?.state, requestId: job?.requestId, comparison: 'waiting for original request' })); process.exit(0); }
const source = detail.assets.find((asset: Asset) => asset.id === receipt.body.sourceAssetId) as Asset;
const result = detail.assets.find((asset: Asset) => take.assetIds.includes(asset.id) && asset.kind === 'video') as Asset;
if (!source || !result) throw new Error('Saved source/result pair missing.');
const media = new LocalFileStorage(config.dataDir), tools = new FilmMediaTools(config.dataDir, media);
const [sourceInfo, resultInfo] = await Promise.all([tools.inspect(source), tools.inspect(result)]);
const duration = Math.min(sourceInfo.duration, resultInfo.duration), { ffmpeg } = mediaToolPaths();
await mkdir(folder, { recursive: true });
const title = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="54"><rect width="1280" height="54" fill="#141419"/><g fill="#eeeeef" font-family="Arial" font-size="20"><text x="22" y="34">SOURCE · saved H3 performance</text><text x="662" y="34">RESULT · Genjutsu clay reference transfer</text></g></svg>');
const titleFile = path.join(folder, 'electric-comparison-labels.png');
await writeFile(titleFile, await sharp(title).png().toBuffer());
const output = path.join(folder, 'electric-source-clay-comparison.mp4');
await runMediaTool(ffmpeg, ['-y', '-v', 'error', '-i', media.path(source), '-i', media.path(result), '-loop', '1', '-i', titleFile,
  '-filter_complex', '[0:v]setpts=PTS-STARTPTS,fps=24,scale=640:800:force_original_aspect_ratio=decrease,pad=640:800:(ow-iw)/2:(oh-ih)/2:color=0x111116,setsar=1[left];[1:v]setpts=PTS-STARTPTS,fps=24,scale=640:800:force_original_aspect_ratio=decrease,pad=640:800:(ow-iw)/2:(oh-ih)/2:color=0x111116,setsar=1[right];[left][right]hstack=inputs=2,pad=1280:854:0:54:color=0x141419[comparison];[comparison][2:v]overlay=0:0:shortest=1[final]',
  '-map', '[final]', '-map', '0:a?', '-t', duration.toFixed(6), '-c:v', 'libx264', '-preset', 'fast', '-crf', '19', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-movflags', '+faststart', output], 16 * 1024 * 1024, 120000);

const requestedTimes = [0.5, 1.5, 2.5, 3.5, 4.5].filter(time => time < duration);
const frameRows: { requestedSeconds: number; sourceSeconds: number; resultSeconds: number }[] = [];
const width = 640, cellWidth = 320, cellHeight = 400, rowHeight = 430;
const layers: OverlayOptions[] = [];
for (let index = 0; index < requestedTimes.length; index++) {
  const seconds = requestedTimes[index]!;
  const [sourceFrame, resultFrame] = await Promise.all([tools.extractFrame(source, seconds), tools.extractFrame(result, seconds)]);
  frameRows.push({ requestedSeconds: seconds, sourceSeconds: sourceFrame.actualSeconds, resultSeconds: resultFrame.actualSeconds });
  for (const [column, frame] of [sourceFrame, resultFrame].entries()) layers.push({ input: await sharp(frame.bytes).resize(cellWidth, cellHeight, { fit: 'contain', background: '#141419' }).png().toBuffer(), left: column * cellWidth, top: 46 + index * rowHeight });
  const label = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="640" height="30"><rect width="640" height="30" fill="#141419"/><g fill="#eeeeef" font-family="Arial" font-size="14"><text x="10" y="21">Source ${sourceFrame.actualSeconds.toFixed(3)}s</text><text x="330" y="21">Result ${resultFrame.actualSeconds.toFixed(3)}s</text></g></svg>`);
  layers.push({ input: label, left: 0, top: 46 + index * rowHeight + cellHeight });
}
const heading = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="640" height="46"><rect width="640" height="46" fill="#22222b"/><text x="12" y="29" fill="#eeeeef" font-family="Arial" font-size="18">Electric bodies · actual decoded frames at matching times</text></svg>');
layers.push({ input: heading, left: 0, top: 0 });
const contact = path.join(folder, 'electric-source-clay-contact.png');
await sharp({ create: { width, height: 46 + rowHeight * requestedTimes.length, channels: 4, background: '#141419' } }).composite(layers).png().toFile(contact);
const manifest = { createdAt: new Date().toISOString(), sourceAssetId: source.id, resultAssetId: result.id, requestId: job.requestId, sourceSha256: source.sha256, resultSha256: result.sha256, sourceInfo, resultInfo, duration, alignment: 'Both clips start at zero and stop at the shorter duration. Video is normalized to 24fps without speed changes. Only source audio is used. Contact sheets use actual nearest decoded timestamps; labels record each timestamp.', frameRows, comparisonFile: path.basename(output), contactSheetFile: path.basename(contact), boundary: 'Local review artifact made from actual saved media; no new inference and no fidelity or identity guarantee.' };
await writeFile(path.join(folder, 'electric-comparison-receipt.json'), JSON.stringify(manifest, null, 2));
console.log(JSON.stringify({ requestId: job.requestId, duration, frames: frameRows.length, comparisonFile: output, contactSheetFile: contact }));
