// Read-only capability discovery. Never prints credentials or response bodies on errors.
import dotenv from 'dotenv';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

dotenv.config({ override: true, quiet: true });
const apiKey = process.env.COMFY_API_KEY?.trim();
if (!apiKey) {
  console.log(JSON.stringify({ configured: false, envPath: path.resolve('.env') }));
  process.exit(0);
}
const ids = process.argv.slice(2);
const selected = ids.length ? ids : [
  'bfl/flux-3-image', 'minimax/minimax-h3', 'bfl/flux-pro-1.0-fill',
  'bria/image-edit-remove-background', 'bria/image-edit-increase-resolution',
  'bfl/video-edit-v1', 'bfl/video-upscale-v1', 'elevenlabs/eleven_sfx_v2',
  'elevenlabs/eleven_v3', 'meshy/meshy-6', 'synclabs/sync-3',
  'kling/videos-video-extend', 'higgsfield/higgsfield-genjutsu-motion-transfer-v1.0',
  'byteplus/seed-audio-1.0-multilingual', 'heygen/starfish',
];
await mkdir('docs/schemas', { recursive: true });
const headers = { 'X-API-Key': apiKey };
const reports = [];
for (const id of selected) {
  try {
    const response = await fetch(`https://api.comfy.org/v2/models/${id}/openapi.json`, { headers });
    const report = { id, status: response.status, etag: response.headers.get('etag'), fetchedAt: new Date().toISOString() };
    if (response.ok) {
      const schema = await response.json();
      await writeFile(`docs/schemas/${id.replace('/', '--')}.json`, JSON.stringify(schema, null, 2));
      const detail = await fetch(`https://api.comfy.org/v2/models/${id}`, { headers });
      report.catalogStatus = detail.status;
      if (detail.ok) {
        await writeFile(`docs/schemas/${id.replace('/', '--')}.catalog.json`, JSON.stringify(await detail.json(), null, 2));
      }
    }
    reports.push(report);
    console.log(JSON.stringify(report));
  } catch {
    reports.push({ id, status: 'network_error', fetchedAt: new Date().toISOString() });
    console.log(JSON.stringify({ id, status: 'network_error' }));
  }
}
const catalog = [];
let cursor;
for (let page = 0; page < 30; page++) {
  const url = new URL('https://api.comfy.org/v2/models');
  url.searchParams.set('limit', '100');
  if (cursor) url.searchParams.set('cursor', cursor);
  const response = await fetch(url, { headers });
  if (!response.ok) { console.log(JSON.stringify({ catalogStatus: response.status })); break; }
  const body = await response.json();
  catalog.push(...(body.data ?? []));
  if (!body.has_more) break;
  cursor = body.next_cursor;
}
await writeFile('docs/schemas/catalog.json', JSON.stringify(catalog, null, 2));
let priorReports = [];
try { priorReports = JSON.parse(await readFile('docs/schemas/discovery-report.json', 'utf8')); } catch { /* First discovery */ }
const mergedReports = new Map(priorReports.map(report => [report.id, report]));
for (const report of reports) mergedReports.set(report.id, report);
await writeFile('docs/schemas/discovery-report.json', JSON.stringify([...mergedReports.values()], null, 2));
console.log(JSON.stringify({ catalogCount: catalog.length, zImageMatches: catalog.filter(m => /z[-_ ]?image/i.test(m.id)).map(m => m.id) }));
