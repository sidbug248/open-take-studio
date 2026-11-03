import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {Store} from '../server/store.ts';
import {LocalFileStorage} from '../server/media.ts';
import {ExploreService} from '../server/explore-service.ts';
import type {StudioRuntime} from '../server/studio-runtime.ts';
import {ReviewerDiscovery} from '../server/reviewer-discovery.ts';
import {REVIEWER_EXAMPLE_IDS,remixReviewerExampleWithMapping,resolveReviewerExampleMedia} from '../server/reviewer-showcase.ts';

const sha=(value:Buffer|string)=>createHash('sha256').update(value).digest('hex');
const stamp=new Date().toISOString().replace(/[:.]/g,'-'),base=path.resolve('data/reviewer-discovery-validation',stamp),artifacts=path.resolve('artifacts/reviewer-discovery',stamp);
await mkdir(base,{recursive:true});await mkdir(artifacts,{recursive:true});
const runtime=(directory:string,readOnly=false)=>{const store=new Store(directory,{readOnly}),media=new LocalFileStorage(directory),explore=new ExploreService(store,media);return{store,media,explore} as StudioRuntime;};
const owner=runtime(path.resolve('data'),true),target=runtime(base),facade=new ReviewerDiscovery(owner);
const snapshot=()=>REVIEWER_EXAMPLE_IDS.map(id=>({project:owner.store.getProject(id),assets:owner.store.listAssets(id),takes:owner.store.listTakes(id),shots:owner.store.listShots(id),recipes:owner.store.listRecipes(id)}));
const before=sha(JSON.stringify(snapshot())),counts=()=>Object.fromEntries(['projects','assets','takes','jobs','recipes'].map(table=>[table,(owner.store.db.prepare(`SELECT count(*) AS n FROM ${table}`).get() as {n:number}).n]));
const originalCounts=counts(),results:unknown[]=[];
try{
  const bootstrap=await facade.bootstrap();assert.equal(bootstrap.projects.length,REVIEWER_EXAMPLE_IDS.length);assert.equal(bootstrap.journeys.length,3);assert.ok(bootstrap.hero?.media.preview);assert.doesNotMatch(JSON.stringify(bootstrap),/\/api\/assets\/|\/api\/display\/|idempotencyKey|submittedInputs/);
  for(const journey of bootstrap.journeys){assert.ok(journey.action.projectId.startsWith('showcase:'));for(const display of[journey.result.media,journey.source?.media]){if(!display)continue;for(const url of[display.poster?.url,display.preview?.url,display.mesh?.url]){if(!url)continue;const parsed=new URL(url,'http://studio.invalid'),parts=parsed.pathname.split('/');const file=await resolveReviewerExampleMedia(owner,parts[4]!,parts[6]!,parsed.searchParams.get('variant')??'original');assert.ok((await readFile(file.path)).length>0);}}}
  for(const id of REVIEWER_EXAMPLE_IDS){
    const result=await remixReviewerExampleWithMapping(owner,target,id),map=result.idMap,source=owner.store.getProject(id)!,copied=target.store.projectDetail(result.projectId)!;assert.equal(copied.jobs.length,0);assert.equal(map['showcase:'+id],result.projectId);
    let exactBinary=0;for(const asset of owner.store.listAssets(id)){if(!map[asset.id]){assert.ok(asset.mimeType==='application/zip'||/comfy-workflow-execution|executed-workflow|executed-graph/.test(String(asset.metadata.operation)));continue;}const imported=target.store.getAsset(map[asset.id])!;assert.equal(imported.projectId,result.projectId);const bytes=await target.media.read(imported);assert.equal(sha(bytes),imported.sha256);if(asset.mimeType!=='application/json'&&!asset.mimeType.startsWith('text/')){assert.equal(imported.sha256,asset.sha256);exactBinary++;}}
    for(const take of owner.store.listTakes(id)){const imported=target.store.getTake(map[take.id])!;assert.ok(imported);assert.equal(imported.jobId,undefined);assert.equal(imported.parentTakeId,take.parentTakeId?map[take.parentTakeId]:undefined);assert.equal(imported.sourceAssetId,take.sourceAssetId?map[take.sourceAssetId]:undefined);if(take.sceneBinding){assert.equal(imported.sceneBinding?.sceneId,map[take.sceneBinding.sceneId]);assert.equal(imported.sceneBinding?.revisionId,map[take.sceneBinding.revisionId]);}}
    for(const film of source.films??[]){const imported=copied.project.films!.find(item=>item.id===map[film.id])!;assert.ok(imported);assert.equal(imported.parentFilmId,film.parentFilmId?map[film.parentFilmId]:undefined);assert.equal(imported.opening.assetId,map[film.opening.assetId]);assert.equal(imported.sourceMoment?.frameAssetId,film.sourceMoment?.frameAssetId?map[film.sourceMoment.frameAssetId]:undefined);for(const choice of film.choices){const clone=imported.choices.find(item=>item.id===map[choice.id])!;assert.equal(clone.clip.assetId,map[choice.clip.assetId]);assert.equal(clone.clip.takeId,choice.clip.takeId?map[choice.clip.takeId]:undefined);}}
    for(const recipe of owner.store.listRecipes(id)){const imported=target.store.getRecipe(map[recipe.id])!;assert.ok(imported);assert.equal(imported.previewAssetId,recipe.previewAssetId?map[recipe.previewAssetId]:undefined);assert.equal(imported.sourceTakeId,recipe.sourceTakeId?map[recipe.sourceTakeId]:undefined);recipe.slots?.forEach((slot,index)=>assert.equal(imported.slots?.[index]?.defaultAssetId,slot.defaultAssetId?map[slot.defaultAssetId]:undefined));}
    const journey=bootstrap.journeys.find(item=>item.action.projectId==='showcase:'+id);const remapped=journey?Object.fromEntries(Object.entries(journey.action).map(([key,value])=>[key,typeof value==='string'&&(key==='projectId'||/Id$/.test(key))?map[value]:value])):undefined;if(remapped)for(const[key,value]of Object.entries(remapped))if(key==='projectId'||/Id$/.test(key))assert.ok(value,'Missing action mapping '+key);
    results.push({sourceProjectId:id,projectId:result.projectId,mappedIds:Object.keys(map).length,assets:copied.assets.length,takes:copied.takes.length,recipes:copied.recipes.length,films:copied.project.films?.length??0,exactBinaryMedia:exactBinary,action:remapped});
  }
  const catalogue=await facade.catalogue();assert.ok(catalogue.capabilities.length>30);assert.ok(!/"(?:url|posterUrl|previewUrl)":"\/api\/(?:assets|display)\/[A-Za-z0-9_-]+|"idempotencyKey"|"submittedInputs"|"requestId"|"jobId"/.test(JSON.stringify(catalogue)),'Catalogue contains a private media URL or execution reference');
  assert.equal(sha(JSON.stringify(snapshot())),before);assert.deepEqual(counts(),originalCounts);
  const output={verifiedAt:new Date().toISOString(),sourceReadOnly:true,noProviderCalls:true,originalCounts,ownerRecordsSha256:before,sourceRecordsUnchanged:true,bootstrap:{projects:bootstrap.projects.length,journeys:bootstrap.journeys.length,hero:bootstrap.hero?.id,firstPage:bootstrap.firstPage.items.length},catalogue:{capabilities:catalogue.capabilities.length,demonstrations:catalogue.capabilities.reduce((sum,item)=>sum+item.demonstrations.length,0)},isolatedDataDirectory:base,results};await writeFile(path.join(artifacts,'receipt.json'),JSON.stringify(output,null,2));process.stdout.write(JSON.stringify({receipt:path.join(artifacts,'receipt.json'),...output})+'\n');
}finally{owner.store.close();target.store.close();}
