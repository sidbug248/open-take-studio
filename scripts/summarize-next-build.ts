import {readFile,writeFile} from 'node:fs/promises';
const base='http://127.0.0.1:4310/api';
async function get(route:string){const response=await fetch(base+route);if(!response.ok)throw new Error(route+': '+response.status);return response.json();}
const checkpoint=JSON.parse(await readFile('artifacts/next-build/checkpoint-2026-11-03/receipt.json','utf8'));
const projects=await get('/projects'),details=await Promise.all(projects.map((p:any)=>get('/projects/'+p.id)));
const takes=details.flatMap(d=>d.takes),assets=details.flatMap(d=>d.assets),jobs=details.flatMap(d=>d.jobs);
const newJobs=jobs.filter(j=>j.createdAt>checkpoint.createdAt),newAssets=assets.filter(a=>a.createdAt>checkpoint.createdAt);
const count=(items:any[],key:string)=>items.reduce((out:any,item:any)=>{out[item[key]??'unknown']=(out[item[key]??'unknown']??0)+1;return out;},{});
const summary={verifiedAt:new Date().toISOString(),checkpoint:checkpoint.createdAt,totals:{projects:projects.length,takes:takes.length,assets:assets.length,jobs:jobs.length},newProduction:{jobs:newJobs.length,statuses:count(newJobs,'state'),byModel:count(newJobs,'modelId'),assets:newAssets.length,mediaKinds:count(newAssets,'kind')},active:jobs.filter(j=>!['COMPLETED','FAILED','BLOCKED','EXPIRED'].includes(j.state)).map(j=>({id:j.id,modelId:j.modelId,state:j.state})),projectCounts:details.map(d=>({id:d.project.id,name:d.project.name,takes:d.takes.length,assets:d.assets.length,jobs:d.jobs.length,films:d.project.films?.length??0,scenes:d.project.scenes?.length??0,recipes:d.recipes.length}))};
await writeFile('artifacts/next-build/final-production-summary.json',JSON.stringify(summary,null,2));
console.log(JSON.stringify(summary));

