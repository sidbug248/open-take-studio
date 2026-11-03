import { readFile, writeFile } from 'node:fs/promises';
const receipt = JSON.parse(await readFile('artifacts/inspection-build/local-productions/receipt.json', 'utf8')), base = 'http://127.0.0.1:4310/api';
const response = await fetch(base + '/projects/' + receipt.projectId); if (!response.ok) throw new Error('Project unavailable');
const project = await response.json(), saved = [];
for (const item of receipt.motion) {
  const asset = project.assets.find((asset: any) => asset.kind === 'video' && asset.metadata.operation === 'motion-render' && asset.metadata.compositionAssetId === item.assetId), take = project.takes.find((take: any) => take.assetIds.includes(asset?.id));
  if (!asset || take?.modelId !== 'local/motion-render') throw new Error('Actual rendered composition output missing for ' + item.name);
  const id = 'inspection-motion-' + asset.id, old = project.project.catalogueDemonstrations?.find((demo: any) => demo.id === id);
  if (old) { saved.push(old); continue; }
  const record = { id, capabilityId: 'motion-design', operationId: 'local.motion.composition.render', title: item.name, previewKind: 'video', projectId: receipt.projectId, previewAssetId: asset.id, ...(asset.metadata.posterAssetId ? { posterAssetId: asset.metadata.posterAssetId } : {}), inputAssetIds: Object.values(take.inputAssetIds).flat(), outputAssetIds: take.assetIds, takeId: take.id, workflowReference: { kind: 'project', toolView: 'motion', artifactAssetId: item.assetId, takeIds: [take.id], note: 'Actual six-second local type/geometry/audio composition. Editable composition settings and source audio remain saved; no hidden generation.' }, verificationKind: 'local-operation', verifiedAt: take.updatedAt, attribution: { creator: 'Open Take Studio', source: 'studio-original' }, createdAt: take.createdAt };
  const result = await fetch(base + '/projects/' + receipt.projectId + '/catalogue-demonstrations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(record) }); if (!result.ok) throw new Error(await result.text()); saved.push(await result.json());
}
await writeFile('artifacts/inspection-build/production/motion-demonstrations.json', JSON.stringify(saved.map(({ id, projectId, takeId, inputAssetIds, outputAssetIds }) => ({ id, projectId, takeId, inputAssetIds, outputAssetIds })), null, 2));
console.log(JSON.stringify({ demonstrations: saved.length }));
