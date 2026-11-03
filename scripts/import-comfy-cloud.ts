import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import type { Asset, Project, ProjectDetail, Shot, Take } from '../shared/types.ts';

// Imports already recovered files only. This script never contacts Cloud or generates media.
const base='http://127.0.0.1:4310';
const staging=path.resolve('imports/comfy-cloud');
const source=JSON.parse(await readFile(path.join(staging,'recovery-receipt.json'),'utf8'));
const title='Mara · Imported from Comfy Cloud';
async function api<T>(url:string,body?:unknown):Promise<T>{const response=await fetch(base+url,{method:body?'POST':'GET',headers:body instanceof FormData?undefined:body?{'Content-Type':'application/json'}:undefined,body:body instanceof FormData?body:body?JSON.stringify(body):undefined});if(!response.ok)throw new Error(`Local import ${response.status}: ${await response.text()}`);return response.json() as Promise<T>;}
const projects=await api<Project[]>('/api/projects');
const project=projects.find(p=>p.name===title)||await api<Project>('/api/projects',{name:title,description:'Imported from Comfy Cloud · NYC Build Night. Four original Mara image takes and the original image-to-video clip. Historical workflow graphs are reference artifacts; all new generation in this studio uses Comfy Router.'});
let detail=await api<ProjectDetail>(`/api/projects/${project.id}`);
async function shot(name:string,description:string,position:number){return detail.shots.find(s=>s.name===name)||await api<Shot>(`/api/projects/${project.id}/shots`,{name,description,position});}
const imageShot=await shot('01 · Image Draft','Four original Mara image candidates. Imported from the completed Comfy Cloud batch.',0);
const videoShot=await shot('02 · Image to Video','Original five-second animation. Its first frame was verified against the media-embedded execution graph.',1);
const relationship=Array.isArray(source.relationships)?source.relationships.find((r:any)=>r.type==='image-to-video'):source.relationships;
const mappings:Record<string,{asset:Asset;take:Take}>={};
async function upload(localPath:string,name:string,mime:string,metadata:Record<string,unknown>,hash?:string){
  const full=path.resolve(staging,localPath);if(!full.startsWith(staging+path.sep))throw new Error('Staged path escapes import directory');
  const bytes=await readFile(full);if(hash&&createHash('sha256').update(bytes).digest('hex')!==hash)throw new Error(`Recovered file checksum mismatch: ${name}`);
  const existing=detail.assets.find(a=>(a.metadata.cloudSource as any)?.stagedPath===localPath);
  if(existing){if(existing.sha256!==createHash('sha256').update(bytes).digest('hex'))throw new Error('Existing import has different bytes');return existing;}
  const form=new FormData();form.set('file',new Blob([new Uint8Array(bytes)],{type:mime}),name);form.set('metadata',JSON.stringify(metadata));form.set('provenance','imported');
  const asset=await api<Asset>(`/api/projects/${project.id}/assets`,form);detail.assets.push(asset);return asset;
}
for(const record of [...source.assets].sort((a:any,b:any)=>Number(a.contentType.startsWith('video/'))-Number(b.contentType.startsWith('video/')))){
  if(record.status!=='downloaded')continue;
  const isVideo=record.contentType.startsWith('video/');
  const verifiedParent=isVideo&&relationship?.verified?mappings[relationship.sourceCloudAssetId]:undefined;
  const cloudSource={service:'Comfy Cloud',label:'Imported from Comfy Cloud',workspaceId:source.workspaceId,workspaceName:source.workspaceName,workflowName:record.sourceWorkflow?.name,workflowId:record.sourceWorkflow?.id,workflowUrl:record.sourceWorkflow?.url,workflowExportSnapshot:record.sourceWorkflow?.exportSnapshot,executionId:record.sourceExecution?.id,execution:record.sourceExecution,originalFilename:record.originalFilename,originalPath:record.originalPath,assetId:record.id,stagedPath:record.localPath,relationshipVerified:Boolean(verifiedParent),sourceImageFilename:verifiedParent?relationship.sourceOriginalFilename:undefined,relationshipEvidence:verifiedParent?relationship.evidence:undefined};
  const asset=await upload(record.localPath,record.originalFilename,record.contentType,{cloudSource,sourcePrompt:record.prompt||'',sourceSettings:record.settingsSnapshot||{},sourceModel:record.model||record.modelProvenance||{},sourceDimensions:record.dimensions,sourceVideo:record.video,originalSha256:record.sha256,...(verifiedParent?{sourceAssetId:verifiedParent.asset.id}:{})},record.sha256);
  let take=detail.takes.find(t=>t.assetIds.includes(asset.id));
  if(!take){take=await api<Take>(`/api/projects/${project.id}/takes/import`,{assetId:asset.id,name:record.originalFilename,shotId:isVideo?videoShot.id:imageShot.id,...(verifiedParent?{parentTakeId:verifiedParent.take.id,sourceAssetId:verifiedParent.asset.id}:{})});detail.takes.push(take);}
  mappings[record.id]={asset,take};
}
for(const workflow of source.workflows)await upload(workflow.localPath,workflow.filename,'application/json',{cloudSource:{service:'Comfy Cloud',label:'Imported from Comfy Cloud',workspaceId:source.workspaceId,stagedPath:workflow.localPath,workflowName:workflow.filename.replace(/(?:\.api)?\.json$/,''),artifactType:workflow.format},referenceOnly:true,notRouterExecutable:true},workflow.sha256);
for(const file of ['recovery-receipt.json','source-jobs.json'])await upload(file,file,'application/json',{cloudSource:{service:'Comfy Cloud',label:'Imported from Comfy Cloud',workspaceId:source.workspaceId,stagedPath:file,artifactType:'Recovery provenance receipt'},referenceOnly:true});
const first=mappings[relationship.sourceCloudAssetId];const video=mappings[relationship.videoCloudAssetId];
async function patch(url:string,body:unknown){const response=await fetch(base+url,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});if(!response.ok)throw new Error('Failed to save import selection');return response.json();}
await patch(`/api/shots/${imageShot.id}`,{selectedTakeId:first.take.id});await patch(`/api/shots/${videoShot.id}`,{selectedTakeId:video.take.id});
await patch(`/api/projects/${project.id}`,{selectedTakeId:video.take.id,coverAssetId:first.asset.id});
const imported=await api<ProjectDetail>(`/api/projects/${project.id}`);
for(const asset of imported.assets){const res=await fetch(base+asset.url);const bytes=Buffer.from(await res.arrayBuffer());if(!res.ok||createHash('sha256').update(bytes).digest('hex')!==asset.sha256)throw new Error('Imported media download integrity failure');}
const importReceipt={importedAt:new Date().toISOString(),projectId:project.id,name:project.name,mediaCount:Object.keys(mappings).length,assets:imported.assets.map(a=>({id:a.id,name:a.name,kind:a.kind,sha256:a.sha256,bytes:a.size,provenance:a.provenance})),takes:imported.takes.map(t=>({id:t.id,name:t.name,parentTakeId:t.parentTakeId,sourceAssetId:t.sourceAssetId,provenance:t.provenance,status:t.status})),relationshipVerified:Boolean(video.take.parentTakeId===first.take.id),downloadsVerified:true,applicationJobs:imported.jobs.length};
await writeFile(path.join(staging,'application-import-receipt.json'),JSON.stringify(importReceipt,null,2));
console.log(JSON.stringify({projectId:project.id,mediaCount:importReceipt.mediaCount,totalAssets:imported.assets.length,takes:imported.takes.length,relationshipVerified:importReceipt.relationshipVerified,downloadsVerified:true,applicationJobs:imported.jobs.length},null,2));
