import {createHash} from 'node:crypto';
import path from 'node:path';
import AdmZip from 'adm-zip';
import type {Asset,Project,ProjectDetail} from '../shared/types.ts';
import type {StudioRuntime} from './studio-runtime.ts';
import {importProject,ProjectError} from './project-routes.ts';
import {MAX_MEDIA_BYTES} from './media.ts';

export const REVIEWER_EXAMPLE_IDS=Object.freeze([
 '456f5fdb-e79b-4946-9122-dc17e7a291e3',
 '1bec0508-6565-4cf8-9666-f07d224351a1',
 '1659408b-f807-418b-8a67-3c2404e0d12e',
] as const);
const examples=[
 {id:REVIEWER_EXAMPLE_IDS[0],name:'Prismatic bloom',description:'A glass garden, an exact source frame, and three different endings. Remix the saved story and choose your next direction.',preferred:['962f7fe4-2bff-41f3-9cbd-421528807401','4c9e5333-4256-4b2f-9e12-84014b3bf3c6']},
 {id:REVIEWER_EXAMPLE_IDS[1],name:'Liquid daylight',description:'A real sculptural object, saved camera views, and cinematic interpretations. Make the materials, lighting, and story your own.',preferred:['1519ad03-9178-4983-90fc-ddee63d8d355','c3cb0964-31ff-42e7-a1aa-63f3e00ef796']},
 {id:REVIEWER_EXAMPLE_IDS[2],name:'Voices elsewhere',description:'A mixed soundtrack and editable motion compositions. Reframe the words, adjust the timing, and export your own film.',preferred:['b3ec9884-8402-4e0d-80ab-d53aaef9658b','8a138b4c-b4a4-406f-bad8-97dd3fd59337']},
];
export interface ReviewerExampleDescriptor {id:string;name:string;description:string;kind:'image'|'video'|'audio'|'3d';posterUrl:string;previewUrl?:string;}
const approved=(id:string)=>examples.some(example=>example.id===id);
const publicMedia=(asset:Asset)=>asset.kind!=='document'&&(/^(image|video|audio)\//.test(asset.mimeType)||asset.mimeType==='model/gltf-binary');
/** Never authorizes an owner's document, archive, arbitrary path, or other project. */
export function getReviewerExampleAsset(owner:StudioRuntime,id:string,assetId:string):Asset|undefined {
 if(!approved(id))return;const asset=owner.store.getAsset(assetId);return asset?.projectId===id&&publicMedia(asset)?asset:undefined;
}
function featured(owner:StudioRuntime,id:string):Asset|undefined{
 const example=examples.find(item=>item.id===id);if(!example||!owner.store.getProject(id))return;
 for(const assetId of example.preferred){const asset=getReviewerExampleAsset(owner,id,assetId);if(asset)return asset;}
 const project=owner.store.getProject(id)!;for(const assetId of [project.coverAssetId,...owner.store.listTakes(id).filter(t=>t.favorite||t.id===project.selectedTakeId).flatMap(t=>t.assetIds)]){if(assetId){const asset=getReviewerExampleAsset(owner,id,assetId);if(asset)return asset;}}
 return owner.store.listAssets(id).find(asset=>publicMedia(asset)&&asset.metadata.operation!=='asset-poster');
}
const mediaUrl=(exampleId:string,assetId:string,variant:'poster'|'preview'|'original')=>`/api/reviewer/examples/${exampleId}/media/${assetId}?variant=${variant}`;
/** Reads only the prepared display index; never renders or writes owner media. */
export async function listReviewerExamples(owner:StudioRuntime):Promise<ReviewerExampleDescriptor[]>{
 const results=await Promise.all(examples.map(async (example):Promise<ReviewerExampleDescriptor|undefined>=>{const asset=featured(owner,example.id);if(!asset)return undefined;const display=await owner.explore.displays.describe(asset);const savedPoster=getReviewerExampleAsset(owner,example.id,String(asset.metadata.posterAssetId??''));
  return{id:example.id,name:example.name,description:example.description,kind:asset.kind as ReviewerExampleDescriptor['kind'],posterUrl:display.poster?mediaUrl(example.id,asset.id,'poster'):savedPoster?mediaUrl(example.id,savedPoster.id,'original'):asset.kind==='image'?mediaUrl(example.id,asset.id,'original'):'',previewUrl:asset.kind==='video'&&display.preview?mediaUrl(example.id,asset.id,'preview'):undefined};
 }));return results.filter((item):item is ReviewerExampleDescriptor=>!!item);
}
export async function resolveReviewerExampleMedia(owner:StudioRuntime,id:string,assetId:string,variant:string='original'):Promise<{asset:Asset;path:string;mimeType:string}>{
 if(!['poster','preview','original'].includes(variant))throw new ProjectError('Unknown example media variant.',404);
 const asset=getReviewerExampleAsset(owner,id,assetId);if(!asset)throw new ProjectError('Curated example media not found.',404);
 if(variant==='original')return{asset,path:owner.media.path(asset),mimeType:asset.mimeType};
 const display=await owner.explore.displays.describe(asset),rendition=variant==='poster'?display.poster:display.preview;
 if(rendition){const file=path.posix.basename(new URL(rendition.url,'http://studio.invalid').pathname);const location=await owner.explore.displays.file(asset,display.presentationVersion,file);return{asset,path:location,mimeType:variant==='poster'?display.poster!.variants.find(item=>item.url===rendition.url)?.mimeType||'image/webp':'video/mp4'};}
 if(variant==='poster'){const poster=getReviewerExampleAsset(owner,id,String(asset.metadata.posterAssetId??''));if(poster?.kind==='image')return{asset:poster,path:owner.media.path(poster),mimeType:poster.mimeType};if(asset.kind==='image')return{asset,path:owner.media.path(asset),mimeType:asset.mimeType};}
 throw new ProjectError('This curated preview is not prepared.',404);
}

const privateField=(key:string)=>/^(?:api[_-]?key|comfy[_-]?api[_-]?key|openai[_-]?api[_-]?key|authorization|password|secret|token|access[_-]?token|refresh[_-]?token|credentials?|credentialId|keyFingerprint|headers|cookie|cookies|jobId|sourceJobId|requestId|executionId|idempotencyKey|fingerprint|submittedInputs|rawInputs|rawResult|result|resultMetadata|uploads|uploadCache|cloudEditorUrl|cloudWorkspace)$/i.test(key)||/(?:^|[_-])(?:secret|password|api[_-]?key|access[_-]?token|authorization)(?:$|[_-])/i.test(key);
function scrubText(value:string):string{
 for(const secret of [process.env.COMFY_API_KEY,process.env.OTS_OWNER_PASSWORD_HASH,process.env.OTS_CREDENTIAL_ENCRYPTION_KEY])if(secret)value=value.split(secret).join('[private credential omitted]');
 value=value.replace(/comfyui-[A-Za-z0-9_-]+/g,'[private credential omitted]');
 if(/^data:[^,]+;base64,/i.test(value))return '[inline execution media omitted; use the saved asset reference]';
 return value.replace(/https?:\/\/[^\s<>"']+/gi,raw=>{try{const url=new URL(raw);if(url.username||url.password||[...url.searchParams.keys()].some(key=>/token|signature|credential|authorization|^key$|api.?key|^sig$|^x-amz-|^x-goog-/i.test(key)))return '[private remote URL omitted]';return raw;}catch{return '[invalid remote URL omitted]';}}).replace(/\bBearer\s+[A-Za-z0-9._~+\/-]+=*/gi,'[authorization omitted]');
}
/** Strip secrets and execution payloads recursively, while retaining local source relationships. */
export function sanitizeReviewerValue(value:unknown,key=''):unknown{
 if(privateField(key))return undefined;
 if(typeof value==='string')return scrubText(value);
 if(Array.isArray(value))return value.map(item=>sanitizeReviewerValue(item)).filter(item=>item!==undefined);
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).flatMap(([name,entry])=>{const clean=sanitizeReviewerValue(entry,name);return clean===undefined?[]:[[name,clean]];}));
 return value;
}
function pruneAssets(value:unknown,excluded:Set<string>,key=''):unknown{
 if(typeof value==='string'&&(key==='assetId'||/AssetId$/.test(key))&&excluded.has(value))return undefined;
 if(Array.isArray(value))return value.map(item=>pruneAssets(item,excluded,['assetIds','inputAssetIds','outputAssetIds'].includes(key)?'assetId':'')).filter(item=>item!==undefined);
 if(value&&typeof value==='object'){
  if(key==='inputAssetIds')return Object.fromEntries(Object.entries(value).flatMap(([name,entry])=>{const ids=(Array.isArray(entry)?entry:[entry]).filter(id=>typeof id==='string'&&!excluded.has(id));return ids.length?[[name,Array.isArray(entry)?ids:ids[0]]]:[];}));
  if(key==='sourceHashes')return Object.fromEntries(Object.entries(value).filter(([id])=>!excluded.has(id)));
  return Object.fromEntries(Object.entries(value).flatMap(([name,entry])=>{const clean=pruneAssets(entry,excluded,name);return clean===undefined?[]:[[name,clean]];}));
 }
 return value;
}
const hash=(bytes:Buffer)=>createHash('sha256').update(bytes).digest('hex');
const inFlight=new WeakMap<StudioRuntime,Map<string,Promise<Project>>>();
export function remixReviewerExample(owner:StudioRuntime,target:StudioRuntime,id:string):Promise<Project>{
 if(!approved(id))return Promise.reject(new ProjectError('Curated example not found.',404));
 if(owner===target||owner.store.dataDir===target.store.dataDir)return Promise.reject(new ProjectError('Remixes require a separate reviewer workspace.',403));
 let pending=inFlight.get(target);if(!pending){pending=new Map();inFlight.set(target,pending);}const existing=pending.get(id);if(existing)return existing;
 const task=copyExample(owner,target,id);pending.set(id,task);void task.finally(()=>pending!.delete(id)).catch(()=>{});return task;
}
async function copyExample(owner:StudioRuntime,target:StudioRuntime,id:string):Promise<Project>{
 // Build a fresh portable manifest from read-only owner records. In particular,
 // do not export jobs then redact them: their large/private inputs are never read.
 const project=owner.store.getProject(id);if(!project)throw new ProjectError('Curated example not found.',404);
 const allAssets=owner.store.listAssets(id),excluded=new Set(allAssets.filter(a=>a.mimeType==='application/zip'||/comfy-workflow-execution|executed-workflow|executed-graph/.test(String(a.metadata.operation??''))).map(a=>a.id));
 const source={project,assets:allAssets.filter(a=>!excluded.has(a.id)),takes:owner.store.listTakes(id),jobs:[],shots:owner.store.listShots(id),recipes:owner.store.listRecipes(id)};
 const clean=pruneAssets(sanitizeReviewerValue(source),excluded) as ProjectDetail;clean.jobs=[];
 for(const take of clean.takes){delete take.jobId;take.provenance='imported';if(!['COMPLETED','LOCAL','IMPORTED'].includes(take.status))take.status='IMPORTED';take.referenceRoles=take.referenceRoles?Object.fromEntries(Object.entries(take.referenceRoles).filter(([,role])=>{const refs=take.inputAssetIds[role.inputKey];return !!role.inputKey&&(Array.isArray(refs)?refs:[refs]).includes(role.assetId);})):undefined;}
 for(const demo of clean.project.catalogueDemonstrations??[]){delete demo.jobId;delete demo.requestId;demo.attribution={...demo.attribution,source:'imported-example'};}
 const zip=new AdmZip();let total=0;const files=new Map<string,Buffer>();
 for(const asset of clean.assets){const original=allAssets.find(a=>a.id===asset.id)!;let bytes=await owner.media.read(original);if(bytes.length!==original.size||hash(bytes)!==original.sha256)throw new ProjectError('Curated media integrity check failed.',409);
  if(asset.mimeType==='application/json'){
   let document:unknown;try{document=JSON.parse(bytes.toString('utf8'));}catch{throw new ProjectError('Curated production document is invalid.',409);}
   bytes=Buffer.from(JSON.stringify(pruneAssets(sanitizeReviewerValue(document),excluded),null,2));
  }else if(asset.mimeType.startsWith('text/'))bytes=Buffer.from(scrubText(bytes.toString('utf8')));
  asset.size=bytes.length;asset.sha256=hash(bytes);asset.provenance='imported';asset.metadata={...asset.metadata,reviewerExample:{sourceProjectId:id,sourceAssetId:asset.id,originalSha256:original.sha256,executionRecordsRemoved:true}};total+=bytes.length;if(total>MAX_MEDIA_BYTES-8*1024*1024)throw new ProjectError('This example exceeds the reviewer package limit.',413);files.set(asset.fileName,bytes);
 }
 // Avoid marking historical JSON hashes as current after its private fields were removed.
 const hashes=new Map(clean.assets.map(a=>[a.id,a.sha256]));for(const asset of clean.assets){if(typeof asset.metadata.sourceAssetId==='string'&&hashes.has(asset.metadata.sourceAssetId)&&asset.metadata.sourceSha256)asset.metadata.sourceSha256=hashes.get(asset.metadata.sourceAssetId);}
 const manifest={format:'open-take-studio',version:1,exportedAt:new Date().toISOString(),...clean,archivedJobIds:[],securityNote:'Curated reviewer copy. Jobs, credentials, signed URLs, execution payloads and embedded archives were omitted. Saved media and local production relationships remain.'};
 const manifestBytes=Buffer.from(JSON.stringify(manifest));if(manifestBytes.length>32*1024*1024)throw new ProjectError('Curated manifest exceeds the package limit.',413);zip.addFile('manifest.json',manifestBytes);for(const [name,bytes]of files){zip.addFile('media/'+name,bytes);const entry=zip.getEntry('media/'+name);if(entry)entry.header.method=0;}
 const imported=await importProject(target.store,target.media,zip.toBuffer());const named={...imported,name:`${examples.find(e=>e.id===id)!.name} · your remix`};target.store.upsertProject(named);return named;
}
