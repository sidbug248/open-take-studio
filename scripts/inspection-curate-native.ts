import { readFile, writeFile } from 'node:fs/promises';
const base = 'http://127.0.0.1:4310/api';
async function api(route: string, body?: unknown) { const response = await fetch(base + route, body ? { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'http://127.0.0.1:4310' }, body: JSON.stringify(body) } : undefined); if (!response.ok) throw new Error(`HTTP ${response.status}: ${await response.text()}`); return response.json(); }
const imageReceipt = JSON.parse(await readFile('artifacts/native-workflows/app-execution-receipt.json', 'utf8'));
const h3Receipt = JSON.parse(await readFile('artifacts/native-workflows/h3-execution-receipt.json', 'utf8'));
const regenerate = JSON.parse(await readFile('artifacts/native-workflows/regenerate-execution-receipt.json', 'utf8'));
const rows = [
  ...imageReceipt.jobs.map((job: any, index: number) => ({ projectId: job.projectId, jobId: job.id, title: index ? 'Prism Atelier · native resize and sharpen' : 'Prism Atelier · native Z-Image Turbo', capabilityId: 'native-workflows' })),
  { projectId: h3Receipt.projectId, jobId: h3Receipt.jobId, title: 'Prism Atelier · native H3 image to video', capabilityId: 'native-workflows' },
  { projectId: regenerate.projectId, jobId: regenerate.jobId, title: 'Tidal Cinema · native H3 768P to 2K regeneration', capabilityId: 'video-regenerate' },
];
const saved = [];
for (const row of rows) {
  const project = await api('/projects/' + row.projectId), job = project.jobs.find((job: any) => job.id === row.jobId), take = project.takes.find((take: any) => take.id === job?.takeId);
  if (!job || job.state !== 'COMPLETED' || !take) throw new Error('Native take is not completed: ' + row.jobId);
  const output = project.assets.find((asset: any) => asset.id === take.assetIds[0]);
  const id = 'inspection-native-' + row.jobId;
  const old = project.project.catalogueDemonstrations?.find((demo: any) => demo.id === id);
  if (old) { saved.push(old); continue; }
  const inputs = [...new Set(Object.values(take.inputAssetIds).flat())].filter(id => project.assets.some((asset: any) => asset.id === id && asset.kind !== 'document'));
  const demo = { id, capabilityId: row.capabilityId, operationId: row.capabilityId === 'video-regenerate' ? 'workflow.video.regenerate.h3' : 'workflow.execute', title: row.title, previewKind: output.kind, projectId: row.projectId, previewAssetId: output.id, inputAssetIds: inputs, outputAssetIds: take.assetIds, takeId: take.id, jobId: job.id, requestId: job.requestId, workflowReference: { kind: 'native-workflow', toolView: 'workflow', nativeWorkflowId: job.workflow.versionAssetId, artifactAssetId: job.workflow.executedGraphAssetId, note: row.capabilityId === 'video-regenerate' ? 'Native MiniMax regeneration partner node; the Router base_video route remains disabled.' : 'Exact version and executed API graph are retained with the actual output.' }, verificationKind: 'generation', verifiedAt: job.completedAt ?? job.updatedAt, attribution: { creator: 'Open Take Studio', source: 'studio-original', licenseNote: 'Application code and model/service licenses are separate. No all-open-weights certification.' }, createdAt: job.completedAt ?? job.updatedAt };
  saved.push(await api('/projects/' + row.projectId + '/catalogue-demonstrations', demo));
}
await writeFile('artifacts/inspection-build/production/native-demonstrations.json', JSON.stringify(saved.map(({ id, capabilityId, operationId, projectId, takeId, jobId, requestId, outputAssetIds, workflowReference }) => ({ id, capabilityId, operationId, projectId, takeId, jobId, requestId, outputAssetIds, workflowReference })), null, 2));
console.log(JSON.stringify({ demonstrations: saved.length }));
