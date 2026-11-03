import {mkdir,readFile,writeFile} from 'node:fs/promises';
import type {ProjectDetail,Asset} from '../shared/types.ts';
import type {AudioMixDocument,AudioMixSaved} from '../shared/audio-types.ts';
import {defaultMotionComposition} from '../shared/motion-types.ts';
const base='http://127.0.0.1:4310/api',projectId='1659408b-f807-418b-8a67-3c2404e0d12e';
async function api<T>(route:string,body?:unknown):Promise<T>{const r=await fetch(base+route,body?{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}:undefined);if(!r.ok)throw new Error(`${r.status}: ${await r.text()}`);return r.json() as Promise<T>;}
const output='artifacts/inspection-build/local-productions';await mkdir(output,{recursive:true});
let receipt:any={projectId,createdAt:new Date().toISOString(),motion:[]};try{receipt=JSON.parse(await readFile(output+'/receipt.json','utf8'));}catch{}
const save=()=>writeFile(output+'/receipt.json',JSON.stringify(receipt,null,2));
const detail=await api<ProjectDetail>(`/projects/${projectId}`);
const audio=(name:string)=>{const take=detail.takes.find(t=>t.name===name&&t.status==='COMPLETED');const a=detail.assets.find(a=>take?.assetIds.includes(a.id)&&a.kind==='audio');if(!a)throw new Error(`Missing completed audio: ${name}`);return a;};
const voice=audio('Voices of Elsewhere / another door · directed voice'),bed=audio('Voices of Elsewhere / world sound 3'),spark=audio('Voices of Elsewhere / world sound 5');
const info=await Promise.all([voice,bed,spark].map(a=>api<{duration:number}>(`/assets/${a.id}/presentation`)));
if(!receipt.mix){const duration=Math.ceil(info[0].duration+2),document:AudioMixDocument={version:1,name:'Another door / voice, tide & glass',duration,tracks:[{id:'voice',assetId:voice.id,name:'Another door · voice',start:.6,offset:0,duration:info[0].duration,gain:.9,fadeIn:.025,fadeOut:.1,muted:false},{id:'tide',assetId:bed.id,name:'The tide beneath',start:0,offset:0,duration:Math.min(info[1].duration,duration),gain:.2,fadeIn:.65,fadeOut:1,muted:false},{id:'glass',assetId:spark.id,name:'A door opening · glass',start:Math.max(0,duration-Math.min(4,info[2].duration)),offset:0,duration:Math.min(4,info[2].duration),gain:.13,fadeIn:.5,fadeOut:1,muted:false}]};const saved=await api<AudioMixSaved>(`/projects/${projectId}/audio-mixes`,{document});receipt.mix={arrangementAssetId:saved.asset.id,takeId:saved.take.id};await save();}
if(!receipt.mix.outputAssetId){const rendered=await api<AudioMixSaved>(`/assets/${receipt.mix.arrangementAssetId}/audio-mix/render`,{clientRequestId:'inspection-another-door-master-v1'});receipt.mix={...receipt.mix,outputAssetId:rendered.asset.id,outputTakeId:rendered.take.id};await save();}
const directions=[
 {name:'Paper / the courage to leave',audio:'Voices of Elsewhere / directed story 1',shape:'torus',background:'#16223b',accent:'#ffd6aa',textColor:'#fff7df',text:['THE CITY WAS PAPER.','THE COURAGE WAS REAL.']},
 {name:'Botanical / machines that grow',audio:'Voices of Elsewhere / directed story 3',shape:'knot',background:'#091d20',accent:'#d0ff7c',textColor:'#f8ffda',text:['FORGOTTEN MACHINES.','NEW ROOTS.']},
 {name:'Tidal / a door that listens',audio:'Voices of Elsewhere / directed story 2',shape:'orb',background:'#101a35',accent:'#6be1ff',textColor:'#fcf5e9',text:['AT THE EDGE OF THE SEA,','A DOOR WAS WAITING.']},
 {name:'Copper / small extraordinary futures',audio:'Voices of Elsewhere / story 5',shape:'knot',background:'#2a1420',accent:'#ffad6b',textColor:'#fff2df',text:['PLANT ONE POSSIBILITY.','LET IT BECOME A WORLD.']},
 {name:'Glass / make room for wonder',audio:'Voices of Elsewhere / story 6',shape:'torus',background:'#1c123a',accent:'#ff79a7',textColor:'#fbecff',text:['THE OBJECT IS SIMPLE.','THE RITUAL IS YOURS.']},
 {name:'Elsewhere / another door',audio:'Voices of Elsewhere / another door · directed voice',shape:'orb',background:'#160f22',accent:'#f9795f',textColor:'#fff5ec',text:['EVERY STORY HAS','ANOTHER DOOR.']},
] as const;
for(const [i,direction]of directions.entries()){if(receipt.motion.some((m:any)=>m.name===direction.name))continue;const a=audio(direction.audio),c={...defaultMotionComposition(),name:direction.name,duration:6,width:960,height:540,shape:direction.shape,background:direction.background,accent:direction.accent,textColor:direction.textColor,audioAssetId:a.id,audioGain:.9,intensity:.55+i*.12,cameraOrbit:(i%2?-.2:.3),cues:direction.text.map((text,j)=>({id:`cue-${j}`,start:j*3,end:(j+1)*3,text,style:(j%2?'rise':'punch') as 'rise'|'punch'}))};const existing=detail.assets.find(a=>a.metadata.operation==='motion-composition'&&(a.metadata.motionComposition as any)?.name===direction.name);if(existing){receipt.motion.push({name:direction.name,assetId:existing.id});}else{const saved=await api<{asset:Asset}>(`/projects/${projectId}/motion/compositions`,{composition:c});receipt.motion.push({name:direction.name,assetId:saved.asset.id});}await save();}
console.log(JSON.stringify(receipt,null,2));
