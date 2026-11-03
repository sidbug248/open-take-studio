import type { Asset } from '../shared/types.ts';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { mediaToolPaths, runMediaTool } from './film-media.ts';

export interface Dimensions { width: number; height: number; }

/** Probe actual audio bytes in an isolated local file. A browser duration or an
 * MP4-only header parser cannot validate WAV, MP3, OGG or FLAC recordings. */
export async function audioDuration(bytes: Buffer): Promise<number> {
  const parent = path.resolve(tmpdir());
  const folder = await mkdtemp(path.join(parent, 'ots-audio-preflight-'));
  try {
    const file = path.join(folder, 'recording.bin');
    await writeFile(file, bytes, { flag: 'wx' });
    const { ffprobe } = mediaToolPaths();
    const raw = await runMediaTool(ffprobe, ['-v', 'error', '-protocol_whitelist', 'file,pipe', '-show_streams', '-show_format', '-of', 'json', file], 1024 * 1024, 30_000);
    const metadata = JSON.parse(raw.toString('utf8'));
    const audio = metadata.streams?.find((stream: any) => stream.codec_type === 'audio');
    const duration = Number(metadata.format?.duration ?? audio?.duration);
    if (!audio || !Number.isFinite(duration) || duration <= 0) throw new Error('The recording contains no verifiable audio duration');
    return duration;
  } finally {
    const resolved = path.resolve(folder);
    if (path.dirname(resolved) === parent && path.basename(resolved).startsWith('ots-audio-preflight-')) await rm(resolved, { recursive: true, force: true });
  }
}

/** Header inspection, not image decoding. Provider validation remains authoritative. */
export function imageDimensions(bytes: Buffer, mimeType: string): Dimensions {
  let result: Dimensions | undefined;
  if (mimeType === 'image/png' && bytes.length >= 24 && bytes.toString('ascii', 12, 16) === 'IHDR') {
    result = { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
  } else if (mimeType === 'image/gif' && bytes.length >= 10) {
    result = { width: bytes.readUInt16LE(6), height: bytes.readUInt16LE(8) };
  } else if (mimeType === 'image/jpeg') {
    let cursor = 2;
    while (cursor + 3 < bytes.length) {
      if (bytes[cursor] !== 0xff) break;
      while (bytes[cursor] === 0xff) cursor++;
      const marker = bytes[cursor++];
      if (marker === 0xd9 || marker === 0xda) break;
      if (marker === 0x01 || marker !== undefined && marker >= 0xd0 && marker <= 0xd7) continue;
      if (cursor + 2 > bytes.length) break;
      const length = bytes.readUInt16BE(cursor);
      if (length < 2 || cursor + length > bytes.length) break;
      if (marker !== undefined && [0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker) && length >= 7) {
        result = { height: bytes.readUInt16BE(cursor + 3), width: bytes.readUInt16BE(cursor + 5) };
        break;
      }
      cursor += length;
    }
  } else if (mimeType === 'image/webp' && bytes.length >= 25) {
    const chunk = bytes.toString('ascii', 12, 16);
    if (chunk === 'VP8X' && bytes.length >= 30) result = { width: bytes.readUIntLE(24, 3) + 1, height: bytes.readUIntLE(27, 3) + 1 };
    if (chunk === 'VP8 ' && bytes.length >= 30 && bytes.subarray(23, 26).equals(Buffer.from([0x9d, 0x01, 0x2a]))) result = { width: bytes.readUInt16LE(26) & 0x3fff, height: bytes.readUInt16LE(28) & 0x3fff };
    if (chunk === 'VP8L' && bytes[20] === 0x2f) {
      const bits = bytes.readUInt32LE(21);
      result = { width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 };
    }
  }
  if (!result || result.width <= 0 || result.height <= 0) throw new Error('Image dimensions could not be verified. Use a valid PNG, JPEG, WebP or GIF reference.');
  return result;
}

type Box = { type: string; start: number; end: number };
function boxes(bytes: Buffer, start: number, end: number): Box[] {
  const result: Box[] = [];
  let cursor = start;
  while (cursor + 8 <= end) {
    let size = bytes.readUInt32BE(cursor), header = 8;
    if (size === 1) {
      if (cursor + 16 > end) throw new Error('Truncated MP4 box');
      const large = bytes.readBigUInt64BE(cursor + 8);
      if (large > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('Invalid MP4 box size');
      size = Number(large); header = 16;
    }
    if (size === 0) size = end - cursor;
    if (size < header || cursor + size > end) throw new Error('Invalid MP4 container');
    result.push({ type: bytes.toString('ascii', cursor + 4, cursor + 8), start: cursor + header, end: cursor + size });
    if (result.length > 100000) throw new Error('MP4 container has too many boxes');
    cursor += size;
  }
  return result;
}

export function mp4Metadata(bytes: Buffer): Dimensions & { duration: number } {
  const moov = boxes(bytes, 0, bytes.length).find(box => box.type === 'moov');
  if (!moov) throw new Error('MP4 has no movie metadata; re-export it as a standard MP4');
  const children = boxes(bytes, moov.start, moov.end);
  const movie = children.find(box => box.type === 'mvhd');
  if (!movie) throw new Error('MP4 duration could not be verified');
  const version = bytes[movie.start];
  const scaleOffset = movie.start + (version === 1 ? 20 : 12);
  const durationOffset = movie.start + (version === 1 ? 24 : 16);
  if (durationOffset + (version === 1 ? 8 : 4) > movie.end) throw new Error('MP4 movie header is truncated');
  const timeScale = bytes.readUInt32BE(scaleOffset);
  const duration = (version === 1 ? Number(bytes.readBigUInt64BE(durationOffset)) : bytes.readUInt32BE(durationOffset)) / timeScale;
  let dimensions: Dimensions | undefined;
  for (const track of children.filter(box => box.type === 'trak')) {
    const trackChildren = boxes(bytes, track.start, track.end);
    const tkhd = trackChildren.find(box => box.type === 'tkhd');
    const mdia = trackChildren.find(box => box.type === 'mdia');
    const handler = mdia && boxes(bytes, mdia.start, mdia.end).find(box => box.type === 'hdlr');
    if (!tkhd || !handler || handler.start + 12 > handler.end || bytes.toString('ascii', handler.start + 8, handler.start + 12) !== 'vide') continue;
    if (tkhd.end - tkhd.start < 8) continue;
    dimensions = { width: bytes.readUInt32BE(tkhd.end - 8) / 65536, height: bytes.readUInt32BE(tkhd.end - 4) / 65536 };
    break;
  }
  if (!dimensions || dimensions.width <= 0 || dimensions.height <= 0 || !Number.isFinite(duration) || duration <= 0) throw new Error('MP4 dimensions or duration could not be verified');
  return { ...dimensions, duration };
}

export function validateRouterBodySize(body: unknown): void {
  if (Buffer.byteLength(JSON.stringify(body), 'utf8') > 100 * 1024 * 1024) throw new Error('Encoded inputs exceed Router’s 100 MiB request limit. Use smaller media or fewer references.');
}

export async function validateAssetConstraints(
  modelId: string,
  inputs: Record<string, Asset | Asset[]>,
  readAsset: (asset: Asset) => Promise<Buffer>,
  settings: Record<string, unknown> = {},
): Promise<void> {
  const flattened = Object.entries(inputs).flatMap(([key, items]) => (Array.isArray(items) ? items : [items]).map(asset => ({ key, asset })));
  const dimensions: Record<string, Dimensions> = {};
  for (const { key, asset } of flattened) {
    const bytes = await readAsset(asset);
    if (modelId === 'vertexai/gemini-3.1-flash-lite') {
      if (!['audio/wav', 'audio/mpeg', 'audio/flac'].includes(asset.mimeType) || bytes.length > 14_000_000) throw new Error('Transcription requires WAV, MP3 or FLAC audio at most 14 MB');
      await audioDuration(bytes);
    }
    if (modelId === 'minimax/minimax-h3') {
      if (asset.kind === 'image') {
        if (!['image/png', 'image/jpeg', 'image/webp'].includes(asset.mimeType)) throw new Error('H3 references currently support verified PNG, JPEG or WebP inputs in this studio');
        const size = imageDimensions(bytes, asset.mimeType), ratio = size.width / size.height;
        if (bytes.length > 30_000_000 || Math.min(size.width, size.height) < 256 || Math.max(size.width, size.height) > 5760 || ratio < .4 || ratio > 2.5) throw new Error('H3 images require 256–5760 pixels per side, aspect ratio 0.4–2.5 and at most 30 MB');
      }
      if (asset.kind === 'video') {
        if (asset.mimeType !== 'video/mp4') throw new Error('H3 video references currently require MP4 in this studio');
        const info = mp4Metadata(bytes), ratio = info.width / info.height;
        if (bytes.length > 50_000_000 || info.duration < 2 || info.duration > 15 || Math.min(info.width, info.height) < 256 || Math.max(info.width, info.height) > 5760 || ratio < .4 || ratio > 2.5) throw new Error('H3 video references require 2–15 seconds, 256–5760 pixels per side, aspect ratio 0.4–2.5 and at most 50 MB');
        if (key === 'base_video' && (settings.resolution !== '2K' || Math.min(info.width, info.height) !== 768 || info.duration < 4)) throw new Error('H3 regeneration requires a source matching H3 768P output specifications and 2K output');
      }
      if (asset.kind === 'audio') {
        if (!['audio/wav', 'audio/mpeg'].includes(asset.mimeType) || bytes.length > 15_000_000) throw new Error('H3 reference audio requires WAV or MP3 at most 15 MB');
        const duration = await audioDuration(bytes);
        if (duration < 2 || duration > 15) throw new Error('H3 reference audio must be 2–15 seconds');
      }
    }
    if (modelId === 'veed/clean-audio') {
      if (asset.kind !== 'audio') throw new Error('VEED cleanup requires an audio recording');
      if (await audioDuration(bytes) > 1800) throw new Error('VEED Clean Audio accepts at most thirty minutes of audio');
    }
    if (modelId === 'synclabs/sync-3' && asset.kind === 'video' && asset.mimeType !== 'video/mp4') throw new Error('Sync 3 requires an MP4 video input.');
    if (modelId === 'higgsfield/higgsfield-genjutsu-motion-transfer-v1.0' && asset.kind === 'video') {
      if (asset.mimeType !== 'video/mp4') throw new Error('Motion transfer requires an MP4 video input.');
      if (mp4Metadata(bytes).duration < 4) throw new Error('Genjutsu motion transfer requires at least four seconds of video.');
    }
    if (modelId === 'bfl/flux-3-image') {
      const size = imageDimensions(bytes, asset.mimeType);
      if (size.width < 256 || size.height < 256 || size.width * size.height > 16_000_000) throw new Error('FLUX 3 references must be at least 256 × 256 and at most 16 megapixels');
      if (4 * Math.ceil(bytes.length / 3) > 20_000_000) throw new Error('A FLUX 3 reference exceeds the 20 MB base64 payload limit');
    }
    if (modelId === 'bfl/flux-pro-1.0-fill') dimensions[key] = imageDimensions(bytes, asset.mimeType);
    if (modelId.startsWith('bria/')) {
      if (!['image/png', 'image/jpeg', 'image/webp'].includes(asset.mimeType)) throw new Error('This Bria operation accepts PNG, JPEG or WebP images');
      if (modelId === 'bria/image-edit-increase-resolution') {
        const size = imageDimensions(bytes, asset.mimeType);
        const scale = Number(settings.desired_increase ?? 2);
        if (size.width * scale > 8192 || size.height * scale > 8192) throw new Error('The selected scale exceeds Bria’s 8192 × 8192 output limit');
      }
    }
    if (modelId === 'byteplus/seed-audio-1.0-multilingual') {
      if (!['image/png', 'image/jpeg', 'image/webp'].includes(asset.mimeType)) throw new Error('Seed Audio image references must be PNG, JPEG or WebP');
      if (bytes.length > 10_000_000) throw new Error('Seed Audio reference images must be at most 10 MB');
    }
    if (modelId === 'bfl/video-edit-v1' || modelId === 'bfl/video-upscale-v1') {
      if (asset.mimeType !== 'video/mp4') throw new Error('This video model requires MP4 input');
      const info = mp4Metadata(bytes);
      const upscale = modelId === 'bfl/video-upscale-v1';
      if (bytes.length > (upscale ? 50_000_000 : 50 * 1024 * 1024)) throw new Error('The video exceeds the model’s 50 MB input limit');
      if (info.duration > (upscale ? 20 : 15)) throw new Error(`This video model accepts at most ${upscale ? 20 : 15} seconds`);
      if (!upscale && Math.min(info.width, info.height) < 160) throw new Error('Video Edit requires at least 160 pixels per side');
      if (upscale && (Math.max(info.width, info.height) > 2560 || Math.min(info.width, info.height) > 1440)) throw new Error('Video Upscale accepts source resolution up to 2560 × 1440');
    }
  }
  if (modelId === 'bfl/flux-pro-1.0-fill' && dimensions.image && dimensions.mask) {
    if (dimensions.image.width !== dimensions.mask.width || dimensions.image.height !== dimensions.mask.height) throw new Error('The inpainting mask must have exactly the same dimensions as the source image');
  }
}
