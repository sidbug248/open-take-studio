import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import AdmZip from 'adm-zip';
import {createStore} from '../server/store.ts';
import {LocalFileStorage} from '../server/media.ts';
import {importProject} from '../server/project-routes.ts';
import {unpackInlineMedia} from '../server/package-inline-media.ts';
import {workflowFromAsset} from '../server/workflow-routes.ts';
import type {Asset,Project,ProjectDetail} from '../shared/types.ts';
const base='http://127.0.0.1:4310/api',directory=path.resolve('artifacts/native-workflows/packages');await mkdir(directory,{recursive:true});
const restoreDirectory=path.join(directory,`isolated-restore-${Date.now()}`),store=createStore(restoreDirectory),media=new LocalFileStorage(restoreDirectory),receipts:any[]=[];
const get=async(route:string)=>{const response=await fetch(base+route);if(!response.ok)throw new Error(`${route}: HTTP ${response.status}`);return Buffer.from(await response.arrayBuffer());};
const hash=(bytes:Buffer)=>createHash('sha256').update(bytes).digest('hex');
try{const projects=JSON.parse((await get('/projects')).toString()) as Project[];for(const project of projects){const detail=JSON.parse((await get(`/projects/${project.id}`)).toString()) as ProjectDetail;if(!detail.jobs.some(job=>job.executionRoute==='comfy-workflow'))continue;
  if(detail.jobs.some(job=>job.executionRoute==='comfy-workflow'&&['PENDING','SUBMITTING','IN_QUEUE','IN_PROGRESS','COLLECTING','RETRY_WAIT'].includes(job.state)))throw new Error(`${project.name} still has an active native execution; retain it and rerun this read-only audit later`);
  const bytes=await get(`/projects/${project.id}/export`),file=project.name.replace(/[^A-Za-z0-9_-]/g,'-')+'.native-production.opentake.zip';await writeFile(path.join(directory,file),bytes);const zip=new AdmZip(bytes),original=unpackInlineMedia(JSON.parse(zip.readAsText('manifest.json')),zip).manifest as ProjectDetail;
  const imported=await importProject(store,media,bytes),restored=store.projectDetail(imported.id)!;assert.equal(restored.assets.length,original.assets.length);assert.equal(restored.takes.length,original.takes.length);assert.equal(restored.jobs.length,original.jobs.length);
  const assets=new Map<string,Asset>(restored.assets.map(asset=>[(asset.metadata.packageImport as {sourceAssetId:string}).sourceAssetId,asset]));
  for(const source of original.assets){const target=assets.get(source.id)!;assert.equal(hash(await media.read(target)),source.sha256);assert.equal(target.sha256,source.sha256);if(source.metadata.operation==='comfy-workflow-version'){const before=workflowFromAsset(source),after=workflowFromAsset(target);assert.deepEqual(after.apiGraph,before.apiGraph);assert.deepEqual(after.editorGraph,before.editorGraph);assert.equal(after.graphSha256,before.graphSha256);assert.equal(after.cloudEditorUrl,before.cloudEditorUrl);assert.equal(after.parentVersionAssetId,before.parentVersionAssetId?assets.get(before.parentVersionAssetId)!.id:undefined);}}
  const jobs=original.jobs.filter(job=>job.executionRoute==='comfy-workflow');for(const source of jobs){const target=restored.jobs.find(job=>(job as any).archive?.sourceJobId===source.id)!;assert.ok(target);assert.ok(store.isArchivedJob(target.id));assert.equal(target.requestId,source.requestId);assert.equal(target.state,source.state);assert.equal(target.workflow!.versionAssetId,assets.get(source.workflow!.versionAssetId)!.id);assert.equal(target.workflow!.executedGraphAssetId,source.workflow!.executedGraphAssetId?assets.get(source.workflow!.executedGraphAssetId)!.id:undefined);assert.equal(target.workflow!.origin,source.workflow!.origin);
    for(const[key,value]of Object.entries(source.workflow!.values))assert.deepEqual(target.workflow!.values[key],typeof value==='object'?{assetId:assets.get(value.assetId)!.id}:value);
    for(const[key,value]of Object.entries(source.workflow!.uploads??{})){assert.equal(target.workflow!.uploads![key].assetId,assets.get(value.assetId)!.id);assert.equal(target.workflow!.uploads![key].remoteId,value.remoteId);assert.equal(target.workflow!.uploads![key].sha256,value.sha256);}
    const take=restored.takes.find(take=>take.id===target.takeId)!,originalTake=original.takes.find(take=>take.id===source.takeId)!;assert.equal(take.workflowVersionAssetId,target.workflow!.versionAssetId);assert.deepEqual(take.assetIds,originalTake.assetIds.map(id=>assets.get(id)!.id));assert.equal(take.sourceAssetId,originalTake.sourceAssetId?assets.get(originalTake.sourceAssetId)!.id:undefined);assert.equal(take.provenance,'imported');
  }
  assert.equal(store.listRunnableJobs().filter(job=>job.projectId===imported.id).length,0);
  receipts.push({projectId:project.id,name:project.name,package:file,packageSha256:hash(bytes),packageBytes:bytes.length,restoredProjectId:imported.id,assets:restored.assets.length,takes:restored.takes.length,jobs:restored.jobs.length,nativeExecutions:jobs.length,workflowVersions:original.assets.filter(asset=>asset.metadata.operation==='comfy-workflow-version').length,allMediaHashesVerified:true,nativeRelationshipsRemapped:true,allRestoredJobsArchived:true});
  console.log(JSON.stringify(receipts.at(-1)));
}}finally{store.close();}
const reopened=createStore(restoreDirectory);try{for(const receipt of receipts){const detail=reopened.projectDetail(receipt.restoredProjectId)!;assert.equal(detail.assets.length,receipt.assets);assert.equal(detail.jobs.length,receipt.jobs);receipt.databaseReopened=true;}}finally{reopened.close();}
await writeFile(path.join(directory,'verification-receipt.json'),JSON.stringify({verifiedAt:new Date().toISOString(),source:'Read-only HTTP production export; isolated restore only. Live database unchanged.',restoreDirectory,projects:receipts},null,2));
