import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {DatabaseSync} from 'node:sqlite';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import path from 'node:path';
import {Store} from '../server/store.ts';
import {LocalFileStorage} from '../server/media.ts';
import {ExploreService} from '../server/explore-service.ts';
const hash=(value:Buffer|string)=>createHash('sha256').update(value).digest('hex');
const checkpoint=path.resolve('artifacts/first-impression/checkpoint-2026-11-03'),directory=path.resolve('artifacts/first-impression/preservation');

/** Read-only audit. Full historical bodies are inspected here explicitly, never by discovery routes. */
export async function verifyFirstImpressionPreservation(){
  await mkdir(directory,{recursive:true});const before=new DatabaseSync(path.join(checkpoint,'studio.sqlite'),{readOnly:true}),current=new Store('data',{readOnly:true}),media=new LocalFileStorage('data'),checkpointReceipt=JSON.parse(await readFile(path.join(checkpoint,'receipt.json'),'utf8'));
  const records:Record<string,{count:number;ids:string[];unchangedRows:number;changedMutableRows:string[]}>=Object.create(null),mediaHashes:{id:string;sha256:string;bytes:number}[]=[];
  try{
    for(const table of ['projects','assets','takes','jobs','shots','recipes']){
      const ids:string[]=[],changedMutableRows:string[]=[];let unchangedRows=0;
      for(const row of before.prepare(`SELECT id,data FROM ${table}`).iterate() as Iterable<{id:string;data:string}>){const retained=current.db.prepare(`SELECT data FROM ${table} WHERE id=?`).get(row.id) as {data:string}|undefined;assert.ok(retained,`Checkpoint ${table} record is missing: ${row.id}`);ids.push(row.id);if(hash(row.data)===hash(retained.data)){unchangedRows++;continue;}const original=JSON.parse(row.data),latest=JSON.parse(retained.data);changedMutableRows.push(row.id);
        if(table==='jobs')assert.deepEqual(latest,original,`Historical execution changed: ${row.id}`);
        if(table==='assets')for(const key of ['id','projectId','fileName','mimeType','kind','size','sha256','provenance','createdAt'])assert.deepEqual(latest[key],original[key],`Original media identity changed: ${row.id}.${key}`);
        if(table==='takes')for(const key of ['id','projectId','parentTakeId','sourceAssetId','inputAssetIds','assetIds','modelId','provider','prompt','settings','createdAt','jobId','executionRoute','workflowVersionAssetId','referenceRoles'])assert.deepEqual(latest[key],original[key],`Original take production history changed: ${row.id}.${key}`);
        if(table==='projects'){for(const film of original.films??[])assert.deepEqual(latest.films?.find((f:any)=>f.id===film.id),film,`Original film changed: ${film.id}`);for(const scene of original.scenes??[]){const kept=latest.scenes?.find((s:any)=>s.id===scene.id);assert.ok(kept,`Original scene missing: ${scene.id}`);for(const revision of scene.revisions)assert.deepEqual(kept.revisions.find((r:any)=>r.id===revision.id),revision,`Original scene revision changed: ${revision.id}`);}}
        if(table==='recipes')for(const key of ['id','projectId','modelId','prompt','settings','inputAssetIds','createdAt','slots','promptTemplate','ingredients','sourceTakeId'])assert.deepEqual(latest[key],original[key],`Original recipe changed: ${row.id}.${key}`);
      }
      records[table]={count:ids.length,ids,unchangedRows,changedMutableRows};
    }
    for(const original of checkpointReceipt.assets){const asset=current.getAsset(original.id)!;assert.equal(asset.sha256,original.sha256);assert.equal(asset.fileName,original.fileName);const bytes=await media.read(asset);assert.equal(bytes.length,original.bytes);assert.equal(hash(bytes),original.sha256);mediaHashes.push({id:asset.id,sha256:asset.sha256,bytes:bytes.length});}
    const counts=Object.fromEntries(['projects','assets','takes','jobs','shots','recipes','job_status'].map(table=>[table,(current.db.prepare(`SELECT count(*) AS n FROM ${table}`).get() as {n:number}).n]));
    const explore=new ExploreService(current,media);current.listJobs=()=>{throw new Error('Discovery/status attempted to read complete job bodies');};current.projectDetail=()=>{throw new Error('Discovery attempted full project history fanout');};const started=performance.now(),bootstrap=await explore.bootstrap();assert.equal(bootstrap.journeys.length,3);const summaries=bootstrap.projects.map(project=>{const jobs=current.listJobSummaries(project.id);assert.ok(jobs.every(j=>Object.keys(j.inputs).length===0&&!('result'in j)&&!('resultMetadata'in j)));return{projectId:project.id,jobs:jobs.length,summaryBytes:Buffer.byteLength(JSON.stringify(jobs))};});
    const receipt={verifiedAt:new Date().toISOString(),checkpoint,checkpointCreatedAt:checkpointReceipt.createdAt,scope:'All checkpoint identities and stored media, immutable production relationships, exact historical job records, and discovery/status read-model independence. Read-only database connections; no live mutations.',counts,records,originalMediaVerified:mediaHashes.length,originalMediaBytes:mediaHashes.reduce((sum,a)=>sum+a.bytes,0),mediaHashes,readModel:{bootstrapBytes:Buffer.byteLength(JSON.stringify(bootstrap)),bootstrapAndStatusMs:Math.round(performance.now()-started),summaries,fullHistoryMethodsDisabled:true}};await writeFile(path.join(directory,'checkpoint-preservation.json'),JSON.stringify(receipt,null,2));console.log(JSON.stringify({counts,preserved:Object.fromEntries(Object.entries(records).map(([key,value])=>[key,value.count])),originalMediaVerified:mediaHashes.length,fullHistoryMethodsDisabled:true}));return receipt;
  }finally{before.close();current.close();}
}
if(process.argv[1]?.endsWith('verify-first-impression-preservation.ts'))await verifyFirstImpressionPreservation();
