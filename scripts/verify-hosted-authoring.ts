/** Hosted HTTP acceptance test. Reads secrets only from ignored .env.hosted.
 * No generation occurs without --generate. Resume with the printed receipt path
 * using --resume=<absolute-path>; intended generation keeps one client identity.
 * Owner password/cookies/API keys never enter the receipt or console. */
import dotenv from 'dotenv';
import path from 'node:path';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
import AdmZip from 'adm-zip';
import type {Asset,Job,Project,ProjectDetail,Take} from '../shared/types.ts';

dotenv.config({path:path.resolve('.env.hosted'),override:true,quiet:true});
const flags=process.argv.slice(2),urlFlag=flags.find(value=>value.startsWith('--url='))?.slice(6);
const supplied=urlFlag??process.env.OTS_PUBLIC_ORIGIN;
if(!supplied)throw new Error('Configure OTS_PUBLIC_ORIGIN in the ignored project .env.hosted, or supply --url=https://the-authorized-host. No generation was submitted.');
const origin=new URL(supplied);
if(origin.protocol!=='https:'||origin.username||origin.password||origin.pathname!=='/'||origin.search||origin.hash)throw new Error('The hosted test requires one HTTPS origin without credentials or a path');
const password=process.env.OTS_OWNER_PASSWORD??process.env.OTS_OWNER_PASSWORD_PLAINTEXT;
if(!password)throw new Error('Configure OTS_OWNER_PASSWORD privately in the ignored project .env.hosted. Do not put it in command arguments or chat.');
const base=origin.origin,artifactsRoot=path.resolve('artifacts/deployment-authoring');
const resume=flags.find(value=>value.startsWith('--resume='))?.slice(9);
const receiptPath=resume?path.resolve(resume):path.join(artifactsRoot,`run-${Date.now()}`,'receipt.json');
if(!receiptPath.startsWith(artifactsRoot+path.sep))throw new Error('Receipt must be within artifacts/deployment-authoring');
await mkdir(path.dirname(receiptPath),{recursive:true});
interface Receipt {origin:string;startedAt:string;clientRequestId:string;projectId?:string;takeId?:string;jobId?:string;requestId?:string;state?:string;events:Record<string,unknown>[];outputs?:Record<string,unknown>[];completedAt?:string;generationSubmitted?:boolean;error?:string;}
const receipt:Receipt=resume?JSON.parse(await readFile(receiptPath,'utf8')):{origin:base,startedAt:new Date().toISOString(),clientRequestId:`hosted-smoke-${randomUUID()}`,events:[]};
if(receipt.origin!==base)throw new Error('The receipt belongs to a different hosted origin');
let cookie='';
const safe=(value:unknown)=>{let text=value instanceof Error?value.message:String(value);for(const secret of[password,cookie,process.env.COMFY_API_KEY,process.env.OTS_OWNER_PASSWORD_HASH])if(secret)text=text.split(secret).join('[redacted]');return text.replace(/comfyui-[A-Za-z0-9_-]+/g,'[redacted]').slice(0,1200);};
const save=()=>writeFile(receiptPath,JSON.stringify(receipt,null,2));
const note=async(event:string,details:Record<string,unknown>={})=>{const observation={at:new Date().toISOString(),event,...details};receipt.events.push(observation);await save();console.log(JSON.stringify(observation));};
async function request(route:string,options:RequestInit={},authenticated=true){
  if(!route.startsWith('/')||route.startsWith('//'))throw new Error('Expected a same-origin application path');
  const headers=new Headers(options.headers);headers.set('Origin',base);if(authenticated&&cookie)headers.set('Cookie',cookie);
  return fetch(base+route,{...options,headers,redirect:'manual',signal:AbortSignal.timeout(120000)});
}
async function json<T>(route:string,method='GET',body?:unknown):Promise<T>{const response=await request(route,{method,...(body===undefined?{}:{headers:{'content-type':'application/json'},body:JSON.stringify(body)})});if(!response.ok)throw new Error(`${method} ${route}: HTTP ${response.status} ${safe(await response.text())}`);return response.json() as Promise<T>;}
async function login(){
  const response=await request('/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({password})},false);
  if(!response.ok)throw new Error(`Owner sign-in failed (HTTP ${response.status}); no credential content is recorded`);
  const header=response.headers.getSetCookie().find(value=>value.startsWith('__Host-ots_session='));
  if(!header||!/(?:^|;)\s*HttpOnly(?:;|$)/i.test(header)||!/(?:^|;)\s*Secure(?:;|$)/i.test(header)||!/(?:^|;)\s*SameSite=Lax(?:;|$)/i.test(header))throw new Error('Owner session cookie is missing required security attributes');
  cookie=header.split(';')[0];const session=await json<{authenticated:boolean;role:string;canGenerate:boolean}>('/api/auth/session');
  if(!session.authenticated||session.role!=='workspace-owner'||!session.canGenerate)throw new Error('Hosted owner permission was not established');
}
try{
  const health=await request('/api/health',{},false);if(!health.ok)throw new Error(`Hosted health HTTP ${health.status}`);
  for(const route of['/api/projects','/api/catalogue','/.env','/data/studio.sqlite']){const r=await request(route,{headers:{Accept:'application/json'}},false);if(![401,403,404].includes(r.status))throw new Error(`Unauthenticated boundary failed for ${route}: HTTP ${r.status}`);}
  await login();await note('hosted-owner-authenticated',{publicPrivateBoundary:'passed',cookieSecurity:'Secure, HttpOnly, SameSite=Lax'});
  const crossOrigin=await fetch(base+'/api/projects',{method:'POST',headers:{Origin:'https://cross-origin.invalid',Cookie:cookie,'content-type':'application/json'},body:JSON.stringify({name:'Must not be created'}),redirect:'manual'});
  if(crossOrigin.status!==403)throw new Error(`Cross-origin mutation was not rejected (HTTP ${crossOrigin.status})`);
  await note('cross-origin-mutation-rejected');
  if(!flags.includes('--generate')&&!receipt.jobId){await note('read-only-checks-completed',{generationSubmitted:false});await request('/auth/logout',{method:'POST'});cookie='';console.log(JSON.stringify({receipt:receiptPath,status:'Ready for authorized --generate'}));process.exit(0);}
  if(!receipt.projectId){const project=await json<Project>('/api/projects','POST',{name:'Hosted studio · First light',description:'Deployment acceptance: one original image generated through Comfy Router, downloaded, reopened after a new owner session, and exported with exact media hashes.'});receipt.projectId=project.id;await note('project-created',{projectId:project.id});}
  const body={projectId:receipt.projectId,modelId:'bfl/flux-3-image',prompt:'An original editorial still life of a sculptural amber glass vessel on pale limestone at dawn. A single ribbon of warm light crosses the translucent surface; soft charcoal background, restrained cinematic composition, fine realistic materials. No logos, no lettering, no people.',settings:{aspect_ratio:'1:1',resolution:'768sq',grounding:false,safety_tolerance:2,version:'latest'},inputAssetIds:{},name:'First light · hosted Router proof',clientRequestId:receipt.clientRequestId};
  if(!receipt.jobId){receipt.generationSubmitted=true;await save();const admitted=await json<{job:Job;take:Take}>('/api/generate','POST',body);receipt.jobId=admitted.job.id;receipt.takeId=admitted.take.id;await note('generation-admitted',{jobId:receipt.jobId,takeId:receipt.takeId,modelId:body.modelId});}
  let detail:ProjectDetail|undefined,job:Job|undefined,last='';
  for(let count=0;count<300;count++){
    detail=await json<ProjectDetail>(`/api/projects/${receipt.projectId}`);job=detail.jobs.find(value=>value.id===receipt.jobId);if(!job)throw new Error('Saved generation is missing from its project');
    receipt.requestId=job.requestId;receipt.state=job.state;
    if(job.state!==last){await note('generation-state',{state:job.state,requestId:job.requestId,attempts:job.attempts});last=job.state;}
    if(['COMPLETED','FAILED','BLOCKED','EXPIRED'].includes(job.state))break;
    await new Promise(resolve=>setTimeout(resolve,3000));
  }
  if(!job||job.state!=='COMPLETED')throw new Error(`Generation is ${job?.state??'unknown'}: ${safe(job?.errorMessage??'Resume this receipt; do not create another submission.')}`);
  const take=detail!.takes.find(value=>value.id===receipt.takeId)!;
  const assets=take.assetIds.map(id=>detail!.assets.find(asset=>asset.id===id)!).filter(Boolean);if(!assets.some(asset=>asset.kind==='image'))throw new Error('Generation completed without a saved image');
  receipt.outputs=[];
  for(const asset of assets){const response=await request(asset.url);if(!response.ok)throw new Error(`Saved asset download HTTP ${response.status}`);const bytes=Buffer.from(await response.arrayBuffer());if(bytes.length!==asset.size||createHash('sha256').update(bytes).digest('hex')!==asset.sha256)throw new Error('Downloaded media does not match persisted hash');const file=path.join(path.dirname(receiptPath),`${asset.id}.${asset.mimeType==='image/jpeg'?'jpg':'png'}`);await writeFile(file,bytes);receipt.outputs.push({assetId:asset.id,name:asset.name,sha256:asset.sha256,bytes:asset.size,file});}
  await json(`/api/projects/${receipt.projectId}`,'PATCH',{selectedTakeId:take.id,coverAssetId:assets[0].id});
  const replay=await json<{job:Job}>('/api/generate','POST',body);if(replay.job.id!==receipt.jobId||replay.job.requestId!==receipt.requestId)throw new Error('Exact-intent replay created or selected a different execution');
  await request('/auth/logout',{method:'POST'});cookie='';await login();
  const reopened=await json<ProjectDetail>(`/api/projects/${receipt.projectId}`);if(reopened.project.selectedTakeId!==take.id||!reopened.takes.some(value=>value.id===take.id&&value.status==='COMPLETED'))throw new Error('Project state did not survive a new owner session');
  for(const original of assets){const restored=reopened.assets.find(asset=>asset.id===original.id);if(restored?.sha256!==original.sha256)throw new Error('Reopened source media metadata changed');}
  await note('project-reopened-in-fresh-owner-session',{projectId:receipt.projectId,takeId:take.id,idempotencyReplay:'same job and Router request'});
  const exported=await request(`/api/projects/${receipt.projectId}/export`);if(!exported.ok)throw new Error(`Project export HTTP ${exported.status}`);const zipBytes=Buffer.from(await exported.arrayBuffer()),zip=new AdmZip(zipBytes),manifest=JSON.parse(zip.readAsText('manifest.json'));
  if(manifest.project?.id!==receipt.projectId||!manifest.jobs.some((j:Job)=>j.id===receipt.jobId&&j.requestId===receipt.requestId))throw new Error('Export does not retain project and execution history');
  for(const asset of assets){const packaged=zip.getEntry(`media/${asset.fileName}`);if(!packaged||createHash('sha256').update(packaged.getData()).digest('hex')!==asset.sha256)throw new Error('Exported media hash differs from saved output');}
  const secrets=[password,cookie,process.env.COMFY_API_KEY].filter((value):value is string=>!!value).map(value=>Buffer.from(value));
  if(zip.getEntries().some(entry=>!entry.isDirectory&&secrets.some(secret=>entry.getData().includes(secret))))throw new Error('Secret boundary check failed; package was not written');
  const packagePath=path.join(path.dirname(receiptPath),'Hosted-first-light.opentake.zip');await writeFile(packagePath,zipBytes);
  receipt.completedAt=new Date().toISOString();await note('hosted-authoring-verified',{projectId:receipt.projectId,jobId:receipt.jobId,requestId:receipt.requestId,packagePath,packageBytes:zipBytes.length,verification:'HTTP actual generation + download + fresh-session reopen + package hash checks; browser interaction not claimed'});
  await request('/auth/logout',{method:'POST'});cookie='';console.log(JSON.stringify({receipt:receiptPath,completed:true}));
}catch(error){receipt.error=safe(error);await save();console.error(JSON.stringify({error:receipt.error,receipt:receiptPath,projectId:receipt.projectId,jobId:receipt.jobId,requestId:receipt.requestId}));process.exitCode=1;}
