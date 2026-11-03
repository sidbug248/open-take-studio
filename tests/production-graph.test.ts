import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import express,{type ErrorRequestHandler} from 'express';
import sharp from 'sharp';
import AdmZip from 'adm-zip';
import { Store } from '../server/store.ts';
import { LocalFileStorage } from '../server/media.ts';
import { createProductionGraphRouter, runProductionGraph, saveProductionGraph, validateProductionGraph } from '../server/production-graph.ts';
import { createGenerationRouter } from '../server/generation-routes.ts';
import type { GenerationWorker } from '../server/worker.ts';
import { setAccess } from '../server/auth-access.ts';
import { exportProject, importProject } from '../server/project-routes.ts';
import { MODEL_REGISTRY } from '../server/model-registry.ts';
import type { ProductionGraphDocument, ProductionGraphRunResponse, ProductionGraphVersion } from '../shared/production-graph-types.ts';
import type { Asset, Recipe } from '../shared/types.ts';

async function fixture(){
  const baseDir=path.resolve('data/test-fixtures');await mkdir(baseDir,{recursive:true});
  const dir=await mkdtemp(path.join(baseDir,'production-graph-')),store=new Store(dir),media=new LocalFileStorage(dir),time=new Date().toISOString();
  for(const id of ['p','other'])store.upsertProject({id,name:'Graph '+id,description:'',createdAt:time,updatedAt:time});
  let ticks=0;
  const app=express();app.use(express.json({limit:'2mb'}));
  app.use((req,_res,next)=>{if(req.header('x-test-no-auth')!=='yes'){const scope=req.header('x-test-scope');setAccess(req,scope?{kind:'scoped-token',subjectId:'test-reader',projectIds:[scope],permissions:['read','write','generate']}:{kind:'local-owner',subjectId:'test-owner',permissions:['read','write','generate','share']});}next();});
  app.use('/api',createProductionGraphRouter(store,media));
  app.use('/api',createGenerationRouter(store,media,{tick:async()=>{ticks++;}} as unknown as GenerationWorker));
  app.use(((error,_req,res,_next)=>res.status(error.status??400).json({error:error.message})) as ErrorRequestHandler);
  const server=await new Promise<ReturnType<typeof app.listen>>(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
  const url='http://127.0.0.1:'+(server.address() as AddressInfo).port+'/api';
  const post=(route:string,body:unknown,headers:Record<string,string>={})=>fetch(url+route,{method:'POST',headers:{'content-type':'application/json',...headers},body:JSON.stringify(body)});
  let stopped=false,closed=false;
  return {dir,store,media,url,post,ticks:()=>ticks,
    async stopHTTP(){if(!stopped){await new Promise<void>(resolve=>server.close(()=>resolve()));stopped=true;}},
    closeStore(){if(!closed){store.close();closed=true;}},
    async dispose(){if(!stopped)await new Promise<void>(resolve=>server.close(()=>resolve()));if(!closed)store.close();assert.equal(path.dirname(dir),baseDir);await rm(dir,{recursive:true,force:true});}
  };
}
async function source(f:Awaited<ReturnType<typeof fixture>>,color:string,projectId='p'){
  const asset=await f.media.put({projectId,name:color+'.png',mimeType:'image/png',kind:'image',provenance:'imported',bytes:await sharp({create:{width:64,height:64,channels:4,background:color}}).png().toBuffer()});f.store.upsertAsset(asset);return asset;
}
const edge=(id:string,from:string,to:string,toPort:string)=>({id,from,fromPort:'output' as const,to,toPort});
function localGraph(red:Asset,blue:Asset):ProductionGraphDocument{return {
  version:1,kind:'production-graph',name:'Two-frame delivery',
  nodes:[
    {id:'red',kind:'asset',assetId:red.id,label:'Red source',x:30,y:20},
    {id:'blue',kind:'asset',assetId:blue.id,label:'Blue source',x:30,y:320},
    {id:'resize',kind:'resize',label:'Wide red',width:128,height:64,fit:'cover',background:'#ffffff',x:340,y:20},
    {id:'sheet',kind:'storyboard',label:'Contact sheet',title:'Two actual images',columns:2,x:650,y:160},
    {id:'delivery',kind:'delivery',label:'Final files',caption:'A red frame and a blue frame.',x:950,y:160}
  ],
  edges:[edge('e1','red','resize','image'),edge('e2','resize','sheet','images'),edge('e3','blue','sheet','images'),edge('e4','sheet','delivery','media'),edge('e5','resize','delivery','media')]
};}
async function saved(f:Awaited<ReturnType<typeof fixture>>,document:ProductionGraphDocument){
  const response=await f.post('/projects/p/production-graphs',{document});assert.equal(response.status,201,await response.clone().text());return await response.json() as ProductionGraphVersion;
}
test('production canvas executes real image/ZIP bytes, deduplicates concurrent runs, and reopens without providers',async()=>{
  const f=await fixture();try{
    const red=await source(f,'red'),blue=await source(f,'blue'),graph=localGraph(red,blue),version=await saved(f,graph);
    const route='/assets/'+version.asset.id+'/production-graph/runs';
    const responses=await Promise.all([f.post(route,{clientRequestId:'one-intended-local-run'}),f.post(route,{clientRequestId:'one-intended-local-run'})]);
    for(const response of responses)assert.equal(response.status,200,await response.clone().text());
    const result=await responses[0].json() as ProductionGraphRunResponse,duplicate=await responses[1].json() as ProductionGraphRunResponse;
    assert.equal(result.run.state,'complete');assert.deepEqual(duplicate.run.nodes,result.run.nodes);assert.equal(f.store.listAssets('p').length,6);
    const resized=f.store.getAsset(result.run.nodes.find(n=>n.nodeId==='resize')!.assetIds[0])!,sheet=f.store.getAsset(result.run.nodes.find(n=>n.nodeId==='sheet')!.assetIds[0])!,delivery=f.store.getAsset(result.run.nodes.find(n=>n.nodeId==='delivery')!.assetIds[0])!;
    const meta=await sharp(await f.media.read(resized)).metadata();assert.equal(meta.width,128);assert.equal(meta.height,64);
    const pixel=await sharp(await f.media.read(resized)).extract({left:64,top:32,width:1,height:1}).raw().toBuffer();assert.deepEqual([...pixel],[255,0,0,255]);
    const sheetMeta=await sharp(await f.media.read(sheet)).metadata();assert.equal(sheetMeta.width,1600);
    const redTile=await sharp(await f.media.read(sheet)).extract({left:400,top:300,width:1,height:1}).raw().toBuffer();
    const blueTile=await sharp(await f.media.read(sheet)).extract({left:1180,top:300,width:1,height:1}).raw().toBuffer();
    assert.deepEqual([...redTile],[255,0,0,255]);assert.deepEqual([...blueTile],[0,0,255,255]);
    const zip=new AdmZip(await f.media.read(delivery)),manifest=JSON.parse(zip.readAsText('delivery.json'));
    assert.equal(manifest.assets.length,2);assert.equal(zip.readAsText('caption.txt'),'A red frame and a blue frame.');
    const sheetBytes=await f.media.read(sheet);assert.ok(zip.getEntries().some(entry=>entry.entryName.startsWith('media/')&&entry.getData().equals(sheetBytes)));
    assert.equal(delivery.metadata.productionGraphVersionAssetId,version.asset.id);assert.equal(f.store.listJobs().length,0);assert.equal(f.ticks(),0);
    const before=f.store.listAssets('p').map(a=>a.id);await f.stopHTTP();f.closeStore();
    const reopened=new Store(f.dir);try{const again=await runProductionGraph(reopened,new LocalFileStorage(f.dir),version.asset.id,'one-intended-local-run');assert.equal(again.id,result.run.id);assert.equal(again.state,'complete');assert.deepEqual(reopened.listAssets('p').map(a=>a.id),before);}finally{reopened.close();}
  }finally{await f.dispose();}
});
test('graph versions and source/recipe references survive project export, import, and a fresh local run',async()=>{
  const f=await fixture();try{
    const red=await source(f,'red'),blue=await source(f,'blue'),document=localGraph(red,blue),one=await saved(f,document);
    const two=await saveProductionGraph(f.store,f.media,'p',{...document,name:'Second saved version'},one.asset.id);
    assert.equal(two.parentVersionAssetId,one.asset.id);
    await runProductionGraph(f.store,f.media,two.asset.id,'before-package-export');
    const imported=await importProject(f.store,f.media,await exportProject(f.store,f.media,'p'));
    const graphs=f.store.listAssets(imported.id).filter(a=>a.metadata.operation==='production-graph-document');assert.equal(graphs.length,2);
    const importedVersion=graphs.find(a=>(a.metadata.productionGraphDocument as ProductionGraphDocument).name==='Second saved version')!;
    const graph=validateProductionGraph(f.store,imported.id,importedVersion.metadata.productionGraphDocument);
    for(const n of graph.nodes)if(n.kind==='asset')assert.equal(f.store.getAsset(n.assetId)?.projectId,imported.id);
    assert.equal(f.store.getAsset(importedVersion.metadata.parentVersionAssetId as string)?.projectId,imported.id);
    const rerun=await runProductionGraph(f.store,f.media,importedVersion.id,'run-after-import');
    assert.equal(rerun.state,'complete');for(const n of rerun.nodes)for(const aid of n.assetIds)assert.equal(f.store.getAsset(aid)?.projectId,imported.id);
    assert.equal(f.store.listJobs().length,0);
  }finally{await f.dispose();}
});
test('typed graph validation rejects cycles, foreign sources/recipes, duplicate wires, and incompatible media',async()=>{
  const f=await fixture();try{
    const red=await source(f,'red'),blue=await source(f,'blue'),foreign=await source(f,'green','other'),graph=localGraph(red,blue);
    const invalid=async(document:unknown,pattern:RegExp)=>{const response=await f.post('/projects/p/production-graphs',{document});assert.equal(response.status,400);assert.match((await response.json()).error,pattern);};
    await invalid({...graph,nodes:graph.nodes.map(n=>n.id==='red'?{...n,assetId:foreign.id}:n)},/belong to this project/);
    await invalid({...graph,edges:[...graph.edges,{...graph.edges[0],id:'duplicate'}]},/already exists/);
    await invalid({...graph,edges:[...graph.edges,edge('bad-type','delivery','resize','image')]},/incompatible/);
    const cycle:ProductionGraphDocument={version:1,kind:'production-graph',name:'Cycle',nodes:[{id:'a',label:'A',x:0,y:0,kind:'resize',width:32,height:32,fit:'cover',background:'#000000'},{id:'b',label:'B',x:300,y:0,kind:'resize',width:32,height:32,fit:'cover',background:'#000000'}],edges:[edge('ab','a','b','image'),edge('ba','b','a','image')]};
    await invalid(cycle,/cycles/);
    await invalid({...graph,nodes:[...graph.nodes,{id:'recipe',kind:'recipe',recipeId:'foreign-recipe',label:'Foreign',x:0,y:0}]},/recipe.*belong/);
    await invalid({...graph,nodes:graph.nodes.map(n=>n.id==='resize'?{...n,width:999999}:n)},/4096/);
    assert.equal(f.store.listAssets('p').length,2);assert.equal(f.store.listScopedRecords('production-graph-run').length,0);
  }finally{await f.dispose();}
});
test('new graph and run endpoints enforce read/write project isolation and reject changed run identities',async()=>{
  const f=await fixture();try{
    const red=await source(f,'red'),blue=await source(f,'blue'),version=await saved(f,localGraph(red,blue));
    const result=await runProductionGraph(f.store,f.media,version.asset.id,'isolation-test-run');
    for(const route of ['/projects/p/production-graphs','/assets/'+version.asset.id+'/production-graph','/production-graph-runs/'+result.id]){
      assert.equal((await fetch(f.url+route,{headers:{'x-test-scope':'other'}})).status,403);
      assert.equal((await fetch(f.url+route,{headers:{'x-test-no-auth':'yes'}})).status,401);
    }
    for(const route of ['/production-graph-runs/'+result.id+'/advance','/production-graph-runs/'+result.id+'/nodes/red/attach-generation'])assert.equal((await f.post(route,{jobId:'no-job'},{'x-test-scope':'other'})).status,403);
    const second=await saved(f,{...version.document,name:'Another version'});
    const conflict=await f.post('/assets/'+second.asset.id+'/production-graph/runs',{clientRequestId:'isolation-test-run'});assert.equal(conflict.status,409);
    assert.equal(f.store.listScopedRecords('production-graph-run').length,1);
  }finally{await f.dispose();}
});
test('recipe nodes wait without submission, attach only the exact explicit request, and resume downstream outputs',async()=>{
  const f=await fixture();try{
    const model=MODEL_REGISTRY.find(m=>m.kind==='image'&&m.status==='implemented'&&m.inputs.length===0)!;assert.ok(model,'A prompt-only image adapter must exist for this contract test.');
    const recipe:Recipe={id:'recipe',projectId:'p',name:'Image recipe',modelId:model.id,prompt:'A small red cube on a clean white background',settings:{},inputAssetIds:{},createdAt:new Date().toISOString()};f.store.upsertRecipe(recipe);
    const graph:ProductionGraphDocument={version:1,kind:'production-graph',name:'Explicit generation',nodes:[{id:'recipe-node',kind:'recipe',recipeId:recipe.id,label:'New image',x:0,y:0},{id:'resize',kind:'resize',label:'Output size',x:350,y:0,width:128,height:128,fit:'cover',background:'#000000'}],edges:[edge('recipe-to-resize','recipe-node','resize','image')]};
    const version=await saved(f,graph),first=await runProductionGraph(f.store,f.media,version.asset.id,'explicit-recipe-run');
    assert.equal(first.nodes[0].state,'ready');assert.equal(first.nodes[1].state,'waiting');assert.equal(f.store.listJobs().length,0);assert.equal(f.ticks(),0);
    await runProductionGraph(f.store,f.media,version.asset.id,'explicit-recipe-run');assert.equal(f.store.listJobs().length,0);
    const badAttach=await f.post('/production-graph-runs/'+first.id+'/nodes/recipe-node/attach-generation',{jobId:'not-the-request'});assert.equal(badAttach.status,409);
    const response=await f.post('/generate',first.nodes[0].request);assert.equal(response.status,202,await response.clone().text());const generated=await response.json();assert.equal(f.ticks(),1);
    const attached=await f.post('/production-graph-runs/'+first.id+'/nodes/recipe-node/attach-generation',{jobId:generated.job.id});assert.equal(attached.status,200,await attached.clone().text());assert.equal((await attached.json()).run.nodes[0].state,'waiting');
    const output=await source(f,'red'),take=f.store.getTake(generated.take.id)!;f.store.upsertTake({...take,assetIds:[output.id],status:'COMPLETED'});f.store.patchJob(generated.job.id,{state:'COMPLETED'});
    const resumed=await runProductionGraph(f.store,f.media,version.asset.id,'explicit-recipe-run');assert.equal(resumed.state,'complete');assert.equal(resumed.nodes[0].jobId,generated.job.id);assert.equal(f.store.listJobs().length,1);assert.equal(f.ticks(),1);
    const completeOutput=f.store.getAsset(resumed.nodes[1].assetIds[0])!;assert.equal((await sharp(await f.media.read(completeOutput)).metadata()).width,128);
    const packaged=await importProject(f.store,f.media,await exportProject(f.store,f.media,'p'));
    const importedGraph=f.store.listAssets(packaged.id).find(a=>a.metadata.operation==='production-graph-document')!;
    const remapped=validateProductionGraph(f.store,packaged.id,importedGraph.metadata.productionGraphDocument),recipeNode=remapped.nodes.find(n=>n.kind==='recipe')!;assert.equal(recipeNode.kind,'recipe');assert.equal(f.store.getRecipe(recipeNode.recipeId)?.projectId,packaged.id);
  }finally{await f.dispose();}
});
test('missing local inputs stay waiting and a processing limit keeps already resolved source references',async()=>{
  const f=await fixture();try{
    const document:ProductionGraphDocument={version:1,kind:'production-graph',name:'Waiting input',nodes:[{id:'resize',kind:'resize',label:'Waiting resize',x:0,y:0,width:128,height:128,fit:'contain',background:'#000000'}],edges:[]};
    const version=await saved(f,document),waiting=await runProductionGraph(f.store,f.media,version.asset.id,'waiting-input-run');assert.equal(waiting.nodes[0].state,'waiting');assert.equal(waiting.nodes[0].assetIds.length,0);assert.equal(f.store.listJobs().length,0);
    const image=await source(f,'red');f.store.upsertAsset({...image,size:33*1024*1024});
    const oversized:ProductionGraphDocument={...document,name:'Bounded source',nodes:[{id:'source',kind:'asset',assetId:image.id,label:'Oversize source',x:0,y:0},...document.nodes],edges:[edge('source-resize','source','resize','image')]};
    const limited=await saved(f,oversized),failed=await runProductionGraph(f.store,f.media,limited.asset.id,'bounded-input-run');
    const step=failed.nodes.find(n=>n.nodeId==='resize')!;assert.equal(step.state,'failed');assert.match(step.message!,/32 MiB/);assert.deepEqual(step.inputAssetIds,[image.id]);assert.equal(f.store.listJobs().length,0);
  }finally{await f.dispose();}
});
