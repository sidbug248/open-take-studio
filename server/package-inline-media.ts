import { createHash } from 'node:crypto';
import type AdmZip from 'adm-zip';

const MAX_BYTES = 300 * 1024 * 1024;
const MAX_REFERENCES = 10000;
type InlineEntry = { path: string[]; sha256: string; bytes: number };
const digest = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
const isInlineMedia = (value: string) => value.length >= 8192 &&
  (/^data:[^;,]+;base64,[A-Za-z0-9+/=\s]+$/i.test(value) || /^[A-Za-z0-9+/=\s]+$/.test(value));

/** Each repeated input is stored once as its exact UTF-8 string, including any data-URI prefix. */
export function packInlineMedia(manifest: Record<string, unknown>) {
  const blobs = new Map<string, Buffer>();
  const entries: InlineEntry[] = [];
  let expandedBytes = 0;
  function visit(value: unknown, path: string[]): unknown {
    if (path.length > 64) throw new Error('Package metadata is nested too deeply');
    if (typeof value === 'string' && isInlineMedia(value)) {
      if (entries.length >= MAX_REFERENCES) throw new Error('Package has too many inline media references');
      if (path.some(key => key.length > 1000)) throw new Error('Inline media path key exceeds 1000 characters');
      const bytes = Buffer.from(value, 'utf8');
      if (bytes.toString('utf8') !== value) throw new Error('Inline media string is not valid Unicode');
      const sha256 = digest(bytes);
      expandedBytes += bytes.length;
      if (expandedBytes > MAX_BYTES) throw new Error('Expanded input history exceeds 300 MiB');
      if (!blobs.has(sha256)) blobs.set(sha256, bytes);
      entries.push({ path, sha256, bytes: bytes.length });
      return null;
    }
    if (Array.isArray(value)) return value.map((entry, index) => visit(entry, [...path, String(index)]));
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, visit(entry, [...path, key])]));
    return value;
  }
  const packed = visit(manifest, []) as Record<string, unknown>;
  if (entries.length) {
    packed.version = 2;
    packed.inlineMedia = { format: 'utf8-strings-v1', entries };
    // Match importer accounting, including the path index and compact manifest overhead.
    if (Buffer.byteLength(JSON.stringify(packed)) + expandedBytes > MAX_BYTES) throw new Error('Expanded input history exceeds 300 MiB');
  }
  return { manifest: packed, blobs };
}

/** Restore before schema validation; imported jobs remain archived by the project importer. */
export function unpackInlineMedia(parsed: unknown, zip: AdmZip): { manifest: unknown; blobPaths: Set<string> } {
  const blobPaths = new Set<string>();
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return { manifest: parsed, blobPaths };
  const manifest = parsed as Record<string, unknown>;
  if (manifest.version !== 2) {
    if (manifest.inlineMedia !== undefined) throw new Error('Inline media metadata requires package version 2');
    return { manifest, blobPaths };
  }
  const inline = manifest.inlineMedia as { format?: unknown; entries?: unknown } | undefined;
  if (!inline || inline.format !== 'utf8-strings-v1' || !Array.isArray(inline.entries) || !inline.entries.length || inline.entries.length > MAX_REFERENCES) throw new Error('Invalid inline media index');
  const paths = new Set<string>();
  const values = new Map<string, string>();
  let expandedBytes = Buffer.byteLength(JSON.stringify(manifest));
  for (const raw of inline.entries) {
    if (!raw || typeof raw !== 'object') throw new Error('Invalid inline media reference');
    const entry = raw as InlineEntry;
    if (!Array.isArray(entry.path) || !entry.path.length || entry.path.length > 64 || entry.path.some(key => typeof key !== 'string' || key.length > 1000) || ['inlineMedia', 'version', 'format'].includes(entry.path[0]) || typeof entry.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(entry.sha256) || !Number.isSafeInteger(entry.bytes) || entry.bytes < 8192 || entry.bytes > MAX_BYTES) throw new Error('Invalid inline media reference');
    const pathKey = JSON.stringify(entry.path);
    if (paths.has(pathKey)) throw new Error('Duplicate inline media path');
    paths.add(pathKey);
    expandedBytes += entry.bytes;
    if (expandedBytes > MAX_BYTES) throw new Error('Expanded input history exceeds 300 MiB');
    const file = `inputs/${entry.sha256}.txt`;
    const blob = zip.getEntry(file);
    if (!blob) throw new Error('Missing inline media blob');
    if (blob.header.size !== entry.bytes) throw new Error('Inline media blob size mismatch');
    let value = values.get(entry.sha256);
    if (value === undefined) {
      const bytes = blob.getData();
      if (bytes.length !== entry.bytes || digest(bytes) !== entry.sha256) throw new Error('Inline media blob integrity check failed');
      value = bytes.toString('utf8');
      if (!Buffer.from(value, 'utf8').equals(bytes) || !isInlineMedia(value)) throw new Error('Invalid inline media blob encoding');
      values.set(entry.sha256, value);
    }
    blobPaths.add(file);
    let cursor: any = manifest;
    for (const key of entry.path.slice(0, -1)) {
      if (!cursor || typeof cursor !== 'object' || !Object.hasOwn(cursor, key)) throw new Error('Inline media path does not exist');
      cursor = cursor[key];
    }
    const key = entry.path.at(-1)!;
    if (!cursor || typeof cursor !== 'object' || !Object.hasOwn(cursor, key) || cursor[key] !== null) throw new Error('Inline media placeholder is invalid');
    Object.defineProperty(cursor, key, { value, writable: true, enumerable: true, configurable: true });
  }
  delete manifest.inlineMedia;
  return { manifest, blobPaths };
}
