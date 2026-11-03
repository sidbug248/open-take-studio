import type { ModelBuildContext, ModelControl, ModelDescriptor, ModelMedia, ModelSetting } from '../shared/model-types.js';
import { KLING_MODELS, buildKlingInput, extractKlingMedia } from './kling-adapter.ts';
import { TRANSCRIPTION_MODEL, buildTranscriptionInput, extractTranscript } from './transcription-adapter.ts';

const verifiedAt = '2026-11-02';
const docs = 'https://docs.comfy.org/development/comfy-router/models/';
const select = (key: string, label: string, options: (string | number)[], value: ModelSetting): ModelControl => ({ key, label, type: 'select', options, default: value });
const number = (key: string, label: string, min: number, max: number, value?: number, step = 1): ModelControl => ({ key, label, type: 'number', min, max, default: value, step });
const bool = (key: string, label: string, value: boolean): ModelControl => ({ key, label, type: 'boolean', default: value });

/** These adapters have reviewed Router input AND output schemas. Status is implementation,
 * not a claim that this account has paid for or successfully executed every model. */
export const MODEL_REGISTRY: ModelDescriptor[] = [
  ...KLING_MODELS,
  TRANSCRIPTION_MODEL,
  {
    id: 'bfl/flux-3-image', name: 'FLUX 3 Image', provider: 'bfl', kind: 'image',
    capabilities: ['image-generation', 'image-editing', 'reference-conditioning', 'compositing', 'product-imagery'],
    description: 'Generate an image or edit up to ten reference images with a written direction.',
    documentation: `${docs}black-forest-labs/flux-3-image/code`, verifiedAt,
    status: 'implemented', delivery: 'queue', promptField: 'prompt', promptRequired: true,
    controls: [
      select('aspect_ratio', 'Aspect ratio', ['auto', '21:9', '2:1', '16:9', '3:2', '7:5', '4:3', '5:4', '1:1', '4:5', '3:4', '5:7', '2:3', '9:16', '1:2', '9:21'], '16:9'),
      select('resolution', 'Resolution', ['768sq', '1k', '1.5k', '2k', '4k'], '1k'),
      bool('grounding', 'Web and image grounding', false),
      number('safety_tolerance', 'Safety tolerance', 0, 4, 2),
      { key: 'version', label: 'Model release', type: 'text', default: 'latest' },
    ],
    inputs: [{ key: 'images', label: 'Reference images', kind: 'image', multiple: true, maxItems: 10, description: '256 × 256 minimum; at most 16 MP per image. Reference conditioning does not guarantee identity.' }],
    notes: 'Actual text-to-image and single-reference image editing completed and saved. Reference conditioning does not guarantee identity or exact compositing. Z-Image Turbo is absent from the checked Router catalog. Seed and workflow sampling steps are not supported.',
  },
  {
    id: 'minimax/minimax-h3', name: 'MiniMax H3', provider: 'minimax', kind: 'video',
    capabilities: ['text-to-video', 'image-to-video', 'native-audio', 'video-bridging', 'reference-conditioning'],
    description: 'Create a short film with native audio, using text, keyframes, or reference media.',
    documentation: `${docs}minimax/minimax-h3/code`, verifiedAt, status: 'implemented', delivery: 'queue',
    promptField: 'content', promptRequired: true,
    controls: [
      number('duration', 'Duration (seconds)', 4, 15, 5),
      select('resolution', 'Resolution', ['768P', '2K'], '768P'),
      select('ratio', 'Aspect ratio (text to video)', ['16:9', '21:9', '4:3', '1:1', '3:4', '9:16'], '16:9'),
      number('seed', 'Seed (optional)', -1, 4294967295),
      bool('aigc_watermark', 'AIGC watermark', false),
    ],
    inputs: [
      { key: 'first_frame', label: 'First frame', kind: 'image' },
      { key: 'last_frame', label: 'Last frame', kind: 'image' },
      { key: 'reference_image', label: 'Reference images', kind: 'image', multiple: true, maxItems: 9 },
      { key: 'reference_video', label: 'Reference video', kind: 'video' },
      { key: 'reference_audio', label: 'Reference audio', kind: 'audio' },
    ],
    notes: 'Actual text-to-video, first-frame image-to-video, first/last-frame bridging and video-reference generation completed as separate saved requests. Audio is generated jointly with no mute setting. Camera presets are prompt guidance. Router base_video regeneration returned invalid_input and remains disabled. A separately labelled native Comfy Cloud partner workflow has proven 768P-to-2K regeneration; it is not this Router mode.',
  },
  {
    id: 'bfl/flux-pro-1.0-fill', name: 'FLUX Fill', provider: 'bfl', kind: 'image',
    capabilities: ['inpainting', 'image-editing'],
    description: 'Replace the white areas of a mask while retaining the black areas.',
    documentation: `${docs}black-forest-labs/flux-pro-1-0-fill/code`, verifiedAt: '2026-11-03', status: 'implemented', delivery: 'queue',
    promptField: 'prompt', promptRequired: false,
    controls: [number('guidance', 'Guidance', 1.5, 100, 60, 0.5), number('steps', 'Steps', 15, 50, 50), select('output_format', 'Format', ['png', 'jpeg', 'webp'], 'png'), bool('prompt_upsampling', 'Expand prompt', false), number('safety_tolerance', 'Safety tolerance', 0, 6, 2), number('seed', 'Seed (optional)', 0, 4294967295)],
    inputs: [{ key: 'image', label: 'Source image', kind: 'image', required: true }, { key: 'mask', label: 'Black and white mask', kind: 'image', required: true }],
    notes: 'Actual source-plus-mask editing completed and saved. The first ceramic test changed shape but did not follow the requested green glaze, so prompt fidelity is not guaranteed. A mask with exactly matching dimensions is required; implicit alpha masks are not offered.',
  },
  {
    id: 'bria/image-edit-remove-background', name: 'Remove background', provider: 'bria', kind: 'image',
    capabilities: ['background-removal', 'product-imagery'], description: 'Isolate a subject on transparency.',
    documentation: `${docs}bria/image-edit-remove-background/code`, verifiedAt, status: 'implemented', delivery: 'queue',
    promptRequired: false, controls: [bool('preserve_alpha', 'Preserve existing transparency', true)],
    inputs: [{ key: 'image', label: 'Source image', kind: 'image', required: true }],
    notes: 'Actual background removal completed; the saved PNG has an alpha channel. No prompt is sent for this operation. Cutout quality remains source-dependent.',
  },
  {
    id: 'bfl/flux-pro-1.0-expand', name: 'FLUX Expand · outpainting', provider: 'bfl', kind: 'image',
    capabilities: ['outpainting', 'image-editing'], description: 'Extend a saved image by explicit pixel margins with optional direction.',
    documentation: `${docs}black-forest-labs/flux-pro-1-0-expand/code`, verifiedAt: '2026-11-03', status: 'implemented', delivery: 'queue', promptField: 'prompt', promptRequired: false,
    controls: [number('top', 'Expand top (pixels)', 0, 2048, 256), number('bottom', 'Expand bottom (pixels)', 0, 2048, 0), number('left', 'Expand left (pixels)', 0, 2048, 0), number('right', 'Expand right (pixels)', 0, 2048, 0), number('guidance', 'Guidance', 1.5, 100, 60, 0.5), number('steps', 'Steps', 15, 50, 50), select('output_format', 'Output format', ['png', 'jpeg'], 'png'), bool('prompt_upsampling', 'Expand prompt', false), number('safety_tolerance', 'Safety tolerance', 0, 6, 2), number('seed', 'Seed (optional)', 0, 4294967295)],
    inputs: [{ key: 'image', label: 'Source image', kind: 'image', required: true }],
    notes: 'Actual native outpainting completed: 256-pixel left/right margins expanded a saved 1184 × 880 image to 1696 × 880. At least one margin must be positive. No mask is required.',
  },
  {
    id: 'bria/image-edit-increase-resolution', name: 'Image enhancement', provider: 'bria', kind: 'image',
    capabilities: ['image-enhancement'], description: 'Increase image resolution by two or four times.',
    documentation: `${docs}bria/image-edit-increase-resolution/code`, verifiedAt, status: 'implemented', delivery: 'queue',
    promptRequired: false, controls: [select('desired_increase', 'Scale', [2, 4], 2), bool('preserve_alpha', 'Preserve transparency', true)],
    inputs: [{ key: 'image', label: 'Source image', kind: 'image', required: true }],
    notes: 'Actual 2× enhancement completed and reopened at twice the source dimensions. Output maximum is 8192 × 8192; the 4× mode remains untested.',
  },
  {
    id: 'recraft/recraftv4_1_vector', name: 'Recraft 4.1 · vector artwork', provider: 'recraft', kind: 'image',
    capabilities: ['vector-generation', 'graphic-design'], description: 'Generate editable vector artwork with a safe PNG preview and downloadable SVG.',
    documentation: `${docs}recraft/recraftv4-1-vector/code`, verifiedAt: '2026-11-03', status: 'implemented', delivery: 'queue', promptField: 'prompt', promptRequired: true,
    controls: [number('n', 'Vector takes', 1, 6, 1), select('size', 'Canvas size', ['1024x1024', '1024x1536', '1536x1024'], '1024x1024')], inputs: [],
    notes: 'Actual SVG and PNG preview completed, saved and reopened. Active elements, external references, CSS rules and unsupported drawing constructs are rejected. Nonvisual metadata is omitted with source-hash provenance; provider signatures are not preserved in sanitized bytes. Shared-schema legacy no_text/artistic_level controls are deliberately omitted for V4.1.',
  },
  {
    id: 'bfl/video-edit-v1', name: 'FLUX Video Edit', provider: 'bfl', kind: 'video',
    capabilities: ['video-editing', 'video-restyling'], description: 'Direct changes to a saved clip with an edit prompt.',
    documentation: `${docs}black-forest-labs/video-edit-v1/code`, verifiedAt, status: 'implemented', delivery: 'queue', promptField: 'prompt', promptRequired: true,
    controls: [number('safety_tolerance', 'Safety tolerance', 0, 4, 2)],
    inputs: [{ key: 'video', label: 'Video to edit', kind: 'video', required: true, description: 'MP4, maximum 15 seconds and 50 MiB; minimum 160 pixels per side.' }],
    notes: 'A real prompt-directed video edit completed and its MP4 was saved. Sources above 720p are reduced by the provider. Edit fidelity requires visual review.',
  },
  {
    id: 'bfl/video-upscale-v1', name: 'FLUX Video Upscale', provider: 'bfl', kind: 'video',
    capabilities: ['video-enhancement'], description: 'Upscale a saved video with optional creative detail.',
    documentation: `${docs}black-forest-labs/flux-video-upscale/code`, verifiedAt, status: 'implemented', delivery: 'queue', promptField: 'prompt', promptRequired: false,
    controls: [number('upscale_factor', 'Scale', 1.5, 3, 2, 0.1), select('creativity', 'Creative detail', [0, 1], 0), number('safety_tolerance', 'Safety tolerance', 0, 4, 2)],
    inputs: [{ key: 'input_video', label: 'Video to enhance', kind: 'video', required: true, description: 'MP4, at most 20 seconds, 50 MB and 2560 × 1440.' }],
    notes: 'Actual enhancement at requested scale 2 and creativity 0 completed; saved 2112 × 1216 H.264 video with audio reopened. Creative detail can change faces or products; other scale/creativity combinations remain untested.',
  },
  {
    id: 'elevenlabs/eleven_sfx_v2', name: 'Sound effects & ambience', provider: 'elevenlabs', kind: 'audio',
    capabilities: ['sound-effects', 'ambience'], description: 'Generate a sound bed or a short effect, with optional seamless looping.',
    documentation: `${docs}elevenlabs/eleven-sfx-v2/code`, verifiedAt, status: 'implemented', delivery: 'sync', promptField: 'text', promptRequired: true, outputFormat: 'binary',
    controls: [number('duration_seconds', 'Duration (seconds)', 0.5, 30, 5, 0.5), bool('loop', 'Seamless loop', false), number('prompt_influence', 'Prompt influence', 0, 1, 0.3, 0.05)], inputs: [],
    notes: 'Actual eight-second stereo ambience completed and persisted. Router permits synchronous delivery only for this binary model. The internal job saves returned bytes and diagnostic execution metadata; it has no resumable Router queue handle.',
  },
  {
    id: 'elevenlabs/eleven_v3', name: 'Speech & dialogue', provider: 'elevenlabs', kind: 'audio',
    capabilities: ['speech', 'voice'], description: 'Speak the written script using a provider voice ID.',
    documentation: `${docs}elevenlabs/eleven-v3/code`, verifiedAt: '2026-11-03', status: 'implemented', delivery: 'sync', promptField: 'inputs', promptRequired: true, outputFormat: 'binary',
    controls: [{ key: 'voice_id', label: 'Voice ID', type: 'text', default: '21m00Tcm4TlvDq8ikWAM' }, select('apply_text_normalization', 'Text normalization', ['auto', 'on', 'off'], 'auto'), { key: 'language_code', label: 'Language code (optional)', type: 'text' }, number('seed', 'Seed (optional)', 0, 4294967295), select('stability', 'Voice stability', [0, 0.5, 1], 0.5)], inputs: [],
    notes: 'Actual directed English speech with the documented example voice completed and saved through synchronous Router binary delivery. Access to other voice IDs and languages remains provider-dependent. No voice cloning or guaranteed performance interpretation.',
  },
  {
    id: 'veed/clean-audio', name: 'VEED · clean speech audio', provider: 'veed', kind: 'audio',
    capabilities: ['audio-cleanup', 'speech-enhancement'], description: 'Reduce background noise beneath speech and optionally normalize loudness.',
    documentation: 'https://api.comfy.org/v2/models/veed/clean-audio/openapi.json', verifiedAt: '2026-11-03', status: 'unavailable', delivery: 'queue', promptRequired: false,
    controls: [number('strength', 'Noise reduction strength', 0, 1, 0.874, 0.001), bool('normalize_loudness', 'Normalize loudness', true), number('target_lufs', 'Target loudness (LUFS)', -40, -8, -19, 0.5), select('output_format', 'Output format', ['wav', 'flac'], 'wav')],
    inputs: [{ key: 'audio_url', label: 'Speech recording', kind: 'audio', required: true, transport: 'cloud-asset-url', description: 'Up to thirty minutes. Uploaded temporarily to Comfy storage.' }],
    notes: 'Catalog and native schema exist, but actual Router admission returned HTTP 403 / not_enabled: this model is not served yet. It was blocked after one attempt; do not retry until Router enables serving. Speech cleanup is not a mixer. Any provider credits field would not be the Comfy charge.',
  },
  {
    id: 'meshy/meshy-6', name: 'Meshy 6 · 3D draft', provider: 'meshy', kind: '3d',
    capabilities: ['text-to-3d'], description: 'Generate a draft 3D mesh from a text description and save the GLB.',
    documentation: `${docs}meshy/meshy-6/code`, verifiedAt, status: 'experimental', delivery: 'queue', promptField: 'prompt', promptRequired: true,
    controls: [select('art_style', 'Art style', ['realistic', 'sculpture'], 'realistic'), bool('should_remesh', 'Remesh', false), select('topology', 'Topology', ['triangle', 'quad'], 'triangle'), number('target_polycount', 'Target polygons', 100, 300000, 30000, 100), select('symmetry_mode', 'Symmetry', ['auto', 'off', 'on'], 'auto'), select('pose_mode', 'Pose', ['', 'a-pose', 't-pose'], '')], inputs: [],
    notes: 'Preview geometry only. This does not create a playable game or a rigged character. Schema verified; live validation pending.',
  },
  {
    id: 'byteplus/seed-audio-1.0-multilingual', name: 'Seed Audio · speech + captions', provider: 'byteplus', kind: 'audio',
    capabilities: ['speech', 'voice', 'generated-subtitles'], description: 'Generate multilingual speech and save its provider-timed subtitles.',
    documentation: `${docs}byteplus/seed-audio-1-0-multilingual/code`, verifiedAt, status: 'implemented', delivery: 'queue', promptField: 'text_prompt', promptRequired: true,
    controls: [select('format', 'Audio format', ['wav', 'mp3', 'ogg_opus'], 'wav'), select('sample_rate', 'Sample rate', [8000, 16000, 24000, 32000, 44100, 48000], 24000), number('speech_rate', 'Speech rate', -50, 100, 0), number('loudness_rate', 'Loudness', -50, 100, 0), number('pitch_rate', 'Pitch', -12, 12, 0), bool('enable_subtitle', 'Generate timed captions', true)],
    inputs: [{ key: 'reference_image', label: 'Voice direction image', kind: 'image', description: 'One JPEG/PNG/WebP image, up to 10 MB. Cannot be combined with audio references.' }],
    notes: 'Actual speech and provider-timed captions completed and saved. Captions time this generated speech, not arbitrary input audio. Image-conditioned speech remains experimental; reference-audio voice conditioning is not exposed. Raw PCM is omitted because it has no self-describing container.',
  },
  {
    id: 'meshy/meshy-7.1', name: 'Meshy 7.1 · geometry & texture', provider: 'meshy', kind: '3d',
    capabilities: ['text-to-3d', '3d-texturing'], description: 'Draft a mesh, then refine a completed preview into a textured GLB.',
    documentation: `${docs}meshy/meshy-7-1/code`, verifiedAt: '2026-11-03', status: 'implemented', delivery: 'queue', promptField: 'prompt', promptRequired: false,
    controls: [select('mode', 'Stage', ['preview', 'refine'], 'preview'), { key: 'preview_task_id', label: 'Completed preview task ID (refine only)', type: 'text', description: 'Choose a completed Meshy 7.1 preview from this project. This is the provider task ID, not the Router request ID.' }, select('art_style', 'Preview · art style', ['realistic', 'sculpture'], 'realistic'), select('geometry_resolution', 'Preview · geometry resolution', ['standard', '2k', '4k'], 'standard'), bool('should_remesh', 'Preview · remesh', false), select('topology', 'Preview · topology', ['triangle', 'quad'], 'triangle'), number('target_polycount', 'Preview · target polygons', 100, 300000, 30000, 100), select('symmetry_mode', 'Preview · symmetry', ['auto', 'off', 'on'], 'auto'), select('pose_mode', 'Preview · pose', ['', 'a-pose', 't-pose'], ''), select('texture_resolution', 'Refine · texture resolution', ['2k', '4k', '8k'], '2k'), bool('enable_pbr', 'Refine · PBR textures', false), bool('moderation', 'Provider moderation', false)],
    inputs: [{ key: 'texture_image_url', label: 'Refine · texture reference', kind: 'image', description: 'JPEG or PNG texture direction; refine stage only.' }],
    notes: 'Actual text-to-3D previews and 2K PBR refinement completed and saved as GLB with embedded textures. Preview and refine have separate native requests and charges. Refine reuses a completed preview from this project; preview fields are omitted in refine snapshots. Prompt is geometry direction for preview and optional texture direction for refine. Exact provider weights remain unverified.',
  },
  {
    id: 'meshy/rigging', name: 'Meshy · humanoid rigging', provider: 'meshy', kind: '3d',
    capabilities: ['3d-rigging'], description: 'Add a skeleton and basic motion to a textured humanoid mesh from this project.',
    documentation: `${docs}meshy/rigging/code`, verifiedAt: '2026-11-03', status: 'implemented', delivery: 'queue', promptRequired: false,
    controls: [{ key: 'input_task_id', label: 'Completed textured mesh task ID', type: 'text' }, { key: 'height_meters', label: 'Character height (meters)', type: 'number', min: 0.01, default: 1.7, step: 0.01 }], inputs: [],
    notes: 'Actual textured fox courier rigging completed. Rigged, walking and running GLBs reopened with real skin, animation and embedded textures. Requires a same-project Meshy 7.1 refine task and a textured biped humanoid; props and quadrupeds are not assumed compatible.',
  },
  {
    id: 'meshy/animations', name: 'Meshy · character animation', provider: 'meshy', kind: '3d',
    capabilities: ['3d-animation'], description: 'Apply one library action to a completed rig from this project.',
    documentation: `${docs}meshy/animations/code`, verifiedAt: '2026-11-03', status: 'implemented', delivery: 'queue', promptRequired: false,
    controls: [{ key: 'rig_task_id', label: 'Completed rigging task ID', type: 'text' }, { key: 'action_id', label: 'Meshy animation action ID', type: 'number', default: 0, step: 1, description: 'Verified library examples: 0 Idle, 1 Walking_Woman, 14 Run_02, 22 FunnyDancing_01, 28 Big_Wave_Hello, 30 Casual_Walk. IDs are not contiguous; consult the Meshy animation library for other actions.' }], inputs: [],
    notes: 'Actual action 30 Casual_Walk completed and saved as a textured GLB with skin and animation. Requires a same-project Meshy rigging task. Other action compatibility remains provider-dependent; optional FBX/USDZ and multi-action merges are not exposed.',
  },
  {
    id: 'ltx/ltx-2-5-fast', name: 'LTX 2.5 Fast · video & audio', provider: 'ltx', kind: 'video',
    capabilities: ['text-to-video', 'native-audio'], description: 'Generate a short video with optional native audio from a written direction.',
    documentation: `${docs}ltx/ltx-2-5-fast/code`, verifiedAt: '2026-11-03', status: 'implemented', delivery: 'queue', promptField: 'prompt', promptRequired: true,
    controls: [select('duration', 'Duration (seconds)', [2, 3, 4, 5, 6, 8, 10, 12, 14, 16, 18, 20], 4), select('fps', 'Frame rate', [24, 25, 48, 50], 25), select('resolution', 'Resolution', ['1280x720', '720x1280', '1920x1080', '1080x1920', '2560x1440', '1440x2560', '3840x2160', '2160x3840'], '1280x720'), bool('generate_audio', 'Generate audio', true)], inputs: [],
    notes: 'Actual four-second 720p 25fps text-to-video with native audio completed; saved H.264/AAC output reopened. This route is text-to-video only. Other resolution/duration combinations remain experimental. Public LTX weights do not attest the hosted checkpoint or auxiliary stages.',
  },
  {
    id: 'synclabs/sync-3', name: 'Sync 3 · lip sync', provider: 'synclabs', kind: 'video',
    capabilities: ['lip-sync'], description: 'Match a saved performance video to a selected speech track.',
    documentation: `${docs}synclabs/sync-3/code`, verifiedAt, status: 'implemented', delivery: 'queue', promptRequired: false,
    controls: [select('sync_mode', 'When durations differ', ['cut_off', 'bounce', 'loop', 'silence', 'remap'], 'cut_off'), number('temperature', 'Expressiveness', 0, 1, 0.5, 0.05), bool('occlusion_detection_enabled', 'Detect covered faces', true)],
    inputs: [{ key: 'video', label: 'Performance video', kind: 'video', required: true, transport: 'cloud-asset-url' }, { key: 'audio', label: 'Speech track', kind: 'audio', required: true, transport: 'cloud-asset-url' }],
    notes: 'Actual video-plus-speech lip sync completed and its MP4 was saved; visual alignment quality is not certified. Selected inputs are uploaded temporarily to Comfy storage. Audio-driven lip sync only; this adapter does not translate speech or invoke hidden text-to-speech.',
  },
  {
    id: 'higgsfield/higgsfield-genjutsu-motion-transfer-v1.0', name: 'Genjutsu · motion transfer', provider: 'higgsfield', kind: 'video',
    capabilities: ['motion-transfer', 'performance-transfer', 'video-restyling'], description: 'Recast a performance with reference images while preserving its motion and timing.',
    documentation: `${docs}higgsfield/higgsfield-genjutsu-motion-transfer-v1-0/code`, verifiedAt, status: 'implemented', delivery: 'queue', promptField: 'prompt', promptRequired: false,
    controls: [select('resolution', 'Resolution', ['480p', '720p', '1080p'], '720p')],
    inputs: [{ key: 'video', label: 'Source performance', kind: 'video', required: true, transport: 'cloud-asset-url', description: 'At least four seconds. The provider trims videos longer than thirty seconds.' }, { key: 'images', label: 'Cast, location and style references', kind: 'image', required: true, multiple: true, maxItems: 8, transport: 'cloud-asset-url' }],
    notes: 'Actual coastal and dancer-to-clay reference transfers completed and saved as MP4s with audio. Selected inputs use temporary Comfy storage. Matched-time review shows retained broad dance poses and changed clay appearance; identity and frame-exact performance preservation are not guaranteed. Optional Higgsfield route.',
  },
];

export function getModel(id: string, allowUnavailable = false): ModelDescriptor {
  const model = MODEL_REGISTRY.find(item => item.id === id);
  if (!model) throw new Error(`Unsupported Router model: ${id}`);
  if (model.status === 'unavailable' && !allowUnavailable) throw new Error(`${model.name} is unavailable: ${model.notes ?? 'Missing dependency'}`);
  return model;
}

export function validateSupportedSettings(modelId: string, settings: Record<string, unknown> = {}): Record<string, ModelSetting> {
  const model = getModel(modelId);
  const allowed = new Map(model.controls.map(control => [control.key, control]));
  for (const key of Object.keys(settings)) {
    if (!allowed.has(key)) throw new Error(`${key} is not supported by ${model.name}`);
  }
  const result: Record<string, ModelSetting> = {};
  for (const control of model.controls) {
    let value = settings[control.key] ?? control.default;
    if (value === undefined || value === '') continue;
    if (control.type === 'number' || (control.type === 'select' && control.options?.every(v => typeof v === 'number'))) {
      if (typeof value === 'string' && value.trim() !== '') value = Number(value);
      if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`${control.label} must be a number`);
      if (control.min !== undefined && value < control.min || control.max !== undefined && value > control.max) throw new Error(`${control.label} is outside the supported range`);
      if (Number.isInteger(control.step) && !Number.isInteger(value)) throw new Error(`${control.label} must be a whole number`);
    }
    if (control.type === 'boolean' && typeof value !== 'boolean') throw new Error(`${control.label} must be true or false`);
    if ((control.type === 'text' || control.type === 'select' && control.options?.every(v => typeof v === 'string')) && typeof value !== 'string') throw new Error(`${control.label} must be text`);
    if (control.type === 'select' && !control.options?.includes(value as ModelSetting as string | number)) throw new Error(`${control.label} has an unsupported value`);
    if (typeof value === 'string' && value.length > 2000) throw new Error(`${control.label} is too long`);
    result[control.key] = value as ModelSetting;
  }
  if (modelId === 'meshy/meshy-7.1') {
    const refine = result.mode === 'refine';
    for (const key of refine ? ['art_style', 'geometry_resolution', 'should_remesh', 'topology', 'target_polycount', 'symmetry_mode', 'pose_mode'] : ['preview_task_id', 'texture_resolution', 'enable_pbr']) delete result[key];
  }
  if (modelId === 'veed/clean-audio' && result.normalize_loudness === false) delete result.target_lufs;
  return result;
}

function dataItems(value: string | string[] | undefined): string[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function base64(value: string): string {
  return value.startsWith('data:') ? value.slice(value.indexOf(',') + 1) : value;
}

export function buildModelInput(modelId: string, context: ModelBuildContext): Record<string, unknown> {
  const model = getModel(modelId);
  if (modelId === 'minimax/minimax-h3' && context.inputData.base_video) throw new Error('H3 base-video regeneration is unavailable: the documented Router role returned invalid_input for a valid 768P source and 2K target. A corrected Router regeneration contract is required.');
  const prompt = context.prompt.trim();
  if (model.promptRequired && !prompt) throw new Error(`${model.name} needs a prompt`);
  const promptLimit = ['meshy/meshy-6', 'meshy/meshy-7.1'].includes(modelId) ? 800 : modelId === 'bfl/video-edit-v1' ? 4096 : modelId === 'byteplus/seed-audio-1.0-multilingual' ? 3000 : ['higgsfield/higgsfield-genjutsu-motion-transfer-v1.0', 'ltx/ltx-2-5-fast', 'recraft/recraftv4_1_vector'].includes(modelId) ? 10000 : 12000;
  if (prompt.length > promptLimit) throw new Error(`Prompt exceeds the ${promptLimit}-character limit`);
  const settings = validateSupportedSettings(modelId, context.settings);
  for (const key of Object.keys(context.inputData)) {
    if (!model.inputs.some(input => input.key === key)) throw new Error(`${key} is not a supported input for ${model.name}`);
  }
  for (const input of model.inputs) {
    const values = dataItems(context.inputData[input.key]);
    if (input.required && values.length === 0) throw new Error(`${input.label} is required`);
    if (!input.multiple && values.length > 1) throw new Error(`${input.label} takes one asset`);
    if (input.maxItems && values.length > input.maxItems) throw new Error(`${input.label} accepts at most ${input.maxItems} assets`);
    for (const value of values) {
      if (input.transport === 'cloud-asset-url') {
        let url: URL;
        try { url = new URL(value); } catch { throw new Error(`${input.label} needs a server-resolved temporary media URL`); }
        if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443')) throw new Error(`${input.label} needs a server-resolved temporary HTTPS media URL`);
        if (modelId === 'higgsfield/higgsfield-genjutsu-motion-transfer-v1.0' && input.key === 'video' && value.length > 2083) throw new Error('Hosted video URL exceeds this model’s 2083-character limit');
        continue;
      }
      if (typeof value !== 'string' || !/^data:(image|video|audio)\/[\w.+-]+;base64,[A-Za-z0-9+/=\r\n]+$/.test(value)) {
        throw new Error(`${input.label} must be a server-resolved media data URI`);
      }
      if (!value.startsWith(`data:${input.kind}/`)) throw new Error(`${input.label} needs ${input.kind} media`);
    }
  }
  const first = (key: string) => dataItems(context.inputData[key])[0];
  if (modelId === TRANSCRIPTION_MODEL.id) return buildTranscriptionInput(prompt, settings, first('audio')!);
  if (modelId.startsWith('kling/')) return buildKlingInput(modelId, prompt, settings);
  if (modelId === 'bfl/flux-3-image') {
    const refs = dataItems(context.inputData.images).map(base64);
    return { prompt, ...settings, ...(refs.length ? { images: refs } : {}) };
  }
  if (modelId === 'minimax/minimax-h3') {
    const keyframes = ['first_frame', 'last_frame'].some(key => first(key));
    const references = ['reference_image', 'reference_video', 'reference_audio'].some(key => first(key));
    if (keyframes && references) throw new Error('MiniMax H3 cannot mix keyframes with reference media');
    if (keyframes && first('base_video')) throw new Error('Choose keyframes or video regeneration, not both');
    if (references && first('base_video')) throw new Error('Video regeneration cannot be mixed with reference media');
    if (first('reference_audio') && !first('reference_image') && !first('reference_video')) throw new Error('H3 reference audio requires an image or video reference');
    if (first('base_video') && settings.resolution !== '2K') throw new Error('H3 source-video regeneration requires 2K output');
    const content: Record<string, unknown>[] = [{ type: 'text', text: prompt }];
    for (const input of model.inputs) {
      for (const uri of dataItems(context.inputData[input.key])) {
        const type = `${input.kind}_url`;
        content.push({ type, [type]: { url: uri }, role: input.key });
      }
    }
    const body: Record<string, unknown> = { ...settings, content };
    if (keyframes) delete body.ratio;
    if (Buffer.byteLength(JSON.stringify(body), 'utf8') > 64_000_000) throw new Error('H3 encoded inputs exceed the provider’s 64 MB request limit. Choose smaller references.');
    return body;
  }
  if (modelId === 'bfl/flux-pro-1.0-fill') return { ...settings, prompt, image: base64(first('image')!), mask: base64(first('mask')!) };
  if (modelId === 'bfl/flux-pro-1.0-expand') {
    if (!['top', 'bottom', 'left', 'right'].some(key => Number(settings[key]) > 0)) throw new Error('Choose at least one positive expansion margin');
    return { ...settings, prompt, image: base64(first('image')!) };
  }
  if (modelId.startsWith('bria/')) return { ...settings, image: base64(first('image')!) };
  if (modelId === 'bfl/video-edit-v1') return { ...settings, prompt, video: base64(first('video')!) };
  if (modelId === 'bfl/video-upscale-v1') return { ...settings, ...(prompt ? { prompt } : {}), input_video: base64(first('input_video')!) };
  if (modelId === 'recraft/recraftv4_1_vector') {
    return { ...settings, prompt, response_format: 'url' };
  }
  if (modelId === 'elevenlabs/eleven_sfx_v2') return { ...settings, text: prompt };
  if (modelId === 'veed/clean-audio') return { ...settings, audio_url: first('audio_url') };
  if (modelId === 'elevenlabs/eleven_v3') {
    const { voice_id, stability, ...rest } = settings;
    if (typeof voice_id !== 'string' || !voice_id.trim()) throw new Error('A provider voice ID is required');
    return { ...rest, inputs: [{ text: prompt, voice_id }], ...(stability === undefined ? {} : { settings: { stability } }) };
  }
  if (modelId === 'meshy/meshy-6') return { ...settings, mode: 'preview', prompt };
  if (modelId === 'meshy/meshy-7.1') {
    if (settings.mode === 'refine') {
      if (typeof settings.preview_task_id !== 'string' || !settings.preview_task_id.trim()) throw new Error('Refine needs a completed preview task ID from this project');
      const texture = first('texture_image_url');
      if (texture && !/^data:image\/(png|jpeg);/.test(texture)) throw new Error('Meshy texture reference must be JPEG or PNG');
      return { ...settings, ...(prompt ? { texture_prompt: prompt } : {}), ...(texture ? { texture_image_url: texture } : {}) };
    }
    if (!prompt) throw new Error('Meshy preview needs a prompt');
    if (first('texture_image_url')) throw new Error('A texture reference is only supported in refine mode');
    return { ...settings, prompt };
  }
  if (modelId === 'meshy/rigging' || modelId === 'meshy/animations') {
    const key = modelId === 'meshy/rigging' ? 'input_task_id' : 'rig_task_id';
    if (typeof settings[key] !== 'string' || !(settings[key] as string).trim()) throw new Error('Choose a completed predecessor task from this project');
    return { ...settings };
  }
  if (modelId === 'ltx/ltx-2-5-fast') return { ...settings, prompt };
  if (modelId === 'byteplus/seed-audio-1.0-multilingual') return { text_prompt: prompt, audio_config: settings, ...(first('reference_image') ? { references: [{ image_data: base64(first('reference_image')!) }] } : {}) };
  if (modelId === 'synclabs/sync-3') return { input: [{ type: 'video', url: first('video') }, { type: 'audio', url: first('audio') }], options: settings };
  if (modelId === 'higgsfield/higgsfield-genjutsu-motion-transfer-v1.0') return { ...settings, video_url: first('video'), image_urls: dataItems(context.inputData.images), ...(prompt ? { prompt } : {}) };
  throw new Error(`No request adapter for ${modelId}`);
}

function object(value: unknown): Record<string, any> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Router returned an unexpected model response');
  return value as Record<string, any>;
}

function media(url: unknown, mimeType?: string, name?: string): ModelMedia {
  if (typeof url !== 'string' || !/^https:\/\//.test(url)) throw new Error('Model completed without an accessible media result');
  return { url, mimeType, name };
}

export function timedCaptionMedia(segments: { start: number; end: number; text: string }[]): ModelMedia | undefined {
  const valid = segments.filter(segment => Number.isFinite(segment.start) && Number.isFinite(segment.end) && segment.start >= 0 && segment.end > segment.start && typeof segment.text === 'string' && segment.text.trim()).sort((a, b) => a.start - b.start);
  if (!valid.length) return undefined;
  const time = (seconds: number) => {
    const milliseconds = Math.round(seconds * 1000);
    return `${String(Math.floor(milliseconds / 3600000)).padStart(2, '0')}:${String(Math.floor(milliseconds / 60000) % 60).padStart(2, '0')}:${String(Math.floor(milliseconds / 1000) % 60).padStart(2, '0')}.${String(milliseconds % 1000).padStart(3, '0')}`;
  };
  const text = 'WEBVTT\n\n' + valid.map((segment, index) => `${index + 1}\n${time(segment.start)} --> ${time(segment.end)}\n${segment.text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\r?\n/g, ' ')}\n`).join('\n');
  return { bytes: Buffer.from(text, 'utf8'), mimeType: 'text/vtt', name: 'captions.vtt', kind: 'document' };
}

/** Model result envelope only, not the SDK {kind,data} wrapper. Binary models are
 * persisted by the worker directly and never sent through this JSON extractor. */
export function extractModelMedia(modelId: string, result: unknown): ModelMedia[] {
  if (modelId === TRANSCRIPTION_MODEL.id) return extractTranscript(result);
  if (modelId.startsWith('kling/')) return extractKlingMedia(result);
  // Collection of an already accepted result remains possible after an adapter
  // is disabled for new submissions because provider availability changed.
  const model = getModel(modelId, true);
  if (model.outputFormat === 'binary') throw new Error('This model returns binary audio; save the SDK response bytes directly');
  const body = object(result);
  if (modelId.startsWith('bfl/')) {
    if (body.status && String(body.status).trim().toLowerCase() !== 'ready') throw new Error(`BFL returned ${String(body.status)}`);
    return [media(object(body.result).sample, model.kind === 'video' ? 'video/mp4' : undefined)];
  }
  if (modelId === 'minimax/minimax-h3') {
    const task = object(body.task);
    if (task.error || task.status && task.status !== 'succeeded') throw new Error(`MiniMax failed: ${task.error?.message ?? task.status ?? 'unknown outcome'}`);
    return [media(object(task.content).url, 'video/mp4')];
  }
  if (modelId.startsWith('bria/')) {
    if (body.error || body.status && body.status !== 'COMPLETED') throw new Error(`Bria failed: ${body.error?.message ?? body.status}`);
    return [media(object(body.result).image_url, 'image/png')];
  }
  if (modelId === 'veed/clean-audio') {
    const data = object(body.data);
    if (data.error || data.status !== 'COMPLETED') throw new Error(`VEED failed: ${data.error?.message ?? data.status ?? 'missing status'}`);
    const audio = object(object(data.result).audio);
    return [{ ...media(audio.url, audio.content_type, audio.file_name), kind: 'audio' }];
  }
  if (modelId === 'recraft/recraftv4_1_vector') {
    if (!Array.isArray(body.data) || !body.data.length) throw new Error('Recraft completed without vector output');
    return body.data.flatMap((item: unknown, index: number) => {
      const row = object(item);
      // Storage verifies actual SVG, renders a PNG preview, and keeps the rebuilt
      // vector as an attachment-only document. Neither result is called a mesh.
      const output = media(row.url, 'image/svg+xml');
      return [{ ...output, name: `Vector ${index + 1} preview.png`, kind: 'image' as const }, { ...output, name: `Vector ${index + 1}.svg`, kind: 'document' as const }];
    });
  }
  if (modelId === 'meshy/meshy-6' || modelId === 'meshy/meshy-7.1') {
    if (body.task_error || body.status !== 'SUCCEEDED') throw new Error(`Meshy failed: ${body.task_error?.message ?? body.status ?? 'missing status'}`);
    const urls = object(body.model_urls);
    // Prefer the self-contained browser-compatible mesh. Extra vendor formats must
    // not turn an otherwise valid GLB collection into a failed take.
    if (typeof urls.glb === 'string' && urls.glb) return [{ ...media(urls.glb, 'model/gltf-binary', 'model.glb'), kind: '3d' }];
    if (typeof urls.obj === 'string' && urls.obj) {
      const meshes: ModelMedia[] = [{ ...media(urls.obj, 'text/plain', 'model.obj'), kind: 'document' }];
      if (typeof urls.mtl === 'string' && urls.mtl) meshes.push({ ...media(urls.mtl, 'text/plain', 'model.mtl'), kind: 'document' });
      return meshes;
    }
    throw new Error('Meshy completed without a supported mesh asset (GLB or OBJ). Other returned format URLs remain in the execution record.');
  }
  if (modelId === 'meshy/rigging' || modelId === 'meshy/animations') {
    if (body.task_error || body.status !== 'SUCCEEDED') throw new Error(`Meshy failed: ${body.task_error?.message ?? body.status ?? 'missing status'}`);
    const output = object(body.result);
    const candidates = modelId === 'meshy/rigging'
      ? [[output.rigged_character_glb_url, 'rigged-character.glb'], [output.basic_animations?.walking_glb_url, 'walking.glb'], [output.basic_animations?.running_glb_url, 'running.glb']]
      : [[output.animation_glb_url, 'animation.glb']];
    const results = candidates.filter(([url]) => typeof url === 'string' && url).map(([url, name]) => ({ ...media(url, 'model/gltf-binary', name), kind: '3d' as const }));
    if (!results.length) throw new Error('Meshy completed without a supported GLB result. Other format URLs remain in the execution record.');
    return results;
  }
  if (modelId === 'ltx/ltx-2-5-fast') {
    if (body.error || body.status !== 'completed') throw new Error(`LTX failed: ${body.error?.message ?? body.status ?? 'missing status'}`);
    return [media(object(body.result).video_url, 'video/mp4')];
  }
  if (modelId === 'byteplus/seed-audio-1.0-multilingual') {
    const items: ModelMedia[] = [];
    if (typeof body.audio === 'string' && /^[A-Za-z0-9+/=\r\n]+$/.test(body.audio)) {
      const bytes = Buffer.from(body.audio, 'base64');
      if (bytes.length) items.push({ bytes, mimeType: 'application/octet-stream', name: 'Generated speech', kind: 'audio' });
    }
    if (!items.length && typeof body.url === 'string' && body.url) items.push(media(body.url));
    if (!items.length) throw new Error(`Seed Audio returned no audio: ${String(body.message ?? body.code ?? 'missing output')}`);
    const subtitle = body.subtitle;
    const rows = Array.isArray(subtitle?.sentences) && subtitle.sentences.length ? subtitle.sentences : subtitle?.words;
    if (Array.isArray(rows)) {
      const captions = timedCaptionMedia(rows.map((row: any) => ({ start: Number(row.start_time) / 1000, end: Number(row.end_time) / 1000, text: row.text })));
      if (captions) items.push(captions);
    }
    return items;
  }
  if (modelId === 'synclabs/sync-3') {
    if (body.error || body.errorCode || body.status !== 'COMPLETED') throw new Error(`Sync 3 failed: ${String(body.error ?? body.errorCode ?? body.status ?? 'missing status')}`);
    return [media(body.outputUrl, 'video/mp4')];
  }
  if (modelId === 'higgsfield/higgsfield-genjutsu-motion-transfer-v1.0') {
    if (body.error || body.status !== 'completed') throw new Error(`Genjutsu failed: ${String(body.error ?? body.status ?? 'missing status')}`);
    return [media(object(body.video).url, 'video/mp4')];
  }
  throw new Error(`No response adapter for ${modelId}`);
}
