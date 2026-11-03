// Read-only Router discovery. No generation, account mutation or secret logging.
import dotenv from 'dotenv';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
dotenv.config({ path: path.resolve('.env'), override: true, quiet: true });
const key = process.env.COMFY_API_KEY?.trim();
if (!key) throw new Error(`COMFY_API_KEY is missing in ${path.resolve('.env')}`);
const headers = { 'X-API-Key': key };
const fetchedAt = new Date().toISOString();
const catalog: Record<string, any>[] = [];
let cursor: string | undefined;
for (let page = 0; page < 30; page++) {
  const url = new URL('https://api.comfy.org/v2/models');
  url.searchParams.set('limit', '100');
  if (cursor) url.searchParams.set('cursor', cursor);
  const response = await fetch(url, { headers });
  if (!response.ok) throw new Error(`Catalog read returned HTTP ${response.status}`);
  const body = await response.json() as any;
  catalog.push(...body.data);
  if (!body.has_more) break;
  if (!body.next_cursor || body.next_cursor === cursor) throw new Error('Catalog cursor did not advance');
  cursor = body.next_cursor;
}
const rows: Record<string, unknown>[] = [];
let next = 0;
await Promise.all(Array.from({ length: 5 }, async () => {
  while (next < catalog.length) {
    const model = catalog[next++]!;
    const row: Record<string, unknown> = { ...model, schemaUrl: `https://api.comfy.org/v2/models/${model.id}/openapi.json` };
    try {
      const response = await fetch(row.schemaUrl as string, { headers });
      row.schemaStatus = response.status;
      if (response.ok) {
        const schema = await response.json() as any;
        row.inputModalities = schema['x-comfy-router-input-modalities'] ?? [];
        row.outputModalities = schema['x-comfy-router-output-modalities'] ?? [];
        row.schemaVerifiedAt = new Date().toISOString();
        row.schemaVersion = schema.info?.version;
        const request: any = Object.values(schema.paths ?? {})[0];
        row.inputFields = Object.keys(request?.post?.requestBody?.content?.['application/json']?.schema?.properties ?? {});
      }
    } catch { row.schemaStatus = 'network_error'; }
    rows.push(row);
  }
}));
rows.sort((a, b) => String(a.id).localeCompare(String(b.id)));
await mkdir('docs/schemas', { recursive: true });
await writeFile('docs/schemas/catalogue-snapshot.json', JSON.stringify({ date: fetchedAt.slice(0, 10), fetchedAt, source: 'https://api.comfy.org/v2/models', models: rows }, null, 2));
console.log(JSON.stringify({ models: rows.length, schemasRead: rows.filter(row => row.schemaStatus === 200).length, missing: rows.filter(row => row.schemaStatus !== 200).map(row => ({ id: row.id, status: row.schemaStatus })), fetchedAt }));
