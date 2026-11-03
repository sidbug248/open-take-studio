import { config, rootDir } from '../server/config.ts';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

const secret=process.env.COMFY_API_KEY;
let checked=0;
async function scan(dir:string){for(const item of await readdir(dir,{withFileTypes:true})){const full=path.join(dir,item.name);if(item.isDirectory())await scan(full);else{const bytes=await readFile(full);checked++;if(secret&&bytes.includes(Buffer.from(secret)))throw new Error('Secret found in browser artifacts; file contents withheld.');}}}
await scan(path.join(rootDir,'dist'));await scan(path.join(rootDir,'client'));await scan(path.join(rootDir,'shared'));
const base=`http://127.0.0.1:${config.port}`;
const protectedPaths=['/.env','/data/studio.sqlite','/imports/comfy-cloud/recovery-receipt.json'];
const checks=[];
for(const target of protectedPaths){const response=await fetch(base+target);const bytes=Buffer.from(await response.arrayBuffer());if(secret&&bytes.includes(Buffer.from(secret)))throw new Error('Secret serving boundary failed');if(response.headers.get('content-type')?.includes('application/octet-stream')||bytes.subarray(0,15).toString().startsWith('SQLite format'))throw new Error('Private data serving boundary failed');checks.push({path:target,status:response.status});}
const cross=await fetch(base+'/api/projects',{method:'POST',headers:{Origin:'https://untrusted.example','Content-Type':'application/json'},body:JSON.stringify({name:'Must never be created'})});if(cross.status!==403)throw new Error('Foreign origin was not rejected');
console.log(JSON.stringify({browserFilesChecked:checked,keyConfigured:config.keyConfigured,noKeyInBrowserFiles:true,protectedPaths:checks,foreignOriginRejected:true},null,2));
