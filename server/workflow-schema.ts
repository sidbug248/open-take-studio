import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { WorkflowVersion, WorkflowGraph, WorkflowDependency } from '../shared/workflow-types.ts';

export class WorkflowError extends Error { constructor(message:string,public status=400){super(message);} }
const nodeId=z.string().min(1).max(500);
const assetId=z.string().min(1).max(128).regex(/^[A-Za-z0-9_-]+$/);
const primitive=z.union([z.string().max(100000),z.number().finite(),z.boolean()]);
export const workflowValueSchema=z.union([primitive,z.object({assetId}).strict()]);
export const workflowBindingSchema=z.object({key:z.string().regex(/^[A-Za-z][A-Za-z0-9_-]{0,60}$/),label:z.string().min(1).max(120),nodeId,inputName:z.string().min(1).max(160),kind:z.enum(['string','number','boolean','image','video','audio']),required:z.boolean().default(true),defaultValue:primitive.optional(),min:z.number().finite().optional(),max:z.number().finite().optional(),maxLength:z.number().int().min(1).max(100000).optional(),options:z.array(z.string().max(1000)).max(500).optional()}).strict();
export const workflowGraphSchema=z.record(nodeId,z.object({class_type:z.string().min(1).max(300),inputs:z.record(z.string().min(1).max(200),z.unknown()),_meta:z.record(z.string(),z.unknown()).optional()}).passthrough());
export const workflowCreateSchema=z.object({cloudEditorUrl:z.string().regex(/^https:\/\/cloud\.comfy\.org\/#(?:[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})$/i).optional(),cloudWorkspace:z.object({id:z.string().regex(/^w-[a-f0-9-]{36}$/i),name:z.string().min(1).max(120)}).strict().optional(),name:z.string().trim().min(1).max(180),description:z.string().max(12000).default(''),editorGraph:z.record(z.string(),z.unknown()),apiGraph:workflowGraphSchema,bindings:z.array(workflowBindingSchema).max(100).default([]),outputNodeIds:z.array(nodeId).min(1).max(100),outputKind:z.enum(['image','video','audio','3d','document']),parentVersionAssetId:assetId.optional()}).strict();
export const workflowRunSchema=z.object({values:z.record(z.string(),workflowValueSchema).default({}),name:z.string().max(180).optional(),parentTakeId:assetId.optional(),sourceAssetId:assetId.optional(),shotId:assetId.optional(),clientRequestId:z.string().min(8).max(128).regex(/^[A-Za-z0-9_-]+$/)}).strict();
export const workflowExecutionSchema=z.object({origin:z.enum(['studio','cloud-editor']).optional(),versionAssetId:assetId,graphSha256:z.string().regex(/^[a-f0-9]{64}$/),target:z.literal('comfy-cloud'),values:z.record(z.string(),workflowValueSchema),uploads:z.record(z.string(),z.object({assetId,remoteId:z.string().max(300),sha256:z.string().regex(/^[a-f0-9]{64}$/)})).optional(),cloudStatus:z.string().max(100).optional(),progress:z.object({value:z.number().min(0).max(1),nodesDone:z.number().nullable(),nodesTotal:z.number().nullable(),currentNode:z.string().nullable(),currentNodeClass:z.string().nullable(),step:z.number().nullable(),steps:z.number().nullable(),message:z.string().nullable()}).optional(),executedGraphAssetId:assetId.optional(),expiresAt:z.string().datetime().optional(),submissionOutcome:z.enum(['not-submitted','accepted','rejected','unknown']).optional()});
const secretKeys=/^(?:api_key|apiKey|api_key_comfy_org|auth_token_comfy_org|authorization|credentials|password|secret|COMFY_API_KEY)$/i;
export function rejectWorkflowSecrets(value:unknown,depth=0):void {
  if(depth>64)throw new WorkflowError('Workflow JSON is nested too deeply');
  if(typeof value==='string'&&(/comfyui-[A-Za-z0-9_-]+/.test(value)||(process.env.COMFY_API_KEY&&value.includes(process.env.COMFY_API_KEY))))throw new WorkflowError('Remove API credentials from workflow JSON; the server supplies authentication');
  if(Array.isArray(value))for(const child of value)rejectWorkflowSecrets(child,depth+1);
  else if(value&&typeof value==='object')for(const[key,child]of Object.entries(value)){if(secretKeys.test(key))throw new WorkflowError('Workflow artifacts cannot contain credential fields');rejectWorkflowSecrets(child,depth+1);}
}
export function graphDependencies(graph:WorkflowGraph):WorkflowDependency[]{return Object.entries(graph).map(([nodeId,node])=>({nodeId,classType:node.class_type,models:Object.fromEntries(Object.entries(node.inputs).filter(([key,value])=>typeof value==='string'&&/(?:ckpt|unet|clip|vae|lora|model)_name$/.test(key))) as Record<string,string>}));}
export function validateWorkflowGraph(graph:WorkflowGraph):void {
  const ids=Object.keys(graph);if(!ids.length||ids.length>1000)throw new WorkflowError('Use a workflow with 1–1000 execution nodes');
  const links=new Map<string,string[]>();
  for(const[id,node]of Object.entries(graph)){const parents:string[]=[];for(const[field,value]of Object.entries(node.inputs))if(Array.isArray(value)&&value.length===2&&typeof value[0]==='string'&&Number.isInteger(value[1])){if(!graph[value[0]]||Number(value[1])<0)throw new WorkflowError(`Node ${id} input ${field} references a missing output`);parents.push(value[0]);}links.set(id,parents);}
  const visiting=new Set<string>(),visited=new Set<string>();const visit=(id:string)=>{if(visiting.has(id))throw new WorkflowError('Workflow graph contains a dependency cycle');if(visited.has(id))return;visiting.add(id);for(const parent of links.get(id)??[])visit(parent);visiting.delete(id);visited.add(id);};ids.forEach(visit);
}
export function makeWorkflowVersion(raw:unknown):WorkflowVersion {
  rejectWorkflowSecrets(raw);const body=workflowCreateSchema.parse(raw);validateWorkflowGraph(body.apiGraph);
  if(!Array.isArray(body.editorGraph.nodes)||!Array.isArray(body.editorGraph.links))throw new WorkflowError('Supply editable ComfyUI workflow JSON with nodes and links, separately from the API graph');
  if(body.outputNodeIds.some(id=>!body.apiGraph[id]))throw new WorkflowError('A selected output node is missing from the API graph');
  if(new Set(body.bindings.map(b=>b.key)).size!==body.bindings.length)throw new WorkflowError('Workflow input keys must be unique');
  for(const binding of body.bindings){if(!body.apiGraph[binding.nodeId]||!Object.hasOwn(body.apiGraph[binding.nodeId].inputs,binding.inputName))throw new WorkflowError(`Input binding ${binding.key} does not reference an existing node input`);if(Array.isArray(body.apiGraph[binding.nodeId].inputs[binding.inputName]))throw new WorkflowError(`Input binding ${binding.key} must target a widget, not a linked media socket`);}
  return {...body,format:'open-take-comfy-workflow',version:1,dependencies:graphDependencies(body.apiGraph),graphSha256:createHash('sha256').update(JSON.stringify(body.apiGraph)).digest('hex'),target:'comfy-cloud',createdAt:new Date().toISOString()};
}
