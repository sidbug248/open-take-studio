import {NodeIO,Logger} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import {dedup,weld,simplify,prune,textureCompress,meshopt} from '@gltf-transform/functions';
import {MeshoptDecoder,MeshoptEncoder,MeshoptSimplifier} from 'meshoptimizer';
import sharp from 'sharp';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);

/** Lossy discovery representation only. The source file and scene's editing identity never change. */
export async function reduceDisplayMesh(bytes:Buffer){
  if(bytes.toString('ascii',0,4)!=='glTF'||bytes.readUInt32LE(4)!==2)throw new Error('A GLB2 model is required');
  const length=bytes.readUInt32LE(12),json=JSON.parse(bytes.subarray(20,20+length).toString('utf8'));
  if((json.buffers??[]).some((b:any)=>b.uri)||(json.images??[]).some((i:any)=>i.uri&&!String(i.uri).startsWith('data:')))throw new Error('Discovery models must have self-contained resources');
  const draco=require('draco3dgltf');await Promise.all([MeshoptDecoder.ready,MeshoptEncoder.ready,MeshoptSimplifier.ready]);
  const io=new NodeIO().setAllowNetwork(false).setLogger(new Logger(Logger.Verbosity.ERROR)).registerExtensions(ALL_EXTENSIONS).registerDependencies({'draco3d.decoder':await draco.createDecoderModule(),'draco3d.encoder':await draco.createEncoderModule(),'meshopt.decoder':MeshoptDecoder,'meshopt.encoder':MeshoptEncoder});
  const document=await io.readBinary(bytes);
  await document.transform(dedup(),weld(),...(document.getRoot().listSkins().length?[]:[simplify({simplifier:MeshoptSimplifier,ratio:.35,error:.001})]),prune(),textureCompress({encoder:sharp,targetFormat:'webp',resize:[512,512],quality:76}),meshopt({encoder:MeshoptEncoder,level:'medium'}));
  const triangles=document.getRoot().listMeshes().reduce((sum,mesh)=>sum+mesh.listPrimitives().reduce((n,p)=>n+(p.getMode()===4?(p.getIndices()?.getCount()??p.getAttribute('POSITION')?.getCount()??0)/3:0),0),0);
  return{bytes:Buffer.from(await io.writeBinary(document)),triangles:Math.round(triangles),textureMaxSize:512};
}
