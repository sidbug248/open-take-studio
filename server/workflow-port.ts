import './config.ts';
import { Comfy, type Job as CloudJob } from '@comfyorg/sdk';
import type { WorkflowGraph, WorkflowProgress, WorkflowValidation } from '../shared/workflow-types.ts';
import { graphDependencies, WorkflowError } from './workflow-schema.ts';
import {credentialSafeError,redactCredentialValue,environmentCredentialSource,type CredentialSource,type ExecutionCredential,CredentialUnavailableError} from './credential-source.ts';
import {operationLimit} from './credential-operation-limit.ts';
import {validateWorkflowNodeInputs} from './workflow-node-validation.ts';
const nativeAdmission=operationLimit(4);let nativeStreams=0;

export interface WorkflowOutput {id:string;nodeId:string;name:string;contentType:string;sizeBytes:number;type:string;}
export interface WorkflowSnapshot {id:string;status:string;queuePosition?:number;progress?:WorkflowProgress;error?:unknown;expiresAt?:string;outputs:WorkflowOutput[];}
export interface WorkflowPort {
  validate(graph:WorkflowGraph):Promise<WorkflowValidation>;
  upload(filePath:string):Promise<string>;
  hashInput?(filePath:string):Promise<string>;
  submit(graph:WorkflowGraph,idempotencyKey:string):Promise<WorkflowSnapshot>;
  get(id:string):Promise<WorkflowSnapshot>;
  download(jobId:string,outputId:string):Promise<Uint8Array>;
  executedGraph(id:string):Promise<unknown>;
  cancel(id:string):Promise<WorkflowSnapshot>;
  watch?(id:string,onProgress:(progress:WorkflowProgress)=>void,signal:AbortSignal):Promise<void>;
}
function cloudClient(credential:ExecutionCredential,source:CredentialSource,fetchImpl:typeof fetch):Comfy {
  const target=process.env.COMFY_BASE_URL?.trim();
  if(target&&new URL(target).href.replace(/\/+$/,'')!=='https://cloud.comfy.org')throw new WorkflowError('Native studio workflows currently target Comfy Cloud. Keep a custom deployment in its separate configured environment.',409);
  const scopedFetch:typeof fetch=(input,init)=>{if(source.resolve().id!==credential.id||credential.signal?.aborted)throw new CredentialUnavailableError();const signals=[init?.signal,credential.signal].filter(Boolean) as AbortSignal[];return fetchImpl(input,{...init,signal:signals.length?AbortSignal.any(signals):undefined});};
  return new Comfy({apiKey:credential.apiKey,clientInfo:'open-take-studio/native-workflow',timeoutMs:60000,fetch:scopedFetch});
}
function snapshot(job:CloudJob):WorkflowSnapshot{return{id:job.id,status:job.status,queuePosition:job.queuePosition??undefined,progress:job.progress??undefined,error:job.error??undefined,expiresAt:job.expiresAt.toISOString(),outputs:job.outputs.map(output=>({id:output.id,nodeId:output.nodeId,name:output.name,contentType:output.contentType,sizeBytes:output.sizeBytes,type:output.type}))};}
export function validateAgainstNodeInfo(graph:WorkflowGraph,info:Record<string,any>):WorkflowValidation {
  const issues:WorkflowValidation['issues']=[];
  const nodes=graphDependencies(graph).map(dep=>{
    const schema=info[dep.classType];
    if(!schema)issues.push({nodeId:dep.nodeId,message:`${dep.classType} is not available in the current Comfy Cloud environment`});
    else issues.push(...validateWorkflowNodeInputs(dep.nodeId,graph,schema,info));
    return{...dep,available:Boolean(schema),partnerNode:schema?.api_node===true};
  });
  return{checkedAt:new Date().toISOString(),target:'comfy-cloud',valid:issues.length===0,issues,nodes};
}
export function createWorkflowPort(source:CredentialSource,options:{fetchImpl?:typeof fetch}={}):WorkflowPort&{nodeInfo():Promise<Record<string,any>>}{
  const fetchImpl=options.fetchImpl??fetch;let cachedInfo:Record<string,any>|undefined,cachedAt=0,cachedScope='';
  const call=async<T>(action:(client:Comfy,credential:ExecutionCredential)=>Promise<T>,stream=false)=>{source.resolve();const release=stream?()=>{}:await nativeAdmission();let credential:ExecutionCredential|undefined;try{credential=source.resolve();return redactCredentialValue(await action(cloudClient(credential,source,fetchImpl),credential),credential.apiKey);}catch(error){throw credential?credentialSafeError(error,credential.apiKey):error;}finally{release();}};
  const nodeInfo=()=>call(async(_client,credential)=>{
    if(cachedInfo&&cachedScope===credential.id&&Date.now()-cachedAt<60000)return cachedInfo;
    const signals=[AbortSignal.timeout(45000),credential.signal].filter(Boolean) as AbortSignal[];
    const response=await fetchImpl('https://cloud.comfy.org/api/object_info',{headers:{Authorization:`Bearer ${credential.apiKey}`},signal:AbortSignal.any(signals),redirect:'error'});
    if(!response.ok)throw new WorkflowError(`Comfy Cloud node information is unavailable (HTTP ${response.status})`,502);
    cachedInfo=await response.json() as Record<string,any>;cachedAt=Date.now();cachedScope=credential.id;return cachedInfo;
  });
  return{
    nodeInfo,validate:async graph=>validateAgainstNodeInfo(graph,await nodeInfo()),
    upload:filePath=>call(client=>client.assets.fromFile(filePath).commit()),
    hashInput:filePath=>call(client=>client.assets.fromFile(filePath).hash()),
    submit:(graph,key)=>call(async(client,credential)=>snapshot(await client.submit(client.workflows.fromJson(structuredClone(graph)),{idempotencyKey:key,apiKey:credential.apiKey,signal:credential.signal}))),
    get:id=>call(async client=>snapshot(await client.jobs.get(id))),
    download:(jobId,outputId)=>call(async client=>{const job=await client.jobs.get(jobId),output=job.outputs.find(value=>value.id===outputId);if(!output)throw new WorkflowError('Saved Cloud output is no longer available',410);return output.toBytes({timeoutMs:120000});}),
    executedGraph:id=>call(async client=>(await client.jobs.get(id)).getWorkflow()),
    cancel:id=>call(async client=>snapshot(await(await client.jobs.get(id)).cancel())),
    watch:async(id,onProgress,signal)=>{if(nativeStreams>=4)return;nativeStreams++;try{await call(async(client,credential)=>{const job=await client.jobs.get(id);for await(const event of job.events(credential.signal?AbortSignal.any([signal,credential.signal]):signal)){if(event.kind==='progress')onProgress(redactCredentialValue(event,credential.apiKey));if(event.kind==='statusChange'&&['succeeded','failed','expired','canceled'].includes(event.status))break;}},true);}finally{nativeStreams--;}},
  };
}
export const workflowPort=createWorkflowPort(environmentCredentialSource);
export const cloudNodeInfo=()=>workflowPort.nodeInfo();
