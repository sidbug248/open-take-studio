import { Router, type ErrorRequestHandler } from 'express';
import multer from 'multer';
import AdmZip from 'adm-zip';
import { createHash, randomUUID } from 'node:crypto';
import path from 'node:path';
import { z } from 'zod';
import type { Asset, Job, Project, ProjectDetail, Recipe, Shot, Take } from '../shared/types.ts';
import { identifyMedia, LocalFileStorage, MAX_MEDIA_BYTES } from './media.ts';
import type { Store } from './store.ts';
import { branchFilmSchema } from './film-schema.ts';
import { packInlineMedia, unpackInlineMedia } from './package-inline-media.ts';
import { workflowExecutionSchema } from './workflow-schema.ts';
import { catalogueDemonstrationSchema } from './catalogue-schema.ts';
import { exportProjectInWorker } from './project-export.ts';

const id=z.string().min(1).max(128).regex(/^[A-Za-z0-9_-]+$/);
const json=z.record(z.string(),z.unknown());
const date=z.string().datetime();
const inputRefs=z.record(z.string().max(80),z.union([id,z.array(id).max(100)]));
const mediaKind=z.enum(['image','video','audio','3d','document']);
const provenance=z.enum(['generated','imported','local-edit']);
const state=z.enum(['PENDING','SUBMITTING','IN_QUEUE','IN_PROGRESS','COLLECTING','COMPLETED','FAILED','BLOCKED','RETRY_WAIT','EXPIRED']);
const storyFactKey=z.enum(['location','time','event','intent','wardrobe','camera','sound']);
const sceneRevisionSchema=z.object({id,createdAt:date,direction:z.string().max(20000),inputs:z.record(z.string().max(60),id),facts:z.partialRecord(storyFactKey,z.string().max(12000)).optional()});
const sceneSchema=z.object({id,name:z.string().min(1).max(160),currentRevisionId:id,revisions:z.array(sceneRevisionSchema).min(1).max(10000),createdAt:date});
const sceneBindingSchema=z.object({sceneId:id,revisionId:id,useDirection:z.boolean(),factKeys:z.array(storyFactKey).max(7).optional()});
const recipeSlotSchema=z.object({key:z.string().min(1).max(60),label:z.string().min(1).max(120),inputKey:z.string().min(1).max(80),kind:z.enum(['image','video','audio']),required:z.boolean(),defaultAssetId:id.optional()});
const recipeIngredientSchema=z.object({key:z.string().min(1).max(60).regex(/^[a-zA-Z][a-zA-Z0-9_]*$/),label:z.string().min(1).max(120),defaultValue:z.string().max(12000),description:z.string().max(2000).optional()});
const recipeCreativeFields={promptTemplate:z.string().max(100000).optional(),ingredients:z.array(recipeIngredientSchema).max(40).optional(),previewAssetId:id.optional(),sourceTakeId:id.optional()};
const projectSchema=z.object({catalogueDemonstrations:z.array(catalogueDemonstrationSchema).max(5000).optional(),id,name:z.string().min(1).max(240),description:z.string().max(20000),createdAt:date,updatedAt:date,selectedTakeId:id.optional(),coverAssetId:id.optional(),films:z.array(branchFilmSchema).max(1000).optional(),scenes:z.array(sceneSchema).max(1000).optional()});
const assetSchema=z.object({id,projectId:id,name:z.string().min(1).max(240),kind:mediaKind,mimeType:z.string().max(100),fileName:z.string().regex(/^[A-Za-z0-9_-]+\.[a-z0-9]+$/),size:z.number().int().min(1).max(MAX_MEDIA_BYTES),sha256:z.string().regex(/^[a-f0-9]{64}$/),provenance,createdAt:date,metadata:json,url:z.string()});
const takeSchema=z.object({executionRoute:z.enum(['router','comfy-workflow']).optional(),workflowVersionAssetId:id.optional(),referenceRoles:z.record(z.string(),z.object({assetId:id,inputKey:z.string(),label:z.string().optional(),locked:z.boolean().optional()})).optional(),id,projectId:id,shotId:id.optional(),name:z.string().max(240),kind:mediaKind,parentTakeId:id.optional(),sourceAssetId:id.optional(),inputAssetIds:inputRefs,assetIds:z.array(id).max(100),modelId:z.string().max(300),provider:z.string().max(100),prompt:z.string().max(100000),settings:json,status:z.union([state,z.enum(['IMPORTED','LOCAL'])]),provenance,favorite:z.boolean(),createdAt:date,updatedAt:date,jobId:id.optional(),sceneBinding:sceneBindingSchema.optional(),changes:z.array(z.object({field:z.string(),before:z.unknown(),after:z.unknown()})).max(1000)});
const jobSchema=z.object({executionRoute:z.enum(['router','comfy-workflow']).optional(),workflow:workflowExecutionSchema.optional(),id,projectId:id,takeId:id,modelId:z.string().max(300),provider:z.string().max(100),requestId:z.string().max(200).optional(),idempotencyKey:z.string().min(1).max(300),inputs:json,state,queuePosition:z.number().optional(),errorType:z.string().optional(),errorMessage:z.string().optional(),httpStatus:z.number().int().optional(),diagnosticRequestId:z.string().nullable().optional(),attempts:z.number().int().min(0),collectAttempts:z.number().int().min(0).optional(),nextPollAt:date.optional(),createdAt:date,updatedAt:date,submittedAt:date.optional(),completedAt:date.optional(),result:z.unknown().optional(),resultMetadata:json.optional(),routerStatus:z.string().optional(),delivery:z.enum(['queue','sync']).optional(),fingerprint:z.string().optional(),archive:json.optional()});
const shotSchema=z.object({id,projectId:id,name:z.string().max(240),description:z.string().max(20000),position:z.number().finite(),selectedTakeId:id.optional()});
const recipeSchema=z.object({id,projectId:id,name:z.string().max(240),modelId:z.string().max(300),prompt:z.string().max(100000),settings:json,inputAssetIds:inputRefs,createdAt:date,slots:z.array(recipeSlotSchema).max(100).optional(),reproductionLimits:z.array(z.string().max(3000)).max(100).optional(),...recipeCreativeFields});
const manifestSchema=z.object({format:z.literal('open-take-studio'),version:z.union([z.literal(1),z.literal(2)]),exportedAt:date,project:projectSchema,assets:z.array(assetSchema).max(5000),takes:z.array(takeSchema).max(10000),jobs:z.array(jobSchema).max(10000),shots:z.array(shotSchema).max(5000),recipes:z.array(recipeSchema).max(5000),archivedJobIds:z.array(id).optional()});
export class ProjectError extends Error { constructor(message:string,public status=400) { super(message); } }
function requireProject(store:Store,projectId:string):Project { const value=store.getProject(projectId); if(!value)throw new ProjectError('Project not found',404); return value; }
function assetInProject(store:Store,assetId:string,projectId:string):Asset { const value=store.getAsset(assetId);if(!value||value.projectId!==projectId)throw new ProjectError('Asset is not in this project');return value; }
function takeInProject(store:Store,takeId:string,projectId:string):Take { const value=store.getTake(takeId);if(!value||value.projectId!==projectId)throw new ProjectError('Take is not in this project');return value; }
function shotInProject(store:Store,shotId:string,projectId:string):Shot { const value=store.getShot(shotId);if(!value||value.projectId!==projectId)throw new ProjectError('Shot is not in this project');return value; }
function checkInputRefs(store:Store,refs:Record<string,string|string[]>,projectId:string):void { for(const entry of Object.values(refs))for(const ref of Array.isArray(entry)?entry:[entry])assetInProject(store,ref,projectId); }
function touch(store:Store,projectId:string):void { const project=requireProject(store,projectId);store.upsertProject({...project,updatedAt:new Date().toISOString()}); }
const safeName=(value:string)=>value.replace(/[^a-zA-Z0-9_.-]+/g,'-').slice(0,100)||'open-take-project';
function isSecretFileName(name:string):boolean { return /^(?:\.env(?:\..*)?|\.npmrc|\.pypirc|id_rsa|id_ed25519)$/i.test(name.replace(/\\/g,'/').split('/').at(-1)??''); }
/** Multipart filename headers commonly arrive as UTF-8 bytes decoded with Latin-1. */
export function normalizeUploadFileName(name:string):string {
  if([...name].some(character=>character.codePointAt(0)!>255))return name;
  const bytes=Buffer.from(name,'latin1'),decoded=bytes.toString('utf8');
  if(decoded.includes('\uFFFD')||!Buffer.from(decoded,'utf8').equals(bytes))return name;
  return decoded;
}
/** Polling views retain readable prompts but avoid repeatedly transferring embedded media. */
export function summarizeInlineMedia(value:unknown):unknown {
  if(typeof value==='string'&&(/^data:[^;,]+;base64,/i.test(value)||(value.length>8192&&/^[A-Za-z0-9+/=\s]+$/.test(value))))return `[Inline media stored in the execution record; ${value.length} encoded characters. Full inputs are included in project export.]`;
  if(typeof value==='string')return redactSignedMediaLinks(value);
  if(Array.isArray(value))return value.map(summarizeInlineMedia);
  if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([key,entry])=>[key,summarizeInlineMedia(entry)]));
  return value;
}
/** Signed media URLs are bearer access tokens. Keep the exact request only in the server database. */
export function redactSignedMediaLinks(value:unknown):unknown {
  if(typeof value==='string')return value.replace(/https?:\/\/[^\s<>"']+/g,raw=>{try{const url=new URL(raw);if([...url.searchParams.keys()].some(key=>/^(?:x-amz-signature|x-goog-signature|signature|sig|token|access_token|auth_token)$/i.test(key))){url.search='';url.hash='';return url.href;}return raw;}catch{return raw;}});
  if(Array.isArray(value))return value.map(redactSignedMediaLinks);
  if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([key,entry])=>[key,redactSignedMediaLinks(entry)]));
  return value;
}

export async function exportProject(store:Store,media:LocalFileStorage,projectId:string):Promise<Buffer> {
  const detail=store.projectDetail(projectId);
  if(!detail)throw new ProjectError('Project not found',404);
  const zip=new AdmZip();
  const history=redactSignedMediaLinks({format:'open-take-studio',version:1,exportedAt:new Date().toISOString(),...detail,archivedJobIds:detail.jobs.filter(job=>store.isArchivedJob(job.id)).map(job=>job.id),securityNote:'Signed media URL query tokens are omitted. Stored media and input-asset relationships are authoritative; imported execution history is archived and never resumed. Version 2 stores repeated inline inputs once under inputs/, restoring their exact strings on import.'}) as Record<string,unknown>;
  const packed=packInlineMedia(history);
  const manifestBytes=Buffer.from(JSON.stringify(packed.manifest,null,2));
  let total=manifestBytes.length;
  if(total>32*1024*1024)throw new ProjectError('Project manifest exceeds the 32 MiB package limit. Split this project before exporting.');
  zip.addFile('manifest.json',manifestBytes);
  for(const [hash,bytes] of packed.blobs){total+=bytes.length;if(total>MAX_MEDIA_BYTES)throw new ProjectError('This package exceeds the 300 MiB local export limit. Split this project before exporting.');zip.addFile(`inputs/${hash}.txt`,bytes);}
  for(const asset of detail.assets){
    const bytes=await media.read(asset); total+=bytes.length;
    if(total>MAX_MEDIA_BYTES)throw new ProjectError('This package exceeds the 300 MiB local export limit. Split this project before exporting.');
    if(bytes.length!==asset.size||createHash('sha256').update(bytes).digest('hex')!==asset.sha256)throw new ProjectError(`Stored media failed its integrity check: ${asset.name}`,409);
    zip.addFile(`media/${asset.fileName}`,bytes);
  }
  return zip.toBuffer();
}

/** Import into fresh identities, keeping provider execution IDs as archived evidence only. */
export async function importProject(store:Store,media:LocalFileStorage,buffer:Buffer):Promise<Project> {
  if(buffer.length>MAX_MEDIA_BYTES)throw new ProjectError('Package must be at most 300 MiB');
  let zip:AdmZip;try{zip=new AdmZip(buffer);}catch{throw new ProjectError('Invalid project ZIP');}
  const entries=zip.getEntries();
  if(entries.length>15001)throw new ProjectError('Package has too many entries');
  const seen=new Set<string>();let total=0;
  for(const entry of entries){
    if(seen.has(entry.entryName))throw new ProjectError('Duplicate ZIP entry');seen.add(entry.entryName);
    if(!/^(manifest\.json|media\/[A-Za-z0-9_-]+\.[a-z0-9]+|inputs\/[a-f0-9]{64}\.txt)$/.test(entry.entryName))throw new ProjectError('Unexpected package path');
    total+=entry.header.size;
    if(total>MAX_MEDIA_BYTES||entry.header.size<0)throw new ProjectError('Expanded package exceeds 300 MiB');
    if(entry.entryName==='manifest.json'&&entry.header.size>32*1024*1024)throw new ProjectError('Manifest exceeds 32 MiB');
  }
  const entry=zip.getEntry('manifest.json');if(!entry)throw new ProjectError('Package is missing manifest.json');
  let parsed:unknown;try{parsed=JSON.parse(entry.getData().toString('utf8'));}catch{throw new ProjectError('Invalid project manifest JSON');}
  let inlineBlobs:Set<string>;try{const unpacked=unpackInlineMedia(parsed,zip);parsed=unpacked.manifest;inlineBlobs=unpacked.blobPaths;}catch(error){throw new ProjectError(error instanceof Error?error.message:'Invalid inline media history');}
  const result=manifestSchema.safeParse(parsed);if(!result.success)throw new ProjectError(`Invalid project manifest: ${result.error.issues[0]?.path.join('.')??'schema'}`);
  const source=result.data; const sourceId=source.project.id;
  const assetsById=new Map(source.assets.map(asset=>[asset.id,asset]));
  const takesById=new Map(source.takes.map(take=>[take.id,take]));
  const jobsById=new Map(source.jobs.map(job=>[job.id,job]));
  const shotsById=new Map(source.shots.map(shot=>[shot.id,shot]));
  const recipesById=new Map(source.recipes.map(recipe=>[recipe.id,recipe]));
  const filmsById=new Map((source.project.films??[]).map(film=>[film.id,film]));
  const scenesById=new Map((source.project.scenes??[]).map(scene=>[scene.id,scene]));
  const revisionsById=new Map((source.project.scenes??[]).flatMap(scene=>scene.revisions.map(revision=>[revision.id,revision] as const)));
  if(filmsById.size!==(source.project.films??[]).length||scenesById.size!==(source.project.scenes??[]).length||revisionsById.size!==(source.project.scenes??[]).reduce((sum,s)=>sum+s.revisions.length,0))throw new ProjectError('Duplicate film, scene, or revision identities in package');
  if(assetsById.size!==source.assets.length||takesById.size!==source.takes.length||jobsById.size!==source.jobs.length||shotsById.size!==source.shots.length||new Set(source.recipes.map(r=>r.id)).size!==source.recipes.length)throw new ProjectError('Duplicate record identities in package');
  if(new Set(source.assets.map(a=>a.fileName)).size!==source.assets.length)throw new ProjectError('Duplicate media file names in package');
  for(const record of [...source.assets,...source.takes,...source.jobs,...source.shots,...source.recipes])if(record.projectId!==sourceId)throw new ProjectError('Package contains records from a different project');
  const requireRef=(map:Map<string,unknown>,ref:string|undefined,label:string)=>{if(ref&&!map.has(ref))throw new ProjectError(`Missing ${label} relationship in package`);};
  const checkRefs=(refs:Record<string,string|string[]>)=>{for(const value of Object.values(refs))for(const ref of Array.isArray(value)?value:[value])requireRef(assetsById,ref,'input asset');};
  requireRef(takesById,source.project.selectedTakeId,'selected take'); requireRef(assetsById,source.project.coverAssetId,'cover asset');
  for(const take of source.takes){requireRef(takesById,take.parentTakeId,'parent take');requireRef(assetsById,take.sourceAssetId,'source asset');requireRef(shotsById,take.shotId,'shot');requireRef(jobsById,take.jobId,'job');for(const a of take.assetIds)requireRef(assetsById,a,'output asset');checkRefs(take.inputAssetIds);}
  for(const job of source.jobs){requireRef(takesById,job.takeId,'job take');if(takesById.get(job.takeId)?.jobId!==job.id)throw new ProjectError('Job and take relationships disagree');}
  for(const take of source.takes){requireRef(assetsById,take.workflowVersionAssetId,'workflow version');for(const role of Object.values(take.referenceRoles??{})){requireRef(assetsById,role.assetId,'reference role');const refs=take.inputAssetIds[role.inputKey];if(!(Array.isArray(refs)?refs:[refs]).includes(role.assetId))throw new ProjectError('Reference role is not an actual take input');}}
  for(const job of source.jobs)if(job.workflow){requireRef(assetsById,job.workflow.versionAssetId,'workflow version');if(assetsById.get(job.workflow.versionAssetId)?.metadata.operation!=='comfy-workflow-version')throw new ProjectError('Native workflow version artifact is invalid');requireRef(assetsById,job.workflow.executedGraphAssetId,'executed workflow graph');for(const value of Object.values(job.workflow.values))if(typeof value==='object')requireRef(assetsById,value.assetId,'workflow input');for(const upload of Object.values(job.workflow.uploads??{}))requireRef(assetsById,upload.assetId,'workflow upload');}
  if(new Set(source.project.catalogueDemonstrations?.map(d=>d.id)??[]).size!==(source.project.catalogueDemonstrations?.length??0))throw new ProjectError('Duplicate demonstration identities');
  for(const demonstration of source.project.catalogueDemonstrations??[]){if(demonstration.projectId!==sourceId)throw new ProjectError('Demonstration belongs to another project');for(const aid of [demonstration.posterAssetId,demonstration.previewAssetId,...demonstration.inputAssetIds,...demonstration.outputAssetIds])requireRef(assetsById,aid,'demonstration asset');requireRef(takesById,demonstration.takeId,'demonstration take');requireRef(jobsById,demonstration.jobId,'demonstration job');const ref=demonstration.workflowReference;if(ref){requireRef(filmsById,ref.filmId,'demonstration film');requireRef(scenesById,ref.sceneId,'demonstration scene');requireRef(recipesById,ref.recipeId,'demonstration recipe');requireRef(assetsById,ref.nativeWorkflowId,'demonstration native workflow');requireRef(assetsById,ref.artifactAssetId,'demonstration artifact');for(const tid of ref.takeIds??[])requireRef(takesById,tid,'demonstration comparison take');}}
  for(const take of source.takes)if(take.jobId&&jobsById.get(take.jobId)?.takeId!==take.id)throw new ProjectError('Take and job relationships disagree');
  for(const shot of source.shots)requireRef(takesById,shot.selectedTakeId,'shot selection');
  for(const recipe of source.recipes){checkRefs(recipe.inputAssetIds);requireRef(assetsById,recipe.previewAssetId,'recipe preview');requireRef(takesById,recipe.sourceTakeId,'recipe source take');if(new Set(recipe.ingredients?.map(i=>i.key)??[]).size!==(recipe.ingredients?.length??0))throw new ProjectError('Duplicate recipe ingredient keys');if(new Set(recipe.slots?.map(s=>s.key)??[]).size!==(recipe.slots?.length??0))throw new ProjectError('Duplicate recipe slot keys');for(const slot of recipe.slots??[]){requireRef(assetsById,slot.defaultAssetId,'recipe slot');if(slot.defaultAssetId&&assetsById.get(slot.defaultAssetId)?.kind!==slot.kind)throw new ProjectError('Recipe slot media kind does not match its asset');}}
  for(const scene of source.project.scenes??[]){if(!scene.revisions.some(r=>r.id===scene.currentRevisionId))throw new ProjectError('Missing current scene revision relationship in package');for(const revision of scene.revisions)checkRefs(revision.inputs);}
  for(const take of source.takes)if(take.sceneBinding){const scene=scenesById.get(take.sceneBinding.sceneId);if(!scene||!scene.revisions.some(r=>r.id===take.sceneBinding!.revisionId))throw new ProjectError('Missing take scene revision relationship in package');}
  for(const film of source.project.films??[]){requireRef(filmsById,film.parentFilmId,'parent film');const visitedParents=new Set([film.id]);let parentId=film.parentFilmId;while(parentId){if(visitedParents.has(parentId))throw new ProjectError('Film parent relationships cannot form a cycle');visitedParents.add(parentId);parentId=filmsById.get(parentId)?.parentFilmId;}if(new Set(film.choices.map(c=>c.id)).size!==film.choices.length)throw new ProjectError('Duplicate film choice identities');for(const clip of [film.opening,...film.choices.map(c=>c.clip)]){requireRef(assetsById,clip.assetId,'film clip');requireRef(takesById,clip.takeId,'film take');if(assetsById.get(clip.assetId)?.kind!=='video'||(clip.takeId&&!takesById.get(clip.takeId)?.assetIds.includes(clip.assetId)))throw new ProjectError('Film clip and take relationships disagree');}if(film.sourceMoment){const moment=film.sourceMoment;requireRef(assetsById,moment.assetId,'source moment');requireRef(assetsById,moment.frameAssetId,'source frame');requireRef(takesById,moment.takeId,'source take');const frame=assetsById.get(moment.frameAssetId)!;if(frame.kind!=='image'||assetsById.get(moment.assetId)?.kind!=='video'||frame.metadata.operation!=='video-frame-extraction'||frame.metadata.sourceAssetId!==moment.assetId||typeof frame.metadata.actualSeconds!=='number'||Math.abs(frame.metadata.actualSeconds-moment.seconds)>.001||(moment.takeId&&(!takesById.get(moment.takeId)?.assetIds.includes(moment.assetId)||frame.metadata.parentTakeId!==moment.takeId)))throw new ProjectError('Source moment and extracted frame relationships disagree');}}
  // Reject cyclic branch graphs rather than creating history that cannot be traversed.
  for(const take of source.takes){const ancestry=new Set<string>();let cursor:typeof take|undefined=take;while(cursor){if(ancestry.has(cursor.id))throw new ProjectError('Cyclic take ancestry');ancestry.add(cursor.id);cursor=cursor.parentTakeId?takesById.get(cursor.parentTakeId):undefined;}}
  const files=new Map<string,Buffer>();let actualBytes=entry.getData().length;
  for(const asset of source.assets){
    if(isSecretFileName(asset.name))throw new ProjectError('Environment and credential files cannot be imported as media');
    const assetEntry=zip.getEntry(`media/${asset.fileName}`);if(!assetEntry)throw new ProjectError(`Missing media for ${asset.name}`);
    const bytes=assetEntry.getData();actualBytes+=bytes.length;
    if(actualBytes>MAX_MEDIA_BYTES)throw new ProjectError('Expanded package exceeds 300 MiB');
    if(bytes.length!==asset.size||createHash('sha256').update(bytes).digest('hex')!==asset.sha256)throw new ProjectError(`Media integrity check failed for ${asset.name}`);
    const format=identifyMedia(bytes,asset.mimeType);
    if(format.mimeType!==asset.mimeType||(format.kind!==asset.kind&&!(asset.kind==='3d'&&format.mimeType==='application/zip')))throw new ProjectError('Media type does not match package metadata');
    files.set(asset.id,bytes);
  }
  if(entries.length!==source.assets.length+inlineBlobs.size+1)throw new ProjectError('Package contains unreferenced media');
  const projectId=randomUUID(), now=new Date().toISOString();
  const assetIds=new Map(source.assets.map(a=>[a.id,randomUUID()]));const takeIds=new Map(source.takes.map(t=>[t.id,randomUUID()]));const jobIds=new Map(source.jobs.map(j=>[j.id,randomUUID()]));const shotIds=new Map(source.shots.map(s=>[s.id,randomUUID()]));
  const recipeIds=new Map(source.recipes.map(r=>[r.id,randomUUID()]));
  const filmIds=new Map([...filmsById.keys()].map(old=>[old,randomUUID()])),sceneIds=new Map([...scenesById.keys()].map(old=>[old,randomUUID()])),revisionIds=new Map([...revisionsById.keys()].map(old=>[old,randomUUID()]));
  // Choice IDs are scoped to a film; retain those stable labels within newly identified films.
  const mapRefs=(refs:Record<string,string|string[]>)=>Object.fromEntries(Object.entries(refs).map(([key,value])=>[key,Array.isArray(value)?value.map(v=>assetIds.get(v)!):assetIds.get(value)!]));
  const referenceMaps:Record<string,Map<string,string>>={projectId:new Map([[sourceId,projectId]]),recipeId:recipeIds,nativeWorkflowId:assetIds,assetId:assetIds,sourceAssetId:assetIds,overlayAssetId:assetIds,frameAssetId:assetIds,defaultAssetId:assetIds,takeId:takeIds,parentTakeId:takeIds,selectedTakeId:takeIds,shotId:shotIds,jobId:jobIds,filmId:filmIds,parentFilmId:filmIds,sceneId:sceneIds,revisionId:revisionIds,currentRevisionId:revisionIds};
  const remapGraph=(value:unknown,key=''):unknown=>{
    const referenceMap=referenceMaps[key]??(/AssetId$/.test(key)?assetIds:/TakeId$/.test(key)?takeIds:undefined);
    if(typeof value==='string'&&referenceMap){const mapped=referenceMap.get(value);if(!mapped)throw new ProjectError(`Missing ${key} relationship in package`);return mapped;}
    if(Array.isArray(value)){const refKey=['assetIds','inputAssetIds','outputAssetIds'].includes(key)?'assetId':key==='takeIds'?'takeId':'';return value.map(v=>remapGraph(v,refKey));}
    if(value&&typeof value==='object'){
      if(key==='packageImport'||key==='sourceExecution'||key==='sourceWorkflow'||key==='cloudSource'||key==='archive'||key==='apiGraph'||key==='editorGraph')return structuredClone(value); // External provenance and Comfy node IDs stay historical.
      if(key==='inputAssetIds'){const refs=inputRefs.parse(value);checkRefs(refs);return mapRefs(refs);}
      if(key==='sourceHashes')return Object.fromEntries(Object.entries(value).map(([sourceAssetId,hash])=>{const mapped=assetIds.get(sourceAssetId);if(!mapped)throw new ProjectError('Missing source hash asset relationship in package');return[mapped,hash];}));
      const object=value as Record<string,unknown>;
      const mapped=Object.fromEntries(Object.entries(object).map(([k,v])=>[k,remapGraph(v,k)]));
      if(key==='filmSnapshot'&&typeof object.id==='string'){const next=filmIds.get(object.id);if(!next)throw new ProjectError('Missing film snapshot relationship in package');mapped.id=next;}
      return mapped;
    }
    return value;
  };
  const remapLocalMetadata=(raw:Record<string,unknown>)=>remapGraph(raw) as Record<string,unknown>;
  // Validate all typed local metadata before any writes, including nested frame/film snapshots.
  for(const asset of source.assets)remapLocalMetadata(asset.metadata);
  for(const take of source.takes){remapLocalMetadata(take.settings);if(take.referenceRoles)remapGraph(take.referenceRoles);}
  for(const job of source.jobs)if(job.workflow)remapGraph(job.workflow);
  const project:Project={...source.project,id:projectId,name:`${source.project.name.slice(0,225)} (imported)`,createdAt:now,updatedAt:now,selectedTakeId:source.project.selectedTakeId?takeIds.get(source.project.selectedTakeId):undefined,coverAssetId:source.project.coverAssetId?assetIds.get(source.project.coverAssetId):undefined,catalogueDemonstrations:source.project.catalogueDemonstrations?.map(d=>({...remapGraph(d) as typeof d,id:randomUUID()})),films:source.project.films?.map(f=>({...remapGraph(f) as typeof f,id:filmIds.get(f.id)!})),scenes:source.project.scenes?.map(s=>({...s,id:sceneIds.get(s.id)!,currentRevisionId:revisionIds.get(s.currentRevisionId)!,revisions:s.revisions.map(r=>({...r,id:revisionIds.get(r.id)!,inputs:Object.fromEntries(Object.entries(r.inputs).map(([key,aid])=>[key,assetIds.get(aid)!]))}))}))};
  const assets:Asset[]=[];
  for(const asset of source.assets){assets.push(await media.put({id:assetIds.get(asset.id)!,projectId,name:asset.name,mimeType:asset.mimeType,bytes:files.get(asset.id)!,kind:asset.kind,provenance:'imported',metadata:{...remapLocalMetadata(asset.metadata),packageImport:{importedAt:now,sourceProjectId:sourceId,sourceAssetId:asset.id,originalProvenance:asset.provenance,originalCreatedAt:asset.createdAt}}}));}
  store.transaction(()=>{
    store.upsertProject(project);
    for(const asset of assets)store.upsertAsset(asset);
    for(const take of source.takes)store.upsertTake({...take,id:takeIds.get(take.id)!,projectId,workflowVersionAssetId:take.workflowVersionAssetId?assetIds.get(take.workflowVersionAssetId):undefined,referenceRoles:take.referenceRoles?remapGraph(take.referenceRoles):undefined,shotId:take.shotId?shotIds.get(take.shotId):undefined,parentTakeId:take.parentTakeId?takeIds.get(take.parentTakeId):undefined,sourceAssetId:take.sourceAssetId?assetIds.get(take.sourceAssetId):undefined,inputAssetIds:mapRefs(take.inputAssetIds),assetIds:take.assetIds.map(a=>assetIds.get(a)!),jobId:take.jobId?jobIds.get(take.jobId):undefined,settings:remapLocalMetadata(take.settings),sceneBinding:take.sceneBinding?remapGraph(take.sceneBinding):undefined,changes:take.changes.map(change=>({...change,before:remapGraph(change.before,change.field),after:remapGraph(change.after,change.field)})),provenance:'imported'} as Take);
    for(const job of source.jobs){const importedJob={...job,workflow:job.workflow?remapGraph(job.workflow) as Job['workflow']:undefined,id:jobIds.get(job.id)!,projectId,takeId:takeIds.get(job.takeId)!,idempotencyKey:`imported-${randomUUID()}`,archive:{importedAt:now,sourceJobId:job.id,sourceProjectId:sourceId,originalIdempotencyKey:job.idempotencyKey,originalState:job.state}};store.upsertJob(importedJob);store.archiveJob(importedJob.id);}
    for(const shot of source.shots)store.upsertShot({...shot,id:shotIds.get(shot.id)!,projectId,selectedTakeId:shot.selectedTakeId?takeIds.get(shot.selectedTakeId):undefined});
    for(const recipe of source.recipes)store.upsertRecipe({...recipe,id:recipeIds.get(recipe.id)!,projectId,inputAssetIds:mapRefs(recipe.inputAssetIds),settings:remapLocalMetadata(recipe.settings),slots:recipe.slots?.map(slot=>({...slot,defaultAssetId:slot.defaultAssetId?assetIds.get(slot.defaultAssetId):undefined})),previewAssetId:recipe.previewAssetId?assetIds.get(recipe.previewAssetId):undefined,sourceTakeId:recipe.sourceTakeId?takeIds.get(recipe.sourceTakeId):undefined});
  });
  return project;
}

export function createProjectRouter(store:Store,media:LocalFileStorage):Router {
  const router=Router();
  const upload=multer({storage:multer.memoryStorage(),limits:{fileSize:MAX_MEDIA_BYTES,files:1,fields:8,fieldSize:256*1024}});
  router.get('/projects',(_req,res)=>res.json(store.listProjects()));
  router.post('/projects',(req,res)=>{
    const body=z.object({name:z.string().trim().min(1).max(240),description:z.string().max(20000).optional()}).parse(req.body);
    const now=new Date().toISOString();const project:Project={id:randomUUID(),name:body.name,description:body.description??'',createdAt:now,updatedAt:now};store.upsertProject(project);res.status(201).json(project);
  });
  router.post('/projects/import',upload.single('file'),async(req,res)=>{if(!req.file)throw new ProjectError('Choose a project ZIP file');res.status(201).json(await importProject(store,media,req.file.buffer));});
  router.get('/projects/:id',(req,res)=>{const projectId=String(req.params.id),detail=req.query.history==='full'?store.projectDetail(projectId):store.projectWorkspace(projectId);if(!detail)throw new ProjectError('Project not found',404);res.json(summarizeInlineMedia({...detail,jobs:detail.jobs.map(job=>({...job,inputsSummarized:true,archived:store.isArchivedJob(job.id)}))}));});
  router.get('/projects/:id/status',(req,res)=>{const projectId=String(req.params.id),project=requireProject(store,projectId),jobs=store.listJobSummaries(projectId);const row=store.db.prepare("SELECT (SELECT count(*) FROM assets WHERE project_id=?) AS assets,(SELECT count(*) FROM takes WHERE project_id=?) AS takes,(SELECT max(json_extract(data,'$.createdAt')) FROM assets WHERE project_id=?) AS assetUpdated,(SELECT max(json_extract(data,'$.updatedAt')) FROM takes WHERE project_id=?) AS takeUpdated").get(projectId,projectId,projectId,projectId) as {assets:number;takes:number;assetUpdated?:string;takeUpdated?:string};const version=[project.updatedAt,row.assetUpdated,row.takeUpdated,...jobs.map(job=>job.updatedAt)].filter((v):v is string=>!!v).sort().at(-1)??project.updatedAt;const activeJobCount=jobs.filter(job=>!job.archived&&['PENDING','SUBMITTING','IN_QUEUE','IN_PROGRESS','COLLECTING','RETRY_WAIT'].includes(job.state)).length;res.json(summarizeInlineMedia({projectId,version,revision:version,activeJobCount,assetCount:row.assets,takeCount:row.takes,jobs,pollAfterMs:activeJobCount?2000:0}));});
  router.patch('/projects/:id',(req,res)=>{
    const project=requireProject(store,String(req.params.id));const body=z.object({name:z.string().trim().min(1).max(240).optional(),description:z.string().max(20000).optional(),selectedTakeId:id.optional(),coverAssetId:id.optional()}).parse(req.body);
    if(body.selectedTakeId)takeInProject(store,body.selectedTakeId,project.id);if(body.coverAssetId)assetInProject(store,body.coverAssetId,project.id);
    res.json(store.upsertProject({...project,...body,updatedAt:new Date().toISOString()}));
  });
  router.post('/projects/:id/assets',upload.single('file'),async(req,res)=>{
    const project=requireProject(store,String(req.params.id));if(!req.file)throw new ProjectError('Choose a media file');
    const body=z.object({name:z.string().max(240).optional(),provenance:z.enum(['imported','local-edit']).optional(),metadata:z.string().max(256*1024).optional()}).parse(req.body);
    const originalName=normalizeUploadFileName(req.file.originalname);
    if(isSecretFileName(originalName)||isSecretFileName(body.name??''))throw new ProjectError('Environment and credential files cannot be imported as media');
    let metadata:Record<string,unknown>={};if(body.metadata){try{metadata=json.parse(JSON.parse(body.metadata));}catch{throw new ProjectError('Asset metadata must be a JSON object');}}
    const asset=await media.put({projectId:project.id,name:body.name??originalName,mimeType:req.file.mimetype,bytes:req.file.buffer,provenance:body.provenance??'imported',metadata});store.upsertAsset(asset);touch(store,project.id);res.status(201).json(asset);
  });
  router.get('/assets/:id/file',(req,res)=>{
    const asset=store.getAsset(String(req.params.id));if(!asset)throw new ProjectError('Asset not found',404);
    res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Cache-Control','private, max-age=3600');res.type(asset.mimeType);
    if(req.query.download==='1'||asset.kind==='document'||asset.kind==='3d'){
      const extension=path.extname(asset.fileName);
      res.attachment(asset.name.toLowerCase().endsWith(extension)?asset.name:`${asset.name}${extension}`);
    }
    res.sendFile(media.path(asset));
  });
  router.post('/projects/:id/takes/import',(req,res)=>{
    const project=requireProject(store,String(req.params.id));const body=z.object({assetId:id,name:z.string().max(240).optional(),shotId:id.optional(),parentTakeId:id.optional(),sourceAssetId:id.optional()}).parse(req.body);const asset=assetInProject(store,body.assetId,project.id);if(body.shotId)shotInProject(store,body.shotId,project.id);
    const parent=body.parentTakeId?takeInProject(store,body.parentTakeId,project.id):undefined;
    const sourceId=body.sourceAssetId??(typeof asset.metadata.sourceAssetId==='string'?asset.metadata.sourceAssetId:undefined);
    const source=sourceId?assetInProject(store,sourceId,project.id):undefined;
    const inputAssetIds:Record<string,string|string[]>={};if(source)inputAssetIds.source=source.id;
    if(asset.metadata.inputAssetIds){const extra=inputRefs.parse(asset.metadata.inputAssetIds);checkInputRefs(store,extra,project.id);Object.assign(inputAssetIds,extra);}
    if(typeof asset.metadata.overlayAssetId==='string')inputAssetIds.overlay=assetInProject(store,asset.metadata.overlayAssetId,project.id).id;
    const now=new Date().toISOString();const local=asset.provenance==='local-edit';const settings={...(typeof asset.metadata.settings==='object'&&asset.metadata.settings!==null&&!Array.isArray(asset.metadata.settings)?asset.metadata.settings:{}),...(typeof asset.metadata.operation==='string'?{operation:asset.metadata.operation}:{})};
    const sourcePrompt=typeof asset.metadata.sourcePrompt==='string'?asset.metadata.sourcePrompt.slice(0,100000):undefined;
    const take:Take={id:randomUUID(),projectId:project.id,shotId:body.shotId??parent?.shotId,parentTakeId:parent?.id,name:body.name??asset.name,kind:asset.kind,inputAssetIds,assetIds:[asset.id],sourceAssetId:source?.id,modelId:local?'local/manual-edit':'imported/example',provider:local?'local':'imported',prompt:sourcePrompt??parent?.prompt??'',settings,status:local?'LOCAL':'IMPORTED',provenance:local?'local-edit':'imported',favorite:false,createdAt:now,updatedAt:now,changes:parent?[{field:'modelId',before:parent.modelId,after:local?'local/manual-edit':'imported/example'},{field:'settings',before:parent.settings,after:settings},{field:'inputAssetIds',before:parent.inputAssetIds,after:inputAssetIds}]:[]};store.upsertTake(take);touch(store,project.id);res.status(201).json(take);
  });
  router.patch('/takes/:id',(req,res)=>{
    const take=store.getTake(String(req.params.id));if(!take)throw new ProjectError('Take not found',404);const body=z.object({favorite:z.boolean().optional(),name:z.string().trim().min(1).max(240).optional(),shotId:id.optional()}).parse(req.body);if(body.shotId)shotInProject(store,body.shotId,take.projectId);const next=store.upsertTake({...take,...body,updatedAt:new Date().toISOString()});touch(store,take.projectId);res.json(next);
  });
  router.post('/projects/:id/shots',(req,res)=>{
    const project=requireProject(store,String(req.params.id));const body=z.object({name:z.string().trim().min(1).max(240),description:z.string().max(20000).optional(),position:z.number().finite().optional()}).parse(req.body);const shot:Shot={id:randomUUID(),projectId:project.id,name:body.name,description:body.description??'',position:body.position??store.listShots(project.id).length};store.upsertShot(shot);touch(store,project.id);res.status(201).json(shot);
  });
  router.patch('/shots/:id',(req,res)=>{
    const shot=store.getShot(String(req.params.id));if(!shot)throw new ProjectError('Shot not found',404);const body=z.object({name:z.string().trim().min(1).max(240).optional(),description:z.string().max(20000).optional(),position:z.number().finite().optional(),selectedTakeId:id.optional()}).parse(req.body);if(body.selectedTakeId)takeInProject(store,body.selectedTakeId,shot.projectId);store.upsertShot({...shot,...body});touch(store,shot.projectId);res.json(store.getShot(shot.id));
  });
  router.post('/projects/:id/recipes',(req,res)=>{
    const project=requireProject(store,String(req.params.id));const body=z.object({name:z.string().trim().min(1).max(240),modelId:z.string().min(1).max(300),prompt:z.string().max(100000),settings:json,inputAssetIds:inputRefs.optional(),slots:z.array(recipeSlotSchema).max(100).optional(),reproductionLimits:z.array(z.string().max(3000)).max(100).optional(),...recipeCreativeFields}).parse(req.body);checkInputRefs(store,body.inputAssetIds??{},project.id);if(body.previewAssetId)assetInProject(store,body.previewAssetId,project.id);if(body.sourceTakeId)takeInProject(store,body.sourceTakeId,project.id);if(new Set(body.ingredients?.map(i=>i.key)??[]).size!==(body.ingredients?.length??0))throw new ProjectError('Each recipe ingredient needs a unique key');if(new Set(body.slots?.map(s=>s.key)??[]).size!==(body.slots?.length??0))throw new ProjectError('Each recipe slot needs a unique key');for(const slot of body.slots??[])if(slot.defaultAssetId&&assetInProject(store,slot.defaultAssetId,project.id).kind!==slot.kind)throw new ProjectError('Recipe slot media kind does not match its default asset');const recipe:Recipe={...body,id:randomUUID(),projectId:project.id,inputAssetIds:body.inputAssetIds??{},createdAt:new Date().toISOString()};store.upsertRecipe(recipe);touch(store,project.id);res.status(201).json(recipe);
  });
  router.get('/projects/:id/export',async(req,res)=>{const project=requireProject(store,String(req.params.id));const bytes=await exportProjectInWorker(store,media,project.id);res.type('application/zip').attachment(`${safeName(project.name)}.opentake.zip`).send(bytes);});
  router.use(((error,_req,res,next)=>{if(error instanceof z.ZodError){res.status(400).json({error:error.issues.map(issue=>`${issue.path.join('.')}: ${issue.message}`).join('; ')});return;}if(error instanceof multer.MulterError){res.status(error.code==='LIMIT_FILE_SIZE'?413:400).json({error:error.message});return;}next(error);}) as ErrorRequestHandler);
  return router;
}
