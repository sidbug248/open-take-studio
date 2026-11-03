import { Router } from 'express';
import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { GenerationRequest, Project, Recipe, Take } from '../shared/types.ts';
import type { ImpactOutput, RecipeSlot, Scene, ScenePlan, SceneRevision } from '../shared/scene-types.ts';
import type { Store } from './store.ts';
import type { LocalFileStorage } from './media.ts';
import { MODEL_REGISTRY, validateSupportedSettings } from './model-registry.ts';
import { ProjectError } from './project-routes.ts';
import { prepareStoryPage, type PreparedStoryPage } from './story-render.ts';
import { bindRecipeIngredients } from './recipe-binding.ts';

const id=z.string().min(1).max(128),refs=z.record(z.string().min(1).max(60),id),slotSchema=z.object({key:z.string().min(1).max(60),label:z.string().min(1).max(120),inputKey:z.string().min(1).max(80),kind:z.enum(['image','video','audio']),required:z.boolean(),defaultAssetId:id.optional()});
const factKey=z.enum(['location','time','event','intent','wardrobe','camera','sound']);
const factsSchema=z.object({location:z.string().max(1000).optional(),time:z.string().max(1000).optional(),event:z.string().max(2000).optional(),intent:z.string().max(1000).optional(),wardrobe:z.string().max(1000).optional(),camera:z.string().max(1000).optional(),sound:z.string().max(1000).optional()}).strict();
const ingredientSchema=z.object({key:z.string().regex(/^[a-z][a-z0-9_]*$/i).max(60),label:z.string().min(1).max(120),defaultValue:z.string().max(2000),description:z.string().max(500).optional()});
const updateSchema=z.object({baseRevisionId:id,inputs:refs,direction:z.string().max(20000).default(''),facts:factsSchema.optional(),freshTakeIds:z.array(id).max(100).default([]),settingsByTake:z.record(id,z.record(z.string(),z.unknown())).default({}),selectedTakeIds:z.array(id).max(100).optional(),clientRequestId:z.string().min(8).max(100).optional()});
const flat=(take:Take)=>[...new Set([...Object.values(take.inputAssetIds).flat(),...(take.sourceAssetId?[take.sourceAssetId]:[])])];
const canonical=(value:unknown):string=>Array.isArray(value)?`[${value.map(canonical)}]`:value&&typeof value==='object'?`{${Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>`${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`:JSON.stringify(value);
function requireProject(store:Store,id:string):Project{const p=store.getProject(id);if(!p)throw new ProjectError('Project not found',404);return p;}
function validAssets(store:Store,projectId:string,inputs:Record<string,string>){for(const aid of Object.values(inputs)){const a=store.getAsset(aid);if(!a||a.projectId!==projectId)throw new ProjectError('Scene inputs must be saved assets in this project.');}}
function getScene(project:Project,id:string){const scene=project.scenes?.find(s=>s.id===id);if(!scene)throw new ProjectError('Scene not found',404);return scene;}
const limitations=['Only recorded inputs are dependencies. Reference conditioning does not guarantee identity or continuous motion.','A downstream step that needs a newly generated output waits until you select that completed output. No hidden generation is submitted.','Recorded settings and seeds do not guarantee identical output across model or provider versions.'];
const projectLocks=new WeakMap<Store,Map<string,Promise<void>>>();
async function withProjectLock<T>(store:Store,projectId:string,operation:()=>Promise<T>):Promise<T>{
  let locks=projectLocks.get(store);if(!locks){locks=new Map();projectLocks.set(store,locks);}
  const previous=locks.get(projectId)??Promise.resolve();let release!:()=>void;
  const current=new Promise<void>(resolve=>{release=resolve;});locks.set(projectId,current);
  await previous;try{return await operation();}finally{release();if(locks.get(projectId)===current)locks.delete(projectId);}
}
interface SceneApplyResult {scene:Scene;plan:ScenePlan;requests:GenerationRequest[];composedTakes:Take[];}

export function planScene(store:Store,projectId:string,sceneId:string,raw:unknown):ScenePlan{
  const body=updateSchema.parse(raw),project=requireProject(store,projectId),scene=getScene(project,sceneId);
  const previous=scene.revisions.find(r=>r.id===body.baseRevisionId);if(!previous)throw new ProjectError('Scene revision not found.');
  validAssets(store,projectId,body.inputs);
  const content={direction:body.direction,inputs:body.inputs,facts:body.facts??previous.facts??{}},hash=createHash('sha256').update(canonical({base:body.baseRevisionId,...content,settings:body.settingsByTake})).digest('hex').slice(0,24);
  const revision:SceneRevision={id:`rev-${hash}`,createdAt:new Date().toISOString(),...content};
  const all=store.listTakes(projectId),bound=all.filter(t=>t.sceneBinding?.sceneId===sceneId),outAssets=new Map(all.flatMap(t=>t.assetIds.map(a=>[a,t.id] as const)));
  const outputs:ImpactOutput[]=bound.map(take=>{
    const baseline=scene.revisions.find(r=>r.id===take.sceneBinding?.revisionId)||previous;
    const map=new Map(Object.entries(baseline.inputs).filter(([key,aid])=>body.inputs[key]&&store.getAsset(aid)?.sha256!==store.getAsset(body.inputs[key])?.sha256).map(([key,aid])=>[aid,body.inputs[key]]));
    const oldRefs=flat(take),changedRefs=oldRefs.filter(a=>map.has(a));
    const removed=Object.entries(baseline.inputs).filter(([key,aid])=>!body.inputs[key]&&oldRefs.includes(aid)).map(([key])=>key);
    const inputAssetIds=Object.fromEntries(Object.entries(take.inputAssetIds).map(([key,value])=>[key,Array.isArray(value)?value.map(a=>map.get(a)||a):map.get(value)||value]));
    const changedFacts=(take.sceneBinding?.factKeys||[]).filter(key=>(baseline.facts?.[key]||'')!==(content.facts[key]||''));
    let prompt=take.sceneBinding?.useDirection&&baseline.direction!==body.direction?body.direction:take.prompt;
    if(changedFacts.length){const base=prompt.replace(/\n\n\[Open Take scene facts\][\s\S]*$/,'');const lines=(take.sceneBinding?.factKeys||[]).filter(key=>content.facts[key]).map(key=>`${key}: ${content.facts[key]}`);prompt=base+(lines.length?'\n\n[Open Take scene facts]\n'+lines.join('\n'):'');}
    const settings=body.settingsByTake[take.id]??take.settings;
    const changedFields=[...changedRefs.map(a=>`reference:${a}`),...changedFacts.map(key=>`facts.${key}`),...(prompt!==take.prompt?['prompt']:[]),...(canonical(settings)!==canonical(take.settings)?['settings']:[])];
    const explicit=body.freshTakeIds.includes(take.id),changed=changedFields.length>0||explicit;
    const reusedAssetIds=oldRefs.filter(a=>!map.has(a));
    const common={takeId:take.id,name:take.name,kind:take.kind,changedFields,reusedAssetIds,dependencies:[] as string[]};
    if(oldRefs.some(a=>store.getAsset(a)?.projectId!==projectId))return {...common,action:'blocked',reason:'A recorded input is missing from this project. Choose a valid project asset.'};
    if(removed.length)return {...common,action:'blocked',changedFields:[...changedFields,...removed.map(k=>`removed:${k}`)],reason:`Removed input ${removed.join(', ')} is still required by this output. Choose a replacement or explicitly configure a new take without that reference.`};
    if(!changed)return {...common,action:'reuse',reason:'Recorded inputs and settings are unchanged. Keep the completed take.'};
    if(take.settings.operation==='storyboard-page'||Array.isArray(take.settings.panels)){
      if(!Array.isArray(settings.panels)||!settings.panels.length||settings.panels.length>9||settings.panels.some(p=>!p||typeof p!=='object'||typeof p.assetId!=='string'))return {...common,action:'blocked',reason:'Story page settings need one to nine saved image panels.'};
      const panels=(settings.panels as {assetId:string;caption?:string}[]).map((p,index)=>({...p,assetId:map.get(p.assetId)||p.assetId,...(index===0&&changedFacts.length?{caption:(take.sceneBinding?.factKeys||[]).map(key=>content.facts[key]).filter(Boolean).join(' · ')}:{})}));
      if(panels.some(p=>{const asset=store.getAsset(p.assetId);return asset?.kind!=='image'||asset.projectId!==projectId;}))return {...common,action:'blocked',reason:'Story panels require image inputs from this project.'};
      return {...common,action:'compose',reason:'Recompose a new story page locally using the saved panel layout.',settings:{...settings,panels},inputAssetIds:{...inputAssetIds,panel_images:panels.map(p=>p.assetId)}};
    }
    const model=MODEL_REGISTRY.find(m=>m.id===take.modelId&&m.status!=='unavailable');
    if(!model)return {...common,action:'blocked',reason:'This imported or local output has no matching verified Router adapter. Choose a supported model or edit it in Local tools.'};
    try{validateSupportedSettings(model.id,settings);}catch(e){return {...common,action:'blocked',reason:e instanceof Error?e.message:'Unsupported model settings.'};}
    for(const [key,value]of Object.entries(inputAssetIds)){const slot=model.inputs.find(i=>i.key===key);if(!slot||(Array.isArray(value)?value:[value]).some(a=>store.getAsset(a)?.kind!==slot.kind))return {...common,action:'blocked',reason:`The chosen model cannot use the replacement media in ${key}.`};}
    const request:GenerationRequest={projectId,modelId:take.modelId,prompt,settings,inputAssetIds,parentTakeId:take.id,sourceAssetId:take.sourceAssetId?(map.get(take.sourceAssetId)||take.sourceAssetId):undefined,shotId:take.shotId,name:`${take.name.slice(0,110)} · scene update`,clientRequestId:`scene-${hash}-${take.id}`};
    return {...common,action:'generate',reason:explicit?'Fresh take explicitly requested; unchanged sources are reused.':'Generate a new branch with the changed recorded inputs.',request};
  });
  // Trace real asset dependencies. A planned new upstream output does not exist yet.
  const affected=new Set(outputs.filter(o=>o.action!=='reuse').map(o=>o.takeId));
  let again=true;while(again){again=false;for(const output of outputs){const take=bound.find(t=>t.id===output.takeId)!;const upstream=[...new Set(flat(take).map(a=>outAssets.get(a)).filter((v):v is string=>!!v&&v!==take.id))].filter(tid=>affected.has(tid));
    if(upstream.length){output.dependencies=upstream;output.action='blocked';output.request=undefined;output.reason='Choose the new completed upstream take before updating this downstream output. Its current media remains available.';if(!affected.has(output.takeId)){affected.add(output.takeId);again=true;}}
  }}
  return {sceneId,baseRevisionId:body.baseRevisionId,revision,changed:canonical(content)!==canonical({direction:previous.direction,inputs:previous.inputs,facts:previous.facts??{}})||outputs.some(o=>o.action==='generate'||o.action==='compose'),outputs,limitations};
}

export function recipePreflight(store:Store,recipe:Recipe,replacements:Record<string,string>,ingredientValues:Record<string,string>={}){
  const model=MODEL_REGISTRY.find(m=>m.id===recipe.modelId),slots:RecipeSlot[]=recipe.slots||model?.inputs.map(i=>({key:i.key,label:i.label,inputKey:i.key,kind:i.kind,required:!!i.required,defaultAssetId:Array.isArray(recipe.inputAssetIds[i.key])?(recipe.inputAssetIds[i.key] as string[])[0]:recipe.inputAssetIds[i.key] as string|undefined}))||[];
  const bound=bindRecipeIngredients(recipe,replacements,ingredientValues);
  const requirements:string[]=[...bound.requirements],inputAssetIds={...recipe.inputAssetIds},changedInputs:string[]=[];
  if(!model||model.status==='unavailable')requirements.push(`Missing Router adapter: ${recipe.modelId}.`);
  for(const key of Object.keys(replacements))if(!slots.some(s=>s.key===key))requirements.push(`Unknown recipe input slot: ${key}.`);
  for(const slot of slots){const aid=replacements[slot.key]||slot.defaultAssetId;const input=model?.inputs.find(i=>i.key===slot.inputKey);
    if(!input||input.kind!==slot.kind){requirements.push(`Model does not support ${slot.label} as ${slot.kind}.`);continue;}
    if(aid){const a=store.getAsset(aid);if(!a||a.projectId!==recipe.projectId||a.kind!==slot.kind){requirements.push(`Choose a saved ${slot.kind} in this project for ${slot.label}.`);continue;}
      if(replacements[slot.key]){inputAssetIds[slot.inputKey]=input.multiple?[aid]:aid;changedInputs.push(slot.inputKey);}
      else if(!inputAssetIds[slot.inputKey])inputAssetIds[slot.inputKey]=input.multiple?[aid]:aid;
    }else if(slot.required)requirements.push(`Missing input: ${slot.label}.`);
  }
  if(model){for(const input of model.inputs)if(input.required&&(!inputAssetIds[input.key]||(Array.isArray(inputAssetIds[input.key])&&!inputAssetIds[input.key].length)))requirements.push(`Required model input: ${input.label}.`);
    try{validateSupportedSettings(model.id,recipe.settings);}catch(e){requirements.push(e instanceof Error?e.message:'Unsupported settings.');}}
  for(const [key,value]of Object.entries(inputAssetIds))for(const aid of Array.isArray(value)?value:[value]){const a=store.getAsset(aid);if(!a||a.projectId!==recipe.projectId)requirements.push(`Missing packaged input asset for ${key}.`);}
  const request:GenerationRequest={projectId:recipe.projectId,modelId:recipe.modelId,prompt:bound.prompt,settings:recipe.settings,inputAssetIds,name:`${recipe.name.slice(0,120)} · remix`,clientRequestId:randomUUID()};
  return {ready:requirements.length===0,slots,ingredients:bound.ingredients,resolvedIngredients:bound.resolvedIngredients,requirements,limitations:[...limitations,...(model?.status==='experimental'?['This adapter is experimental; check model requirements before submitting.']:[])],runtime:['Node.js 22.13+','@comfyorg/sdk 0.5.0 or compatible','Server-side COMFY_API_KEY and sufficient Comfy credits','The requested model must remain available to the receiving workspace'],request,changedInputs,reusedAssetIds:[...new Set(Object.entries(inputAssetIds).filter(([key])=>!changedInputs.includes(key)).flatMap(([,v])=>Array.isArray(v)?v:[v]))]};
}

export function createSceneRouter(store:Store,media:LocalFileStorage){const api=Router();
  api.post('/projects/:id/scenes',(req,res)=>{const body=z.object({name:z.string().min(1).max(160),inputs:refs,direction:z.string().max(20000).default(''),facts:factsSchema.default({}),factKeys:z.array(factKey).max(7).default([]),takeIds:z.array(id).max(100).optional(),useDirection:z.boolean().default(false)}).parse(req.body);const project=requireProject(store,req.params.id);validAssets(store,project.id,body.inputs);const now=new Date().toISOString(),revision:SceneRevision={id:randomUUID(),createdAt:now,direction:body.direction,inputs:body.inputs,facts:body.facts},scene:Scene={id:randomUUID(),name:body.name,createdAt:now,currentRevisionId:revision.id,revisions:[revision]};
    const selected=body.takeIds||store.listTakes(project.id).filter(t=>flat(t).some(a=>Object.values(body.inputs).includes(a))).map(t=>t.id);for(const tid of selected)if(store.getTake(tid)?.projectId!==project.id)throw new ProjectError('Take is not in this project.');
    store.transaction(()=>{store.upsertProject({...project,scenes:[...(project.scenes||[]),scene],updatedAt:now});for(const tid of selected){const take=store.getTake(tid)!;store.upsertTake({...take,sceneBinding:{sceneId:scene.id,revisionId:revision.id,useDirection:body.useDirection,factKeys:body.factKeys}});}});res.status(201).json(scene);
  });
  api.post('/projects/:id/scenes/:sceneId/bind',(req,res)=>{const project=requireProject(store,req.params.id),scene=getScene(project,req.params.sceneId),body=z.object({takeIds:z.array(id).min(1).max(100),useDirection:z.boolean().default(false),factKeys:z.array(factKey).max(7).default([])}).parse(req.body);for(const tid of body.takeIds)if(store.getTake(tid)?.projectId!==project.id)throw new ProjectError('Take is not in this project.');store.transaction(()=>{for(const tid of body.takeIds){const take=store.getTake(tid)!;store.upsertTake({...take,sceneBinding:{sceneId:scene.id,revisionId:scene.currentRevisionId,useDirection:body.useDirection,factKeys:body.factKeys}});}});res.json(scene);});
  api.post('/projects/:id/scenes/:sceneId/plan',(req,res)=>res.json(planScene(store,req.params.id,req.params.sceneId,req.body)));
  api.post('/projects/:id/scenes/:sceneId/restore',(req,res)=>{const body=z.object({revisionId:id,clientRequestId:z.string().min(8).max(100)}).parse(req.body),project=requireProject(store,req.params.id),scene=getScene(project,req.params.sceneId),source=scene.revisions.find(r=>r.id===body.revisionId);if(!source)throw new ProjectError('Saved scene revision not found.');validAssets(store,project.id,source.inputs);const key=`scene-restore:${project.id}:${scene.id}:${body.clientRequestId}`,fingerprint=canonical(body),old=store.getOperationReceipt<Scene>(key);if(old){if(old.fingerprint!==fingerprint)throw new ProjectError('Restore identity belongs to a different revision.',409);res.json(old.result);return;}const now=new Date().toISOString(),revision={...structuredClone(source),id:randomUUID(),createdAt:now},next={...scene,currentRevisionId:revision.id,revisions:[...scene.revisions,revision]};store.transaction(()=>{store.upsertProject({...project,scenes:project.scenes!.map(s=>s.id===scene.id?next:s),updatedAt:now});store.putOperationReceipt({key,fingerprint,result:next,createdAt:now});});res.json(next);});
  api.post('/projects/:id/scenes/:sceneId/apply',async(req,res)=>{
    const body=updateSchema.parse(req.body);if(!body.clientRequestId||!body.selectedTakeIds)throw new ProjectError('Choose outputs and provide a stable update identity.');
    const projectId=req.params.id,sceneId=req.params.sceneId;
    const key='scene-apply:'+createHash('sha256').update(canonical([projectId,sceneId,body.clientRequestId])).digest('hex');
    const fingerprint=createHash('sha256').update(canonical(body)).digest('hex');
    const replay=()=>{const receipt=store.getOperationReceipt<SceneApplyResult>(key);if(!receipt)return undefined;if(receipt.fingerprint!==fingerprint)throw new ProjectError('This scene update identity already belongs to different inputs. Start a new update.',409);return receipt.result;};
    const result=await withProjectLock(store,projectId,async()=>{
      const existing=replay();if(existing)return existing;
      const project=requireProject(store,projectId),scene=getScene(project,sceneId),plan=planScene(store,projectId,sceneId,body);
      if(scene.currentRevisionId!==body.baseRevisionId)throw new ProjectError('Scene changed since this plan. Review a fresh plan.',409);
      const selected=plan.outputs.filter(o=>body.selectedTakeIds!.includes(o.takeId));
      if(selected.length!==new Set(body.selectedTakeIds).size)throw new ProjectError('Selected output is not in the plan.');
      if(selected.some(o=>o.action==='blocked'))throw new ProjectError('Resolve the blocked dependencies before updating these outputs.');
      const requests:GenerationRequest[]=[],prepared:PreparedStoryPage[]=[];
      for(const output of selected){
        const parent=store.getTake(output.takeId)!;
        const binding={sceneId,revisionId:plan.revision.id,useDirection:parent.sceneBinding?.useDirection||false,factKeys:parent.sceneBinding?.factKeys};
        if(output.action==='generate'&&output.request)requests.push({...output.request,clientRequestId:createHash('sha256').update(`${key}:${output.takeId}`).digest('hex'),sceneBinding:binding});
        if(output.action==='compose')prepared.push(await prepareStoryPage(store,media,parent,output.settings!,output.inputAssetIds!,binding,`${key}:${output.takeId}`));
      }
      // Rendering awaits disk/codec work. Recheck scene and output scope before
      // committing; merge into the latest project to preserve unrelated edits.
      return store.transaction(()=>{
        const concurrent=replay();if(concurrent)return concurrent;
        const latest=requireProject(store,projectId),latestScene=getScene(latest,sceneId);
        if(latestScene.currentRevisionId!==scene.currentRevisionId)throw new ProjectError('Scene changed while rendering. Review a fresh plan.',409);
        const latestSelected=planScene(store,projectId,sceneId,body).outputs.filter(o=>body.selectedTakeIds!.includes(o.takeId));
        if(canonical(latestSelected)!==canonical(selected))throw new ProjectError('Connected outputs changed while rendering. Review a fresh plan.',409);
        const next={...latestScene,currentRevisionId:plan.revision.id,revisions:latestScene.revisions.some(r=>r.id===plan.revision.id)?latestScene.revisions:[...latestScene.revisions,plan.revision]};
        const response:SceneApplyResult={scene:next,plan,requests,composedTakes:prepared.map(item=>item.take)};
        for(const item of prepared){store.upsertAsset(item.asset);store.upsertTake(item.take);}
        store.upsertProject({...latest,scenes:(latest.scenes||[]).map(s=>s.id===sceneId?next:s),updatedAt:new Date().toISOString()});
        store.putOperationReceipt({key,fingerprint,result:response,createdAt:new Date().toISOString()});
        return response;
      });
    });
    res.json(result);
  });
  api.post('/recipes/:id/preflight',(req,res)=>{const recipe=store.getRecipe(req.params.id);if(!recipe)throw new ProjectError('Recipe not found',404);const body=z.object({replacements:refs.default({}),ingredients:z.record(z.string().max(60),z.string().max(2000)).default({})}).parse(req.body);res.json(recipePreflight(store,recipe,body.replacements,body.ingredients));});
  api.patch('/recipes/:id',(req,res)=>{const recipe=store.getRecipe(req.params.id);if(!recipe)throw new ProjectError('Recipe not found',404);const body=z.object({name:z.string().min(1).max(240).optional(),slots:z.array(slotSchema).max(12).optional(),promptTemplate:z.string().max(20000).optional(),ingredients:z.array(ingredientSchema).max(20).optional(),previewAssetId:id.optional(),sourceTakeId:id.optional()}).strict().parse(req.body);if(body.slots){if(new Set(body.slots.map(s=>s.key)).size!==body.slots.length)throw new ProjectError('Recipe slot names must be unique.');for(const slot of body.slots)if(slot.defaultAssetId)validAssets(store,recipe.projectId,{slot:slot.defaultAssetId});}if(body.previewAssetId)validAssets(store,recipe.projectId,{preview:body.previewAssetId});if(body.sourceTakeId&&store.getTake(body.sourceTakeId)?.projectId!==recipe.projectId)throw new ProjectError('Recipe source take must belong to this project.');if(body.ingredients&&new Set(body.ingredients.map(i=>i.key)).size!==body.ingredients.length)throw new ProjectError('Ingredient keys must be unique.');res.json(store.upsertRecipe({...recipe,...body,reproductionLimits:recipe.reproductionLimits??limitations}));});
  api.use((error:unknown,_req:unknown,res:any,_next:unknown)=>res.status(error instanceof ProjectError?error.status:400).json({error:error instanceof z.ZodError?error.issues.map(i=>i.message).join('; '):error instanceof Error?error.message:'Invalid scene request.'}));return api;
}
