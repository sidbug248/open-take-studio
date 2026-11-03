import { mkdir, readFile, writeFile } from 'node:fs/promises';
const base='http://127.0.0.1:4310';
async function request(path:string,method='GET',body?:unknown){const r=await fetch(base+'/api'+path,{method,headers:{'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});const value=await r.json();if(!r.ok)throw new Error(value.error||`HTTP ${r.status}`);return value;}
const projectId='8836985f-6d32-4686-bf0b-d5d7bcfe4118';
const detail=await request('/projects/'+projectId);
const parent=detail.takes.find((t:any)=>t.id==='116394cb-a032-44a7-897f-039741448ef3');
const nameMap=['Mara · A light in the storm','Mara · Holding the horizon','Mara · Before the squall','Mara · Blue hour','The last light · Opening'];
for(const [i,take]of detail.takes.slice(0,5).entries())await request('/takes/'+take.id,'PATCH',{name:nameMap[i]});
await mkdir('artifacts/redesign',{recursive:true});
let frame;try{frame=JSON.parse(await readFile('artifacts/redesign/branch-frame.json','utf8'));}catch{
  frame=await request('/takes/'+parent.id+'/frame','POST',{seconds:2.5,name:'The fork · 2.500s'});await writeFile('artifacts/redesign/branch-frame.json',JSON.stringify(frame,null,2));
}
const directions=[
  {name:'Follow the signal',prompt:'Use the supplied first frame as the starting composition. The fictional lighthouse keeper in the yellow raincoat turns her head toward the lighthouse. A powerful warm golden lighthouse beam sweeps across her face, the camera gently draws back to reveal the tower glowing through fog while she takes one determined step toward it. Moody cinematic realism, wind pushes her raincoat, sea spray catches the warm light. A hopeful, mysterious continuation. Audio: gusts of coastal wind, soft crashing waves, one low resonant foghorn from the lighthouse. No dialogue, no text, no music.'},
  {name:'Face the storm',prompt:'Use the supplied first frame as the starting composition. The fictional lighthouse keeper in the yellow raincoat turns away from the lighthouse to face the open sea. The camera moves gently closer as an enormous distant wave crashes against the rocks behind her, a white curtain of spray rising into the dark blue sky. She braces against the wind, courageous and alert. Moody cinematic realism, physical water and wet fabric. A tense, spectacular continuation. Audio: rushing wind rising into a powerful surf crash, rain on the coat. No dialogue, no text, no music.'}
];
const receipts=[];
for(const [i,direction]of directions.entries()){
 const result=await request('/generate','POST',{projectId,modelId:'minimax/minimax-h3',prompt:direction.prompt,settings:{duration:4,resolution:'768P'},inputAssetIds:{first_frame:frame.asset.id},parentTakeId:frame.take.id,sourceAssetId:frame.asset.id,name:direction.name,clientRequestId:`mara-branch-redesign-20261103-${i}`});
 receipts.push({name:direction.name,takeId:result.take.id,jobId:result.job.id,frameAssetId:frame.asset.id,parentTakeId:frame.take.id});
}
await writeFile('artifacts/redesign/branch-submissions.json',JSON.stringify({projectId,sourceTakeId:parent.id,sourceAssetId:parent.assetIds[0],frameAssetId:frame.asset.id,frameTakeId:frame.take.id,seconds:frame.actualSeconds,branches:receipts},null,2));console.log(JSON.stringify({frame:{id:frame.asset.id,requestedSeconds:frame.requestedSeconds,actualSeconds:frame.actualSeconds,frameIndex:frame.frameIndex},branches:receipts},null,2));
