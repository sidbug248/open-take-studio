import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';
import type { Asset } from '../shared/types.ts';
import type { LocalFileStorage } from './media.ts';
import { uploadRouterInputAsset, type HostedMediaReference } from './media-transport.ts';

const pending=new Map<string,Promise<HostedMediaReference>>();
/** Protected server storage only; these URL tokens never go into asset metadata. */
export async function hostedInput(asset:Asset,media:LocalFileStorage,dataDir:string){
  const key=asset.sha256,folder=path.join(dataDir,'hosted-inputs'),file=path.join(folder,key+'.json');
  try{const cached=JSON.parse(await readFile(file,'utf8')) as HostedMediaReference;if(cached.sourceSha256===key&&Date.parse(cached.urlExpiresAt)-Date.now()>60*60_000)return cached;}catch{/* Expired or absent cache is re-uploaded only upon explicit submission. */}
  if(pending.has(key))return pending.get(key)!;
  const operation=(async()=>{const value=await uploadRouterInputAsset(asset,await media.read(asset));await mkdir(folder,{recursive:true});const temporary=file+'.tmp';await writeFile(temporary,JSON.stringify(value));await rename(temporary,file);return value;})();pending.set(key,operation);try{return await operation;}finally{pending.delete(key);}
}
