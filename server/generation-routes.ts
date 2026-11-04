import { Router } from 'express';
import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Store } from './store.ts';
import type { LocalFileStorage } from './media.ts';
import type { GenerationWorker } from './worker.ts';
import type { Job, Take, Json, Asset } from '../shared/types.ts';
import { MODEL_REGISTRY, getModel, buildModelInput, validateSupportedSettings } from './model-registry.ts';
import { validateAssetConstraints, validateRouterBodySize } from './input-validation.ts';
import { hostedInput } from './hosted-input-cache.ts';
import { summarizeInlineMedia } from './project-routes.ts';
import { listModelDependencies, validateModelDependencies } from './model-dependencies.ts';
import {bindJobCredential,type CredentialSource} from './credential-source.ts';
import { SyncDurationGuard, SyncDurationConfirmationRequired } from './sync-duration.ts';
import { SYNC_DURATION_MODEL, type SyncDurationReceipt } from '../shared/sync-duration.ts';

const publicJob=(job:Job)=>({...job,inputs:summarizeInlineMedia(job.inputs),result:summarizeInlineMedia(job.result)});

const referenceRolesSchema=z.record(z.string().max(60),z.object({assetId:z.string().min(1),inputKey:z.string().max(100),label:z.string().max(100).optional(),locked:z.boolean().optional()}).strict()).refine(v=>Object.keys(v).length<=8,'Choose at most eight reference roles');
const requestSchema=z.object({durationConfirmation:z.string().max(100).optional(),referenceRoles:referenceRolesSchema.optional(),projectId:z.string().min(1),modelId:z.string().min(1),prompt:z.string().max(20_000).default(''),settings:z.record(z.string(),z.unknown()).default({}),inputAssetIds:z.record(z.string(),z.union([z.string().min(1),z.array(z.string().min(1)).max(12)])).default({}),parentTakeId:z.string().optional(),sourceAssetId:z.string().optional(),shotId:z.string().optional(),name:z.string().max(150).optional(),sceneBinding:z.object({sceneId:z.string(),revisionId:z.string(),useDirection:z.boolean(),factKeys:z.array(z.enum(['location','time','event','intent','wardrobe','camera','sound'])).max(7).optional()}).optional(),clientRequestId:z.string().min(8).max(100)}).strict();
function canonical(value:unknown):string {if(Array.isArray(value))return `[${value.map(canonical).join(',')}]`;if(value&&typeof value==='object')return `{${Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>`${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`;return JSON.stringify(value);}
export function recordedChanges(parent:Take|undefined,current:Pick<Take,'modelId'|'prompt'|'settings'|'inputAssetIds'|'sourceAssetId'|'referenceRoles'>):Take['changes']{
  if(!parent)return [];
  const fields=['modelId','prompt','sourceAssetId','inputAssetIds','referenceRoles'] as const;
  const changes:Take['changes']=fields.filter(k=>canonical(parent[k])!==canonical(current[k])).map(field=>({field,before:parent[field]??null,after:current[field]??null}));
  for(const key of new Set([...Object.keys(parent.settings),...Object.keys(current.settings)]))if(canonical(parent.settings[key])!==canonical(current.settings[key]))changes.push({field:`settings.${key}`,before:parent.settings[key]??null,after:current.settings[key]??null});
  return changes;
}
export function createGenerationRouter(store:Store,media:LocalFileStorage,worker:GenerationWorker,credentialSource?:CredentialSource,durationGuard=new SyncDurationGuard(store,media)){
  const api=Router();
  api.use('/jobs',(req,_res,next)=>{if(credentialSource&&req.method==='POST')credentialSource.resolve();next();});
  api.get('/models',(_req,res)=>res.json({models:MODEL_REGISTRY}));
  api.get('/projects/:id/model-dependencies',(req,res)=>{if(!store.getProject(req.params.id)){res.status(404).json({error:'Project not found.'});return;}res.json({dependencies:listModelDependencies(store,req.params.id)});});
  api.post('/generation/duration-check',async(req,res)=>{
    const parsed=z.object({projectId:z.string().min(1),modelId:z.literal(SYNC_DURATION_MODEL),settings:z.record(z.string(),z.unknown()).default({}),inputAssetIds:z.object({video:z.string().min(1),audio:z.string().min(1)}).strict()}).strict().safeParse(req.body);
    if(!parsed.success){res.status(400).json({error:'Choose a performance video and speech track from this project.'});return;}
    try{res.setHeader('Cache-Control','no-store');res.json(await durationGuard.review(parsed.data));}catch(error){res.status(400).json({error:error instanceof Error?error.message:'The input durations could not be checked.'});}
  });
  api.post('/generate',async(req,res)=>{
    if(credentialSource){const credential=credentialSource.resolve();if(JSON.stringify(req.body).includes(credential.apiKey)){res.status(400).json({error:'Keep API credentials out of prompts and project inputs.'});return;}}
    const parsed=requestSchema.safeParse(req.body);if(!parsed.success){res.status(400).json({error:parsed.error.issues.map(x=>`${x.path.join('.')}: ${x.message}`).join('; ')});return;}
    const body=parsed.data;
    const project=store.getProject(body.projectId);if(!project){res.status(404).json({error:'Project not found.'});return;}
    const model=MODEL_REGISTRY.find(m=>m.id===body.modelId);if(!model||model.status==='unavailable'){res.status(400).json({error:'This model adapter is unavailable.'});return;}
    const idempotencyKey=createHash('sha256').update(`ots:${body.projectId}:${body.clientRequestId}`).digest('hex');
    // The acknowledgement authorizes admission; it is not a provider input and
    // must not change a previously admitted request's idempotent identity.
    const {durationConfirmation:_durationConfirmation,...fingerprintedBody}=body;
    const fingerprint=createHash('sha256').update(canonical(fingerprintedBody)).digest('hex');
    const existing=store.getJobByIdempotencyKey(idempotencyKey);
    if(existing){if(existing.fingerprint!==fingerprint){res.status(409).json({error:'This submission identity is already attached to different inputs. Start a new take.'});return;}res.json({take:store.getTake(existing.takeId),job:publicJob(existing)});return;}
    let parent=body.parentTakeId?store.getTake(body.parentTakeId):undefined;
    if(body.parentTakeId&&(!parent||parent.projectId!==project.id)){res.status(400).json({error:'Parent take must belong to this project.'});return;}
    if(body.shotId&&store.getShot(body.shotId)?.projectId!==project.id){res.status(400).json({error:'Shot must belong to this project.'});return;}
    if(body.sourceAssetId&&store.getAsset(body.sourceAssetId)?.projectId!==project.id){res.status(400).json({error:'Source asset must belong to this project.'});return;}
    if(body.sceneBinding){const scene=project.scenes?.find(s=>s.id===body.sceneBinding!.sceneId);if(!scene?.revisions.some(r=>r.id===body.sceneBinding!.revisionId)){res.status(400).json({error:'Scene revision must belong to this project.'});return;}}
    const inputData:Record<string,string|string[]>={};
    const inputAssets:Record<string,Asset|Asset[]>={};
    for(const [key,value] of Object.entries(body.inputAssetIds)){
      const input=model.inputs.find(x=>x.key===key);if(!input){res.status(400).json({error:`Unsupported input ${key}.`});return;}
      const ids=(Array.isArray(value)?value:[value]).filter(Boolean);
      if(!input.multiple&&ids.length>1){res.status(400).json({error:`${input.label} accepts one asset.`});return;}
      const data:string[]=[];const assets:Asset[]=[];
      for(const id of ids){const asset=store.getAsset(id);if(!asset||asset.projectId!==project.id||asset.kind!==input.kind){res.status(400).json({error:`Choose a ${input.kind} asset from this project for ${input.label}.`});return;}assets.push(asset);data.push(input.transport==='cloud-asset-url'?'https://media-validation.invalid/'+asset.fileName:await media.toDataUri(asset));}
      if(assets.length)inputAssets[key]=input.multiple?assets:assets[0];
      if(data.length)inputData[key]=input.multiple?data:data[0];
    }
    for(const [role,ref] of Object.entries(body.referenceRoles??{})){
      if(store.getAsset(ref.assetId)?.projectId!==project.id){res.status(400).json({error:'The '+role+' reference must belong to this project.'});return;}
      if(ref.inputKey){const ids=body.inputAssetIds[ref.inputKey];if(!model.inputs.some(i=>i.key===ref.inputKey)||!(Array.isArray(ids)?ids:[ids]).includes(ref.assetId)){res.status(400).json({error:'The '+role+' reference must match the selected model input '+ref.inputKey+'.'});return;}}
    }
    let inputs:Json;let settings:Json;let inputDurationReview:SyncDurationReceipt|undefined;try{
      settings=validateSupportedSettings(model.id,body.settings);
      const predecessor=validateModelDependencies(store,{...body,settings});
      if(predecessor){body.parentTakeId=predecessor.takeId;parent=store.getTake(predecessor.takeId);body.sourceAssetId??=parent?.assetIds.find(a=>['3d','video'].includes(store.getAsset(a)?.kind??''));}
      await validateAssetConstraints(model.id,inputAssets,a=>media.read(a),settings);
      if(model.id===SYNC_DURATION_MODEL)inputDurationReview=await durationGuard.validate({...body,settings},body.durationConfirmation);
      // Validate the complete request before any public media upload occurs.
      buildModelInput(model.id,{prompt:body.prompt,settings,inputData});
      for(const input of model.inputs.filter(i=>i.transport==='cloud-asset-url')){
        const selected=inputAssets[input.key];if(!selected)continue;
        const assets=Array.isArray(selected)?selected:[selected],urls:string[]=[];
        for(const asset of assets)urls.push((await hostedInput(asset,media,store.dataDir,{credentialSource})).url);
        inputData[input.key]=input.multiple?urls:urls[0];
      }
      inputs=buildModelInput(model.id,{prompt:body.prompt,settings,inputData});validateRouterBodySize(inputs);
    }catch(e){if(e instanceof SyncDurationConfirmationRequired){res.status(409).json({error:e.message,code:e.code,durationCheck:e.check});return;}res.status(400).json({error:e instanceof Error?e.message:'Invalid model inputs.'});return;}
    if(model.id==='minimax/minimax-h3'&&(inputData.first_frame||inputData.last_frame))delete settings.ratio;
    const now=new Date().toISOString();const jobId=randomUUID();
    const snapshot={modelId:model.id,prompt:body.prompt,settings,inputAssetIds:body.inputAssetIds,sourceAssetId:body.sourceAssetId,referenceRoles:body.referenceRoles};
    const take:Take={id:randomUUID(),projectId:project.id,name:body.name||`${model.kind==='image'?'Image':model.kind==='video'?'Motion':model.kind==='audio'?'Audio':model.kind==='3d'?'3D':'Text'} take ${store.listTakes(project.id).length+1}`,kind:model.kind,executionRoute:'router',...(inputDurationReview?{inputDurationReview}:{}),parentTakeId:body.parentTakeId,sceneBinding:body.sceneBinding,shotId:body.shotId,...snapshot,assetIds:[],provider:model.provider,status:'PENDING',provenance:'generated',favorite:false,createdAt:now,updatedAt:now,jobId,changes:recordedChanges(parent,snapshot)};
    const job:Job={id:jobId,projectId:project.id,takeId:take.id,modelId:model.id,provider:model.provider,idempotencyKey,inputs,state:'PENDING',attempts:0,createdAt:now,updatedAt:now,fingerprint,delivery:model.delivery||'queue'};
    // Input resolution awaits disk I/O. Recheck after that gap before committing admission.
    const concurrent=store.getJobByIdempotencyKey(idempotencyKey);
    if(concurrent){if(concurrent.fingerprint!==fingerprint){res.status(409).json({error:'Submission identity belongs to different inputs.'});return;}res.json({take:store.getTake(concurrent.takeId),job:publicJob(concurrent)});return;}
    credentialSource?.resolve();store.saveTakeAndJob(take,job);if(credentialSource)bindJobCredential(store,job.id,credentialSource);
    res.status(202).json({take,job:publicJob(job)});
    void worker.tick();
  });
  api.post('/jobs/:id/retry',(req,res)=>{if(store.getJob(req.params.id)?.executionRoute==='comfy-workflow'){res.status(409).json({error:'Use the native workflow retry control for this execution.',endpoint:`/api/workflow-jobs/${req.params.id}/retry`});return;}try{res.json(publicJob(worker.retry(req.params.id)));void worker.tick();}catch(e){res.status(409).json({error:e instanceof Error?e.message:'Cannot retry.'});}});
  api.post('/jobs/:id/cancel',async(req,res)=>{if(store.getJob(req.params.id)?.executionRoute==='comfy-workflow'){res.status(409).json({error:'Use the native workflow cancel control for this execution.',endpoint:`/api/workflow-jobs/${req.params.id}/cancel`});return;}try{res.json(publicJob(await worker.cancel(req.params.id)));}catch(e){res.status(409).json({error:e instanceof Error?e.message:'Cannot cancel.'});}});
  return api;
}
