import { z } from 'zod';
const id=z.string().min(1).max(128).regex(/^[A-Za-z0-9_-]+$/),color=z.string().regex(/^#[0-9a-fA-F]{6}$/),finite=z.number().finite();
const vector=z.tuple([finite.min(-100).max(100),finite.min(-100).max(100),finite.min(-100).max(100)]);
const material=z.object({color,metalness:finite.min(0).max(1),roughness:finite.min(.02).max(1),emissive:color,emissiveIntensity:finite.min(0).max(5),opacity:finite.min(.1).max(1),override:z.boolean()}).strict();
const camera=z.object({position:vector,target:vector,fov:finite.min(15).max(100)}).strict();
export const spatialSceneSchema=z.object({version:z.literal(1),name:z.string().trim().min(1).max(180),objects:z.array(z.object({id,name:z.string().trim().min(1).max(120),type:z.enum(['primitive','model']),primitive:z.enum(['box','sphere','cylinder','torus','knot','icosahedron','plane']).optional(),assetId:id.optional(),assetSha256:z.string().regex(/^[a-f0-9]{64}$/).optional(),position:vector,rotation:vector,scale:z.tuple([finite.min(.02).max(30),finite.min(.02).max(30),finite.min(.02).max(30)]),material,visible:z.boolean(),animation:z.object({clipIndex:z.number().int().min(0).max(50),speed:finite.min(.05).max(4)}).strict().optional()}).strict()).min(1).max(24),lights:z.array(z.object({id,name:z.string().min(1).max(120),type:z.enum(['point','directional','spot']),position:vector,target:vector,color,intensity:finite.min(0).max(200),enabled:z.boolean(),angle:finite.min(.1).max(1.5)}).strict()).max(8),camera,cameraViews:z.array(camera.extend({id,name:z.string().min(1).max(100)})).max(16),environment:z.object({background:color,floorColor:color,floorVisible:z.boolean(),ambientIntensity:finite.min(0).max(3),exposure:finite.min(.1).max(3)}).strict(),motion:z.object({mode:z.enum(['turntable','camera-path']),duration:finite.min(1).max(8),fps:z.union([z.literal(12),z.literal(24)]),yaw:finite.min(-Math.PI*4).max(Math.PI*4),viewIds:z.array(id).max(16)}).strict()}).strict().superRefine((scene,ctx)=>{
  const ids=[...scene.objects.map(o=>o.id),...scene.lights.map(l=>l.id)];if(new Set(ids).size!==ids.length)ctx.addIssue({code:'custom',message:'Object and light IDs must be unique'});
  if(new Set(scene.cameraViews.map(v=>v.id)).size!==scene.cameraViews.length)ctx.addIssue({code:'custom',message:'Saved camera IDs must be unique'});
  for(const object of scene.objects)if(object.type==='primitive'&&!object.primitive||object.type==='model'&&!object.assetId&&!object.assetSha256)ctx.addIssue({code:'custom',message:'Each object needs real geometry or a saved model reference'});
  if(scene.motion.viewIds.some(id=>!scene.cameraViews.some(v=>v.id===id)))ctx.addIssue({code:'custom',message:'Camera path references a missing saved view'});
  if(scene.motion.mode==='camera-path'&&scene.motion.viewIds.length<2)ctx.addIssue({code:'custom',message:'A camera path needs at least two saved camera views'});
  if(scene.motion.duration*scene.motion.fps>144)ctx.addIssue({code:'custom',message:'Render at most 144 frames per sequence'});
  for(const view of [scene.camera,...scene.cameraViews])if(Math.hypot(...view.position.map((n,i)=>n-view.target[i]))<.05)ctx.addIssue({code:'custom',message:'Camera position and target must be separated'});
});
export class SpatialError extends Error{constructor(message:string,public status=400){super(message);}}
/** GLB must be self-contained: the viewer never retrieves embedded external URLs. */
export function inspectGlb(bytes:Buffer):{meshes:number;animations:number;triangles:number}{
  if(bytes.length<28||bytes.toString('ascii',0,4)!=='glTF'||bytes.readUInt32LE(4)!==2||bytes.readUInt32LE(8)!==bytes.length)throw new SpatialError('Use a valid, self-contained glTF 2.0 binary (.glb) model');
  const length=bytes.readUInt32LE(12);if(bytes.readUInt32LE(16)!==0x4e4f534a||length>16*1024*1024||20+length>bytes.length)throw new SpatialError('Invalid GLB JSON chunk');
  let document:any;try{document=JSON.parse(bytes.toString('utf8',20,20+length).trim());}catch{throw new SpatialError('Invalid GLB scene data');}
  if(document.asset?.version!=='2.0'||!Array.isArray(document.meshes)||!document.meshes.length||document.meshes.length>500)throw new SpatialError('This GLB needs 1–500 actual meshes');
  for(const item of [...(document.buffers??[]),...(document.images??[])])if(item.uri&&!/^data:(?:image\/(?:png|jpeg|webp)|application\/octet-stream);base64,/i.test(item.uri))throw new SpatialError('External model resources are unsupported. Export a self-contained GLB with embedded buffers and textures.');
  const triangles=document.meshes.reduce((sum:number,mesh:any)=>sum+(mesh.primitives??[]).reduce((n:number,p:any)=>n+(document.accessors?.[p.indices??p.attributes?.POSITION]?.count??0)/3,0),0);if(triangles>1_500_000)throw new SpatialError('This model exceeds the 1.5 million triangle stage limit');
  return{meshes:document.meshes.length,animations:document.animations?.length??0,triangles:Math.round(triangles)};
}
