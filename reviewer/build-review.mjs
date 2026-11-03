import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

// This public artifact is the same immutable demo archive used by the original
// reviewer deployment. No workspace database, credentials, or private media is read.
const releaseUrl = 'https://github.com/sidbug248/open-take-studio/releases/download/v0.1.0-submission/Open-Take-Studio-review-demo-2026-11-03.zip';
const expectedArchiveSha256 = '95f13e58d66e165712b6b440961897f8c4bda5f5fbadd0f83061c0534044b76e';
const root = path.dirname(fileURLToPath(import.meta.url));
const output = path.join(root, 'public');
// Routing transforms resolve this private environment variable on Vercel.
// Never substitute it into static files, print it, or expose it as a response header.
if (process.env.VERCEL === '1' && !/^[A-Za-z0-9_-]{43}$/.test(process.env.OTS_VERCEL_PROXY_SECRET ?? '')) {
  throw new Error('Configure the private proxy credential before deploying this routing build.');
}
const archiveFlag = process.argv.find(value => value.startsWith('--archive='));
let zip;
if (archiveFlag) zip = await fs.readFile(path.resolve(archiveFlag.slice('--archive='.length)));
else {
  const response = await fetch(releaseUrl, { signal: AbortSignal.timeout(120000) });
  if (!response.ok) throw new Error(`Public release archive returned HTTP ${response.status}.`);
  zip = Buffer.from(await response.arrayBuffer());
}
const actualSha256 = crypto.createHash('sha256').update(zip).digest('hex');
if (actualSha256 !== expectedArchiveSha256) throw new Error('Public review archive SHA-256 mismatch. Build stopped.');

// Extract this trusted, hash-verified ZIP using Node built-ins; the reviewer has
// no npm install step. Validate paths and sizes even for the pinned archive.
let end = -1;
for (let i = zip.length - 22; i >= Math.max(0, zip.length - 65558); i--) {
  if (zip.readUInt32LE(i) === 0x06054b50) { end = i; break; }
}
if (end < 0) throw new Error('ZIP directory not found.');
const count = zip.readUInt16LE(end + 10);
if (count > 1000) throw new Error('Unexpected archive entry count.');
let cursor = zip.readUInt32LE(end + 16);
const entries = [];
await fs.mkdir(output, { recursive: true });
for (let i = 0; i < count; i++) {
  if (zip.readUInt32LE(cursor) !== 0x02014b50) throw new Error('Invalid ZIP central directory.');
  const method = zip.readUInt16LE(cursor + 10);
  const compressedSize = zip.readUInt32LE(cursor + 20);
  const size = zip.readUInt32LE(cursor + 24);
  const nameLength = zip.readUInt16LE(cursor + 28);
  const extraLength = zip.readUInt16LE(cursor + 30);
  const commentLength = zip.readUInt16LE(cursor + 32);
  const localOffset = zip.readUInt32LE(cursor + 42);
  const name = zip.subarray(cursor + 46, cursor + 46 + nameLength).toString('utf8');
  cursor += 46 + nameLength + extraLength + commentLength;
  if (name.includes('\\') || name.startsWith('/') || name.split('/').includes('..') || name.includes(':')) throw new Error('Unsafe archive path.');
  if (name.endsWith('/')) continue;
  if (size > 160 * 1024 * 1024) throw new Error('Unexpected archive file size.');
  const destination = path.resolve(output, name);
  if (!destination.startsWith(output + path.sep)) throw new Error('Archive destination escapes output directory.');
  if (zip.readUInt32LE(localOffset) !== 0x04034b50) throw new Error('Invalid local ZIP entry.');
  const start = localOffset + 30 + zip.readUInt16LE(localOffset + 26) + zip.readUInt16LE(localOffset + 28);
  const compressed = zip.subarray(start, start + compressedSize);
  const bytes = method === 0 ? compressed : method === 8 ? zlib.inflateRawSync(compressed, { maxOutputLength: size }) : null;
  if (!bytes || bytes.length !== size) throw new Error('Unsupported or invalid ZIP entry.');
  // The live studio now owns /. Keep every historical media/support URL.
  if (name !== 'index.html') {
    await fs.mkdir(path.dirname(destination), { recursive: true });
    await fs.writeFile(destination, bytes);
  }
  entries.push({ file: name, bytes: size, sha256: crypto.createHash('sha256').update(bytes).digest('hex') });
}
await fs.mkdir(path.join(output, 'competition'), { recursive: true });
await fs.copyFile(path.join(root, 'index.html'), path.join(output, 'competition', 'index.html'));
// Remove only the old generated landing file. A stale index would shadow the app.
await fs.rm(path.join(output, 'index.html'), { force: true });
await fs.writeFile(path.join(output, 'Open-Take-Studio-Review-Demo.zip'), zip);
console.log(JSON.stringify({ output, archiveSha256: actualSha256, archiveEntries: entries.length, source: releaseUrl, files: entries }, null, 2));
