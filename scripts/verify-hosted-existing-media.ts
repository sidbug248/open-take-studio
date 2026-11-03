/** Completes non-inference hosted acceptance after the preserved credit block. */
import dotenv from 'dotenv';
import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import AdmZip from 'adm-zip';
import type {Asset,ProjectDetail,Take,Project} from '../shared/types.ts';
dotenv.config({path:path.resolve('.env.hosted'),override:true,quiet:true});
const base='https://open-take-studio.onrender.com',password=process.env.OTS_OWNER_PASSWORD??process.env.OTS_OWNER_PASSWORD_PLAINTEXT;
if(!password)throw new Error('Private hosted credential is not configured');
const directory=path.resolve('artifacts/deployment-authoring/run-1793725713545'),receiptPath=path.join(directory,'existing-media-receipt.json');
const projectId='98955f31-517d-4b58-b444-c8a5addd2587',blockedJobId='4df3b3e4-7258-47f8-8dd7-c622cc7901ea';
const sourceProjectId='1bec0508-6565-4cf8-9666-f07d224351a1',sourceAssetId='e5ebae2e-4573-49e8-96af-61b7c472fa2c';
const verifyOnly=process.argv.includes('--verify-only');let cookie='';
const receipt:any=await readFile(receiptPath,'utf8').then(JSON.parse).catch(()=>({startedAt:new Date().toISOString(),origin:base,projectId,blockedJobId,sourceProjectId,sourceAssetId,events:[]}));
const save=()=>writeFile(receiptPath,JSON.stringify(receipt,null,2));
const note=async(event:string,details:Record<string,unknown>={})=>{const entry={at:new Date().toISOString(),event,...details};receipt.events.push(entry);await save();console.log(JSON.stringify(entry));};
async function request(route:string,options:RequestInit={}){const headers=new Headers(options.headers);headers.set('Origin',base);if(cookie)headers.set('Cookie',cookie);const response=await fetch(base+route,{...options,headers,redirect:'manual',signal:AbortSignal.timeout(120000)});if(!response.ok){let message=(await response.text()).slice(0,1000);for(const secret of[password,cookie,process.env.COMFY_API_KEY])if(secret)message=message.split(secret).join('[redacted]');throw new Error(`${options.method??'GET'} ${route}: HTTP ${response.status}: ${message}`);}return response;}
async function json<T>(route:string,method='GET',body?:unknown){return(await request(route,{method,...(body===undefined?{}:{headers:{'content-type':'application/json'},body:JSON.stringify(body)})})).json() as Promise<T>;}
async function login(){const r=await request('/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({password})});const value=r.headers.getSetCookie().find(v=>v.startsWith('__Host-ots_session='));if(!value)throw new Error('Owner session cookie missing');cookie=value.split(';')[0];}
async function logout(){await fetch(base+'/auth/logout',{method:'POST',headers:{Origin:base,Cookie:cookie},redirect:'manual'});cookie='';}
const hash=(bytes:Buffer)=>createHash('sha256').update(bytes).digest('hex');
try{
 await login();let detail=await json<ProjectDetail>(`/api/projects/${projectId}`);
 const blocked=detail.jobs.find(job=>job.id===blockedJobId);if(blocked?.state!=='BLOCKED'||blocked.errorType!=='insufficient_credits'||blocked.attempts!==1)throw new Error('Expected the one preserved insufficient-credit job');
 if(!verifyOnly){
  await json(`/api/projects/${projectId}`,'PATCH',{description:'Hosted deployment check: one FLUX3 Router attempt was blocked by insufficient_credits; no new image was generated. The separately labelled imported Liquid daylight image verifies upload, editing, download, fresh-session reopen and project export/import. The original project and blocked request remain preserved.'});
  const source=await json<ProjectDetail>(`/api/projects/${sourceProjectId}`),original=source.assets.find(asset=>asset.id===sourceAssetId)!;if(!original)throw new Error('Original source image is missing');
  const bytes=Buffer.from(await(await request(original.url)).arrayBuffer());if(hash(bytes)!==original.sha256)throw new Error('Original hosted source failed integrity check');
  let copy=detail.assets.find(asset=>asset.metadata.deploymentProofSourceAssetId===sourceAssetId);
  if(!copy){const form=new FormData();form.set('file',new Blob([bytes],{type:original.mimeType}),'liquid-daylight-imported-example.png');form.set('name','Liquid daylight · imported existing image');form.set('provenance','imported');form.set('metadata',JSON.stringify({operation:'deployment-existing-media-proof',deploymentProofSourceAssetId:sourceAssetId,originalProjectId:sourceProjectId,originalSha256:original.sha256,originalProvenance:original.provenance,description:'Existing previously generated image copied to validate hosted upload; not a new hosted generation.'}));copy=await(await request(`/api/projects/${projectId}/assets`,{method:'POST',body:form})).json() as Asset;}
  if(copy.sha256!==original.sha256||copy.provenance!=='imported')throw new Error('Imported image did not preserve exact bytes and provenance');
  let take=detail.takes.find(take=>take.assetIds.includes(copy!.id));if(!take)take=await json<Take>(`/api/projects/${projectId}/takes/import`,'POST',{assetId:copy.id,name:'Imported example · existing Liquid daylight'});
  await json(`/api/takes/${take.id}`,'PATCH',{favorite:true,name:'Imported example · Liquid daylight · saved hosted review'});
  await json(`/api/projects/${projectId}`,'PATCH',{selectedTakeId:take.id,coverAssetId:copy.id});
  receipt.importedAssetId=copy.id;receipt.importedTakeId=take.id;receipt.sha256=copy.sha256;
  await note('existing-image-imported-and-edited',{assetId:copy.id,takeId:take.id,sha256:copy.sha256,provenance:'imported',newInference:false});
 }
 await logout();await login();detail=await json<ProjectDetail>(`/api/projects/${projectId}`);
 const asset=detail.assets.find(asset=>asset.id===receipt.importedAssetId),take=detail.takes.find(take=>take.id===receipt.importedTakeId);
 if(!asset||!take||take.status!=='IMPORTED'||!take.favorite||detail.project.selectedTakeId!==take.id||asset.sha256!==receipt.sha256)throw new Error('Edited imported media state did not reopen');
 const bytes=Buffer.from(await(await request(asset.url+'?download=1')).arrayBuffer());if(hash(bytes)!==receipt.sha256)throw new Error('Imported asset download hash differs');await writeFile(path.join(directory,'Imported-existing-Liquid-daylight.png'),bytes);
 const zipBytes=Buffer.from(await(await request(`/api/projects/${projectId}/export`)).arrayBuffer()),zip=new AdmZip(zipBytes),manifest=JSON.parse(zip.readAsText('manifest.json'));
 const packaged=manifest.jobs.find((job:any)=>job.id===blockedJobId);if(packaged?.state!=='BLOCKED'||packaged.attempts!==1||packaged.errorType!=='insufficient_credits')throw new Error('Export lost the blocked execution');
 const media=zip.getEntry('media/'+asset.fileName);if(!media||hash(media.getData())!==receipt.sha256)throw new Error('Export media hash differs');
 for(const secret of[password,cookie,process.env.COMFY_API_KEY].filter(Boolean) as string[])if(zip.getEntries().some(entry=>!entry.isDirectory&&entry.getData().includes(Buffer.from(secret))))throw new Error('Secret boundary check failed');
 const packagePath=path.join(directory,'Hosted-existing-media-and-blocked-history.opentake.zip');await writeFile(packagePath,zipBytes);
 if(!verifyOnly&&!receipt.roundtripProjectId){const form=new FormData();form.set('file',new Blob([zipBytes],{type:'application/zip'}),'Hosted-existing-media-and-blocked-history.opentake.zip');const imported=await(await request('/api/projects/import',{method:'POST',body:form})).json() as Project;receipt.roundtripProjectId=imported.id;await save();await json(`/api/projects/${imported.id}`,'PATCH',{name:'Hosted verification · reopened package'});}
 const restored=await json<ProjectDetail>(`/api/projects/${receipt.roundtripProjectId}`);const restoredAsset=restored.assets.find(value=>value.sha256===receipt.sha256),restoredJob=restored.jobs.find(value=>value.errorType==='insufficient_credits') as any;
 if(!restoredAsset||!restoredJob?.archived||restoredJob.state!=='BLOCKED'||restoredJob.attempts!==1)throw new Error('Imported package did not retain archived blocked history');
 const restoredBytes=Buffer.from(await(await request(restoredAsset.url)).arrayBuffer());if(hash(restoredBytes)!==receipt.sha256)throw new Error('Roundtrip media bytes differ');
 receipt.completedAt=new Date().toISOString();receipt.packagePath=packagePath;receipt.packageBytes=zipBytes.length;
 await note(verifyOnly?'post-restart-existing-media-verified':'hosted-non-inference-journey-verified',{projectId,roundtripProjectId:receipt.roundtripProjectId,blockedJobAttempts:1,importedMediaSha256:receipt.sha256,scope:'Imported existing image upload/edit/download/new-session reopen/export/import. New generation remains blocked.'});await logout();
}catch(error){receipt.error=error instanceof Error?error.message:'Hosted existing-media check failed';await save();console.error(JSON.stringify({error:receipt.error,receiptPath}));process.exitCode=1;}
