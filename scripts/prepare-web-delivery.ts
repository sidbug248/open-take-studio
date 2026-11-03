import {readdir,readFile,writeFile} from 'node:fs/promises';
import {brotliCompress,gzip,constants} from 'node:zlib';
import {promisify} from 'node:util';
import path from 'node:path';
const br=promisify(brotliCompress),gz=promisify(gzip);
export async function prepareWebDelivery(directory:string):Promise<number>{let count=0;for(const entry of await readdir(directory,{withFileTypes:true})){const file=path.join(directory,entry.name);if(entry.isDirectory()){count+=await prepareWebDelivery(file);continue;}if(!/\.(?:js|css|html|svg|json)$/.test(entry.name))continue;const bytes=await readFile(file);if(bytes.length<512)continue;await Promise.all([br(bytes,{params:{[constants.BROTLI_PARAM_QUALITY]:7}}).then(v=>writeFile(file+'.br',v)),gz(bytes,{level:8}).then(v=>writeFile(file+'.gz',v))]);count++;}return count;}
if(process.argv[1]?.endsWith('prepare-web-delivery.ts'))console.log(`Prepared compressed web files: ${await prepareWebDelivery(path.resolve('dist'))}`);
