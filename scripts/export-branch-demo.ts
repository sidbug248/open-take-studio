import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import AdmZip from 'adm-zip';
const base='http://127.0.0.1:4310',directory=path.resolve('artifacts/redesign');
const receipt=JSON.parse(await readFile(path.join(directory,'demo-receipt.json'),'utf8'));
const detail=await(await fetch(`${base}/api/projects/${receipt.projectId}`)).json();
const exports=[];
for(const choice of ['signal','storm']){
 const name=choice==='signal'?'Mara · Signal cut':'Mara · Storm cut';let take=detail.takes.find((t:any)=>t.name===name),asset;
 if(!take){const response=await fetch(`${base}/api/projects/${receipt.projectId}/films/${receipt.filmId}/render`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({choiceId:choice,name})});const result=await response.json();if(!response.ok)throw new Error(result.error);take=result.take;asset=result.asset;}else asset=detail.assets.find((a:any)=>take.assetIds.includes(a.id));
 const bytes=Buffer.from(await(await fetch(base+asset.url+'?download=1')).arrayBuffer());const filename=`mara-${choice}-cut.mp4`;await writeFile(path.join(directory,filename),bytes);exports.push({choiceId:choice,assetId:asset.id,takeId:take.id,file:filename,sha256:asset.sha256,bytes:bytes.length});
}
const response=await fetch(`${base}/api/projects/${receipt.projectId}/films/${receipt.filmId}/player-export`);if(!response.ok)throw new Error(await response.text());const bytes=Buffer.from(await response.arrayBuffer());const zip=new AdmZip(bytes);const folder=path.join(directory,'mara-player');await mkdir(folder,{recursive:true});for(const entry of zip.getEntries()){const destination=path.resolve(folder,entry.entryName);if(!destination.startsWith(folder+path.sep))throw new Error('Unsafe export entry');if(!entry.isDirectory){await mkdir(path.dirname(destination),{recursive:true});await writeFile(destination,entry.getData());}}
await writeFile(path.join(directory,'Mara-The-last-light.playable.zip'),bytes);await writeFile(path.join(directory,'film-export-receipt.json'),JSON.stringify({projectId:receipt.projectId,filmId:receipt.filmId,paths:exports,playerZipBytes:bytes.length,entries:zip.getEntries().map(e=>e.entryName)},null,2));console.log(JSON.stringify({paths:exports,player:folder,zipBytes:bytes.length},null,2));
