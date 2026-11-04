import type { ModelBuildContext, ModelDescriptor, ModelMedia } from '../shared/model-types.ts';

/** Router contract e9a5317c2f66, fetched from Comfy on 2026-11-04.
 * This adapter deliberately exposes text/lyrics composition only. Voice cloning,
 * covers and provider prompt rewriting are separate operations, not hidden defaults.
 */
export const PIKA_MUSIC_MODEL: ModelDescriptor = {
  id: 'pika/pika-music',
  name: 'Pika Music · original soundtrack',
  provider: 'pika',
  kind: 'audio',
  capabilities: ['text-to-music', 'lyrics-to-music'],
  description: 'Compose an original music track from a written direction and optional lyrics.',
  documentation: 'https://api.comfy.org/v2/models/pika/pika-music/openapi.json',
  verifiedAt: '2026-11-04',
  status: 'experimental',
  delivery: 'queue',
  promptField: 'prompt',
  promptRequired: true,
  inputs: [],
  controls: [
    { key: 'duration', label: 'Duration (seconds)', type: 'number', min: 10, max: 360, step: 1, default: 10, description: 'Start with a short take. Longer tracks use more generation credits.' },
    { key: 'lyrics', label: 'Lyrics (optional)', type: 'text', description: 'Optional words and section labels, up to 2,000 characters in the studio.' },
    { key: 'seed', label: 'Seed', type: 'number', min: -1, max: 2147483647, step: 1, default: -1, description: '-1 chooses a new seed.' },
  ],
  notes: 'Current Router schema and request/result fixtures verified. A funded music generation has not yet been run. Only text_to_music is exposed; reference voices, song covers and prompt rewriting are not submitted. No song is generated until Generate is explicitly chosen.',
};
export const AUDIO_GENERATION_MODELS: ModelDescriptor[] = [PIKA_MUSIC_MODEL];

export function buildAudioGenerationInput(modelId: string, context: ModelBuildContext): Record<string, unknown> {
  if (modelId !== PIKA_MUSIC_MODEL.id) throw new Error('Unsupported audio generation adapter');
  if (Object.keys(context.inputData).length) throw new Error('Music composition uses written direction and optional lyrics; media references are not enabled');
  const allowed = new Set(['duration', 'lyrics', 'seed']);
  for (const key of Object.keys(context.settings)) if (!allowed.has(key)) throw new Error(`${key} is not supported by this music composer`);
  const prompt = context.prompt.trim();
  if (!prompt || prompt.length > 4000) throw new Error('Music direction must contain 1–4,000 characters');
  const duration = context.settings.duration ?? 10;
  if (typeof duration !== 'number' || !Number.isInteger(duration) || duration < 10 || duration > 360) throw new Error('Music duration must be a whole number from 10 to 360 seconds');
  const seed = context.settings.seed ?? -1;
  if (typeof seed !== 'number' || !Number.isInteger(seed) || seed < -1 || seed > 2147483647) throw new Error('Music seed must be -1 or an integer from 0 to 2147483647');
  const lyrics = context.settings.lyrics;
  if (lyrics !== undefined && (typeof lyrics !== 'string' || lyrics.length > 2000)) throw new Error('Music lyrics must be text up to 2,000 characters');
  return {
    prompt, duration, seed, mode: 'text_to_music',
    rewrite_prompt: false,
    ...(typeof lyrics === 'string' && lyrics.trim() ? { lyrics: lyrics.trim() } : {}),
  };
}

function object(value: unknown): Record<string, any> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Music provider returned an unexpected result');
  return value as Record<string, any>;
}

export function extractAudioGenerationMedia(modelId: string, result: unknown): ModelMedia[] {
  if (modelId !== PIKA_MUSIC_MODEL.id) throw new Error('Unsupported audio generation adapter');
  const body = object(result);
  if (body.error || body.status !== 'completed') throw new Error(`Pika Music did not complete: ${String(body.error?.message ?? body.error?.code ?? body.status ?? 'missing status').slice(0,500)}`);
  const output = object(body.output);
  if (output.media_type !== undefined && output.media_type !== 'audio') throw new Error('Pika Music returned a different media type');
  const audio = object(output.audio);
  let url: URL;
  try { url = new URL(audio.url); } catch { throw new Error('Pika Music completed without an accessible audio URL'); }
  if (typeof audio.url !== 'string' || url.protocol !== 'https:' || url.username || url.password || url.port && url.port !== '443') throw new Error('Pika Music needs an authenticated-free HTTPS audio result');
  const mimeType = audio.content_type == null ? undefined : String(audio.content_type).split(';')[0]!.trim().toLowerCase();
  if (mimeType && !/^audio\/[a-z0-9.+-]+$/.test(mimeType) && mimeType !== 'application/octet-stream') throw new Error('Pika Music returned an unsupported audio content type');
  const extension: Record<string, string> = { 'audio/mpeg': 'mp3', 'audio/mp3': 'mp3', 'audio/wav': 'wav', 'audio/x-wav': 'wav', 'audio/flac': 'flac', 'audio/ogg': 'ogg', 'audio/mp4': 'm4a', 'audio/aac': 'aac' };
  return [{ url: audio.url, ...(mimeType ? { mimeType } : {}), name: extension[mimeType ?? ''] ? `pika-music.${extension[mimeType!]}` : 'pika-music-audio', kind: 'audio' }];
}
