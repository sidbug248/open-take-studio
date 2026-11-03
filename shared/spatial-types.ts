import type { Asset, Take } from './types';

export type Vec3=[number,number,number];
export type SpatialPrimitive='box'|'sphere'|'cylinder'|'torus'|'knot'|'icosahedron'|'plane';
export interface SpatialMaterial {color:string;metalness:number;roughness:number;emissive:string;emissiveIntensity:number;opacity:number;override:boolean;}
export interface SpatialObject {id:string;name:string;type:'primitive'|'model';primitive?:SpatialPrimitive;assetId?:string;assetSha256?:string;position:Vec3;rotation:Vec3;scale:Vec3;material:SpatialMaterial;visible:boolean;animation?:{clipIndex:number;speed:number};}
export interface SpatialLight {id:string;name:string;type:'point'|'directional'|'spot';position:Vec3;target:Vec3;color:string;intensity:number;enabled:boolean;angle:number;}
export interface SpatialCamera {position:Vec3;target:Vec3;fov:number;}
export interface SpatialCameraView extends SpatialCamera {id:string;name:string;}
export interface SpatialSceneDocument {version:1;name:string;objects:SpatialObject[];lights:SpatialLight[];camera:SpatialCamera;cameraViews:SpatialCameraView[];environment:{background:string;floorColor:string;floorVisible:boolean;ambientIntensity:number;exposure:number};motion:{mode:'turntable'|'camera-path';duration:number;fps:12|24;yaw:number;viewIds:string[]};}
export interface SpatialSavedScene {asset:Asset;take:Take;scene:SpatialSceneDocument;}
export interface SpatialRenderResult {assets:Asset[];take:Take;frameCount:number;fps:number;duration:number;}
export const spatialMaterial=(color='#9476ff'):SpatialMaterial=>({color,metalness:.35,roughness:.25,emissive:'#000000',emissiveIntensity:0,opacity:1,override:true});
export function createSpatialObject(primitive:SpatialPrimitive,id:string):SpatialObject{return{id,name:primitive==='knot'?'Orbital sculpture':primitive[0].toUpperCase()+primitive.slice(1),type:'primitive',primitive,position:[0,1,0],rotation:[0,0,0],scale:[1,1,1],material:spatialMaterial(),visible:true};}
export function createSpatialScene(name='Prismatic study'):SpatialSceneDocument{return{version:1,name,objects:[{...createSpatialObject('knot','sculpture'),position:[0,1.6,0],rotation:[.25,.3,0],material:spatialMaterial('#9c5cff')},{...createSpatialObject('cylinder','plinth'),name:'Ceramic plinth',position:[0,.15,0],scale:[1.5,.3,1.5],material:{...spatialMaterial('#192243'),metalness:.18,roughness:.4}},{...createSpatialObject('icosahedron','satellite'),name:'Luminous satellite',position:[1.7,.55,.4],scale:[.55,.55,.55],material:{...spatialMaterial('#7cf4df'),metalness:.65,roughness:.15}}],lights:[{id:'key',name:'Key · soft gold',type:'point',position:[3,4,3],target:[0,1,0],color:'#ffe9ce',intensity:65,enabled:true,angle:.65},{id:'rim',name:'Rim · ultraviolet',type:'point',position:[-3,2,-2],target:[0,1,0],color:'#aa70ff',intensity:85,enabled:true,angle:.65},{id:'fill',name:'Fill · cyan',type:'point',position:[0,3,4],target:[0,1,0],color:'#80f0ff',intensity:28,enabled:true,angle:.65}],camera:{position:[5,3.2,6],target:[0,1.2,0],fov:38},cameraViews:[],environment:{background:'#10152c',floorColor:'#202741',floorVisible:true,ambientIntensity:.3,exposure:1.15},motion:{mode:'turntable',duration:4,fps:12,yaw:Math.PI*2,viewIds:[]}};}
const mix=(a:Vec3,b:Vec3,t:number):Vec3=>a.map((v,i)=>v+(b[i]-v)*t) as Vec3;
/** Exact local camera motion; generative interpretation of its guide is a separate operation. */
export function spatialCameraAt(scene:SpatialSceneDocument,seconds:number):SpatialCamera{
  const progress=Math.max(0,Math.min(1,seconds/scene.motion.duration));
  if(scene.motion.mode==='camera-path'){
    const views=scene.motion.viewIds.map(id=>scene.cameraViews.find(view=>view.id===id)).filter((view):view is SpatialCameraView=>!!view);
    if(views.length>=2){const step=progress*(views.length-1),index=Math.min(views.length-2,Math.floor(step)),t=step-index,eased=t*t*(3-2*t),a=views[index],b=views[index+1];return{position:mix(a.position,b.position,eased),target:mix(a.target,b.target,eased),fov:a.fov+(b.fov-a.fov)*eased};}
  }
  const [x,y,z]=scene.camera.position.map((v,i)=>v-scene.camera.target[i]),angle=scene.motion.yaw*progress,c=Math.cos(angle),s=Math.sin(angle);
  return{position:[scene.camera.target[0]+x*c+z*s,scene.camera.target[1]+y,scene.camera.target[2]+z*c-x*s],target:[...scene.camera.target],fov:scene.camera.fov};
}
export function spatialGuidePrompt(scene:SpatialSceneDocument):string{return`Use the rendered 3D scene as a composition guide. ${scene.objects.filter(o=>o.visible).map(o=>o.name).join(', ')}. Camera: ${scene.camera.fov} degree field of view, position (${scene.camera.position.map(n=>n.toFixed(2)).join(', ')}), looking toward (${scene.camera.target.map(n=>n.toFixed(2)).join(', ')}). Lighting: ${scene.lights.filter(l=>l.enabled).map(l=>`${l.name}, ${l.color}, at (${l.position.map(n=>n.toFixed(1)).join(', ')})`).join('; ')}. Preserve the intended framing and lighting as guidance; generative output may interpret geometry, identity, and camera motion.`;}
