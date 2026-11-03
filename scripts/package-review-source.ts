import {readFile,readdir,mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import AdmZip from 'adm-zip';
import {config} from '../server/config.ts';
const root=process.cwd(),zip=new AdmZip(),entries:Array<{file:string;bytes:number;sha256:string}>=[];
const secret=process.env.COMFY_API_KEY;
async function add(file:string){const bytes=await readFile(path.join(root,file));if(secret&&bytes.includes(Buffer.from(secret)))throw new Error('Source package credential boundary failed; contents withheld');zip.addFile(file.replaceAll('\\','/'),bytes);entries.push({file,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});}
async function walk(dir:string){for(const item of await readdir(path.join(root,dir),{withFileTypes:true})){if(item.isSymbolicLink())throw new Error('Unexpected source symlink');const file=path.join(dir,item.name);if(item.isDirectory())await walk(file);else await add(file);}}
for(const dir of ['client','server','shared','tests','scripts','docs','public','workflows']){try{await walk(dir);}catch(error:any){if(error.code!=='ENOENT')throw error;}}
for(const file of ['package.json','package-lock.json','tsconfig.json','vite.config.ts','index.html','README.md','LICENSE','.env.example','.gitignore','Start-OpenTakeStudio.ps1'])await add(file);
if(entries.some(e=>/(^|[\\/])\.env(?!\.example$)|(^|[\\/])(?:data|imports|artifacts|node_modules|\.git)([\\/]|$)/.test(e.file)))throw new Error('Private path in source package');
const requestedDir=process.argv.find(a=>a.startsWith('--output-dir='))?.slice('--output-dir='.length);
const dir=path.resolve(requestedDir||'artifacts/next-build/delivery');
const artifactRoot=path.resolve('artifacts');if(!dir.startsWith(artifactRoot+path.sep))throw new Error('Source delivery must stay in the project artifacts directory');
await mkdir(dir,{recursive:true});const bytes=zip.toBuffer(),output=path.join(dir,'Open-Take-Studio-source.zip');await writeFile(output,bytes);
await writeFile(path.join(dir,'source-manifest.json'),JSON.stringify({createdAt:new Date().toISOString(),file:output,files:entries.length,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),configuredKeyChecked:config.keyConfigured,noConfiguredSecretIncluded:true,excluded:['.env and secret environment files','databases','media and recovered reference artifacts','node_modules','build output','.git'],entries},null,2));
console.log(JSON.stringify({output,files:entries.length,bytes:bytes.length,noConfiguredSecretIncluded:true}));
