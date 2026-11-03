import type { CatalogueDemonstrationView } from './catalogue-types';
import type { Asset } from './types';
export interface CatalogueTransformation {source:Asset;result:Asset;before:string;after:string;kind:'image-edit'|'still-motion'|'video-edit'|'mesh-refine'|'mesh-motion'|'scene-render'|'audio-motion';}
/** Pair only actual declared inputs and saved outputs, never a cover or unrelated project image. */
export function catalogueTransformation(demo:CatalogueDemonstrationView):CatalogueTransformation|undefined {
  if(demo.verificationKind==='concept'||demo.verificationKind==='interaction')return;
  const outputs=demo.outputAssets.filter(a=>a.metadata.operation!=='asset-poster'),inputs=demo.inputAssets.filter(a=>a.metadata.operation!=='asset-poster');
  const pair=(source:Asset|undefined,result:Asset|undefined,before:string,after:string,kind:CatalogueTransformation['kind'])=>source&&result&&source.id!==result.id?{source,result,before,after,kind}:undefined;
  if(demo.operationId==='mesh.generate.refine')return pair(inputs.find(a=>a.kind==='3d'),outputs.find(a=>a.kind==='3d'),'Draft geometry','Textured object','mesh-refine');
  if(['mesh.animate','mesh.rig'].includes(demo.operationId))return pair(inputs.find(a=>a.kind==='3d'),outputs.find(a=>a.kind==='3d'),'Source mesh',demo.operationId==='mesh.rig'?'Rigged mesh':'Animated mesh','mesh-motion');
  const video=outputs.find(a=>a.kind==='video');
  if(video){const sourceVideo=inputs.find(a=>a.kind==='video');if(sourceVideo){const after=({'video.enhance':'Enhanced clip','video.lip-sync':'Spoken performance','video.motion-transfer':'Recast performance','video.edit':'Edited interpretation','video.regenerate':'Regenerated at 2K'} as Record<string,string>)[demo.operationId]||'New interpretation';return pair(sourceVideo,video,'Source clip',after,'video-edit');}const image=inputs.find(a=>a.kind==='image');if(image)return pair(image,video,demo.operationId==='video.generate.keyframes'?'First frame':'Source frame',demo.operationId==='video.generate.keyframes'?'Bridged motion':'In motion','still-motion');const audio=inputs.find(a=>a.kind==='audio');if(audio)return pair(audio,video,'Chosen soundtrack','Edited motion film','audio-motion');}
  const image=outputs.find(a=>a.kind==='image');if(image){const sourceImage=inputs.find(a=>a.kind==='image');if(sourceImage){const after=({'image.background.remove':'Background removed','image.outpaint':'Expanded canvas','image.enhance':'Enhanced image','image.edit.mask':'Masked edit'} as Record<string,string>)[demo.operationId]||'New take';return pair(sourceImage,image,'Original reference',after,'image-edit');}const scene=inputs.find(a=>a.metadata.operation==='spatial-scene');if(scene)return pair(scene,image,'Editable scene','Rendered frame','scene-render');}
}
