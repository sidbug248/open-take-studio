import {constants,createReadStream} from 'node:fs';
import {copyFile,mkdir,readFile,stat,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import assert from 'node:assert/strict';
import {Store} from '../server/store.ts';

const root=path.resolve('artifacts/first-impression'),exportsDirectory=path.join(root,'exports');
const json=async(file:string)=>JSON.parse(await readFile(file,'utf8'));
const digest=async(file:string)=>{const hash=createHash('sha256');for await(const bytes of createReadStream(file))hash.update(bytes);return hash.digest('hex');};
await mkdir(exportsDirectory,{recursive:true});
const latest=await json(path.join(root,'journey-package-verification/latest.json')),audit=await json(latest.receipt);
const names:Record<string,string>={
  '456f5fdb-e79b-4946-9122-dc17e7a291e3':'Prismatic-Three-possible-skies.opentake.zip',
  '1bec0508-6565-4cf8-9666-f07d224351a1':'Liquid-Directed-Object.opentake.zip',
  '1659408b-f807-418b-8a67-3c2404e0d12e':'Voices-Mixed-Soundtrack.opentake.zip',
};
const projects=[];
for(const project of audit.projects){
  const filename=names[project.projectId];assert.ok(filename,'Unknown audited delivery project');
  const source=path.resolve(path.dirname(latest.receipt),project.file),destination=path.join(exportsDirectory,filename);
  assert.equal(path.dirname(source),path.dirname(latest.receipt),'Source package must be beside its audit');
  assert.equal(await digest(source),project.sha256);assert.equal((await stat(source)).size,project.packageBytes);
  try{await copyFile(source,destination,constants.COPYFILE_EXCL);}catch(error){if((error as NodeJS.ErrnoException).code!=='EEXIST')throw error;}
  assert.equal(await digest(destination),project.sha256,'A different existing delivery package must be preserved');
  projects.push({projectId:project.projectId,name:project.name,path:destination,bytes:project.packageBytes,sha256:project.sha256,sourceAudit:latest.receipt,assets:project.assets,takes:project.takes,jobs:project.jobs,isolatedRestoreVerified:true});
}
const files=[];
for(const filename of ['Prismatic-Three-possible-skies.playable.zip','Afterlight-directed-scene.spatial.zip','Prismatic - Glass koi ending.mp4','Prismatic - Selected glass koi cut.mp4','Liquid-Directed-Scene-H3.mp4','Voices-Mixed-Soundtrack-Motion.mp4']){
  const file=path.join(exportsDirectory,filename);files.push({path:file,bytes:(await stat(file)).size,sha256:await digest(file)});
}
const preservationPath=path.join(root,'preservation/checkpoint-preservation.json'),preservation=await json(preservationPath),censusPointer=await json(path.join(root,'inventory/latest.json')),censusPath=path.join(root,'inventory',censusPointer.file),census=await json(censusPath);
assert.deepEqual(census.counts,preservation.counts);assert.equal(census.active.length,0);assert.equal(preservation.originalMediaVerified,443);
const store=new Store('data',{readOnly:true});let activeJobs:unknown[];
try{activeJobs=store.db.prepare("SELECT id,state FROM job_status WHERE state IN ('PENDING','SUBMITTING','IN_QUEUE','IN_PROGRESS','COLLECTING','RETRY_WAIT') AND NOT EXISTS(SELECT 1 FROM archived_jobs a WHERE a.job_id=job_status.id)").all();assert.equal(activeJobs.length,0);}finally{store.close();}
const healthResponse=await fetch('http://127.0.0.1:4310/api/health',{signal:AbortSignal.timeout(10000)}),health=await healthResponse.json();assert.equal(healthResponse.status,200);assert.equal(health.ok,true);
const player=await fetch('http://127.0.0.1:4335/',{method:'HEAD',signal:AbortSignal.timeout(10000)});assert.equal(player.status,200);
const receipt={createdAt:new Date().toISOString(),scope:'Stable copies of verified packages and actual exported media; read-only final census, preservation, and health checks. No generation or live project edits.',studio:{url:'http://127.0.0.1:4310',status:healthResponse.status,ok:health.ok,sdkVersion:health.sdkVersion,activeJobs},portablePlayer:{url:'http://127.0.0.1:4335',status:player.status,folder:path.join(exportsDirectory,'Prismatic-player')},projects,files,latestAudit:latest.receipt,auditVerifiedAt:audit.verifiedAt,restoredTotals:audit.totals,verifiedMediaBytes:audit.totalMediaBytesVerified,preservation:{path:preservationPath,verifiedAt:preservation.verifiedAt,originalMediaVerified:preservation.originalMediaVerified,counts:preservation.counts},census:{path:censusPath,capturedAt:census.capturedAt,prepared:census.prepared,routeReadinessChanges:census.catalogue.routeReadinessChanges},qaProxyShutdownReceipt:path.join(root,'arrival-proxies/shutdown-receipt.json')};
await writeFile(path.join(exportsDirectory,'delivery-index.json'),JSON.stringify(receipt,null,2));
console.log(JSON.stringify({deliveryIndex:path.join(exportsDirectory,'delivery-index.json'),projects,counts:preservation.counts,activeJobs,studioHealthy:true,portablePlayerHealthy:true},null,2));
