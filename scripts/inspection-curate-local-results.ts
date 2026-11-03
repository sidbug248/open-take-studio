import { writeFile } from 'node:fs/promises';
const base = 'http://127.0.0.1:4310/api';
async function api(route: string, body?: unknown) { const response = await fetch(base + route, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : undefined); if (!response.ok) throw new Error(await response.text()); return response.json(); }
const catalogue = await api('/catalogue'), saved = [];
for (const id of ['video-trim', 'motion-design', 'story-pages', 'mesh-inspect', 'mesh-render-sequence']) {
  const capability = catalogue.capabilities.find((item: any) => item.id === id);
  if (capability.demonstrations.length) continue;
  const example = capability.examples.find((item: any) => ['image', 'video'].includes(item.kind)); if (!example) throw new Error('No actual visual result: ' + id);
  const project = await api('/projects/' + example.projectId), take = project.takes.find((item: any) => item.id === example.takeId), preview = project.assets.find((item: any) => item.id === example.assetId);
  if (take.status !== 'LOCAL' || take.provenance !== 'local-edit') throw new Error('Not a local result');
  const inputs = [...new Set(Object.values(take.inputAssetIds).flat())].filter(input => project.assets.some((asset: any) => asset.id === input));
  const source = take.sourceAssetId ? project.assets.find((asset: any) => asset.id === take.sourceAssetId && asset.kind === 'document') : undefined;
  const filmId = typeof preview.metadata.filmId === 'string' && project.project.films?.some((film: any) => film.id === preview.metadata.filmId) ? preview.metadata.filmId : undefined;
  const record = { id: 'inspection-local-result-' + id, capabilityId: id, operationId: 'local.' + id + '.render', title: take.name + ' · actual saved local result', previewKind: id === 'mesh-inspect' ? 'scene' : preview.kind, projectId: take.projectId, previewAssetId: preview.id, ...(preview.metadata.posterAssetId ? { posterAssetId: preview.metadata.posterAssetId } : {}), inputAssetIds: inputs, outputAssetIds: take.assetIds, takeId: take.id, workflowReference: { kind: filmId ? 'film' : 'project', toolView: capability.route.toolView, ...(filmId ? { filmId } : {}), ...(source ? { artifactAssetId: source.id } : {}), takeIds: [take.id], note: 'Actual prior-pass local output, created ' + take.createdAt + '; project/take/source/output relationships reopened and verified on ' + new Date().toISOString() + '. No new inference or new interaction recording is claimed.' }, verificationKind: 'local-operation', verifiedAt: new Date().toISOString(), attribution: { creator: 'Open Take Studio', source: 'studio-original' }, createdAt: take.createdAt };
  saved.push(await api('/projects/' + take.projectId + '/catalogue-demonstrations', record));
}
await writeFile('artifacts/inspection-build/production/local-result-demonstrations.json', JSON.stringify(saved.map(({ id, capabilityId, projectId, takeId, inputAssetIds, outputAssetIds, workflowReference }) => ({ id, capabilityId, projectId, takeId, inputAssetIds, outputAssetIds, workflowReference })), null, 2));
console.log(JSON.stringify({ demonstrations: saved.length }));
