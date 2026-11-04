import type { WorkflowBinding, WorkflowGraph, WorkflowVersion } from '../shared/workflow-types.ts';

export type AudioNativeWorkflowKind = 'dubbing' | 'cleanup';
export type AudioNativeWorkflow = Pick<WorkflowVersion, 'name' | 'description' | 'editorGraph' | 'apiGraph' | 'bindings' | 'outputNodeIds' | 'outputKind'>;
export interface AudioNativeWorkflowOptions {
  targetLanguage?: string;
  sourceLanguage?: string;
  seed?: number;
  strength?: number;
  normalizeLoudness?: boolean;
  targetLufs?: number;
}

/** Standard-mode choices observed in official Cloud object_info, 2026-11-04.
 * Pro accents are deliberately not sent to the lower-cost Standard node mode.
 */
export const DUBBING_STANDARD_LANGUAGES = [
  'Afrikaans', 'Arabic', 'Armenian', 'Assamese', 'Asturian', 'Azerbaijani', 'Belarusian',
  'Bengali', 'Bosnian', 'Bulgarian', 'Burmese', 'Cantonese', 'Catalan', 'Cebuano',
  'Chichewa', 'Chinese (Mandarin)', 'Croatian', 'Czech', 'Danish', 'Dutch', 'English',
  'Estonian', 'Filipino', 'Finnish', 'French', 'Galician', 'Georgian', 'German',
  'Greek', 'Gujarati', 'Hausa', 'Hebrew', 'Hindi', 'Hungarian', 'Icelandic',
  'Indonesian', 'Irish', 'Italian', 'Japanese', 'Javanese', 'Kannada', 'Kazakh',
  'Korean', 'Kyrgyz', 'Latvian', 'Lingala', 'Lithuanian', 'Luxembourgish',
  'Macedonian', 'Malay', 'Malayalam', 'Maltese', 'Maori', 'Marathi', 'Mongolian',
  'Nepali', 'Norwegian', 'Occitan', 'Odia', 'Pashto', 'Persian', 'Polish',
  'Portuguese', 'Punjabi', 'Romanian', 'Russian', 'Serbian', 'Sindhi', 'Slovak',
  'Slovenian', 'Somali', 'Spanish', 'Swahili', 'Swedish', 'Tajik', 'Tamil',
  'Telugu', 'Thai', 'Turkish', 'Ukrainian', 'Urdu', 'Uzbek', 'Vietnamese', 'Welsh', 'Yoruba',
] as const;
export const AUDIO_NATIVE_CONSTRAINTS = {
  dubbing: { inputKind: 'video', maxDurationSeconds: 599, requiresAudioTrack: true, partnerUsdPerSecond: 0.1573 },
  cleanup: { inputKind: 'audio', maxDurationSeconds: 1799, requiresAudioTrack: true, partnerUsdPerMinute: 0.017875 },
} as const;

function numberInRange(value: unknown, fallback: number, minimum: number, maximum: number, label: string, integer = false): number {
  const parsed = value ?? fallback;
  if (typeof parsed !== 'number' || !Number.isFinite(parsed) || parsed < minimum || parsed > maximum || integer && !Number.isInteger(parsed)) throw new Error(`${label} is outside the supported range`);
  return parsed;
}

function editorGraph(graph: WorkflowGraph, media: 'audio' | 'video', effectWidgets: (string | number | boolean)[]) {
  const socket = media.toUpperCase();
  const effectInput = media === 'video' ? 'model.video' : 'audio';
  const specifications = [
    { id: 1, input: undefined, inputLink: undefined, outputLink: 1, widgets: [graph['1']!.inputs[media === 'video' ? 'file' : 'audio']] },
    { id: 2, input: effectInput, inputLink: 1, outputLink: 2, widgets: effectWidgets },
    { id: 3, input: media, inputLink: 2, outputLink: undefined, widgets: media === 'video' ? [graph['3']!.inputs.filename_prefix, 'mp4', 'h264', 'auto'] : [graph['3']!.inputs.filename_prefix, 'flac'] },
  ];
  return {
    version: 0.4, revision: 0, last_node_id: 3, last_link_id: 2,
    nodes: specifications.map((specification, index) => {
      const node = graph[String(specification.id)]!;
      const widgets = Object.fromEntries(Object.entries(node.inputs).filter(([, value]) => !Array.isArray(value)));
      return {
        id: specification.id, type: node.class_type, pos: [index * 440, 80], size: [370, 330],
        flags: {}, order: index, mode: 0, title: node._meta?.title ?? node.class_type,
        inputs: specification.input ? [{ name: specification.input, type: socket, link: specification.inputLink }] : [],
        // Current SaveVideo / SaveAudioAdvanced nodes retain one passthrough
        // output, named lowercase in their official node schemas.
        outputs: [{ name: specification.id === 3 ? media : socket, type: socket, links: specification.outputLink ? [specification.outputLink] : [], slot_index: 0 }],
        properties: { 'Node name for S&R': node.class_type },
        widgets_values: specification.widgets, widgets_values_named: widgets,
      };
    }),
    links: [[1, 1, 0, 2, 0, socket], [2, 2, 0, 3, 0, socket]],
    groups: [], config: {}, extra: { ds: { scale: 0.8, offset: [40, 40] } },
  };
}

/** Builds an editable, non-executing preset. The existing workflow route owns
 * project scoping, uploads, credential binding, job identity and saved outputs.
 */
export function buildAudioNativeWorkflow(kind: AudioNativeWorkflowKind, options: AudioNativeWorkflowOptions = {}): AudioNativeWorkflow {
  if (kind === 'dubbing') {
    const targetLanguage = options.targetLanguage ?? 'English';
    const sourceLanguage = options.sourceLanguage ?? 'auto';
    if (!(DUBBING_STANDARD_LANGUAGES as readonly string[]).includes(targetLanguage)) throw new Error('Choose a supported Standard dubbing target language');
    if (sourceLanguage !== 'auto' && !(DUBBING_STANDARD_LANGUAGES as readonly string[]).includes(sourceLanguage)) throw new Error('Choose a supported Standard dubbing source language');
    if (sourceLanguage === targetLanguage) throw new Error('Choose a target language different from the known source language');
    const seed = numberInRange(options.seed, 42, 0, 2147483647, 'Dubbing seed', true);
    const apiGraph: WorkflowGraph = {
      '1': { class_type: 'LoadVideo', inputs: { file: 'choose_speech_video.mp4' }, _meta: { title: 'Source video with speech' } },
      '2': { class_type: 'VeedDubbingNode', inputs: { model: 'standard', 'model.video': ['1', 0], 'model.target_language': targetLanguage, 'model.source_language': sourceLanguage, 'model.seed': seed }, _meta: { title: 'Translate speech and synchronize lips' } },
      '3': { class_type: 'SaveVideo', inputs: { video: ['2', 0], filename_prefix: 'OpenTakeStudio/dubbing/translated', format: 'mp4', 'format.codec': 'h264', 'format.codec.encoding': 'auto' }, _meta: { title: 'Save translated video as a new take' } },
    };
    const bindings: WorkflowBinding[] = [
      { key: 'video', label: 'Video with speech', nodeId: '1', inputName: 'file', kind: 'video', required: true },
      { key: 'target_language', label: 'Translate into', nodeId: '2', inputName: 'model.target_language', kind: 'string', required: true, defaultValue: targetLanguage, options: [...DUBBING_STANDARD_LANGUAGES] },
      { key: 'source_language', label: 'Source language', nodeId: '2', inputName: 'model.source_language', kind: 'string', required: true, defaultValue: sourceLanguage, options: ['auto', ...DUBBING_STANDARD_LANGUAGES] },
      { key: 'seed', label: 'Take seed', nodeId: '2', inputName: 'model.seed', kind: 'number', required: true, defaultValue: seed, min: 0, max: 2147483647 },
    ];
    return {
      name: 'Translate and dub a video',
      description: 'Translate the speech in a saved video, preserve the speaker’s voice and synchronize their lips through the native VEED Standard node in Comfy Cloud. Requires speech and a visible speaker, no longer than 599 seconds. The source stays unchanged. Review the translated words, voice and visible lip synchronization before publishing.',
      apiGraph, editorGraph: editorGraph(apiGraph, 'video', ['standard', targetLanguage, sourceLanguage, seed, 'fixed']) as WorkflowVersion['editorGraph'],
      bindings, outputNodeIds: ['3'], outputKind: 'video',
    };
  }
  if (kind !== 'cleanup') throw new Error('Unsupported native audio workflow');
  const strength = numberInRange(options.strength, .874, 0, 1, 'Cleanup strength');
  if (options.normalizeLoudness !== undefined && typeof options.normalizeLoudness !== 'boolean') throw new Error('Loudness normalization must be true or false');
  const normalize = options.normalizeLoudness ?? true;
  const loudness = normalize ? 'normalize' : 'keep input level';
  const targetLufs = numberInRange(options.targetLufs, -19, -40, -8, 'Cleanup target loudness');
  const apiGraph: WorkflowGraph = {
    '1': { class_type: 'LoadAudio', inputs: { audio: 'choose_speech_audio.wav' }, _meta: { title: 'Original speech recording' } },
    '2': { class_type: 'VeedCleanAudioNode', inputs: { audio: ['1', 0], strength, loudness, ...(normalize ? { 'loudness.target_lufs': targetLufs } : {}) }, _meta: { title: 'Remove noise under speech' } },
    '3': { class_type: 'SaveAudioAdvanced', inputs: { audio: ['2', 0], filename_prefix: 'OpenTakeStudio/speech/cleaned', format: 'flac' }, _meta: { title: 'Save cleaned speech as a new take' } },
  };
  const bindings: WorkflowBinding[] = [
    { key: 'audio', label: 'Speech recording', nodeId: '1', inputName: 'audio', kind: 'audio', required: true },
    { key: 'strength', label: 'Noise removal strength', nodeId: '2', inputName: 'strength', kind: 'number', required: true, defaultValue: strength, min: 0, max: 1 },
    ...(normalize ? [{ key: 'target_lufs', label: 'Target loudness (LUFS)', nodeId: '2', inputName: 'loudness.target_lufs', kind: 'number' as const, required: true, defaultValue: targetLufs, min: -40, max: -8 }] : []),
  ];
  return {
    name: 'Clean a speech recording',
    description: 'Remove background noise from saved speech through the native VEED Clean Audio node in Comfy Cloud. Returns 48 kHz mono speech; music and sound effects are removed too. Use speech shorter than 30 minutes (at most 1799 seconds). The original stays unchanged. The native workflow is available separately from the disabled Router adapter. Compare the cleaned result with the source before replacing a soundtrack.',
    apiGraph, editorGraph: editorGraph(apiGraph, 'audio', [strength, loudness, ...(normalize ? [targetLufs] : [])]) as WorkflowVersion['editorGraph'],
    bindings, outputNodeIds: ['3'], outputKind: 'audio',
  };
}
