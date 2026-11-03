import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import sharp from 'sharp';
const directory = 'artifacts/inspection-build/production', root = path.resolve('data/media');
const receipts = JSON.parse(await readFile(directory + '/requests.json', 'utf8')) as { key: string; state: string; body: { projectId: string }; takeId: string; jobId: string; requestId: string; outputAssetIds: string[] }[];
const projects = new Map<string, any>(), checked: any[] = [];
for (const item of receipts.filter(item => item.state === 'COMPLETED')) {
  if (!projects.has(item.body.projectId)) { const response = await fetch('http://127.0.0.1:4310/api/projects/' + item.body.projectId); if (!response.ok) throw new Error('Project reopen failed'); projects.set(item.body.projectId, await response.json()); }
  const project = projects.get(item.body.projectId), take = project.takes.find((take: any) => take.id === item.takeId), job = project.jobs.find((job: any) => job.id === item.jobId);
  if (!take || take.status !== 'COMPLETED' || job?.state !== 'COMPLETED') throw new Error('Completed history did not reopen');
  for (const id of item.outputAssetIds) {
    const asset = project.assets.find((asset: any) => asset.id === id); if (!asset || !take.assetIds.includes(id) || asset.metadata.operation === 'asset-poster') throw new Error('Missing output or incorrectly counted poster');
    const filename = path.resolve(root, asset.fileName); if (!filename.startsWith(root + path.sep)) throw new Error('Media path escaped root');
    const bytes = await readFile(filename), hash = createHash('sha256').update(bytes).digest('hex');
    if (hash !== asset.sha256 || bytes.length !== asset.size) throw new Error('Saved bytes mismatch ' + id);
    const row: any = { key: item.key, projectId: item.body.projectId, takeId: item.takeId, jobId: item.jobId, requestId: item.requestId, assetId: id, kind: asset.kind, mimeType: asset.mimeType, size: bytes.length, sha256: hash };
    if (asset.kind === 'image') { const metadata = await sharp(bytes).metadata(); row.dimensions = { width: metadata.width, height: metadata.height }; }
    if (asset.kind === '3d') {
      if (bytes.toString('ascii', 0, 4) !== 'glTF' || bytes.readUInt32LE(4) !== 2 || bytes.readUInt32LE(8) !== bytes.length) throw new Error('Invalid GLB output');
      const json = JSON.parse(bytes.toString('utf8', 20, 20 + bytes.readUInt32LE(12)).trim()); row.meshes = json.meshes?.length ?? 0; row.materials = json.materials?.length ?? 0; row.textures = json.textures?.length ?? 0; row.skins = json.skins?.length ?? 0; row.animations = json.animations?.length ?? 0;
      if (!row.meshes) throw new Error('GLB has no mesh');
    }
    if (asset.mimeType === 'text/plain') row.text = bytes.toString('utf8');
    checked.push(row);
  }
}
const result = { at: new Date().toISOString(), reopenedProjects: projects.size, verifiedOutputAssets: checked.length, totalBytes: checked.reduce((sum, row) => sum + row.size, 0), allSizeAndSha256Matched: true, assets: checked };
await writeFile(directory + '/media-verification.json', JSON.stringify(result, null, 2));
console.log(JSON.stringify({ reopenedProjects: result.reopenedProjects, verifiedOutputAssets: result.verifiedOutputAssets, totalBytes: result.totalBytes, allSizeAndSha256Matched: true }));
