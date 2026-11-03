import {parentPort,workerData} from 'node:worker_threads';
import {register} from 'tsx/esm/api';
register();
const {Store}=await import('./store.ts');
const {LocalFileStorage}=await import('./media.ts');
const {DisplayMediaStore}=await import('./display-media.ts');
const store=new Store(workerData.dataDir,{readOnly:true});
const display=new DisplayMediaStore(store,new LocalFileStorage(workerData.dataDir));
parentPort.on('message',async ({assetId,options})=>{
  try{const asset=store.getAsset(assetId);if(!asset)throw new Error('Display source was not found');const result=await display.prepare(asset,options);parentPort.postMessage({assetId,result});}
  catch(error){const source=store.getAsset(assetId);if(source)await display.recordFailure(source,error).catch(()=>{});parentPort.postMessage({assetId,error:error instanceof Error?error.message:String(error)});}
});
