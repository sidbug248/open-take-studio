import {ObjectRoomViewer} from './object-room-viewer';
import type {ObjectRoomPlayerManifest} from '../shared/object-room-types';
import type {Asset} from '../shared/types';
const urls:string[]=[];let viewer:ObjectRoomViewer|undefined;
async function open(){const response=await fetch('./room.json');if(!response.ok)throw new Error('The room manifest is missing');const manifest=await response.json() as ObjectRoomPlayerManifest;if(manifest.format!=='open-take-object-room'||manifest.version!==1)throw new Error('Unsupported room package');
  const assets=await Promise.all(manifest.assets.map(async asset=>{if(asset.mimeType!=='model/gltf-binary')return asset;const result=await fetch(asset.url);if(!result.ok)throw new Error(`Model file missing: ${asset.name}`);const bytes=await result.arrayBuffer();const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(n=>n.toString(16).padStart(2,'0')).join('');if(digest!==asset.sha256)throw new Error(`Model integrity check failed: ${asset.name}`);const url=URL.createObjectURL(new Blob([bytes],{type:asset.mimeType}));urls.push(url);return{...asset,url};}));
  const host=document.querySelector<HTMLElement>('#room')!;viewer=new ObjectRoomViewer(host);await viewer.update(manifest.document,manifest.scene,assets as Asset[]);host.focus({preventScroll:true});document.title=`${manifest.document.name} · Object Room`;const credits=document.querySelector<HTMLElement>('#credits')!;for(const item of manifest.credits){const row=document.createElement('p');row.textContent=`${item.name} · ${item.provenance}${item.modelId?` · ${item.modelId}`:''}${item.provider?` / ${item.provider}`:''}`;credits.append(row);}
}
open().catch(error=>{document.querySelector<HTMLElement>('#room')!.textContent=error instanceof Error?error.message:'The room could not open. Run the included local server.';});
window.addEventListener('pagehide',()=>{viewer?.dispose();urls.forEach(url=>URL.revokeObjectURL(url));},{once:true});
