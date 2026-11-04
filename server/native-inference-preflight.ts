import path from 'node:path';
import type { Asset } from '../shared/types.ts';
import type { WorkflowExecution, WorkflowGraph, WorkflowVersion } from '../shared/workflow-types.ts';
import type { Store } from './store.ts';
import type { LocalFileStorage } from './media.ts';
import { FilmMediaTools } from './film-media.ts';
import { audioDuration } from './input-validation.ts';
import { AUDIO_NATIVE_CONSTRAINTS } from './audio-native-workflows.ts';
import { WorkflowError } from './workflow-schema.ts';

const mediaKinds = new Set(['image', 'video', 'audio']);
const loaderInputs: Record<string, {kind: 'image' | 'video' | 'audio'; field: string}> = {
  LoadImage: {kind: 'image', field: 'image'},
  LoadVideo: {kind: 'video', field: 'file'},
  LoadAudio: {kind: 'audio', field: 'audio'},
};
const widgetKey = (nodeId: string, inputName: string) => JSON.stringify([nodeId, inputName]);

/**
 * Inspect local bytes before a native input upload or paid submission.
 * This does not attempt to predict the output of an arbitrary intermediate
 * workflow node. Duration checks apply only to directly bound loader sources.
 */
export async function validateNativeInferenceInputs(
  definition: WorkflowVersion,
  values: WorkflowExecution['values'],
  store: Store,
  media: LocalFileStorage,
  projectId: string,
): Promise<void> {
  if (!projectId || !store.getProject(projectId)) throw new WorkflowError('Project not found', 404);
  const graph: WorkflowGraph = structuredClone(definition.apiGraph);
  const boundAssets = new Map<string, Asset>();
  const boundWidgets = new Set<string>();

  for (const binding of definition.bindings) {
    const node = graph[binding.nodeId];
    if (!node || !Object.hasOwn(node.inputs, binding.inputName)) throw new WorkflowError('A workflow input binding no longer resolves to a saved node input');
    const value = values[binding.key] ?? binding.defaultValue;
    if (!mediaKinds.has(binding.kind)) {
      if (value !== undefined) node.inputs[binding.inputName] = value;
      continue;
    }
    const location = widgetKey(binding.nodeId, binding.inputName);
    if (value === undefined) {
      if (binding.required) throw new WorkflowError(`Choose ${binding.label} before running this workflow`);
      continue; // Optional omission may retain an existing Cloud filename.
    }
    boundWidgets.add(location);
    if (!value || typeof value !== 'object' || Array.isArray(value) || typeof value.assetId !== 'string') {
      throw new WorkflowError(`${binding.label} needs a saved ${binding.kind} asset`);
    }
    const asset = store.getAsset(value.assetId);
    if (!asset || asset.projectId !== projectId || asset.kind !== binding.kind) {
      throw new WorkflowError(`${binding.label} needs a saved ${binding.kind} from this project`);
    }
    boundAssets.set(location, asset);
  }

  const directSource = (link: unknown, expected: 'image' | 'video' | 'audio', label: string): Asset | undefined => {
    if (!Array.isArray(link) || link.length !== 2 || typeof link[0] !== 'string' || !Number.isInteger(link[1])) return;
    const source = graph[link[0]];
    const loader = source && loaderInputs[source.class_type];
    // A composite workflow may synthesize/change its media upstream. Its
    // runtime node validation remains authoritative; do not reject that graph.
    if (!loader) return;
    if (loader.kind !== expected || link[1] !== 0) throw new WorkflowError(`${label} needs a ${expected} loader output`);
    const location = widgetKey(link[0], loader.field);
    if (!boundWidgets.has(location)) return; // Existing Cloud input, not a local bound source.
    const asset = boundAssets.get(location);
    if (!asset) throw new WorkflowError(`Choose the saved ${expected} input for ${label}`);
    return asset;
  };

  const videoTools = new FilmMediaTools(path.dirname(media.root), media);
  const checkedAudio = new Map<string, Promise<number>>();
  const durationOf = (asset: Asset) => {
    if (!checkedAudio.has(asset.sha256)) checkedAudio.set(asset.sha256, media.read(asset).then(audioDuration));
    return checkedAudio.get(asset.sha256)!;
  };

  for (const node of Object.values(graph)) {
    if (node.class_type === 'VeedDubbingNode') {
      const asset = directSource(node.inputs['model.video'], 'video', 'Video dubbing');
      if (!asset) continue;
      const info = await videoTools.inspect(asset);
      if (!info.hasAudio) throw new WorkflowError('Video dubbing needs a source video with an audio track. Choose a recording with speech.');
      if (info.duration > AUDIO_NATIVE_CONSTRAINTS.dubbing.maxDurationSeconds) {
        throw new WorkflowError(`Video dubbing accepts at most ${AUDIO_NATIVE_CONSTRAINTS.dubbing.maxDurationSeconds} seconds. Trim the source before running it.`);
      }
    } else if (node.class_type === 'VeedCleanAudioNode') {
      const asset = directSource(node.inputs.audio, 'audio', 'Speech cleanup');
      if (!asset) continue;
      if (await durationOf(asset) > AUDIO_NATIVE_CONSTRAINTS.cleanup.maxDurationSeconds) {
        throw new WorkflowError(`Speech cleanup accepts at most ${AUDIO_NATIVE_CONSTRAINTS.cleanup.maxDurationSeconds} seconds. Trim the recording before running it.`);
      }
    } else if (node.class_type === 'MeshyImageToModelNode') {
      directSource(node.inputs.image, 'image', 'Image-to-3D');
      const prompt = node.inputs['should_texture.texture_prompt'];
      if (typeof prompt === 'string' && prompt.length > 600) throw new WorkflowError('Meshy texture direction must be no longer than 600 characters');
      const textureImage = node.inputs['should_texture.texture_image'];
      if (node.inputs.should_texture === 'true' && typeof prompt === 'string' && prompt.length > 0 && textureImage !== undefined && textureImage !== null) {
        throw new WorkflowError('Choose a Meshy texture image or texture direction, not both');
      }
      if (textureImage !== undefined && textureImage !== null) directSource(textureImage, 'image', 'Meshy texture guidance');
    }
  }
}
