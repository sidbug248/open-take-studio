import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { mp4Metadata } from '../server/input-validation.ts';
import type { ProjectDetail } from '../shared/types.ts';

const projectId=process.argv[2];if(!projectId)throw new Error('Pass a project ID. This script only reads existing work.');
const base='http://127.0.0.1:4310';
const detail=await (await fetch(`${base}/api/projects/${projectId}`)).json() as ProjectDetail;
if(!detail.project)throw new Error('Project not found');
const directory=path.resolve('artifacts/validation');await mkdir(directory,{recursive:true});
const assets=[];
for(const asset of detail.assets){
  const res=await fetch(base+asset.url+'?download=1');if(!res.ok)throw new Error(`Download ${res.status}`);
  const bytes=Buffer.from(await res.arrayBuffer());const digest=createHash('sha256').update(bytes).digest('hex');
  if(digest!==asset.sha256)throw new Error('Download did not match stored media');
  await writeFile(path.join(directory,asset.fileName),bytes);
  const info:Record<string,unknown>={id:asset.id,name:asset.name,kind:asset.kind,bytes:bytes.length,sha256:digest,downloadMatches:true,contentDisposition:res.headers.get('content-disposition')};
  if(asset.mimeType==='video/mp4'){
    info.video=mp4Metadata(bytes);
    // Read MP4 handler boxes; an actual sound media handler confirms an audio track.
    const handlers:string[]=[];
    const walk=(start:number,end:number)=>{for(let p=start;p+8<=end;){let size=bytes.readUInt32BE(p);const type=bytes.toString('ascii',p+4,p+8);let head=8;if(size===1){if(p+16>end)break;size=Number(bytes.readBigUInt64BE(p+8));head=16;}if(!size)size=end-p;if(size<head||p+size>end)break;if(type==='hdlr'&&p+head+12<=p+size)handlers.push(bytes.toString('ascii',p+head+8,p+head+12));if(['moov','trak','mdia'].includes(type))walk(p+head,p+size);p+=size;}};
    walk(0,bytes.length);info.mediaHandlers=handlers;info.hasAudioTrack=handlers.includes('soun');
  }
  assets.push(info);
}
const receipt={checkedAt:new Date().toISOString(),project:{id:detail.project.id,name:detail.project.name,selectedTakeId:detail.project.selectedTakeId},jobs:detail.jobs.map(j=>({id:j.id,takeId:j.takeId,modelId:j.modelId,provider:j.provider,requestId:j.requestId,state:j.state,idempotencyKey:j.idempotencyKey,createdAt:j.createdAt,submittedAt:j.submittedAt,completedAt:j.completedAt,errorType:j.errorType})),takes:detail.takes.map(t=>({id:t.id,parentTakeId:t.parentTakeId,sourceAssetId:t.sourceAssetId,inputAssetIds:t.inputAssetIds,settings:t.settings,status:t.status,provenance:t.provenance})),assets};
await writeFile(path.join(directory,'router-live-receipt.json'),JSON.stringify(receipt,null,2));
const exportResponse=await fetch(`${base}/api/projects/${projectId}/export`);if(!exportResponse.ok)throw new Error('Export failed');
const packageBytes=Buffer.from(await exportResponse.arrayBuffer());await writeFile(path.join(directory,'coastal-light.opentake.zip'),packageBytes);
console.log(JSON.stringify({projectId,assets,jobs:receipt.jobs.map(j=>({modelId:j.modelId,state:j.state,requestId:j.requestId})),packageBytes:packageBytes.length,receipt:path.join(directory,'router-live-receipt.json')},null,2));
