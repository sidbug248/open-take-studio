import type { WorkflowTemplate } from '../shared/workflow-types.ts';
import { buildImageTo3dWorkflow } from './spatial-generation-adapters.ts';
import { buildAudioNativeWorkflow } from './audio-native-workflows.ts';

/** Returning a starter only creates a local definition; no Comfy call occurs. */
export function studioWorkflowTemplates():WorkflowTemplate[]{
  return [
    {id:'mesh-image',name:'Image to 3D',description:'Reconstruct an image as editable Meshy 7.1 geometry, with a saved GLB.',
      creditNote:'Uses Comfy Cloud credits when run. Textured standard geometry is the starting setup.',
      verificationNote:'Checked against the current Cloud node schema. Funded image-to-3D execution and output quality are not yet verified.',
      definition:buildImageTo3dWorkflow()},
    {id:'dubbing',name:'Translate and dub',description:'Translate spoken dialogue and synchronize it to the speaker in your video.',
      creditNote:'Uses Comfy Cloud credits based on source duration. Start with a short clip containing speech.',
      verificationNote:'VEED Standard node schema checked. Requires audible speech and a visible speaker; the provider must be available to your workspace. Funded execution remains unverified.',
      definition:buildAudioNativeWorkflow('dubbing')},
    {id:'audio-cleanup',name:'Clean speech',description:'Remove background noise from a recording and save the cleaned speech.',
      creditNote:'Uses Comfy Cloud credits when run. Music and sound effects are also removed.',
      verificationNote:'Native VEED node schema checked. This uses the Cloud workflow, separate from the unavailable Router cleanup route. Funded execution remains unverified.',
      definition:buildAudioNativeWorkflow('cleanup')},
  ];
}
