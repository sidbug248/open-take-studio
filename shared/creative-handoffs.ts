import type { Asset, Take } from './types';
import type { SpatialCamera, SpatialLight, SpatialSavedScene, SpatialSceneDocument, Vec3 } from './spatial-types';

/** The original rendered frame and immutable saved scene, never a display derivative. */
export interface SpatialCinematicHandoff {
  projectId:string; asset:Asset; take:Take; prompt:string;
  sceneAssetId:string; sceneTakeId:string; sceneSha256:string;
  camera:SpatialCamera; lights:SpatialLight[];
  originalModels:{assetId:string;sha256:string}[];
  frame:{index:0;seconds:0;width:number;height:number};
  interpretation:'reference-render';
}
export function spatialCinematicHandoff(saved:SpatialSavedScene,asset:Asset,take:Take,prompt:string):SpatialCinematicHandoff {
  if(asset.kind!=='image'||asset.metadata.operation!=='spatial-guide'||asset.metadata.sourceAssetId!==saved.asset.id||take.projectId!==saved.asset.projectId||asset.projectId!==saved.asset.projectId||!take.assetIds.includes(asset.id)||take.inputAssetIds.scene!==saved.asset.id||take.parentTakeId!==saved.take.id)throw new Error('Use the actual rendered frame of this saved scene.');
  if(!Number.isInteger(asset.metadata.width)||!Number.isInteger(asset.metadata.height)||Number(asset.metadata.width)<=0||Number(asset.metadata.height)<=0)throw new Error('The rendered frame needs its original dimensions.');
  return {projectId:asset.projectId,asset,take,prompt,sceneAssetId:saved.asset.id,sceneTakeId:saved.take.id,sceneSha256:saved.asset.sha256,camera:structuredClone(saved.scene.camera),lights:structuredClone(saved.scene.lights),originalModels:saved.scene.objects.flatMap(o=>o.assetId&&o.assetSha256?[{assetId:o.assetId,sha256:o.assetSha256}]:[]),frame:{index:0,seconds:0,width:Number(asset.metadata.width),height:Number(asset.metadata.height)},interpretation:'reference-render'};
}
export type SpatialCameraPreset='hero'|'profile'|'detail';
export type SpatialLightPreset='daylight'|'afterlight'|'gallery';
export function sceneWithDirectedOpening(scene:SpatialSceneDocument,viewId:string):SpatialSceneDocument {
  const next=structuredClone(scene),first=next.cameraViews[0];
  if(first&&JSON.stringify({position:first.position,target:first.target,fov:first.fov})===JSON.stringify(next.camera))return next;
  next.cameraViews=[{...structuredClone(next.camera),id:viewId,name:'Your directed view'},...next.cameraViews].slice(0,16);return next;
}
export function applySpatialCameraPreset(scene:SpatialSceneDocument,preset:SpatialCameraPreset):SpatialSceneDocument {
  const next=structuredClone(scene),target=next.camera.target;
  const delta=next.camera.position.map((v,i)=>v-target[i]),distance=Math.max(2,Math.hypot(...delta));
  const directions:Record<SpatialCameraPreset,Vec3>={hero:[.61,.28,.74],profile:[-.94,.19,.28],detail:[.32,.14,.94]};
  const radius=distance*(preset==='detail'?.7:1),direction=directions[preset],length=Math.hypot(...direction);
  next.camera={position:direction.map((n,i)=>target[i]+n/length*radius) as Vec3,target:[...target],fov:preset==='detail'?31:38};return next;
}
export function applySpatialLightPreset(scene:SpatialSceneDocument,preset:SpatialLightPreset):SpatialSceneDocument {
  const next=structuredClone(scene),target=next.camera.target;
  const colors=preset==='daylight'?['#fff3df','#c6e5ff','#fff9e9']:preset==='afterlight'?['#ffbd72','#9b80ff','#e8b9a4']:['#ffffff','#dce5ff','#b6e3e3'];
  const positions:Vec3[]=[[3,4,3],[-3,2,-2],[0,3,4]];
  next.lights=positions.map((offset,i)=>({id:`preset-${i}`,name:['Key','Rim','Fill'][i],type:'point',position:offset.map((n,j)=>n+target[j]) as Vec3,target:[...target],color:colors[i],intensity:[70,85,24][i],enabled:true,angle:.65}));
  next.environment={...next.environment,background:preset==='daylight'?'#292522':preset==='afterlight'?'#171522':'#252b30',floorColor:preset==='afterlight'?'#27202d':'#343332',ambientIntensity:.25,exposure:1.05};return next;
}
