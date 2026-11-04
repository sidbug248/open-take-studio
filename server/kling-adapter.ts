import type { ModelDescriptor, ModelMedia } from '../shared/model-types.ts';
export const KLING_MODELS: ModelDescriptor[] = [
  { id: 'kling/kling-v2-6', name: 'Kling 2.6 · directed video', provider: 'kling', kind: 'video', capabilities: ['text-to-video', 'native-audio', 'native-camera-control'], description: 'Generate a text-led shot and retain its native execution identity.', documentation: 'https://docs.comfy.org/development/comfy-router/models/kling/kling-v2-6/code', verifiedAt: '2026-11-03', status: 'implemented', delivery: 'queue', promptField: 'prompt', promptRequired: true, inputs: [],
    controls: [{ key: 'duration', label: 'Duration', type: 'select', options: ['5', '10'], default: '5' }, { key: 'mode', label: 'Quality mode', type: 'select', options: ['std', 'pro'], default: 'pro' }, { key: 'aspect_ratio', label: 'Aspect ratio', type: 'select', options: ['16:9', '9:16', '1:1'], default: '16:9' }, { key: 'sound', label: 'Native audio', type: 'select', options: ['on', 'off'], default: 'off' }, { key: 'cfg_scale', label: 'Prompt adherence', type: 'number', min: 0, max: 1, step: .05, default: .5 }, { key: 'negative_prompt', label: 'Avoid', type: 'text' }, { key: 'camera_movement', label: 'Native camera movement', type: 'select', options: ['none', 'down_back', 'forward_up', 'right_turn_forward', 'left_turn_forward'], default: 'none' }],
    notes: 'Actual five-second pro-mode text-to-video with sound off completed and saved. Native camera_control presets and sound-on remain separately untested. Multi-shot and voice lists are not exposed. A linked extension attempt returned invalid_input; extension is not claimed as working.' },
  { id: 'kling/videos-video-extend', name: 'Kling · extend a saved video', provider: 'kling', kind: 'video', capabilities: ['video-extension'], description: 'Continue a same-project Kling video using its validated native video ID.', documentation: 'https://docs.comfy.org/development/comfy-router/models/kling/videos-video-extend/code', verifiedAt: '2026-11-03', status: 'unavailable', delivery: 'queue', promptField: 'prompt', promptRequired: false, inputs: [],
    controls: [{ key: 'video_id', label: 'Completed native Kling video ID', type: 'text' }, { key: 'cfg_scale', label: 'Prompt adherence', type: 'number', min: 0, max: 1, step: .05, default: .5 }, { key: 'negative_prompt', label: 'Avoid', type: 'text' }],
    notes: 'Unavailable after actual request becd74ed-a6a6-4d2b-bb8d-0d70f6259b4a returned invalid_input using a completed same-project Kling 2.6 native video ID. Needs a documented compatible predecessor model/extension dispatch contract. Uploaded video URLs, task IDs and Router request IDs are not substitutes. No automatic resubmission.' },
];
export function buildKlingInput(modelId: string, prompt: string, settings: Record<string, unknown>): Record<string, unknown> {
  if (prompt.length > 2500 || typeof settings.negative_prompt === 'string' && settings.negative_prompt.length > 2500) throw new Error('Kling prompts have a 2500-character limit');
  const result: Record<string, unknown> = { ...settings, ...(prompt ? { prompt } : {}) };
  if (modelId === 'kling/kling-v2-6') { const movement = result.camera_movement; delete result.camera_movement; if (movement && movement !== 'none') result.camera_control = { type: movement }; }
  else if (typeof result.video_id !== 'string' || !result.video_id.trim()) throw new Error('Choose a completed native Kling video ID from this project');
  return result;
}
export function extractKlingMedia(result: any): ModelMedia[] {
  if (result?.code !== undefined && result.code !== 0) throw new Error(String(result.message ?? 'Kling request failed'));
  if (result?.data?.task_status !== 'succeed') throw new Error(String(result?.data?.task_status_msg ?? result?.message ?? 'Kling did not return a succeeded native task'));
  const videos = result.data.task_result?.videos;
  if (!Array.isArray(videos) || !videos.length) throw new Error('Kling completed without a supported video URL');
  const httpsMedia = (value: unknown): value is string => {
    if (typeof value !== 'string') return false;
    try { const url = new URL(value); return url.protocol === 'https:' && Boolean(url.hostname) && !url.username && !url.password; } catch { return false; }
  };
  return videos.map((video, index) => {
    // The provider may return only its hotlink-protected watermark URL. Router
    // treats either field as a valid result; do not discard a completed output.
    const url = [video?.url, video?.watermark_url].find(httpsMedia);
    if (!url) throw new Error('Kling completed without a supported video URL');
    return { url, mimeType: 'video/mp4', name: `kling-video-${index + 1}.mp4`, kind: 'video' as const };
  });
}
