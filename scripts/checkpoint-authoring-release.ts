import { DatabaseSync } from 'node:sqlite';
import { mkdir, readFile, writeFile, copyFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..');
const target=path.join(root,'artifacts','authoring-release','checkpoint');
await mkdir(path.join(target,'media'),{recursive:true});
const db=new DatabaseSync(path.join(root,'data','studio.sqlite'));
try { await readFile(path.join(target,'receipt.json')); throw new Error('Checkpoint already exists; never overwrite it.'); } catch(e) { if((e as NodeJS.ErrnoException).code!=='ENOENT') throw e; }
db.exec(`VACUUM INTO '${path.join(target,'studio.sqlite').replaceAll("'","''")}'`);
const assets=db.prepare('SELECT data FROM assets').all().map(row=>JSON.parse(String(row.data)));
const counts=Object.fromEntries(['projects','assets','takes','jobs','shots','recipes'].map(t=>[t,db.prepare(`SELECT count(*) n FROM ${t}`).get()!.n]));
const files=[];
for(const asset of assets){const source=path.join(root,'data','media',asset.fileName),bytes=await readFile(source);const hash=createHash('sha256').update(bytes).digest('hex');if(hash!==asset.sha256)throw new Error(`Media mismatch: ${asset.id}`);await copyFile(source,path.join(target,'media',asset.fileName));files.push({id:asset.id,fileName:asset.fileName,bytes:bytes.length,sha256:hash});}
db.close();
await writeFile(path.join(target,'submission-source.tar'),execFileSync('git',['archive','v0.1.0-submission'],{cwd:root,maxBuffer:50*1024*1024}));
const receipt={createdAt:new Date().toISOString(),submissionCommit:execFileSync('git',['rev-parse','v0.1.0-submission'],{cwd:root,encoding:'utf8'}).trim(),counts,files,totalMediaBytes:files.reduce((sum,a)=>sum+a.bytes,0)};
await writeFile(path.join(target,'receipt.json'),JSON.stringify(receipt,null,2));
console.log(JSON.stringify({checkpoint:target,counts,verifiedMedia:files.length,totalMediaBytes:receipt.totalMediaBytes}));
