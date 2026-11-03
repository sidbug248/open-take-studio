import type { MediaModality } from './catalogue-types';
/** Explicit media contracts, independent of display copy or model family names. */
export const CAPABILITY_MODALITIES: Record<string, [MediaModality[], MediaModality[]]> = {
  'video-kling': [['text'], ['video', 'audio']],
  'native-workflows': [['image', 'video', 'audio', 'text'], ['image', 'video', 'audio']],
  'image-generate': [['text'], ['image']], 'image-reference-edit': [['image', 'text'], ['image']], 'image-inpaint': [['image', 'text'], ['image']],
  'image-background': [['image'], ['image']], 'image-enhance': [['image'], ['image']], 'image-outpaint': [['image', 'text'], ['image']], 'image-vector': [['text'], ['vector', 'image']],
  'reference-library': [['image', 'video', 'audio', 'mesh', 'text'], ['image', 'video', 'audio', 'mesh', 'text']], 'reference-sheet': [['image', 'text'], ['image']], 'source-continuity': [['image', 'video', 'audio', 'mesh'], ['image', 'video', 'audio', 'mesh']],
  'video-image': [['image', 'text'], ['video', 'audio']], 'video-text': [['text'], ['video', 'audio']], 'video-fast': [['text'], ['video', 'audio']], 'video-keyframes': [['image', 'text'], ['video', 'audio']], 'video-references': [['image', 'video', 'audio', 'text'], ['video', 'audio']], 'video-regenerate': [['video', 'text'], ['video', 'audio']], 'video-edit': [['video', 'text'], ['video']], 'video-enhance': [['video'], ['video']], 'camera-presets': [['text'], ['text']], 'video-trim': [['video'], ['video']], 'video-extension': [['video', 'text'], ['video']],
  'speech-captions': [['text'], ['audio', 'text']], 'speech-voice': [['text'], ['audio']], 'lip-sync': [['video', 'audio'], ['video']], 'motion-transfer': [['video', 'image'], ['video']], 'dubbing': [['video', 'audio', 'text'], ['video', 'audio', 'text']], 'transcribe': [['audio'], ['text']],
  'sound-effects': [['text'], ['audio']], 'motion-design': [['audio', 'text'], ['video']], 'music-compose': [['text'], ['audio']], 'audio-cleanup': [['audio'], ['audio']], 'audio-mix': [['audio'], ['audio']],
  'shot-board': [['text', 'image', 'video'], ['text', 'image', 'video']], 'story-pages': [['image', 'text'], ['image']], 'scene-plans': [['text', 'image', 'video'], ['scene']], 'film-branches': [['video', 'text'], ['playable']], 'document-film': [['text'], ['video', 'audio']],
  'product-imagery': [['image', 'text'], ['image']], 'campaign-recipes': [['image', 'text'], ['image', 'video']], 'campaign-review': [['image', 'video', 'text'], ['text']],
  'mesh-draft': [['text'], ['mesh']], 'mesh-refine': [['mesh', 'text', 'image'], ['mesh']], 'mesh-rig': [['mesh'], ['mesh']], 'mesh-animate': [['mesh'], ['mesh']], 'mesh-inspect': [['mesh'], ['scene', 'image']], 'mesh-image': [['image'], ['mesh']], 'mesh-render-sequence': [['scene'], ['video', 'image']],
  'interactive-film': [['video', 'text'], ['playable']], 'offline-playable': [['video'], ['playable']], 'playable-game': [['image', 'text'], ['playable']], 'object-room': [['mesh', 'scene', 'image', 'audio', 'text'], ['playable']],
  'named-recipes': [['text', 'image', 'video', 'audio'], ['text']], 'batch-shots': [['text', 'image'], ['image', 'video']], 'compare': [['image', 'video', 'audio', 'mesh'], ['image', 'video', 'audio', 'mesh']], 'workflow-references': [['text', 'image', 'video'], ['text']], 'node-canvas': [['text', 'image', 'video', 'audio', 'mesh'], ['image', 'video', 'audio', 'mesh']],
  'project-library': [[], []], 'take-history': [['image', 'video', 'audio', 'mesh'], ['text']], 'package-handoff': [['image', 'video', 'audio', 'text', 'mesh', 'scene', 'playable'], ['image', 'video', 'audio', 'text', 'mesh', 'scene', 'playable']], 'shared-review': [['image', 'video', 'text'], ['text']],
  'recoverable-jobs': [['text', 'image', 'video', 'audio', 'mesh'], ['image', 'video', 'audio', 'mesh']], 'local-api': [[], []], 'mcp-server': [[], []], 'scheduled-publishing': [['image', 'video', 'audio', 'text'], ['text']],
};
export function normalizeModalities(values: string[]): MediaModality[] {
  return [...new Set(values.flatMap(value => value === '3d' ? ['mesh' as const] : ['image', 'video', 'audio', 'text', 'vector', 'mesh', 'scene', 'playable'].includes(value) ? [value as MediaModality] : []))];
}
