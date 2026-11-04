/** Public, creator-facing evidence. Contains no account identifiers or credentials.
 * A published model family is not proof of the checkpoint or auxiliary models a
 * hosted route executes. Runtime serving-provider metadata must remain separate. */
export type WeightEvidence = 'commercial-license-only' | 'public-weights-restricted-license' | 'no-public-weight-evidence';
export interface ModelRouteAudit {
  modelId: string;
  exactVariant: string;
  requestedProvider: string;
  routeType: 'router-hosted-api';
  weightEvidence: WeightEvidence;
  licenseName: string;
  openWeightExecutionVerified: false;
  readiness: 'tested-ready' | 'experimental' | 'unavailable';
  testedModes: string[];
  creatorSummary: string;
  executionBoundary: string;
  sources: { label: string; url: string }[];
  reviewedAt: string;
}

const docs = 'https://docs.comfy.org/development/comfy-router/models/';
const executionBoundary = 'Comfy Router hosted API. A requested model/provider is recorded; an actual serving provider is known only when Router returns that metadata. Checkpoint revisions and auxiliary inference stages are not attested.';
function entry(modelId: string, exactVariant: string, documentation: string, summary: string, overrides: Partial<ModelRouteAudit> = {}): ModelRouteAudit {
  return {
    modelId, exactVariant, requestedProvider: modelId.split('/')[0]!, routeType: 'router-hosted-api',
    weightEvidence: 'no-public-weight-evidence', licenseName: 'Hosted service terms; no exact public weight license verified',
    openWeightExecutionVerified: false, readiness: 'experimental', testedModes: [],
    creatorSummary: summary, executionBoundary,
    sources: [{ label: 'Router model contract', url: `${docs}${documentation}/code` }],
    reviewedAt: '2026-11-03', ...overrides,
  };
}

export const MODEL_ROUTE_AUDIT: Readonly<Record<string, ModelRouteAudit>> = {
  'pika/pika-music': entry('pika/pika-music', 'Pika Music hosted text-to-music operation', 'pika/pika-music', 'Text and lyrics composition has a validated request/result contract, but the funded personal-workspace request returned HTTP 403 not_enabled on 2026-11-04. This adapter remains unavailable. Native Sonilo music is a separate route; exact serving weights are not attested.', { readiness: 'unavailable', reviewedAt: '2026-11-04', sources: [{ label: 'Exact Router contract', url: 'https://api.comfy.org/v2/models/pika/pika-music/openapi.json' }] }),
  'vertexai/gemini-3.1-flash-lite': entry('vertexai/gemini-3.1-flash-lite', 'Gemini 3.1 Flash Lite hosted multimodal text endpoint through Router VertexAI route', 'vertexai/gemini-3-1-flash-lite', 'Actual saved English speech was transcribed into a persistent text document through Router, without supplying the script. No forced alignment, speaker identity or exact recognition guarantee. Public weights and the hosted serving revision are not attested.', { readiness: 'tested-ready', testedModes: ['saved English speech to complete plain-text transcript'], sources: [{ label: 'Exact Router native schema', url: 'https://api.comfy.org/v2/models/vertexai/gemini-3.1-flash-lite/openapi.json' }, { label: 'Official audio understanding and transcription', url: 'https://ai.google.dev/gemini-api/docs/audio' }] }),
  'kling/kling-v2-6': entry('kling/kling-v2-6', 'Kling 2.6 hosted text-to-video route', 'kling/kling-v2-6', 'Actual pro-mode five-second origin video completed and saved. Native camera and audio-on controls remain untested; no public hosted-weight evidence is claimed.', { readiness: 'tested-ready', testedModes: ['five-second pro text-to-video with sound off'] }),
  'kling/videos-video-extend': entry('kling/videos-video-extend', 'Kling native video extension operation; compatible predecessor variant not established', 'kling/videos-video-extend', 'Actual extension with a verified same-project Kling 2.6 native video ID returned invalid_input. Disabled pending a compatible predecessor/dispatch contract, without automatic retries.', { readiness: 'unavailable' }),
  'bfl/flux-3-image': entry('bfl/flux-3-image', 'FLUX 3 Image hosted endpoint; release tag is not a weight revision', 'black-forest-labs/flux-3-image',
    'Real image generation and single-reference editing tested. This route is the full FLUX 3 Image service, not the separate FLUX 3 Image Klein open-weight release.', {
      weightEvidence: 'commercial-license-only', licenseName: 'Full model: commercial weights by agreement; Klein uses a separate FLUX Kommunity License',
      readiness: 'tested-ready', testedModes: ['text-to-image', 'single-reference image editing'],
      sources: [{ label: 'Router model contract', url: `${docs}black-forest-labs/flux-3-image/code` }, { label: 'Full FLUX 3 Image', url: 'https://bfl.ai/models/flux-3-image' }, { label: 'Separate Klein release', url: 'https://bfl.ai/blog/flux-3-image-klein' }],
    }),
  'minimax/minimax-h3': entry('minimax/minimax-h3', 'MiniMax-H3 hosted model selected by Router; open FL2VA/Ref2VA/Regenerate checkpoints not pinned', 'minimax/minimax-h3',
    'Real image-to-video with native audio tested. Public H3 weights have a restricted community license; the hosted Context-IR pipeline is not included in that release.', {
      weightEvidence: 'public-weights-restricted-license', licenseName: 'MiniMax H3 Community License Agreement; hosted API terms are a separate route',
      readiness: 'tested-ready', testedModes: ['first and last frame bridging', 'single reference-video generation', 'text-to-video with native audio', 'first-frame image-to-video', 'native video audio', 'four-second branches from an extracted video frame'],
      sources: [{ label: 'Router model contract', url: `${docs}minimax/minimax-h3/code` }, { label: 'H3 release', url: 'https://www.minimax.io/news/minimax-h3-open-source' }, { label: 'Weight license', url: 'https://huggingface.co/MiniMaxAI/MiniMax-H3/blob/main/LICENSE' }, { label: 'Weight versus hosted API scope', url: 'https://huggingface.co/MiniMaxAI/MiniMax-H3/blob/main/docs/QA-about-License.md' }],
    }),
  'bfl/flux-pro-1.0-fill': entry('bfl/flux-pro-1.0-fill', 'FLUX.1 Fill [pro] API', 'black-forest-labs/flux-pro-1-0-fill', 'Actual same-size source/mask request returned a saved edit. The first requested glaze color was not followed; model fidelity is not guaranteed. Pro is not the separately released Fill [dev] checkpoint.', { readiness: 'tested-ready', testedModes: ['explicit same-dimension source and mask edit'] }),
  'bfl/flux-pro-1.0-expand': entry('bfl/flux-pro-1.0-expand', 'FLUX.1 Pro Expand hosted operation', 'black-forest-labs/flux-pro-1-0-expand', 'Actual margin-based expansion completed and saved at the expected larger dimensions. A model-family release does not attest the exact hosted weights.', { readiness: 'tested-ready', testedModes: ['256-pixel left and right outpainting'] }),
  'recraft/recraftv4_1_vector': entry('recraft/recraftv4_1_vector', 'Recraft V4.1 Vector hosted variant', 'recraft/recraftv4-1-vector', 'Actual sanitized SVG and PNG preview saved and reopened. Original hash is retained; nonvisual provider metadata is omitted and its signature is not preserved. Exact serving weights remain unverified.', { readiness: 'tested-ready', testedModes: ['text-to-vector with sanitized SVG download and PNG preview'], sources: [{ label: 'Router contract', url: `${docs}recraft/recraftv4-1-vector/code` }, { label: 'Exact V4.1 supported controls', url: 'https://www.recraft.ai/docs/api-reference/models/recraft-v4-1' }] }),
  'bria/image-edit-remove-background': entry('bria/image-edit-remove-background', 'Bria remove-background operation; checkpoint version not disclosed by this contract', 'bria/image-edit-remove-background', 'Actual removal completed and the saved PNG has an alpha channel. A Bria RMBG family release does not identify this hosted operation’s weights.', { readiness: 'tested-ready', testedModes: ['background removal with saved alpha PNG'] }),
  'bria/image-edit-increase-resolution': entry('bria/image-edit-increase-resolution', 'Bria increase-resolution operation; checkpoint version not disclosed by this contract', 'bria/image-edit-increase-resolution', 'Actual 2× enhancement saved at twice the source dimensions. Exact serving weights and auxiliary processing are unverified.', { readiness: 'tested-ready', testedModes: ['2× image enhancement'] }),
  'bfl/video-edit-v1': entry('bfl/video-edit-v1', 'BFL video-edit-v1 hosted endpoint', 'black-forest-labs/video-edit-v1', 'A real video edit completed and its returned MP4 was saved. Exact edit fidelity still requires visual review. No public weight artifact for this exact hosted variant was verified.', { readiness: 'tested-ready', testedModes: ['prompt-directed edit of a saved MP4'] }),
  'bfl/video-upscale-v1': entry('bfl/video-upscale-v1', 'BFL video-upscale-v1 hosted endpoint', 'black-forest-labs/flux-video-upscale', 'Actual enhancement at requested scale 2 and creativity 0 completed; H.264 video with audio was saved and reopened. No public weight artifact for this exact hosted variant was verified.', { readiness: 'tested-ready', testedModes: ['video enhancement at scale 2 and creativity 0'] }),
  'elevenlabs/eleven_sfx_v2': entry('elevenlabs/eleven_sfx_v2', 'ElevenLabs eleven_sfx_v2', 'elevenlabs/eleven-sfx-v2', 'Actual eight-second stereo ambience was saved through synchronous Router binary delivery. Public weights for the exact SFX model are unverified.', { readiness: 'tested-ready', testedModes: ['eight-second sound ambience with loop requested'] }),
  'elevenlabs/eleven_v3': entry('elevenlabs/eleven_v3', 'ElevenLabs eleven_v3', 'elevenlabs/eleven-v3', 'Actual directed English speech completed with the documented example voice and saved binary audio. Other voice entitlements and exact public model weights remain unverified.', { readiness: 'tested-ready', testedModes: ['directed English text-to-speech with example provider voice'] }),
  'veed/clean-audio': entry('veed/clean-audio', 'VEED Clean Audio hosted operation; checkpoint undisclosed', 'veed/clean-audio', 'Native schema is published, but actual admission returned HTTP403/not_enabled because Router does not serve this model yet. No generation occurred; no automatic retry. Exact hosted processing weights remain unverified.', { readiness: 'unavailable', sources: [{ label: 'Verified Router native contract', url: 'https://api.comfy.org/v2/models/veed/clean-audio/openapi.json' }] }),
  'byteplus/seed-audio-1.0-multilingual': entry('byteplus/seed-audio-1.0-multilingual', 'BytePlus Seed Audio 1.0 multilingual hosted model', 'byteplus/seed-audio-1-0-multilingual', 'Real speech and provider-timed captions tested. This exact API variant has no verified public weight license; Seed-family research releases are not equivalent.', { readiness: 'tested-ready', testedModes: ['text-to-speech', 'provider-timed generated-speech captions'] }),
  'meshy/meshy-6': entry('meshy/meshy-6', 'Meshy 6, text-to-3D preview mode', 'meshy/meshy-6', 'Mesh generation adapter exists. The local 3D preview is separate from the untested hosted generation; no exact public Meshy 6 weights were verified.'),
  'meshy/meshy-7.1': entry('meshy/meshy-7.1', 'Meshy 7.1, Router text-to-3D preview and refine operations', 'meshy/meshy-7-1', 'Real geometry previews and 2K PBR refinement completed. Saved GLBs reopened with actual mesh geometry and embedded textures. Exact hosted weights are not attested.', { readiness: 'tested-ready', testedModes: ['text-to-3D preview', 'same-project preview-to-textured-refine with embedded PBR textures'] }),
  'meshy/rigging': entry('meshy/rigging', 'Meshy rigging operation; upstream rigging model revision undisclosed', 'meshy/rigging', 'Actual humanoid rigging returned rigged, walking and running GLBs with skin, animations and embedded textures. Other topology compatibility and exact model weights remain unverified.', { readiness: 'tested-ready', testedModes: ['textured biped humanoid rigging', 'returned basic walking and running clips'] }),
  'meshy/animations': entry('meshy/animations', 'Meshy preset animation operation; library action ID recorded', 'meshy/animations', 'Actual action 30 Casual_Walk completed as a saved animated GLB. This is a documented library action, not unrestricted text-to-motion; exact processing weights are not attested.', { readiness: 'tested-ready', testedModes: ['action 30 Casual_Walk on same-project completed rig'] }),
  'ltx/ltx-2-5-fast': entry('ltx/ltx-2-5-fast', 'LTX 2.5 Fast hosted text-to-video endpoint; checkpoint revision not pinned', 'ltx/ltx-2-5-fast', 'Actual four-second 720p 25fps text-to-video returned stored H.264 and stereo AAC. Public LTX 2.5 weights have a separate restricted community license; hosted checkpoint and auxiliary stages remain unknown.', { readiness: 'tested-ready', testedModes: ['four-second 720p 25fps text-to-video with native audio'], weightEvidence: 'public-weights-restricted-license', licenseName: 'LTX-2.x Community License for published weights; hosted API terms remain separate', sources: [{ label: 'Router contract', url: `${docs}ltx/ltx-2-5-fast/code` }, { label: 'Public model and license', url: 'https://huggingface.co/Lightricks/LTX-2.5' }] }),
  'synclabs/sync-3': entry('synclabs/sync-3', 'Sync 3 audio-driven lip sync; no built-in TTS or dubbing enabled', 'synclabs/sync-3', 'A real video-plus-speech lip-sync request completed and its MP4 was saved. Visual alignment quality is not certified. Public weights for this exact service were not verified.', { readiness: 'tested-ready', testedModes: ['video plus supplied audio lip sync with stored MP4'] }),
  'higgsfield/higgsfield-genjutsu-motion-transfer-v1.0': entry('higgsfield/higgsfield-genjutsu-motion-transfer-v1.0', 'Genjutsu motion-transfer v1.0 hosted endpoint', 'higgsfield/higgsfield-genjutsu-motion-transfer-v1-0', 'Actual coastal and dancer-to-clay transfers completed using temporary Comfy hosting; MP4s with audio were saved and reopened. Matched-time review frames show the clay appearance change and retained broad poses, without certifying exact identity or motion fidelity. Public serving weights remain unknown.', { readiness: 'tested-ready', testedModes: ['five-second source video plus one appearance reference', 'five-second dancer-to-clay reference transfer with matched-time review'] }),
};

export function getModelRouteAudit(modelId: string): ModelRouteAudit | undefined {
  return MODEL_ROUTE_AUDIT[modelId];
}
