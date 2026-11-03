import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {Store} from '../server/store.ts';
import {LocalFileStorage} from '../server/media.ts';
import {ExploreService} from '../server/explore-service.ts';

const dataDir=path.resolve('data'),store=new Store(dataDir,{readOnly:true}),media=new LocalFileStorage(dataDir),explore=new ExploreService(store,media),output=path.resolve('artifacts/first-impression/derivatives');await mkdir(output,{recursive:true});
const assets=store.listAssets(),before=Object.fromEntries(['projects','assets','takes','jobs'].map(table=>[table,(store.db.prepare(`SELECT count(*) AS count FROM ${table}`).get() as {count:number}).count]));
const curation=await explore.curation();await explore.saveCuration(curation);
const priorities=new Set([curation.heroAssetId,...curation.journeys.flatMap(j=>[j.resultAssetId,j.sourceAssetId,...Object.entries(j.action).filter(([key])=>key.endsWith('AssetId')).map(([,v])=>String(v))]).filter(Boolean)]),ordered=[...assets].sort((a,b)=>Number(priorities.has(b.id))-Number(priorities.has(a.id)));
const results:any[]=[];for(const asset of ordered){const start=performance.now();try{const presentation=await explore.displays.prepare(asset,{...(asset.id===curation.heroAssetId?{hero:true}:{})});results.push({assetId:asset.id,sha256:asset.sha256,originalBytes:asset.size,milliseconds:Math.round(performance.now()-start),presentation});console.log(JSON.stringify({assetId:asset.id,kind:asset.kind,state:presentation.state,posterBytes:presentation.poster?.variants.find(v=>v.width>=960)?.bytes,previewBytes:presentation.preview?.bytes,meshBytes:presentation.mesh?.bytes}));}catch(error){results.push({assetId:asset.id,sha256:asset.sha256,error:error instanceof Error?error.message:String(error)});console.log(JSON.stringify(results.at(-1)));}}
for(const asset of assets)if(createHash('sha256').update(await media.read(asset)).digest('hex')!==asset.sha256)throw new Error(`Original media changed: ${asset.id}`);
const after=Object.fromEntries(['projects','assets','takes','jobs'].map(table=>[table,(store.db.prepare(`SELECT count(*) AS count FROM ${table}`).get() as {count:number}).count]));if(JSON.stringify(before)!==JSON.stringify(after))throw new Error('Records changed during derivative preparation; inspect concurrent edits');
await writeFile(path.join(output,'preparation-receipt.json'),JSON.stringify({verifiedAt:new Date().toISOString(),before,after,originalHashesVerified:assets.length,cacheOnlyWrites:true,results},null,2));console.log(JSON.stringify({complete:true,before,after,prepared:results.filter(r=>!r.error).length,failures:results.filter(r=>r.error).length}));store.close();
