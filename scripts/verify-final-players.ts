import {mkdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import AdmZip from 'adm-zip';
const sha=(b:Buffer)=>createHash('sha256').update(b).digest('hex');
const dir=path.resolve('artifacts/next-build/prismatic-film'),bytes=await readFile(path.join(dir,'Prismatic-bloom.playable.zip')),zip=new AdmZip(bytes),root=path.join(dir,'player'),entries=[];
for(const entry of zip.getEntries()){
 if(entry.isDirectory)continue;const dest=path.resolve(root,entry.entryName);
 if(!dest.startsWith(root+path.sep))throw new Error('Unexpected exported archive path');
 const content=entry.getData();await mkdir(path.dirname(dest),{recursive:true});await writeFile(dest,content);
 entries.push({file:entry.entryName,bytes:content.length,sha256:sha(content)});
}
const response=await fetch('http://127.0.0.1:4315/'),served=Buffer.from(await response.arrayBuffer());
if(sha(served)!==entries.find(e=>e.file==='index.html')?.sha256)throw new Error('Standalone server did not serve final exported HTML');
if(!response.headers.get('content-security-policy')?.includes("connect-src 'none'"))throw new Error('Independent host allows application API calls');
for(const entry of entries.filter(e=>/\.(mp4|png)$/.test(e.file))){const r=await fetch('http://127.0.0.1:4315/'+entry.file);if(!r.ok||sha(Buffer.from(await r.arrayBuffer()))!==entry.sha256)throw new Error('Independent film media mismatch');}
const game=await fetch('http://127.0.0.1:4314/');if(!game.ok||!game.headers.get('content-security-policy')?.includes("connect-src 'none'"))throw new Error('Independent game host unavailable');
const receipt={verifiedAt:new Date().toISOString(),film:{zipBytes:bytes.length,zipSha256:sha(bytes),host:'http://127.0.0.1:4315',exactFinalHtmlServed:true,mediaHashesVerified:true,entries},game:{host:'http://127.0.0.1:4314',available:true},boundary:'Independent read-only static hosts, no studio modules or API; connect-src none. Actual stopped-studio browser proof is recorded separately.'};
await writeFile('artifacts/next-build/final-player-verification.json',JSON.stringify(receipt,null,2));console.log(JSON.stringify({filmEntries:entries.length,filmZipBytes:bytes.length,exactHtml:true,exactMedia:true,independentGame:true}));
