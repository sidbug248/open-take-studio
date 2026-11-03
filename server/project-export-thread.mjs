import {parentPort,workerData} from 'node:worker_threads';
import {register} from 'tsx/esm/api';
register();
let store;
try{
  const [{Store},{LocalFileStorage},{exportProject}]=await Promise.all([import('./store.ts'),import('./media.ts'),import('./project-routes.ts')]);
  store=new Store(workerData.dataDir,{readOnly:true});
  // A read transaction provides one committed project snapshot while other app work continues.
  store.db.exec('BEGIN');
  const archive=await exportProject(store,new LocalFileStorage(workerData.mediaDataDir),workerData.projectId);
  store.db.exec('COMMIT');
  store.close();store=undefined;
  const bytes=new Uint8Array(archive.length);bytes.set(archive);
  parentPort.postMessage({bytes},[bytes.buffer]);
}catch(error){parentPort.postMessage({error:{message:error instanceof Error?error.message:'Project export failed',status:Number(error?.status)||500}});}
finally{store?.close();}
