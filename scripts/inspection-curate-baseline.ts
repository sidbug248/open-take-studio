import { GENERATION_OPERATIONS } from '../server/catalogue-demonstrations.ts';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
const base = 'http://127.0.0.1:4310/api', directory = path.resolve('artifacts/inspection-build/production');
await mkdir(directory, { recursive: true });
async function api(route: string, method = 'GET', body?: unknown) { const result = await fetch(base + route, { method, headers: { 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) }); const json = await result.json(); if (!result.ok) throw new Error(`${result.status}: ${json.error}`); return json; }
const catalogue = await api('/catalogue'), projects = await api('/projects');
const checkpoint = JSON.parse(await readFile('artifacts/inspection-build/checkpoint-2026-11-03/receipt.json', 'utf8'));
const ids = new Set(projects.filter((item: any) => item.createdAt < checkpoint.createdAt).map((item: any) => item.id));
const cache = new Map<string, any>(); const saved: any[] = [];
for (const capability of catalogue.capabilities.filter((item: any) => item.route.kind === 'router' && GENERATION_OPERATIONS[item.id])) {
  const seen = new Set<string>();
  for (const example of capability.examples.filter((item: any) => ids.has(item.projectId))) {
    if (seen.has(example.takeId)) continue; seen.add(example.takeId);
    if (!cache.has(example.projectId)) cache.set(example.projectId, await api('/projects/' + example.projectId));
    const detail = cache.get(example.projectId), take = detail.takes.find((item: any) => item.id === example.takeId), assets = take.assetIds.map((id: string) => detail.assets.find((asset: any) => asset.id === id)).filter((asset: any) => asset && asset.metadata.operation !== 'asset-poster');
    if (take.createdAt >= checkpoint.createdAt) continue;
    const preview = assets.find((asset: any) => asset.kind !== 'document'); if (!preview) continue;
    const poster = detail.assets.find((asset: any) => asset.metadata.operation === 'asset-poster' && asset.metadata.sourceAssetId === preview.id);
    const id = 'baseline-' + capability.id + '-' + take.id;
    if (detail.project.catalogueDemonstrations?.some((item: any) => item.id === id)) continue;
    const record = { id, projectId: take.projectId, capabilityId: capability.id, operationId: GENERATION_OPERATIONS[capability.id], title: take.name, previewKind: preview.kind === '3d' ? 'mesh' : preview.kind, previewAssetId: preview.id, ...(poster ? { posterAssetId: poster.id } : preview.kind === 'image' ? { posterAssetId: preview.id } : {}), inputAssetIds: [...new Set(Object.values(take.inputAssetIds).flat())], outputAssetIds: assets.map((asset: any) => asset.id), takeId: take.id, jobId: take.jobId, verificationKind: 'generation', attribution: { creator: 'Open Take Studio original collection', source: 'studio-original' }, createdAt: take.createdAt };
    await api('/projects/' + take.projectId + '/catalogue-demonstrations', 'POST', record); saved.push({ capabilityId: capability.id, demonstrationId: id, projectId: take.projectId, takeId: take.id });
  }
}
let old: any[] = []; const file = path.join(directory, 'baseline-demonstrations.json'); try { old = JSON.parse(await readFile(file, 'utf8')); } catch {}
await writeFile(file, JSON.stringify([...old, ...saved], null, 2)); console.log(JSON.stringify({ created: saved.length }));
