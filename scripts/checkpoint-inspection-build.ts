import {DatabaseSync} from 'node:sqlite';
import {mkdir,readFile,writeFile,readdir,copyFile} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import AdmZip from 'adm-zip';
const root=path.resolve(import.meta.dirname,'..');
const destination=path.join(root,'artifacts','inspection-build','checkpoint-2026-11-03');
await mkdir(destination,{recursive:true});
const db=new DatabaseSync(path.join(root,'data','studio.sqlite'));
const dbCopy=path.join(destination,'studio.sqlite');
try{await readFile(dbCopy);}catch{db.exec(`VACUUM INTO '${dbCopy.replaceAll("'","''")}'`);}
const tables=['projects','assets','takes','jobs','shots','recipes'];
const counts=Object.fromEntries(tables.map(t=>[t,(db.prepare(`SELECT count(*) n FROM ${t}`).get() as {n:number}).n]));
const assets=(db.prepare('SELECT data FROM assets').all() as {data:string}[]).map(row=>JSON.parse(row.data));
await mkdir(path.join(destination,'media'),{recursive:true});
const hashes=[];
for(const asset of assets){const bytes=await readFile(path.join(root,'data','media',asset.fileName));const sha=createHash('sha256').update(bytes).digest('hex');if(sha!==asset.sha256)throw new Error('Stored media integrity mismatch: '+asset.id);await copyFile(path.join(root,'data','media',asset.fileName),path.join(destination,'media',asset.fileName));hashes.push({id:asset.id,fileName:asset.fileName,bytes:bytes.length,sha256:sha});}
db.close();
const zip=new AdmZip();
for(const directory of ['client','server','shared','scripts','docs'])zip.addLocalFolder(path.join(root,directory),directory);
for(const entry of await readdir(root,{withFileTypes:true})){if(entry.isFile()&&!entry.name.startsWith('.env')&&!entry.name.endsWith('.log')&&entry.name!=='.DS_Store')zip.addLocalFile(path.join(root,entry.name));}
zip.writeZip(path.join(destination,'application-source.zip'));
await writeFile(path.join(destination,'receipt.json'),JSON.stringify({createdAt:new Date().toISOString(),counts,assets:hashes,environmentFilesExcluded:true},null,2));
console.log(JSON.stringify({checkpoint:destination,counts,verifiedAssets:hashes.length}));

