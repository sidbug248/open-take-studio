import { z } from 'zod';
import type { WorkflowBinding, WorkflowGraph } from '../shared/workflow-types.ts';
import { workflowCreateSchema } from './workflow-schema.ts';

export type SpatialWorkflowCreateBody = z.infer<typeof workflowCreateSchema>;

/** Settings for the native image-geometry node, not the Router text/texture route. */
export const imageTo3dOptionsSchema = z.object({
  textured: z.boolean().default(true),
  textureResolution: z.enum(['2k', '4k', '8k']).default('2k'),
  texturePrompt: z.string().trim().max(600).default(''),
  enablePbr: z.boolean().default(false),
  remesh: z.boolean().default(true),
  topology: z.enum(['triangle', 'quad']).default('triangle'),
  targetPolycount: z.number().int().min(100).max(300000).default(30000),
  symmetryMode: z.enum(['auto', 'on', 'off']).default('auto'),
  poseMode: z.enum(['', 'A-pose', 'T-pose']).default(''),
  seed: z.number().int().min(0).max(2147483647).default(0),
  ultraMode: z.boolean().default(false),
  ultraResolution: z.enum(['2k', '4k']).default('2k'),
}).strict().superRefine((settings, context) => {
  if (!settings.textured && (settings.texturePrompt || settings.enablePbr || settings.textureResolution !== '2k')) {
    context.addIssue({code: 'custom', path: ['textured'], message: 'Enable textures before setting a texture prompt, PBR maps or texture resolution.'});
  }
  if (!settings.ultraMode && settings.ultraResolution !== '2k') {
    context.addIssue({code: 'custom', path: ['ultraMode'], message: 'Enable the ultra geometry pass before selecting its resolution.'});
  }
});
export type ImageTo3dOptions = z.input<typeof imageTo3dOptionsSchema>;

export const IMAGE_TO_3D_PRESET_INFO = {
  id: 'mesh-image',
  name: 'Image to 3D · Meshy 7.1',
  description: 'Turn a saved reference image into editable 3D geometry and a downloadable GLB.',
  documentation: 'https://comfy.org/hub/workflows/meshy-7-1-image-to-3d-da6947213b75/',
  schemaCheckedAt: '2026-11-04',
  verification: 'Cloud node schemas checked; funded generation has not been verified.',
  requiredInput: 'image',
} as const;

/**
 * A versionable Comfy workflow. Creation and editing are local; the existing
 * WorkflowWorker validates and uploads a project-owned image only on Run.
 * The source image enters the IMAGE socket of MeshyImageToModelNode, so its
 * content guides geometry. It is not text-to-3D with a texture_image_url.
 */
export function buildImageTo3dWorkflow(raw: ImageTo3dOptions = {}): SpatialWorkflowCreateBody {
  const settings = imageTo3dOptionsSchema.parse(raw);
  const modelInputs: Record<string, unknown> = {
    model: 'meshy-7.1',
    image: ['1', 0],
    should_remesh: settings.remesh ? 'true' : 'false',
    ...(settings.remesh ? {
      'should_remesh.topology': settings.topology,
      'should_remesh.target_polycount': settings.targetPolycount,
    } : {}),
    symmetry_mode: settings.symmetryMode,
    should_texture: settings.textured ? 'true' : 'false',
    ...(settings.textured ? {
      'should_texture.enable_pbr': settings.enablePbr,
      'should_texture.texture_prompt': settings.texturePrompt,
      'should_texture.texture_resolution': settings.textureResolution,
    } : {}),
    pose_mode: settings.poseMode,
    seed: settings.seed,
    ultra_mode: settings.ultraMode,
    ultra_resolution: settings.ultraResolution,
  };
  const apiGraph: WorkflowGraph = {
    '1': {class_type: 'LoadImage', inputs: {image: 'source-image.png'}, _meta: {title: 'Source image · choose a saved asset'}},
    '2': {class_type: 'MeshyImageToModelNode', inputs: modelInputs, _meta: {title: 'Image geometry · Meshy 7.1'}},
    '3': {class_type: 'SaveGLB', inputs: {mesh: ['2', 2], filename_prefix: '3d/open-take-image-model'}, _meta: {title: 'Save editable GLB'}},
  };
  const bindings: WorkflowBinding[] = [
    {key: 'source_image', label: 'Source image', nodeId: '1', inputName: 'image', kind: 'image', required: true},
    {key: 'seed', label: 'Run variation seed', nodeId: '2', inputName: 'seed', kind: 'number', required: true, defaultValue: settings.seed, min: 0, max: 2147483647},
    {key: 'symmetry', label: 'Geometry symmetry', nodeId: '2', inputName: 'symmetry_mode', kind: 'string', required: true, defaultValue: settings.symmetryMode, options: ['auto', 'on', 'off']},
    {key: 'pose', label: 'Character pose (optional)', nodeId: '2', inputName: 'pose_mode', kind: 'string', required: true, defaultValue: settings.poseMode, options: ['', 'A-pose', 'T-pose']},
    ...(settings.remesh ? [
      {key: 'topology', label: 'Topology', nodeId: '2', inputName: 'should_remesh.topology', kind: 'string' as const, required: true, defaultValue: settings.topology, options: ['triangle', 'quad']},
      {key: 'polycount', label: 'Target polygon count', nodeId: '2', inputName: 'should_remesh.target_polycount', kind: 'number' as const, required: true, defaultValue: settings.targetPolycount, min: 100, max: 300000},
    ] : []),
    ...(settings.textured ? [
      {key: 'texture_prompt', label: 'Texture direction (optional, up to 600 characters)', nodeId: '2', inputName: 'should_texture.texture_prompt', kind: 'string' as const, required: true, defaultValue: settings.texturePrompt, maxLength: 600},
      {key: 'pbr', label: 'PBR material maps', nodeId: '2', inputName: 'should_texture.enable_pbr', kind: 'boolean' as const, required: true, defaultValue: settings.enablePbr},
    ] : []),
  ];
  // Widget order follows the official Meshy 7.1 template, including dynamic
  // combo children and the seed's "fixed" control-after-generate widget.
  const meshyWidgets: (string | number | boolean)[] = [
    'meshy-7.1',
    settings.remesh ? 'true' : 'false',
    ...(settings.remesh ? [settings.topology, settings.targetPolycount] : []),
    settings.symmetryMode,
    settings.textured ? 'true' : 'false',
    ...(settings.textured ? [settings.enablePbr, settings.texturePrompt, settings.textureResolution] : []),
    settings.poseMode, settings.seed, 'fixed', settings.ultraMode, settings.ultraResolution,
  ];
  const editorGraph = {
    version: 0.4,
    revision: 0,
    last_node_id: 3,
    last_link_id: 2,
    config: {},
    extra: {ds: {scale: 1, offset: [0, 0]}},
    groups: [],
    nodes: [
      {id: 1, type: 'LoadImage', title: 'Source image', pos: [0, 80], size: [300, 340], flags: {}, order: 0, mode: 0, inputs: [], outputs: [{name: 'IMAGE', type: 'IMAGE', links: [1]}, {name: 'MASK', type: 'MASK', links: null}], properties: {'Node name for S&R': 'LoadImage', cnr_id: 'comfy-core'}, widgets_values: ['source-image.png', 'image']},
      {id: 2, type: 'MeshyImageToModelNode', title: 'Image geometry · Meshy 7.1', pos: [370, 40], size: [420, 530], flags: {}, order: 1, mode: 0,
        inputs: [{name: 'image', type: 'IMAGE', link: 1}, ...(settings.textured ? [{name: 'should_texture.texture_image', shape: 7, type: 'IMAGE', link: null}] : [])],
        outputs: [{name: 'model_file', type: 'STRING', links: null}, {name: 'meshy_task_id', type: 'MESHY_TASK_ID', links: null}, {name: 'GLB', type: 'FILE_3D_GLB', links: [2]}, {name: 'FBX', type: 'FILE_3D_FBX', links: null}],
        properties: {'Node name for S&R': 'MeshyImageToModelNode', cnr_id: 'comfy-core'}, widgets_values: meshyWidgets},
      {id: 3, type: 'SaveGLB', title: 'Save editable GLB', pos: [860, 80], size: [440, 420], flags: {}, order: 2, mode: 0,
        inputs: [{name: 'mesh', type: 'MESH,FILE_3D_GLB,FILE_3D_GLTF,FILE_3D_OBJ,FILE_3D_FBX,FILE_3D_STL,FILE_3D_USDZ,FILE_3D_PLY,FILE_3D_SPLAT,FILE_3D_SPZ,FILE_3D_KSPLAT,FILE_3D_SPLAT_ANY,FILE_3D_POINT_CLOUD_ANY,FILE_3D', link: 2}],
        outputs: [], properties: {'Node name for S&R': 'SaveGLB', cnr_id: 'comfy-core'}, widgets_values: ['3d/open-take-image-model', '']},
    ],
    links: [[1, 1, 0, 2, 0, 'IMAGE'], [2, 2, 2, 3, 0, 'FILE_3D_GLB']],
  };
  return workflowCreateSchema.parse({
    name: settings.textured ? 'Image to 3D · Meshy 7.1' : 'Image to 3D · Meshy 7.1 geometry',
    description: 'Reconstruct a saved source image as real 3D geometry. The native Meshy 7.1 node feeds its GLB output into SaveGLB, preserving a downloadable, editable model. A Comfy Cloud plan and credits are needed only when you run it. The seed triggers a new variation; Meshy results are not deterministic. Schema checked 2026-11-04; paid generation remains unverified.',
    editorGraph, apiGraph, bindings, outputNodeIds: ['3'], outputKind: '3d',
  });
}
