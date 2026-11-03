import { createHash, randomUUID } from 'node:crypto';
import { Router, type ErrorRequestHandler } from 'express';
import { z } from 'zod';
import sharp, { type OverlayOptions } from 'sharp';
import AdmZip from 'adm-zip';
import type { Store } from './store.ts';
import type { LocalFileStorage } from './media.ts';
import { requireProjectAccess, requireAssetAccess } from './auth-access.ts';
import { MODEL_REGISTRY, validateSupportedSettings } from './model-registry.ts';
import type { Asset, GenerationRequest, Take } from '../shared/types.ts';
import type { ProductionGraphDocument, ProductionGraphNode, ProductionGraphRun, ProductionNodeRun, ProductionGraphVersion } from '../shared/production-graph-types.ts';
import { productionPorts } from '../shared/production-graph-types.ts';

const RECORD_KIND='production-graph-run';
const MAX_SOURCE_BYTES=32*1024*1024;
const MAX_DELIVERY_BYTES=96*1024*1024;
const id=z.string().regex(/^[a-zA-Z0-9_-]{1,128}$/);
const position={id,label:z.string().trim().min(1).max(100),x:z.number().finite().min(0).max(4000),y:z.number().finite().min(0).max(3000)};
export const productionGraphSchema=z.object({
  version:z.literal(1),kind:z.literal('production-graph'),name:z.string().trim().min(1).max(120),
  nodes:z.array(z.discriminatedUnion('kind',[
    z.object({...position,kind:z.literal('asset'),assetId:id}).strict(),
    z.object({...position,kind:z.literal('resize'),width:z.number().int().min(16).max(4096),height:z.number().int().min(16).max(4096),fit:z.enum(['contain','cover']),background:z.string().regex(/^#[a-fA-F0-9]{6}$/)}).strict(),
    z.object({...position,kind:z.literal('storyboard'),columns:z.union([z.literal(1),z.literal(2),z.literal(3),z.literal(4)]),title:z.string().max(160)}).strict(),
    z.object({...position,kind:z.literal('delivery'),caption:z.string().max(4000)}).strict(),
    z.object({...position,kind:z.literal('recipe'),recipeId:id,prompt:z.string().max(20000).optional()}).strict()
  ])).max(48),
  edges:z.array(z.object({id,from:id,fromPort:z.literal('output'),to:id,toPort:z.string().min(1).max(100)}).strict()).max(128)
}).strict();
class GraphError extends Error { constructor(message:string,public status=400){super(message);} }
const canonical=(value:unknown):string=>Array.isArray(value)?'['+value.map(canonical).join(',')+']':value&&typeof value==='object'?'{'+Object.entries(value).filter(([,v])=>v!==undefined).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>JSON.stringify(k)+':'+canonical(v)).join(',')+'}':JSON.stringify(value);
const hash=(value:unknown)=>createHash('sha256').update(canonical(value)).digest('hex');
const now=()=>new Date().toISOString();
function assetInProject(store:Store,projectId:string,assetId:string):Asset {
  const asset=store.getAsset(assetId);
  if(!asset||asset.projectId!==projectId)throw new GraphError('Every source asset must belong to this project.');
  return asset;
}
function graphContext(store:Store,projectId:string){return {assets:store.listAssets(projectId),recipes:store.listRecipes(projectId),models:MODEL_REGISTRY};}
export function validateProductionGraph(store:Store,projectId:string,raw:unknown):ProductionGraphDocument {
  if(!store.getProject(projectId))throw new GraphError('Project not found.',404);
  const graph=productionGraphSchema.parse(raw) as ProductionGraphDocument;
  if(Buffer.byteLength(JSON.stringify(graph))>128*1024)throw new GraphError('This graph exceeds the 128 KiB document limit.');
  const context=graphContext(store,projectId),nodes=new Map(graph.nodes.map(n=>[n.id,n]));
  if(nodes.size!==graph.nodes.length)throw new GraphError('Node identities must be unique.');
  for(const node of graph.nodes){
    if(node.kind==='asset')assetInProject(store,projectId,node.assetId);
    if(node.kind==='recipe'){
      const recipe=store.getRecipe(node.recipeId);
      if(!recipe||recipe.projectId!==projectId)throw new GraphError('Every recipe must belong to this project.');
      const model=MODEL_REGISTRY.find(m=>m.id===recipe.modelId);
      if(!model||model.status==='unavailable')throw new GraphError('This recipe has no available model adapter.');
      for(const [key,value] of Object.entries(recipe.inputAssetIds)){
        const input=model.inputs.find(i=>i.key===key);if(!input)throw new GraphError('The recipe contains an unsupported media input: '+key+'.');
        const ids=Array.isArray(value)?value:value?[value]:[];
        if(ids.length>(input.multiple?(input.maxItems??12):1))throw new GraphError('The recipe has too many assets for '+input.label+'.');
        for(const aid of ids)if(assetInProject(store,projectId,aid).kind!==input.kind)throw new GraphError('The recipe input '+input.label+' needs '+input.kind+' media.');
      }
      try{validateSupportedSettings(model.id,recipe.settings);}catch(error){throw new GraphError(error instanceof Error?error.message:'Invalid recipe settings.');}
    }
  }
  const edgeIds=new Set<string>(),connections=new Set<string>(),counts=new Map<string,number>();
  for(const edge of graph.edges){
    if(edgeIds.has(edge.id))throw new GraphError('Edge identities must be unique.');edgeIds.add(edge.id);
    const from=nodes.get(edge.from),to=nodes.get(edge.to);
    if(!from||!to)throw new GraphError('A wire refers to a missing node.');
    if(from.id===to.id)throw new GraphError('A node cannot connect to itself.');
    const source=productionPorts(from,context).outputs.find(p=>p.key===edge.fromPort);
    const target=productionPorts(to,context).inputs.find(p=>p.key===edge.toPort);
    if(!source||!target)throw new GraphError('Connect a visible output port to a valid input port.');
    if(!source.kinds.every(kind=>target.kinds.includes(kind)))throw new GraphError('The wire connects incompatible media types.');
    const connection=edge.from+':'+edge.to+':'+edge.toPort;
    if(connections.has(connection))throw new GraphError('This wire already exists.');connections.add(connection);
    const key=edge.to+':'+edge.toPort,count=(counts.get(key)??0)+1;counts.set(key,count);
    if(count>target.maxItems||(!target.multiple&&count>1))throw new GraphError('The input port has too many wires.');
  }
  productionGraphOrder(graph);
  return graph;
}
export function productionGraphOrder(graph:ProductionGraphDocument):ProductionGraphNode[] {
  const nodes=new Map(graph.nodes.map(n=>[n.id,n])),indegree=new Map(graph.nodes.map(n=>[n.id,0]));
  for(const edge of graph.edges)indegree.set(edge.to,(indegree.get(edge.to)??0)+1);
  const queue=graph.nodes.filter(n=>indegree.get(n.id)===0).map(n=>n.id),order:ProductionGraphNode[]=[];
  for(let i=0;i<queue.length;i++){const key=queue[i],node=nodes.get(key);if(!node)throw new GraphError('Missing node.');order.push(node);
    for(const edge of graph.edges.filter(e=>e.from===key)){const count=(indegree.get(edge.to)??0)-1;indegree.set(edge.to,count);if(count===0)queue.push(edge.to);}}
  if(order.length!==graph.nodes.length)throw new GraphError('Production graphs cannot contain cycles.');
  return order;
}
function readVersion(store:Store,assetId:string):ProductionGraphVersion {
  const asset=store.getAsset(assetId);
  if(!asset||asset.metadata.operation!=='production-graph-document')throw new GraphError('Production graph version not found.',404);
  const document=validateProductionGraph(store,asset.projectId,asset.metadata.productionGraphDocument);
  return {asset,document,parentVersionAssetId:typeof asset.metadata.parentVersionAssetId==='string'?asset.metadata.parentVersionAssetId:undefined};
}
function localTake(projectId:string,asset:Asset,operation:string,sources:string[],takeId:string=randomUUID()):Take {
  const time=now();
  return {id:takeId,projectId,name:asset.name,kind:asset.kind,modelId:'local/'+operation,provider:'local',prompt:'',settings:{operation,productionGraphVersionAssetId:asset.metadata.productionGraphVersionAssetId,productionNodeId:asset.metadata.productionNodeId},inputAssetIds:{sources},assetIds:[asset.id],status:'LOCAL',provenance:'local-edit',favorite:false,createdAt:time,updatedAt:time,changes:[]};
}
export async function saveProductionGraph(store:Store,media:LocalFileStorage,projectId:string,raw:unknown,parentVersionAssetId?:string):Promise<ProductionGraphVersion> {
  const document=validateProductionGraph(store,projectId,raw);
  if(parentVersionAssetId){const parent=readVersion(store,parentVersionAssetId);if(parent.asset.projectId!==projectId)throw new GraphError('The parent graph belongs to a different project.');}
  const inputAssetIds=[...new Set(document.nodes.flatMap(n=>n.kind==='asset'?[n.assetId]:n.kind==='recipe'?Object.values(store.getRecipe(n.recipeId)!.inputAssetIds).flat():[]))];
  const asset=await media.put({projectId,name:document.name+'.production.json',kind:'document',mimeType:'application/json',bytes:Buffer.from(JSON.stringify(document,null,2)),provenance:'local-edit',metadata:{operation:'production-graph-document',productionGraphDocument:document,parentVersionAssetId,inputAssetIds}});
  const take=localTake(projectId,asset,'production-graph-document',inputAssetIds);
  store.transaction(()=>{store.upsertAsset(asset);store.upsertTake(take);const project=store.getProject(projectId)!;store.upsertProject({...project,updatedAt:now()});});
  return {asset,document,parentVersionAssetId};
}
function readRun(store:Store,runId:string):ProductionGraphRun {
  const record=store.getScopedRecord<ProductionGraphRun>(RECORD_KIND,runId);
  if(!record)throw new GraphError('Production run not found.',404);
  if(record.projectId!==record.data.projectId)throw new GraphError('Invalid production run ownership.',409);
  return record.data;
}
function persistRun(store:Store,run:ProductionGraphRun){
  run.updatedAt=now();
  run.state=run.nodes.every(n=>n.state==='complete')?'complete':run.nodes.some(n=>n.state==='failed')?'failed':run.nodes.some(n=>n.state==='running')?'running':'waiting';
  store.upsertScopedRecord({id:run.id,kind:RECORD_KIND,projectId:run.projectId,data:run,createdAt:run.createdAt,updatedAt:run.updatedAt});
}
let rendererTail:Promise<unknown>=Promise.resolve(),queuedRuns=0;
const workspaceWork=new WeakMap<Store,Promise<unknown>>();
/** One renderer across workspaces bounds memory. Duplicate requests reuse durable receipts. */
function serialized<T>(store:Store,work:()=>Promise<T>):Promise<T> {
  if(queuedRuns>=12)throw new GraphError('The local renderer is busy. Keep your saved graph and try again shortly.',429);
  queuedRuns++;const result=rendererTail.catch(()=>undefined).then(work);
  rendererTail=result.then(()=>undefined,()=>undefined);workspaceWork.set(store,rendererTail);
  void result.finally(()=>{queuedRuns--;}).catch(()=>undefined);return result;
}
/** Call before closing a runtime's Store; in-flight local work then finishes cleanly. */
export async function drainProductionGraphWork(store:Store):Promise<void>{await workspaceWork.get(store);}
const escapeXML=(value:string)=>value.replace(/[<>&"']/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&apos;'}[c]!));
async function imageBytes(media:LocalFileStorage,asset:Asset):Promise<Buffer>{
  if(asset.kind!=='image')throw new GraphError('This node needs an image.');
  if(asset.size>MAX_SOURCE_BYTES)throw new GraphError('Local image operations support source files up to 32 MiB.');
  return media.read(asset);
}
async function renderLocal(media:LocalFileStorage,node:ProductionGraphNode,inputs:Asset[],run:ProductionGraphRun):Promise<{bytes:Buffer;mimeType:string;name:string;kind:Asset['kind']}> {
  if(node.kind==='resize'){
    if(inputs.length!==1)throw new GraphError('Resize needs exactly one image.');
    const bytes=await sharp(await imageBytes(media,inputs[0]),{limitInputPixels:32*1024*1024,sequentialRead:true}).rotate().resize(node.width,node.height,{fit:node.fit,background:node.background}).png().toBuffer();
    return {bytes,mimeType:'image/png',name:node.label+'.png',kind:'image'};
  }
  if(node.kind==='storyboard'){
    if(!inputs.length||inputs.length>12)throw new GraphError('A contact sheet needs one to twelve images.');
    const width=1600,gap=24,header=92,tileWidth=Math.floor((width-gap*(node.columns+1))/node.columns),tileHeight=Math.round(tileWidth*0.65),rows=Math.ceil(inputs.length/node.columns),height=header+gap+rows*(tileHeight+52+gap);
    const layers:OverlayOptions[]=[];
    for(let index=0;index<inputs.length;index++){
      const asset=inputs[index],left=gap+(index%node.columns)*(tileWidth+gap),top=header+gap+Math.floor(index/node.columns)*(tileHeight+52+gap);
      const bytes=await sharp(await imageBytes(media,asset),{limitInputPixels:32*1024*1024,sequentialRead:true}).rotate().resize(tileWidth,tileHeight,{fit:'contain',background:'#16121f'}).png().toBuffer();
      layers.push({input:bytes,left,top});
      const label='<svg width="'+tileWidth+'" height="48"><text x="0" y="28" font-family="sans-serif" font-size="19" fill="#e8def7">'+escapeXML((index+1)+'. '+asset.name.slice(0,65))+'</text></svg>';
      layers.push({input:Buffer.from(label),left,top:top+tileHeight});
    }
    const title='<svg width="'+width+'" height="'+header+'"><text x="24" y="57" font-family="sans-serif" font-size="32" fill="#f5efff">'+escapeXML((node.title||node.label).slice(0,90))+'</text></svg>';
    layers.unshift({input:Buffer.from(title),left:0,top:0});
    const bytes=await sharp({create:{width,height,channels:4,background:'#0f0d16'}}).composite(layers).png().toBuffer();
    return {bytes,mimeType:'image/png',name:node.label+'.png',kind:'image'};
  }
  if(node.kind==='delivery'){
    if(!inputs.length||inputs.length>20)throw new GraphError('A delivery package needs one to twenty assets.');
    if(inputs.reduce((sum,a)=>sum+a.size,0)>MAX_DELIVERY_BYTES)throw new GraphError('A delivery node supports up to 96 MiB. Split this delivery into smaller packages.');
    const zip=new AdmZip(),entries:Record<string,unknown>[]=[];
    for(let index=0;index<inputs.length;index++){
      const asset=inputs[index],name=(index+1).toString().padStart(2,'0')+'-'+asset.name.replace(/[^a-zA-Z0-9._-]/g,'_').slice(0,100);
      zip.addFile('media/'+name,await media.read(asset));
      entries.push({assetId:asset.id,name:asset.name,path:'media/'+name,mimeType:asset.mimeType,sha256:asset.sha256,size:asset.size});
    }
    zip.addFile('delivery.json',Buffer.from(JSON.stringify({format:'open-take-studio-delivery',version:1,createdAt:run.createdAt,productionGraphVersionAssetId:run.graphVersionAssetId,nodeId:node.id,caption:node.caption,assets:entries},null,2)));
    zip.addFile('caption.txt',Buffer.from(node.caption||'Created with Open Take Studio.'));
    for(const entry of zip.getEntries())entry.header.time=new Date('2020-01-01T00:00:00.000Z');
    return {bytes:zip.toBuffer(),mimeType:'application/zip',name:node.label+'.zip',kind:'document'};
  }
  throw new GraphError('This node is not a local renderer.');
}
function generationRequest(store:Store,graph:ProductionGraphDocument,run:ProductionGraphRun,node:Extract<ProductionGraphNode,{kind:'recipe'}>):GenerationRequest {
  const recipe=store.getRecipe(node.recipeId)!;
  const model=MODEL_REGISTRY.find(m=>m.id===recipe.modelId)!;
  const inputAssetIds:Record<string,string|string[]>={...recipe.inputAssetIds};
  for(const input of model.inputs){
    const edges=graph.edges.filter(e=>e.to===node.id&&e.toPort===input.key);
    if(edges.length){const ids=edges.flatMap(edge=>run.nodes.find(n=>n.nodeId===edge.from)!.assetIds);inputAssetIds[input.key]=input.multiple?ids:ids[0]??'';}
    const value=inputAssetIds[input.key],ids=Array.isArray(value)?value:value?[value]:[];
    if(input.required&&!ids.length)throw new GraphError('Connect '+input.label+' or select it in the saved recipe.');
    if(ids.length>(input.multiple?(input.maxItems??12):1))throw new GraphError('Too many assets for '+input.label+'.');
    for(const aid of ids)if(assetInProject(store,run.projectId,aid).kind!==input.kind)throw new GraphError(input.label+' needs '+input.kind+' media.');
  }
  const prompt=node.prompt??recipe.prompt;
  if(model.promptRequired&&!prompt.trim())throw new GraphError('This recipe needs a prompt.');
  if(prompt.length>20000)throw new GraphError('The recipe prompt exceeds 20,000 characters.');
  return {projectId:run.projectId,modelId:recipe.modelId,prompt,settings:recipe.settings,inputAssetIds,name:node.label,clientRequestId:'graph-'+hash([run.id,node.id]).slice(0,56)};
}
function jobIdentity(request:GenerationRequest){return createHash('sha256').update('ots:'+request.projectId+':'+request.clientRequestId).digest('hex');}
function validateAttachedJob(store:Store,run:ProductionGraphRun,node:ProductionNodeRun,jobId:string){
  const job=store.getJob(jobId),take=job?store.getTake(job.takeId):undefined;
  if(!node.request||!job||!take||job.projectId!==run.projectId||take.projectId!==run.projectId||job.idempotencyKey!==jobIdentity(node.request)||job.fingerprint!==hash(node.request))throw new GraphError('The generation job does not match this node and its exact saved request.',409);
  return job;
}
async function advance(store:Store,media:LocalFileStorage,run:ProductionGraphRun):Promise<ProductionGraphRun>{
  const {asset,document:graph}=readVersion(store,run.graphVersionAssetId);
  if(asset.projectId!==run.projectId||hash(graph)!==run.graphFingerprint)throw new GraphError('The saved graph version no longer matches this run.',409);
  for(const node of productionGraphOrder(graph)){
    const state=run.nodes.find(n=>n.nodeId===node.id)!;
    if(state.state==='complete')continue;
    const incoming=graph.edges.filter(e=>e.to===node.id),upstream=incoming.map(e=>run.nodes.find(n=>n.nodeId===e.from)!);
    state.inputAssetIds=[...new Set(upstream.flatMap(n=>n.assetIds))];delete state.message;
    if(node.kind==='asset'){state.assetIds=[assetInProject(store,run.projectId,node.assetId).id];state.state='complete';persistRun(store,run);continue;}
    if(upstream.some(n=>n.state!=='complete')){state.state='waiting';state.message='Waiting for connected nodes. Existing inputs are preserved.';persistRun(store,run);continue;}
    if(node.kind==='recipe'){
      try{
        state.request??=generationRequest(store,graph,run,node);
        state.inputAssetIds=[...new Set(Object.values(state.request.inputAssetIds??{}).flat())];
        const known=state.jobId?validateAttachedJob(store,run,state,state.jobId):store.getJobByIdempotencyKey(jobIdentity(state.request));
        if(known){
          const job=validateAttachedJob(store,run,state,known.id);state.jobId=job.id;state.takeId=job.takeId;
          if(job.state==='COMPLETED'){
            const output=store.getTake(job.takeId)!.assetIds;
            if(!output.length)throw new GraphError('The completed recipe has no collected output.');
            for(const aid of output)assetInProject(store,run.projectId,aid);
            state.assetIds=output;state.state='complete';
          }else if(['FAILED','EXPIRED'].includes(job.state)){state.state='failed';state.message=job.errorMessage||'Generation failed. Inspect the existing job before retrying.';}
          else {state.state='waiting';state.message=job.errorMessage||'Waiting for the explicitly requested generation.';}
        }else{state.state='ready';state.message='Ready for your explicit Generate action. This step uses your Comfy credits.';}
      }catch(error){state.state='waiting';state.message=error instanceof Error?error.message:'Recipe inputs are not ready.';}
      persistRun(store,run);continue;
    }
    if(!state.inputAssetIds.length){state.state='waiting';state.message='Connect a source before running this node.';persistRun(store,run);continue;}
    const sources=state.inputAssetIds.map(aid=>assetInProject(store,run.projectId,aid));
    const operationKey='production-node:'+run.id+':'+node.id,fingerprint=hash({graph:run.graphFingerprint,node:node.id,sources:sources.map(a=>[a.id,a.sha256])});
    const receipt=store.getOperationReceipt<{assetId:string;takeId:string}>(operationKey);
    if(receipt){
      if(receipt.fingerprint!==fingerprint)throw new GraphError('This node execution identity has different inputs.',409);
      assetInProject(store,run.projectId,receipt.result.assetId);state.assetIds=[receipt.result.assetId];state.takeId=receipt.result.takeId;state.state='complete';persistRun(store,run);continue;
    }
    state.state='running';persistRun(store,run);
    try{
      const rendered=await renderLocal(media,node,sources,run),assetId='graph-output-'+hash([run.id,node.id]).slice(0,48);
      const output=await media.put({id:assetId,projectId:run.projectId,...rendered,provenance:'local-edit',metadata:{operation:'production-graph-'+node.kind,productionGraphVersionAssetId:run.graphVersionAssetId,productionNodeId:node.id,runIdentity:run.id,inputAssetIds:sources.map(a=>a.id),sourceHashes:Object.fromEntries(sources.map(a=>[a.id,a.sha256]))}});
      const take=localTake(run.projectId,output,'production-graph-'+node.kind,sources.map(a=>a.id),'graph-take-'+hash([run.id,node.id]).slice(0,48));
      store.transaction(()=>{store.upsertAsset(output);store.upsertTake(take);store.putOperationReceipt({key:operationKey,fingerprint,result:{assetId:output.id,takeId:take.id},createdAt:now()});});
      state.assetIds=[output.id];state.takeId=take.id;state.state='complete';
    }catch(error){state.state='failed';state.message=error instanceof Error?error.message:'Local node failed.';}
    persistRun(store,run);
  }
  persistRun(store,run);return run;
}
export function runProductionGraph(store:Store,media:LocalFileStorage,graphVersionAssetId:string,clientRequestId:string):Promise<ProductionGraphRun>{
  return serialized(store,async()=>{
    const {asset,document}=readVersion(store,graphVersionAssetId),runId='graph-run-'+hash([asset.projectId,clientRequestId]).slice(0,48);
    const existing=store.getScopedRecord<ProductionGraphRun>(RECORD_KIND,runId);
    if(existing){
      if(existing.data.graphVersionAssetId!==graphVersionAssetId)throw new GraphError('This run identity belongs to a different graph version. Start a new run.',409);
      return advance(store,media,existing.data);
    }
    const time=now(),run:ProductionGraphRun={id:runId,projectId:asset.projectId,graphVersionAssetId,graphFingerprint:hash(document),clientRequestId,createdAt:time,updatedAt:time,state:'waiting',nodes:document.nodes.map(n=>({nodeId:n.id,state:'waiting',inputAssetIds:[],assetIds:[]}))};
    persistRun(store,run);return advance(store,media,run);
  });
}
const runResponse=(store:Store,run:ProductionGraphRun)=>({run,assets:[...new Set(run.nodes.flatMap(n=>n.assetIds))].map(id=>assetInProject(store,run.projectId,id))});
export function createProductionGraphRouter(store:Store,media:LocalFileStorage):Router {
  const router=Router();
  router.get('/projects/:id/production-graphs',(req,res)=>{
    const projectId=String(req.params.id);requireProjectAccess(store,req,projectId);
    const versions=store.listAssets(projectId).filter(a=>a.metadata.operation==='production-graph-document').map(a=>readVersion(store,a.id)).reverse();
    const runs=store.listScopedRecords<ProductionGraphRun>(RECORD_KIND,projectId).map(r=>r.data).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt));
    res.json({versions,runs});
  });
  router.post('/projects/:id/production-graphs',async(req,res)=>{
    const projectId=String(req.params.id);requireProjectAccess(store,req,projectId,'write');
    const body=z.object({document:productionGraphSchema,parentVersionAssetId:id.optional()}).strict().parse(req.body);
    res.status(201).json(await saveProductionGraph(store,media,projectId,body.document,body.parentVersionAssetId));
  });
  router.get('/assets/:id/production-graph',(req,res)=>{requireAssetAccess(store,req,String(req.params.id));res.json(readVersion(store,String(req.params.id)));});
  router.post('/assets/:id/production-graph/runs',async(req,res)=>{
    requireAssetAccess(store,req,String(req.params.id),'write');
    const body=z.object({clientRequestId:z.string().min(8).max(100)}).strict().parse(req.body);
    res.status(200).json(runResponse(store,await runProductionGraph(store,media,String(req.params.id),body.clientRequestId)));
  });
  router.get('/production-graph-runs/:id',(req,res)=>{const run=readRun(store,String(req.params.id));requireProjectAccess(store,req,run.projectId);res.json(runResponse(store,run));});
  router.post('/production-graph-runs/:id/advance',async(req,res)=>{
    const run=readRun(store,String(req.params.id));requireProjectAccess(store,req,run.projectId,'write');
    res.json(runResponse(store,await serialized(store,()=>advance(store,media,readRun(store,run.id)))));
  });
  router.post('/production-graph-runs/:id/nodes/:nodeId/attach-generation',async(req,res)=>{
    const run=readRun(store,String(req.params.id));requireProjectAccess(store,req,run.projectId,'write');
    const body=z.object({jobId:id}).strict().parse(req.body);
    const result=await serialized(store,async()=>{
      const current=readRun(store,run.id),node=current.nodes.find(n=>n.nodeId===String(req.params.nodeId));
      if(!node)throw new GraphError('Node not found.',404);
      validateAttachedJob(store,current,node,body.jobId);node.jobId=body.jobId;persistRun(store,current);
      return advance(store,media,current);
    });res.json(runResponse(store,result));
  });
  router.use(((error,_req,res,next)=>{
    if(error instanceof z.ZodError){res.status(400).json({error:error.issues.map(i=>i.path.join('.')+': '+i.message).join('; ')});return;}
    if(error instanceof GraphError){res.status(error.status).json({error:error.message});return;}next(error);
  }) as ErrorRequestHandler);
  return router;
}
