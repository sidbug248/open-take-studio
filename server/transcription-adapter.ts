import type { ModelDescriptor, ModelMedia } from '../shared/model-types.ts';
export const TRANSCRIPTION_MODEL: ModelDescriptor = {
  id: 'vertexai/gemini-3.1-flash-lite', name: 'Gemini · audio transcript', provider: 'vertexai', kind: 'document', capabilities: ['audio-transcription'],
  description: 'Transcribe saved speech into a downloadable plain-text document. Review against the original audio.', documentation: 'https://api.comfy.org/v2/models/vertexai/gemini-3.1-flash-lite/openapi.json', verifiedAt: '2026-11-03', status: 'implemented', delivery: 'queue', promptField: 'contents', promptRequired: false,
  controls: [{ key: 'maxOutputTokens', label: 'Maximum transcript tokens', type: 'number', min: 256, max: 16384, default: 4096, step: 256 }, { key: 'temperature', label: 'Sampling temperature', type: 'number', min: 0, max: 2, default: 0, step: .1 }],
  inputs: [{ key: 'audio', label: 'Speech recording', kind: 'audio', required: true, description: 'WAV, MP3 or FLAC, up to 14 MB raw audio for the conservative inline request limit.' }],
  notes: 'Actual saved speech was transcribed through Router and the complete text persisted. This multimodal-model operation is not forced alignment, guaranteed verbatim recognition, speaker identity or dubbing. No direct Google backend or separate key is used.',
};
export function buildTranscriptionInput(prompt: string, settings: Record<string, unknown>, uri: string): Record<string, unknown> {
  const match = /^data:(audio\/(?:wav|mpeg|mp3|flac));base64,([A-Za-z0-9+/=\r\n]+)$/.exec(uri);
  if (!match) throw new Error('Transcription requires a server-resolved WAV, MP3 or FLAC recording');
  if (Buffer.from(match[2]!, 'base64').length > 14_000_000) throw new Error('Transcription audio exceeds the conservative 14 MB inline limit');
  const direction = 'Transcribe the audible spoken words in this recording faithfully in their original language. Return only the transcript, without preface, invented speech, analysis, timestamps or stage directions. Preserve meaningful punctuation. Mark genuinely unclear speech as [unclear]. If there is no speech, return [No intelligible speech].' + (prompt ? '\nAdditional user direction: ' + prompt : '');
  return { contents: [{ role: 'user', parts: [{ inlineData: { mimeType: match[1], data: match[2] } }, { text: direction }] }], generationConfig: { ...settings, responseModalities: ['TEXT'] } };
}
export function extractTranscript(result: any): ModelMedia[] {
  const candidate = result?.candidates?.[0];
  if (!candidate || candidate.finishReason !== 'STOP') throw new Error(`Transcript was not completed: ${String(result?.promptFeedback?.blockReason ?? candidate?.finishReason ?? 'no candidate')}`);
  const text = candidate.content?.parts?.filter((part: any) => part.thought !== true && typeof part.text === 'string').map((part: any) => part.text).join('\n').trim();
  if (!text) throw new Error('The transcription model returned no final text');
  return [{ bytes: Buffer.from(text + '\n', 'utf8'), mimeType: 'text/plain', name: 'transcript.txt', kind: 'document' }];
}
