import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';
import type { Asset } from '../shared/types.ts';
import type { LocalFileStorage } from './media.ts';
import { uploadRouterInputAsset, type HostedMediaReference } from './media-transport.ts';
import {createHash,randomUUID} from 'node:crypto';
import {environmentCredentialSource,type CredentialSource} from './credential-source.ts';

const pending=new Map<string,Promise<HostedMediaReference>>();
/** Protected server storage only; these URL tokens never go into asset metadata. */
export async function hostedInput(asset:Asset,media:LocalFileStorage,dataDir:string,options:{credentialSource?:CredentialSource;upload?:typeof uploadRouterInputAsset}={}){
  const source=options.credentialSource??environmentCredentialSource,credential=source.resolve(),scope=createHash('sha256').update(credential.id).digest('hex');
  const key=asset.sha256,folder=path.join(dataDir,'hosted-inputs',scope),file=path.join(folder,key+'.json'),pendingKey=path.resolve(dataDir)+'\0'+scope+'\0'+key;
  try{const cached=JSON.parse(await readFile(file,'utf8')) as HostedMediaReference;if(cached.sourceSha256===key&&cached.credentialScopeId===credential.id&&Date.parse(cached.urlExpiresAt)-Date.now()>60*60_000)return cached;}catch{/* Only an explicit submission refreshes an expired scoped URL. */}
  if(pending.has(pendingKey))return pending.get(pendingKey)!;
  const operation=(async()=>{const value={...await(options.upload??uploadRouterInputAsset)(asset,await media.read(asset),{credentialSource:source}),credentialScopeId:credential.id};source.resolve();await mkdir(folder,{recursive:true});const temporary=file+'.'+randomUUID()+'.tmp';await writeFile(temporary,JSON.stringify(value),{mode:0o600});await rename(temporary,file);return value;})();pending.set(pendingKey,operation);try{return await operation;}finally{pending.delete(pendingKey);}
}
