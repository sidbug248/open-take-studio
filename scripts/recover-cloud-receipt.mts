/** Offline inspection of recovered bytes; no generation or model calls. */
import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {mp4Metadata} from '../server/input-validation.ts';
const root=path.resolve('imports/comfy-cloud');
const receipt=JSON.parse(await readFile(path.join(root,'recovery-receipt.json'),'utf8'));
const assets=JSON.parse(await readFile(path.join(root,'source-assets.json'),'utf8'));
const jobs=JSON.parse(await readFile(path.join(root,'source-jobs.json'),'utf8'));
const imageWorkflow=JSON.parse(await readFile(path.join(root,'workflows','Open Take Studio — 01 Image Draft.json'),'utf8'));
const videoWorkflow=JSON.parse(await readFile(path.join(root,'workflows','Open Take Studio — 02 Image to Video.json'),'utf8'));
const videoBytes=await readFile(path.join(root,receipt.assets[0].localPath));
type Box={type:string;offset:number;body:number;end:number};
function boxes(start:number,end:number):Box[]{const list:Box[]=[];for(let p=start;p+8<=end;){let length=videoBytes.readUInt32BE(p),header=8;if(length===1){length=Number(videoBytes.readBigUInt64BE(p+8));header=16;}if(length===0)length=end-p;if(length<header||p+length>end)break;list.push({type:videoBytes.toString('latin1',p+4,p+8),offset:p,body:p+header,end:p+length});p+=length;}return list;}
const moov=boxes(0,videoBytes.length).find(b=>b.type==='moov')!;
const movieChildren=boxes(moov.body,moov.end);
const udta=movieChildren.find(b=>b.type==='udta');
const meta=udta&&boxes(udta.body,udta.end).find(b=>b.type==='meta');
const metadata:Record<string,unknown>={};
if(meta){const children=boxes(meta.body+4,meta.end);const keys=children.find(b=>b.type==='keys'),ilst=children.find(b=>b.type==='ilst');const names:string[]=[];
 if(keys){const count=videoBytes.readUInt32BE(keys.body+4);let cursor=keys.body+8;for(let i=0;i<count&&cursor+8<=keys.end;i++){const size=videoBytes.readUInt32BE(cursor);names.push(videoBytes.toString('utf8',cursor+8,cursor+size));cursor+=size;}}
 if(ilst)for(const item of boxes(ilst.body,ilst.end)){const index=videoBytes.readUInt32BE(item.offset+4);const data=boxes(item.body,item.end).find(b=>b.type==='data');if(!data)continue;const text=videoBytes.toString('utf8',data.body+8,data.end);try{metadata[names[index-1]??String(index)]=JSON.parse(text);}catch{metadata[names[index-1]??String(index)]=text;}}
}
await writeFile(path.join(root,'media','OpenTakeStudio','video_draft','mara_i2v_00001_.mp4.metadata.json'),JSON.stringify(metadata,null,2));
const tracks=[];
for(const track of movieChildren.filter(b=>b.type==='trak')){const mdia=boxes(track.body,track.end).find(b=>b.type==='mdia');if(!mdia)continue;const children=boxes(mdia.body,mdia.end);const hdlr=children.find(b=>b.type==='hdlr');const kind=hdlr?videoBytes.toString('ascii',hdlr.body+8,hdlr.body+12):'unknown';const minf=children.find(b=>b.type==='minf');const stbl=minf&&boxes(minf.body,minf.end).find(b=>b.type==='stbl');const stsd=stbl&&boxes(stbl.body,stbl.end).find(b=>b.type==='stsd');const sample=stsd&&boxes(stsd.body+8,stsd.end)[0];tracks.push({handler:kind,codec:sample?.type,...(kind==='soun'&&sample?{channels:videoBytes.readUInt16BE(sample.offset+24),sampleRate:videoBytes.readUInt32BE(sample.offset+32)/65536}:{})});}
const actualVideoGraph=metadata.prompt as Record<string,any>;
if(!actualVideoGraph)throw new Error('Video contains no execution prompt graph');
const loadEntry=Object.entries(actualVideoGraph).find(([,node]:any)=>node.class_type==='LoadImage');
const firstFrameName=loadEntry?.[1]?.inputs?.image;
const matching=receipt.assets.find((a:any)=>a.filename===firstFrameName);
const h3=Object.entries(actualVideoGraph).find(([,node]:any)=>node.class_type==='MiniMaxH3ImageToVideo');
if(!matching||!loadEntry||h3?.[1]?.inputs?.first_frame?.[0]!==loadEntry[0])throw new Error('The video execution graph did not establish a matching first frame');
receipt.version=1;receipt.kind='imported-comfy-cloud-reference-artifacts';receipt.workspaceName='NYC Build Night';receipt.workspaceNameEvidence='User identified workspace; workspace ID independently observed in Cloud media endpoints';
receipt.sourceDocumentation='https://docs.comfy.org/development/cloud/api-reference#downloading-outputs';
receipt.relationships=[{type:'image-to-video',sourceCloudAssetId:matching.id,sourceOriginalFilename:matching.originalFilename,sourceLocalSha256:matching.sha256,sourceCloudStorageName:firstFrameName,videoCloudAssetId:receipt.assets[0].id,videoOriginalFilename:receipt.assets[0].originalFilename,evidence:'Actual downloaded MP4 embedded prompt graph: MiniMaxH3ImageToVideo.first_frame links to LoadImage whose image field matches the first PNG Cloud storage name',verified:true}];
for(const asset of receipt.assets){const source=assets.find((a:any)=>a.id===asset.id);if(!source)throw new Error('Source asset metadata missing');const job=jobs.find((j:any)=>j.id===source.job_id);const image=asset.contentType.startsWith('image/');asset.provenance='imported';asset.sourceWorkflow={name:image?'Open Take Studio — 01 Image Draft':'Open Take Studio — 02 Image to Video',id:image?imageWorkflow.id:videoWorkflow.id,url:`https://cloud.comfy.org/#${image?imageWorkflow.id:videoWorkflow.id}`,exportSnapshot:image?'saved UI workflow':'current UI workflow (unsaved changes indicator visible during export); actual execution inputs separately embedded in media'};asset.sourceExecution={id:source.job_id,status:job?.status??'unknown',createdAt:job?.create_time?new Date(job.create_time).toISOString():null,startedAt:job?.execution_start_time?new Date(job.execution_start_time).toISOString():null,completedAt:job?.execution_end_time?new Date(job.execution_end_time).toISOString():null,executor:job?.executor??null};asset.sourceCreatedAt=source.created_at;asset.sourceMetadata=source.metadata??{};asset.stableSourceEndpoint=`https://cloud.comfy.org/api/view?id=${asset.id}`;asset.isRouterGeneration=false;
 const bytes=await readFile(path.join(root,asset.localPath));if(createHash('sha256').update(bytes).digest('hex')!==asset.sha256)throw new Error('Stored file checksum changed');
 const embedded=image?JSON.parse(await readFile(path.join(root,asset.metadataPath),'utf8')).prompt:actualVideoGraph;
 const nodes=Object.values(embedded) as any[];const promptNode=nodes.find(n=>image?n.class_type==='CLIPTextEncode'&&n._meta?.title?.includes('positive'):n.class_type==='MiniMaxH3ImageToVideo')??nodes.find(n=>image?n.class_type==='CLIPTextEncode':false);asset.prompt=image?promptNode?.inputs?.text:promptNode?.inputs?.prompt;
 const model=nodes.find(n=>n.class_type==='UNETLoader');asset.model={name:image?'Z-Image Turbo':'MiniMax H3',source:'ComfyUI workflow checkpoint',checkpoint:model?.inputs?.unet_name??null,routerModelId:null};
 const sampler=nodes.find(n=>n.class_type==='KSampler');const latent=nodes.find(n=>n.class_type==='EmptySD3LatentImage');asset.settingsSnapshot=image?{seed:sampler?.inputs?.seed,steps:sampler?.inputs?.steps,cfg:sampler?.inputs?.cfg,sampler_name:sampler?.inputs?.sampler_name,scheduler:sampler?.inputs?.scheduler,denoise:sampler?.inputs?.denoise,width:latent?.inputs?.width??1280,height:latent?.inputs?.height??720,batch_size:latent?.inputs?.batch_size??4}:{seed:nodes.find(n=>n.class_type==='RandomNoise')?.inputs?.noise_seed,fps:nodes.find(n=>n.class_type==='CreateVideo')?.inputs?.fps};
 if(!image){asset.metadataPath='media/OpenTakeStudio/video_draft/mara_i2v_00001_.mp4.metadata.json';asset.dimensions=mp4Metadata(videoBytes);asset.tracks=tracks;asset.inputCloudAssetIds={first_frame:matching.id};asset.sourceAssetSha256=matching.sha256;}
}
receipt.validation={allFileChecksumsVerified:true,images:receipt.assets.filter((a:any)=>a.contentType.startsWith('image/')).length,videos:1,workflowExports:receipt.workflows.length,videoActualMetadata:mp4Metadata(videoBytes),tracks,sourceImageRelationshipVerified:true,noGenerationSubmitted:true,signedUrlsSaved:false,configuredKeyIncludedInCopies:false};
await writeFile(path.join(root,'recovery-receipt.json'),JSON.stringify(receipt,null,2));
console.log(JSON.stringify({assets:receipt.assets.length,workflows:receipt.workflows.length,video:receipt.validation.videoActualMetadata,tracks,sourceImage:matching.originalFilename,sourceImageVerified:true,executionIds:receipt.assets.map((a:any)=>a.sourceExecution.id).filter((v:any,i:number,a:any[])=>a.indexOf(v)===i),workflowIds:[imageWorkflow.id,videoWorkflow.id]},null,2));
