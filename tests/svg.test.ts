import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { sanitizeSvg, rasterizeSvg } from '../server/svg.ts';
import { LocalFileStorage, identifyMedia } from '../server/media.ts';
import { extractModelMedia } from '../server/model-registry.ts';
import { Store } from '../server/store.ts';
import { exportProject, importProject } from '../server/project-routes.ts';
import { randomUUID } from 'node:crypto';
const vector = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="200" viewBox="0 0 400 200"><defs><linearGradient id="paint"><stop offset="0%" stop-color="#ff4d37"/><stop offset="100%" stop-color="#5238ff"/></linearGradient></defs><path d="M10 10 L390 10 L200 190 Z" fill="url(#paint)"/><text x="20" y="30" style="font-size:18px;fill:white">A &amp; B</text></svg>');

test('restricted vector keeps editable paths, local gradients and text while rasterizing a real PNG', async () => {
  const safe = sanitizeSvg(vector);
  assert.equal(safe.width, 400); assert.equal(safe.height, 200);
  assert.match(safe.bytes.toString(), /<path d="M10 10/); assert.match(safe.bytes.toString(), /url\(#paint\)/); assert.match(safe.bytes.toString(), /A &amp; B/);
  assert.deepEqual(sanitizeSvg(safe.bytes).bytes, safe.bytes, 'sanitization is stable for export/import');
  const png = await rasterizeSvg(safe.bytes);
  assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
});

test('SVG refuses active elements, entity expansion, external resources and CSS escapes before rendering', () => {
  const sources = [
    '<!DOCTYPE svg [<!ENTITY x SYSTEM "file:///C:/secret">]><svg>&x;</svg>',
    '<?xml-stylesheet href="https://example.com/style.css"?><svg/>',
    '<svg><script>alert(1)</script></svg>',
    '<svg><foreignObject><div>Unsafe</div></foreignObject></svg>',
    '<svg onload="alert(1)"><path d="M0 0"/></svg>',
    '<svg><image href="https://example.com/file.png"/></svg>',
    '<svg><use href="#recursive" id="recursive"/></svg>',
    '<svg><path d="M0 0" fill="url(&#104;ttps://example.com/paint)"/></svg>',
    '<svg><path d="M0 0" style="fill:u\\72l(https://example.com/paint)"/></svg>',
    '<svg><style>@import "https://example.com/style";</style></svg>',
    '<svg><path d="M0 0" fill="url(#missing)"/></svg>',
    '<svg xmlns="http://example.com/evil"><path d="M0 0"/></svg>',
    '<svg style="display:expression(alert(1))"><path d="M0 0"/></svg>',
  ];
  for (const source of sources) assert.throws(() => sanitizeSvg(Buffer.from(source)), /SVG rejected/);
  assert.throws(() => sanitizeSvg(Buffer.from('<svg width="100000" height="10"/>')), /dimensions/);
  assert.throws(() => sanitizeSvg(Buffer.from('<svg>' + '<g>'.repeat(60) + '</g>'.repeat(60) + '</svg>')), /complexity/);
});

test('provider nonvisual metadata is omitted without carrying a stale C2PA signature into the sanitized vector', async () => {
  const source = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" xmlns:c2pa="http://c2pa.org/manifest" style="display:block" width="10" height="10"><metadata><c2pa:manifest>encoded-provider-manifest</c2pa:manifest><script>not-rendered()</script></metadata><path d="M0 0 L10 10" stroke="black"/></svg>');
  const safe = sanitizeSvg(source);
  assert.equal(safe.metadataOmitted, true);
  assert.doesNotMatch(safe.bytes.toString(), /metadata|manifest|script|not-rendered/);
  assert.match(safe.bytes.toString(), /display="block"/);
  assert.equal(sanitizeSvg(safe.bytes).metadataOmitted, false);
  assert.deepEqual([...((await rasterizeSvg(safe.bytes)).subarray(0, 4))], [137, 80, 78, 71]);
});

test('storage keeps SVG as attachment-only document and its PNG preview as image with source hashes', async () => {
  const parent = path.resolve('data/test-fixtures'); mkdirSync(parent, { recursive: true });
  const folder = mkdtempSync(path.join(parent, 'svg-'));
  try {
    const media = new LocalFileStorage(folder);
    const source = await media.put({ projectId: 'project', name: 'Editable.svg', mimeType: 'image/svg+xml', bytes: vector, kind: 'document', provenance: 'generated', metadata: { modelId: 'recraft/recraftv4_1_vector' } });
    const preview = await media.put({ projectId: 'project', name: 'Preview.png', mimeType: 'image/svg+xml', bytes: vector, kind: 'image', provenance: 'generated' });
    assert.equal(source.kind, 'document'); assert.equal(source.mimeType, 'image/svg+xml'); assert.match(source.fileName, /\.svg$/);
    assert.equal(preview.kind, 'image'); assert.equal(preview.mimeType, 'image/png'); assert.match(preview.fileName, /\.png$/);
    assert.equal(source.metadata.svgSourceSha256, preview.metadata.svgSourceSha256);
    assert.equal(source.metadata.svgSanitized, true); assert.equal(preview.metadata.svgRasterPreview, true);
    assert.equal(identifyMedia(await media.read(source), source.mimeType).kind, 'document');
    assert.equal((await media.read(source)).toString(), sanitizeSvg(vector).bytes.toString());
    await assert.rejects(media.put({ projectId: 'project', name: 'bad.svg', mimeType: 'image/svg+xml', bytes: Buffer.from('<svg onload="bad()"/>'), kind: 'document', provenance: 'imported' }), /SVG rejected/);
    const outputs = extractModelMedia('recraft/recraftv4_1_vector', { data: [{ image_id: 'provider-id', url: 'https://example.com/art.svg' }] });
    assert.deepEqual(outputs.map(item => item.kind), ['image', 'document']);
  } finally { assert.equal(path.dirname(folder), parent); rmSync(folder, { recursive: true, force: true }); }
});

test('production package reopens vector and preview bytes while preserving labelled original-source history', async () => {
  const parent = path.resolve('data/test-fixtures'); mkdirSync(parent, { recursive: true });
  const folder = mkdtempSync(path.join(parent, 'svg-package-')), store = new Store(folder), media = new LocalFileStorage(folder), now = new Date().toISOString(), projectId = randomUUID();
  try {
    store.upsertProject({ id: projectId, name: 'Vector continuity', description: '', createdAt: now, updatedAt: now });
    const source = await media.put({ projectId, name: 'Editable.svg', bytes: vector, mimeType: 'image/svg+xml', kind: 'document', provenance: 'generated' });
    const preview = await media.put({ projectId, name: 'Preview.png', bytes: vector, mimeType: 'image/svg+xml', kind: 'image', provenance: 'generated' });
    store.upsertAsset(source); store.upsertAsset(preview);
    store.upsertTake({ id: randomUUID(), projectId, name: 'Actual vector', kind: 'image', inputAssetIds: {}, assetIds: [preview.id, source.id], modelId: 'recraft/recraftv4_1_vector', provider: 'recraft', prompt: 'Original vector', settings: { size: '1024x1024', n: 1 }, status: 'COMPLETED', provenance: 'generated', favorite: false, createdAt: now, updatedAt: now, changes: [] });
    const imported = await importProject(store, media, await exportProject(store, media, projectId)), detail = store.projectDetail(imported.id)!;
    const importedVector = detail.assets.find(asset => asset.mimeType === 'image/svg+xml')!, importedPreview = detail.assets.find(asset => asset.kind === 'image')!;
    assert.deepEqual(await media.read(importedVector), await media.read(source)); assert.deepEqual(await media.read(importedPreview), await media.read(preview));
    assert.equal(importedVector.metadata.svgSourceSha256, source.metadata.svgSourceSha256);
    assert.equal(importedVector.metadata.svgCollectionInputSha256, source.sha256);
    assert.equal(importedVector.metadata.svgSourceHashFromImportedHistory, true);
    assert.equal(importedVector.metadata.svgProviderSignaturePreserved, false);
    assert.deepEqual(detail.takes[0]!.assetIds, [importedPreview.id, importedVector.id]);
    assert.equal(detail.takes[0]!.provenance, 'imported');
  } finally { store.close(); assert.equal(path.dirname(folder), parent); rmSync(folder, { recursive: true, force: true }); }
});
