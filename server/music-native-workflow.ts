import { z } from 'zod';
import type { WorkflowGraph } from '../shared/workflow-types.ts';
import { workflowCreateSchema } from './workflow-schema.ts';

const defaultDirection = 'A short original instrumental with warm piano, gentle electronic percussion, and a clear musical ending. No vocals.';
export const musicNativeOptionsSchema = z.object({
  prompt: z.string().trim().min(1).max(1000).default(defaultDirection),
  duration: z.number().int().min(1).max(360).default(10),
  // Bound to exactly representable UI values; Sonilo currently ignores the seed.
  seed: z.number().int().min(0).max(2147483647).default(0),
}).strict();
export type MusicNativeOptions = z.input<typeof musicNativeOptionsSchema>;

/** Builds a saved editable graph only. The native worker owns the explicit Run,
 * credentials, provider submission, collection and execution provenance.
 * Contract: Comfy-Org/ComfyUI comfy_api_nodes/nodes_sonilo.py, 2026-11-04.
 */
export function buildMusicNativeWorkflow(options: MusicNativeOptions = {}) {
  const { prompt, duration, seed } = musicNativeOptionsSchema.parse(options);
  const prefix = 'OpenTakeStudio/music/sonilo';
  const apiGraph: WorkflowGraph = {
    '1': { class_type: 'SoniloTextToMusic', inputs: { prompt, duration, seed }, _meta: { title: 'Compose original music - Sonilo' } },
    '2': { class_type: 'SaveAudioAdvanced', inputs: { audio: ['1', 0], filename_prefix: prefix, format: 'flac' }, _meta: { title: 'Save music as a new FLAC take' } },
  };
  return workflowCreateSchema.parse({
    name: 'Compose music - Sonilo',
    description: 'Compose original music from a written direction through the native Sonilo Text to Music node and save a FLAC take. Duration is 1-360 seconds, with a short 10-second default. The seed controls graph execution but is currently ignored by Sonilo; it does not guarantee reproducibility. A funded short run produced saved audio; listening and musical-quality review remain unverified. This is separate from the unavailable Pika Music Router route.',
    apiGraph,
    editorGraph: {
      version: 0.4, revision: 0, last_node_id: 2, last_link_id: 1,
      nodes: [
        {
          id: 1, type: 'SoniloTextToMusic', title: 'Compose original music - Sonilo',
          pos: [0, 80], size: [400, 310], flags: {}, order: 0, mode: 0,
          inputs: [], outputs: [{ name: 'AUDIO', type: 'AUDIO', links: [1], slot_index: 0 }],
          properties: { cnr_id: 'comfy-core', 'Node name for S&R': 'SoniloTextToMusic' },
          widgets_values: [prompt, duration, seed, 'fixed'],
          widgets_values_named: { prompt, duration, seed },
        },
        {
          id: 2, type: 'SaveAudioAdvanced', title: 'Save music as a new FLAC take',
          pos: [470, 80], size: [400, 210], flags: {}, order: 1, mode: 0,
          inputs: [{ name: 'audio', type: 'AUDIO', link: 1 }],
          outputs: [{ name: 'audio', type: 'AUDIO', links: [], slot_index: 0 }],
          properties: { cnr_id: 'comfy-core', 'Node name for S&R': 'SaveAudioAdvanced' },
          widgets_values: [prefix, 'flac'],
          widgets_values_named: { filename_prefix: prefix, format: 'flac' },
        },
      ],
      links: [[1, 1, 0, 2, 0, 'AUDIO']], groups: [], config: {},
      extra: { ds: { scale: 0.9, offset: [40, 40] } },
    },
    bindings: [
      { key: 'prompt', label: 'Music direction', nodeId: '1', inputName: 'prompt', kind: 'string', required: true, defaultValue: prompt, maxLength: 1000 },
      { key: 'duration', label: 'Duration (seconds)', nodeId: '1', inputName: 'duration', kind: 'number', required: true, defaultValue: duration, min: 1, max: 360 },
      { key: 'seed', label: 'Execution variation (not reproducible)', nodeId: '1', inputName: 'seed', kind: 'number', required: true, defaultValue: seed, min: 0, max: 2147483647 },
    ],
    outputNodeIds: ['2'], outputKind: 'audio',
  });
}
