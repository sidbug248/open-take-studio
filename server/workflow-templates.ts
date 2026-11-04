import type { WorkflowTemplate } from '../shared/workflow-types.ts';
import { buildImageTo3dWorkflow } from './spatial-generation-adapters.ts';
import { buildAudioNativeWorkflow } from './audio-native-workflows.ts';
import { buildMusicNativeWorkflow } from './music-native-workflow.ts';

/** Returning a starter only creates a local definition; no Comfy call occurs. */
export function studioWorkflowTemplates():WorkflowTemplate[]{
  return [
    {id:'mesh-image',name:'Image to 3D',description:'Reconstruct an image as editable Meshy 7.1 geometry, with a saved GLB.',
      creditNote:'Uses Comfy Cloud credits when run. Textured standard geometry is the starting setup.',
      verificationNote:"Funded geometry-only and 2K textured runs saved valid GLBs. Four-view shape and color review passed with approximate resemblance; transparent glass/PBR fidelity and hosted reviewer Meshy execution remain unverified.",
      definition:buildImageTo3dWorkflow()},
    {id:'dubbing',name:'Translate and dub',description:'Translate spoken dialogue and synchronize it to the speaker in your video.',
      creditNote:'Uses Comfy Cloud credits based on source duration. Start with a short clip containing speech.',
      verificationNote:"Local and hosted reviewer API runs saved dubbed MP4s. The corrected hosted output retains the full narration duration and passed decoding and project export checks. Translation quality, voice similarity, lip synchronization and paid browser submission remain unverified.",
      definition:buildAudioNativeWorkflow('dubbing')},
    {id:'audio-cleanup',name:'Clean speech',description:'Remove background noise from a recording and save the cleaned speech.',
      creditNote:'Uses Comfy Cloud credits when run. Music and sound effects are also removed.',
      verificationNote:"A local funded run saved a cleanup FLAC. Offline transcription retained the full source narration. Listening quality and hosted reviewer funded generation remain unverified.",
      definition:buildAudioNativeWorkflow('cleanup')},
    {id:'music-compose',name:'Compose music',description:'Create an original soundtrack from a written direction with native Sonilo.',
      creditNote:'Uses Comfy Cloud credits when run. Starts with a short 10-second track.',
      verificationNote:"Local and isolated hosted reviewer Sonilo runs saved real FLAC outputs. The hosted workflow also passed save/reopen and project export checks. Listening quality remains unverified. Pika Music is unavailable for the tested workspace.",
      definition:buildMusicNativeWorkflow()},
  ];
}
