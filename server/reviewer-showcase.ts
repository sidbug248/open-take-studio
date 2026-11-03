import {createHash,randomUUID} from 'node:crypto';
import {mkdir,readFile,writeFile,rename} from 'node:fs/promises';
import path from 'node:path';
import AdmZip from 'adm-zip';
import type {Asset,Project,ProjectDetail} from '../shared/types.ts';
import type {StudioRuntime} from './studio-runtime.ts';
import {importProject,ProjectError} from './project-routes.ts';
import {MAX_MEDIA_BYTES} from './media.ts';
import {DISPLAY_VERSION} from './display-media.ts';
import type {AssetPresentation} from '../shared/presentation-contract.ts';

// The original submission collections are explicitly approved for public discovery.
// Keep future owner projects private unless they are deliberately added here.
export const REVIEWER_EXAMPLE_IDS=Object.freeze([
 '456f5fdb-e79b-4946-9122-dc17e7a291e3',
 '1bec0508-6565-4cf8-9666-f07d224351a1',
 '1659408b-f807-418b-8a67-3c2404e0d12e',
 '97d0268d-35f7-43f2-8ebc-539fef34485c',
 '8836985f-6d32-4686-bf0b-d5d7bcfe4118',
 'fceaf455-9ba2-4763-a3fa-d0eabf4e3b4a',
 'eaa51979-8b29-4544-9867-bee3800c28d2',
 '8fa4b332-af41-4dd8-8027-45d2ced245af',
 'b9c044a3-62a8-44c7-ad12-d9c3916b3ed3',
 '43ffec75-0816-4c5e-9320-e05dd720178f',
 '4c24e243-ee13-4dc5-9e81-fbe36debbfb6',
 'dd0fe498-de28-4667-a758-628f81822a1f',
 '7c4498c2-0ad9-4b79-ad49-6c0fc1b7bc18',
 'eb4de8b6-7160-46f5-b68e-5fb19998b3f6',
 '8af0cb23-c715-483d-89d9-44f56716499e',
 'd4e99c40-db8f-47a9-a4a9-8a6a103cf114',
 '94db17ce-def1-4abd-8f48-b08c8cb62928',
 'c9526232-ca45-4877-8f45-ceba3fe6264c',
 'f03f4e1f-d214-464a-9743-77fd14575fa8',
] as const);
const examples=[
 {id:REVIEWER_EXAMPLE_IDS[0],name:'Prismatic bloom',description:'A glass garden, an exact source frame, and three different endings. Remix the saved story and choose your next direction.',preferred:['962f7fe4-2bff-41f3-9cbd-421528807401','4c9e5333-4256-4b2f-9e12-84014b3bf3c6']},
 {id:REVIEWER_EXAMPLE_IDS[1],name:'Liquid daylight',description:'A real sculptural object, saved camera views, and cinematic interpretations. Make the materials, lighting, and story your own.',preferred:['1519ad03-9178-4983-90fc-ddee63d8d355','c3cb0964-31ff-42e7-a1aa-63f3e00ef796']},
 {id:REVIEWER_EXAMPLE_IDS[2],name:'Voices elsewhere',description:'A mixed soundtrack and editable motion compositions. Reframe the words, adjust the timing, and export your own film.',preferred:['b3ec9884-8402-4e0d-80ab-d53aaef9658b','8a138b4c-b4a4-406f-bad8-97dd3fd59337']},
 {id:REVIEWER_EXAMPLE_IDS[3],name:'Coastal Light',description:'Explore the original Coastal Light collection and make a private remix.',preferred:[]},
 {id:REVIEWER_EXAMPLE_IDS[4],name:'Mara · The last light',description:'Explore the original Mara · The last light collection and make a private remix.',preferred:[]},
 {id:REVIEWER_EXAMPLE_IDS[5],name:'Midnight on wheels',description:'Explore the original Midnight on wheels collection and make a private remix.',preferred:[]},
 {id:REVIEWER_EXAMPLE_IDS[6],name:'Afterglow · Editorial',description:'Explore the original Afterglow · Editorial collection and make a private remix.',preferred:[]},
 {id:REVIEWER_EXAMPLE_IDS[7],name:'Electric bodies',description:'Explore the original Electric bodies collection and make a private remix.',preferred:[]},
 {id:REVIEWER_EXAMPLE_IDS[8],name:'Neon courier',description:'Explore the original Neon courier collection and make a private remix.',preferred:[]},
 {id:REVIEWER_EXAMPLE_IDS[9],name:'Signal / Noise',description:'Explore the original Signal / Noise collection and make a private remix.',preferred:[]},
 {id:REVIEWER_EXAMPLE_IDS[10],name:'Saffron Circuit',description:'Explore the original Saffron Circuit collection and make a private remix.',preferred:[]},
 {id:REVIEWER_EXAMPLE_IDS[11],name:'Cerulean Couture',description:'Explore the original Cerulean Couture collection and make a private remix.',preferred:[]},
 {id:REVIEWER_EXAMPLE_IDS[12],name:'Botanical Machines',description:'Explore the original Botanical Machines collection and make a private remix.',preferred:[]},
 {id:REVIEWER_EXAMPLE_IDS[13],name:'Quiet Monument',description:'Explore the original Quiet Monument collection and make a private remix.',preferred:[]},
 {id:REVIEWER_EXAMPLE_IDS[14],name:'Paper Signals',description:'Explore the original Paper Signals collection and make a private remix.',preferred:[]},
 {id:REVIEWER_EXAMPLE_IDS[15],name:'Chrome Reef',description:'Explore the original Chrome Reef collection and make a private remix.',preferred:[]},
 {id:REVIEWER_EXAMPLE_IDS[16],name:'Tidal Cinema',description:'Explore the original Tidal Cinema collection and make a private remix.',preferred:[]},
 {id:REVIEWER_EXAMPLE_IDS[17],name:'Pocket Mythologies',description:'Explore the original Pocket Mythologies collection and make a private remix.',preferred:[]},
 {id:REVIEWER_EXAMPLE_IDS[18],name:'The Velvet Observatory',description:'Explore the original The Velvet Observatory collection and make a private remix.',preferred:[]},
];
export interface ReviewerExampleDescriptor {id:string;name:string;description:string;kind:'image'|'video'|'audio'|'3d';posterUrl:string;previewUrl?:string;}
const approved=(id:string)=>examples.some(example=>example.id===id);
const publicMedia=(asset:Asset)=>asset.kind!=='document'&&(/^(image|video|audio)\//.test(asset.mimeType)||asset.mimeType==='model/gltf-binary');
function approvedAsset(owner:StudioRuntime,id:string,assetId:string){if(!approved(id)||!owner.store.db.prepare('SELECT 1 FROM assets WHERE id=? AND project_id=?').get(assetId,id))return;return owner.store.getAsset(assetId);}
/** Never authorizes an owner's document, archive, arbitrary path, or other project. */
export function getReviewerExampleAsset(owner:StudioRuntime,id:string,assetId:string):Asset|undefined {
 const asset=approvedAsset(owner,id,assetId);return asset&&publicMedia(asset)?asset:undefined;
}
function featured(owner:StudioRuntime,id:string):Asset|undefined{
 const example=examples.find(item=>item.id===id);if(!example||!owner.store.getProject(id))return;
 for(const assetId of example.preferred){const asset=getReviewerExampleAsset(owner,id,assetId);if(asset)return asset;}
 const project=owner.store.getProject(id)!;for(const assetId of [project.coverAssetId,...owner.store.listTakes(id).filter(t=>t.favorite||t.id===project.selectedTakeId).flatMap(t=>t.assetIds)]){if(assetId){const asset=getReviewerExampleAsset(owner,id,assetId);if(asset)return asset;}}
 return owner.store.listAssets(id).find(asset=>publicMedia(asset)&&asset.metadata.operation!=='asset-poster');
}
export const reviewerMediaUrl=(exampleId:string,assetId:string,variant:string='original')=>`/api/reviewer/examples/${exampleId}/media/${assetId}?variant=${encodeURIComponent(variant)}`;
const mediaUrl=reviewerMediaUrl;
/** Reads only the prepared display index; never renders or writes owner media. */
export async function listReviewerExamples(owner:StudioRuntime):Promise<ReviewerExampleDescriptor[]>{
 const results=await Promise.all(examples.map(async (example):Promise<ReviewerExampleDescriptor|undefined>=>{const asset=featured(owner,example.id);if(!asset)return undefined;const display=await owner.explore.displays.describe(asset);const savedPoster=getReviewerExampleAsset(owner,example.id,String(asset.metadata.posterAssetId??''));
  return{id:example.id,name:example.name,description:example.description,kind:asset.kind as ReviewerExampleDescriptor['kind'],posterUrl:display.poster?mediaUrl(example.id,asset.id,'poster'):savedPoster?mediaUrl(example.id,savedPoster.id,'original'):asset.kind==='image'?mediaUrl(example.id,asset.id,'original'):'',previewUrl:asset.kind==='video'&&display.preview?mediaUrl(example.id,asset.id,'preview'):undefined};
 }));return results.filter((item):item is ReviewerExampleDescriptor=>!!item);
}
export async function resolveReviewerExampleMedia(owner:StudioRuntime,id:string,assetId:string,variant:string='original'):Promise<{asset:Asset;path:string;mimeType:string}>{
 if(!['poster','preview','mesh','original'].includes(variant)&&!/^file:[a-f0-9]{64}\.(?:webp|jpg|mp4|glb)$/.test(variant))throw new ProjectError('Unknown example media variant.',404);
 const asset=approvedAsset(owner,id,assetId);if(!asset)throw new ProjectError('Curated example media not found.',404);
 if(variant==='original'){if(!publicMedia(asset))throw new ProjectError('Curated production documents require a private remix.',404);return{asset,path:owner.media.path(asset),mimeType:asset.mimeType};}
 const display=await owner.explore.displays.describe(asset),rendition=variant==='poster'?display.poster:variant==='mesh'?display.mesh:display.preview;
 const permitted=[...(display.poster?.variants??[]),...(display.preview?[display.preview]:[]),...(display.mesh?[display.mesh]:[])];
 const selected=variant.startsWith('file:')?permitted.find(item=>path.posix.basename(new URL(item.url,'http://studio.invalid').pathname)===variant.slice(5)):rendition;
 if(selected){const file=path.posix.basename(new URL(selected.url,'http://studio.invalid').pathname);const mimeType=permitted.find(item=>item.url===selected.url)?.mimeType;if(!mimeType||!publicMedia(asset)&&!mimeType.startsWith('image/'))throw new ProjectError('Curated rendition is not registered.',404);const location=await owner.explore.displays.file(asset,display.presentationVersion,file);return{asset,path:location,mimeType};}
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
interface PreparedDisplayIndex {version:string;assetId:string;sourceSha256:string;posterSourceSha256?:string;preparedAt:string;optionsKey:string;presentation:AssetPresentation;files:{file:string;sha256:string;bytes:number}[];}
/** Copy cache bytes only after original and derivative integrity checks. The
 * imported media mapping is authoritative; owner IDs never remain in URLs. */
export async function copyReviewerExampleDisplays(owner:StudioRuntime,target:StudioRuntime,sourceProjectId:string,targetProjectId:string){
 if(!approved(sourceProjectId)||owner===target||owner.store.dataDir===target.store.dataDir)throw new ProjectError('Invalid curated display copy.',403);
 const imported=target.store.listAssets(targetProjectId),mapping=new Map<string,Asset>();
 for(const asset of imported){const provenance=asset.metadata.packageImport as {sourceProjectId?:string;sourceAssetId?:string}|undefined;if(provenance?.sourceProjectId===sourceProjectId&&provenance.sourceAssetId)mapping.set(provenance.sourceAssetId,asset);}
 const result={copied:0,skipped:0,failed:0,files:0};
 for(const [sourceId,asset]of mapping){const original=owner.store.getAsset(sourceId);if(!original||original.projectId!==sourceProjectId||original.sha256!==asset.sha256){result.skipped++;continue;}
  try{
   const sourceDirectory=owner.explore.displays.directory(original),targetDirectory=target.explore.displays.directory(asset);
   const raw=await readFile(path.join(sourceDirectory,'index.json'));if(raw.length>128*1024)throw new Error('Oversized display index');const record=JSON.parse(raw.toString('utf8')) as PreparedDisplayIndex;
   if(record.version!==DISPLAY_VERSION||record.assetId!==sourceId||record.sourceSha256!==original.sha256||!['ready','partial'].includes(record.presentation?.state)||!Array.isArray(record.files)||record.files.length>16)throw new Error('Invalid display index');
   const mediaFiles=new Map<string,Buffer>();
   for(const file of record.files){if(!/^[a-f0-9]{64}\.(?:webp|jpg|mp4|glb)$/.test(file.file)||!/^[a-f0-9]{64}$/.test(file.sha256)||!file.file.startsWith(file.sha256+'.')||!Number.isSafeInteger(file.bytes)||file.bytes<1||file.bytes>64*1024*1024)throw new Error('Invalid display file');const bytes=await readFile(path.join(sourceDirectory,file.file));if(bytes.length!==file.bytes||hash(bytes)!==file.sha256)throw new Error('Display file integrity mismatch');mediaFiles.set(file.file,bytes);}
   const sourcePrefix=`/api/display/${sourceId}/${original.sha256}/${DISPLAY_VERSION}/`,targetPrefix=`/api/display/${asset.id}/${asset.sha256}/${DISPLAY_VERSION}/`;
   const rewriteUrl=(url:string)=>{if(typeof url!=='string'||!url.startsWith(sourcePrefix)||!mediaFiles.has(url.slice(sourcePrefix.length)))throw new Error('Display URL does not match verified files');return targetPrefix+url.slice(sourcePrefix.length);};
   const sourceIdentity=(id:string,sha:string)=>{const mapped=mapping.get(id),source=owner.store.getAsset(id);if(!mapped||!source||source.projectId!==sourceProjectId||source.sha256!==sha||mapped.sha256!==sha)throw new Error('Display source is not an unchanged imported asset');return mapped.id;};
   const presentation:AssetPresentation={original:target.explore.displays.original(asset),presentationVersion:DISPLAY_VERSION,state:record.presentation.state};
   const prior=record.presentation;
   if(prior.poster){const variants=prior.poster.variants.map(variant=>({...variant,url:rewriteUrl(variant.url)}));presentation.poster={...prior.poster,url:rewriteUrl(prior.poster.url),sourceAssetId:sourceIdentity(prior.poster.sourceAssetId,prior.poster.sourceSha256),variants,srcSet:variants.map(variant=>`${variant.url} ${variant.width}w`).join(', ')};}
   if(prior.preview)presentation.preview={...prior.preview,url:rewriteUrl(prior.preview.url),sourceAssetId:sourceIdentity(prior.preview.sourceAssetId,prior.preview.sourceSha256)};
   if(prior.mesh)presentation.mesh={...prior.mesh,url:rewriteUrl(prior.mesh.url),sourceAssetId:sourceIdentity(prior.mesh.sourceAssetId,prior.mesh.sourceSha256)};
   if(prior.waveform)presentation.waveform=prior.waveform;
   const next:PreparedDisplayIndex={...record,assetId:asset.id,sourceSha256:asset.sha256,presentation};
   await mkdir(targetDirectory,{recursive:true});
   for(const [file,bytes]of mediaFiles){await writeFile(path.join(targetDirectory,file),bytes,{flag:'wx'}).catch(async error=>{if(error.code!=='EEXIST')throw error;const existing=await readFile(path.join(targetDirectory,file));if(hash(existing)!==hash(bytes))throw new Error('Target display integrity mismatch');});}
   const temporary=path.join(targetDirectory,'index-copy-'+randomUUID()+'.json');await writeFile(temporary,JSON.stringify(next));await rename(temporary,path.join(targetDirectory,'index.json'));result.copied++;result.files+=mediaFiles.size;
  }catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')result.skipped++;else result.failed++;}
 }
 if(result.copied){await mkdir(path.dirname(target.explore.displays.revisionFile),{recursive:true});await target.explore.displays.publishRevision();}
 return result;
}
export interface ReviewerRemixResult {projectId:string;sourceProjectId:string;idMap:Record<string,string>;}
const inFlight=new WeakMap<StudioRuntime,Map<string,Promise<ReviewerRemixResult>>>();
export async function remixReviewerExample(owner:StudioRuntime,target:StudioRuntime,id:string):Promise<Project>{const result=await remixReviewerExampleWithMapping(owner,target,id);return target.store.getProject(result.projectId)!;}
export function remixReviewerExampleWithMapping(owner:StudioRuntime,target:StudioRuntime,id:string):Promise<ReviewerRemixResult>{
 if(!approved(id))return Promise.reject(new ProjectError('Curated example not found.',404));
 if(owner===target||owner.store.dataDir===target.store.dataDir)return Promise.reject(new ProjectError('Remixes require a separate reviewer workspace.',403));
 let pending=inFlight.get(target);if(!pending){pending=new Map();inFlight.set(target,pending);}const existing=pending.get(id);if(existing)return existing;
 const task=copyExample(owner,target,id);pending.set(id,task);void task.finally(()=>pending!.delete(id)).catch(()=>{});return task;
}
async function copyExample(owner:StudioRuntime,target:StudioRuntime,id:string):Promise<ReviewerRemixResult>{
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
 const imported=await importProject(target.store,target.media,zip.toBuffer());const named={...imported,name:`${examples.find(e=>e.id===id)!.name} · your remix`};target.store.upsertProject(named);
 // The importer preserves entity order while allocating fresh IDs. Check that
 // contract against source identity and relationships instead of guessing IDs.
 const idMap:Record<string,string>={[id]:named.id,['showcase:'+id]:named.id};
 for(const asset of target.store.listAssets(named.id)){const origin=asset.metadata.packageImport as {sourceProjectId?:string;sourceAssetId?:string}|undefined;if(origin?.sourceProjectId===id&&origin.sourceAssetId)idMap[origin.sourceAssetId]=asset.id;}
 const pairs=<T extends {id:string;name:string}>(before:T[],after:T[])=>{if(before.length!==after.length)throw new ProjectError('Imported example relationship count changed.',409);before.forEach((item,index)=>{const mapped=after[index]!;if(item.name!==mapped.name)throw new ProjectError('Imported example relationship order changed.',409);idMap[item.id]=mapped.id;});};
 const copiedTakes=target.store.listTakes(named.id);pairs(clean.takes,copiedTakes);pairs(clean.recipes,target.store.listRecipes(named.id));pairs(clean.shots,target.store.listShots(named.id));pairs(clean.project.films??[],named.films??[]);pairs(clean.project.scenes??[],named.scenes??[]);
 (clean.project.scenes??[]).forEach((scene,index)=>scene.revisions.forEach((revision,n)=>{const mapped=named.scenes?.[index]?.revisions[n];if(!mapped||mapped.createdAt!==revision.createdAt)throw new ProjectError('Imported scene revision changed.',409);idMap[revision.id]=mapped.id;}));
 (clean.project.films??[]).forEach((film,index)=>film.choices.forEach((choice,n)=>{const mapped=named.films?.[index]?.choices[n];if(!mapped||mapped.label!==choice.label)throw new ProjectError('Imported film choice changed.',409);idMap[choice.id]=mapped.id;}));
 clean.takes.forEach((take,index)=>{const mapped=copiedTakes[index]!;if(take.createdAt!==mapped.createdAt||take.modelId!==mapped.modelId||take.assetIds.some((assetId,n)=>idMap[assetId]!==mapped.assetIds[n])||(take.parentTakeId&&idMap[take.parentTakeId]!==mapped.parentTakeId)||(take.sourceAssetId&&idMap[take.sourceAssetId]!==mapped.sourceAssetId))throw new ProjectError('Imported take lineage changed.',409);});
 await copyReviewerExampleDisplays(owner,target,id,named.id);return{projectId:named.id,sourceProjectId:id,idMap};
}
