/** Read-only recovery of the independently executed Cloud editor demonstration. */
import '../server/config.ts';
import { Comfy } from '@comfyorg/sdk';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { rejectWorkflowSecrets } from '../server/workflow-schema.ts';
const finish=process.argv.includes('--finish'),reopen=process.argv.includes('--reopen');
const directory=path.resolve('artifacts/native-workflows/'+(finish?'cloud-editor-finish':'cloud-editor')+(reopen?'-reopen':''));await mkdir(directory,{recursive:true});
const filename=finish?'image_finish_cloud_v1_edit':'375e409d8fbeac1f22ce23b235607d091fc90aab5bf0ba0ca2a79e82df6ee1c9.png';
const response=await fetch('https://cloud.comfy.org/api/assets?include_public=false&limit=100&sort=created_at&tags_any=output,temp&tags_none=missing',{headers:{'X-API-Key':process.env.COMFY_API_KEY??''},signal:AbortSignal.timeout(45000)});
if(!response.ok)throw new Error(`Cloud asset index HTTP ${response.status}`);
const raw=await response.json() as any,list=Array.isArray(raw)?raw:Object.values(raw).find(Array.isArray) as any[];
const source=list?.find(item=>JSON.stringify(item).includes(filename));if(!source?.job_id)throw new Error('The selected Cloud editor output was not found in the current workspace asset history');
const client=new Comfy({apiKey:process.env.COMFY_API_KEY,clientInfo:'open-take-studio/editor-recovery'}),job=await client.jobs.get(source.job_id),workflow=await job.getWorkflow();
if(job.status!=='succeeded')throw new Error(`Cloud editor execution status is ${job.status}`);
rejectWorkflowSecrets(workflow);
await writeFile(path.join(directory,`cloud-executed-workflow.${workflow.format}.json`),JSON.stringify(workflow,null,2));
const outputs=[];
for(const output of job.outputs){const bytes=Buffer.from(await output.toBytes({timeoutMs:120000}));const safe=path.basename(output.name).replace(/[^A-Za-z0-9._-]/g,'-'),file=`${output.id}-${safe}`;await writeFile(path.join(directory,file),bytes);const metadata:Record<string,unknown>={};if(bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))){for(let cursor=8;cursor+12<=bytes.length;){const size=bytes.readUInt32BE(cursor),type=bytes.toString('ascii',cursor+4,cursor+8);if(cursor+12+size>bytes.length)break;if(type==='tEXt'){const chunk=bytes.subarray(cursor+8,cursor+8+size).toString('utf8'),separator=chunk.indexOf('\0'),key=chunk.slice(0,separator),value=chunk.slice(separator+1);try{metadata[key]=JSON.parse(value);}catch{metadata[key]=value;}}cursor+=12+size;}}
  rejectWorkflowSecrets(metadata);if(metadata.prompt)await writeFile(path.join(directory,'cloud-editor-execution.api.json'),JSON.stringify(metadata.prompt,null,2));if(metadata.workflow)await writeFile(path.join(directory,'cloud-editor-execution.editor.json'),JSON.stringify(metadata.workflow,null,2));
  outputs.push({remoteAssetId:output.id,nodeId:output.nodeId,originalFilename:output.name,file,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),metadataKeys:Object.keys(metadata)});
}
const receipt={retrievedAt:new Date().toISOString(),mode:'Read-only recovery; no new execution submitted',workflowName:finish?'Open Take Studio — 04 Image Finish v1':'Open Take Studio — 03 Prism Atelier v1',workflowUrl:finish?'https://cloud.comfy.org/#285883fc-da32-44dd-9d80-0bb9ccd6b1e2':'https://cloud.comfy.org/#8a5749a6-5f46-419d-b89b-e1c4ba79d699',workspaceId:source.workspace_id??'w-90148e74-2552-485e-aba8-90fe66066824',workspaceEvidence:source.workspace_id?'Cloud asset record':'Root browser observation; authenticated asset lookup used the same project key',jobId:job.id,status:job.status,createdAt:job.createdAt.toISOString(),completedAt:job.completedAt?.toISOString(),workflowFormat:workflow.format,outputSourceMatch:filename,outputs};
await writeFile(path.join(directory,'recovery-receipt.json'),JSON.stringify(receipt,null,2));console.log(JSON.stringify(receipt,null,2));
