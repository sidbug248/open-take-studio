import { test } from 'node:test';
import assert from 'node:assert/strict';
import { imageDimensions, mp4Metadata, validateAssetConstraints } from '../server/input-validation.js';
import type { Asset } from '../shared/types.ts';

function pngHeader(width: number, height: number) {
  const bytes = Buffer.alloc(33);
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(bytes);
  bytes.writeUInt32BE(13, 8); bytes.write('IHDR', 12); bytes.writeUInt32BE(width, 16); bytes.writeUInt32BE(height, 20);
  return bytes;
}
function box(type: string, payload: Buffer) {
  const bytes = Buffer.alloc(8 + payload.length); bytes.writeUInt32BE(bytes.length); bytes.write(type, 4); payload.copy(bytes, 8); return bytes;
}
function mp4Headers(duration: number, width: number, height: number) {
  const movie = Buffer.alloc(100); movie.writeUInt32BE(1000, 12); movie.writeUInt32BE(duration * 1000, 16);
  const track = Buffer.alloc(84); track.writeUInt32BE(width * 65536, 76); track.writeUInt32BE(height * 65536, 80);
  const handler = Buffer.alloc(24); handler.write('vide', 8);
  const trak = box('trak', Buffer.concat([box('tkhd', track), box('mdia', box('hdlr', handler))]));
  return Buffer.concat([box('ftyp', Buffer.from('isom0000isom')), box('moov', Buffer.concat([box('mvhd', movie), trak]))]);
}
const asset = (mimeType = 'image/png') => ({ mimeType, kind: mimeType.startsWith('video/') ? 'video' : 'image' }) as Asset;

test('inspects actual standard image header dimensions, without trusting browser metadata', () => {
  const actualPng = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6xWQAAAAASUVORK5CYII=', 'base64');
  assert.deepEqual(imageDimensions(actualPng, 'image/png'), { width: 1, height: 1 });
  assert.throws(() => imageDimensions(Buffer.alloc(3), 'image/png'), /could not be verified/);
});

test('rejects FLUX references below 256px and above 16MP before dispatch', async () => {
  await assert.rejects(validateAssetConstraints('bfl/flux-3-image', { images: asset() }, async () => pngHeader(255, 512)), /256/);
  await assert.rejects(validateAssetConstraints('bfl/flux-3-image', { images: asset() }, async () => pngHeader(5000, 5000)), /16 megapixels/);
  await validateAssetConstraints('bfl/flux-3-image', { images: asset() }, async () => pngHeader(1344, 768));
});

test('enforces matching inpaint source and mask dimensions', async () => {
  const source = asset(), mask = asset();
  await assert.rejects(validateAssetConstraints('bfl/flux-pro-1.0-fill', { image: source, mask }, async a => a === source ? pngHeader(1024, 1024) : pngHeader(512, 512)), /same dimensions/);
});

test('enforces Bria format and output resolution limits', async () => {
  await assert.rejects(validateAssetConstraints('bria/image-edit-remove-background', { image: asset('image/gif') }, async () => Buffer.alloc(32)), /PNG, JPEG or WebP/);
  await assert.rejects(validateAssetConstraints('bria/image-edit-increase-resolution', { image: asset() }, async () => pngHeader(3000, 3000), { desired_increase: 4 }), /8192/);
});

test('reads MP4 duration and dimensions from its movie/track atoms', () => {
  assert.deepEqual(mp4Metadata(mp4Headers(5, 1344, 768)), { duration: 5, width: 1344, height: 768 });
  assert.throws(() => mp4Metadata(Buffer.from([0, 0, 0, 1, 109, 111, 111, 118])), /Truncated/);
});

test('guards video edit and enhancement input bounds', async () => {
  await assert.rejects(validateAssetConstraints('bfl/video-edit-v1', { video: asset('video/mp4') }, async () => mp4Headers(16, 1344, 768)), /at most 15 seconds/);
  await assert.rejects(validateAssetConstraints('bfl/video-edit-v1', { video: asset('video/webm') }, async () => Buffer.alloc(64)), /MP4/);
  await assert.rejects(validateAssetConstraints('bfl/video-upscale-v1', { input_video: asset('video/mp4') }, async () => mp4Headers(5, 3840, 2160)), /2560/);
});
