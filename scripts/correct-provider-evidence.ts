import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { createStore } from '../server/store.ts';
import { config } from '../server/config.ts';
const store=createStore(config.dataDir),folder=path.join(config.dataDir,'backups');mkdirSync(folder,{recursive:true});
const backup=path.join(folder,`studio-before-provider-evidence-${Date.now()}.sqlite`);
store.db.exec(`VACUUM INTO '${backup.replaceAll("'","''")}'`);
let corrected=0;
store.transaction(()=>{for(const asset of store.listAssets()){
 if(asset.provenance!=='generated'||typeof asset.metadata.jobId!=='string')continue;
 const job=store.getJob(asset.metadata.jobId);if(!job||job.resultMetadata?.servingProvider||asset.metadata.servingProvider!==job.provider)continue;
 store.upsertAsset({...asset,metadata:{...asset.metadata,requestedProvider:job.provider,servingProvider:null,servingProviderEvidence:'Not reported by Router; an earlier requested-provider fallback was corrected.',evidenceCorrectedAt:new Date().toISOString()}});corrected++;
}});store.close();console.log(JSON.stringify({corrected,backup}));
