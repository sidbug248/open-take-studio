import dotenv from 'dotenv';
import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
dotenv.config({path:path.resolve('.env'),override:true,quiet:true});
const directory=path.resolve('imports/comfy-cloud');
const receipt=JSON.parse(await readFile(path.join(directory,'recovery-receipt.json'),'utf8'));
const references=new Set(receipt.assets.map((a:any)=>a.id));
const sourceNames=receipt.assets.map((a:any)=>a.filename);
function sanitize(value:any):any{if(Array.isArray(value))return value.map(sanitize);if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).filter(([key])=>key!=='preview_url').map(([key,v])=>[key,sanitize(v)]));if(typeof value==='string'&&/(X-Goog-|[?&](?:token|signature)=)/i.test(value))return '[temporary signed URL omitted]';return value;}
const routes={assets:'/api/assets?include_public=false&limit=100&sort=created_at&tags_any=output,temp&tags_none=missing',jobs:'/api/jobs?status=completed,failed,cancelled&limit=64&offset=0'};
for(const [kind,route] of Object.entries(routes)){
 const response=await fetch('https://cloud.comfy.org'+route,{headers:{'X-API-Key':process.env.COMFY_API_KEY??''},redirect:'manual',signal:AbortSignal.timeout(30000)});
 if(!response.ok){console.log(JSON.stringify({kind,status:response.status}));continue;}
 const data=await response.json() as any;
 console.log(JSON.stringify({kind,status:response.status,topKeys:Object.keys(data),arrays:Object.entries(data).filter(([,v])=>Array.isArray(v)).map(([k,v]:any)=>({key:k,length:v.length,firstKeys:v.length?Object.keys(v[0]):[]}))}));
 const list=Array.isArray(data)?data:Object.values(data).find(Array.isArray)??[];
 const matched=(list as any[]).filter(item=>{const text=JSON.stringify(item);return references.has(item.id)||text.includes('OpenTakeStudio/')||sourceNames.some((name:string)=>text.includes(name));});
 await writeFile(path.join(directory,`source-${kind}.json`),JSON.stringify(sanitize(matched),null,2));
 console.log(JSON.stringify({kind,matchedCount:matched.length,recordKeys:matched.map(x=>({id:x.id??x.prompt_id,keys:Object.keys(x)}))}));
}
