import {Worker} from 'node:worker_threads';
import path from 'node:path';
import type {Store} from './store.ts';
import type {LocalFileStorage} from './media.ts';

// One export thread bounds memory while keeping expensive JSON/media/ZIP work off HTTP's event loop.
let tail:Promise<unknown>=Promise.resolve();
const pending=new Map<string,Promise<Buffer>>();
export function exportProjectInWorker(store:Store,media:LocalFileStorage,projectId:string):Promise<Buffer>{
  const key=JSON.stringify([store.dataDir,media.root,projectId]),existing=pending.get(key);if(existing)return existing;
  const task=tail.catch(()=>undefined).then(()=>new Promise<Buffer>((resolve,reject)=>{
    const worker=new Worker(new URL('./project-export-thread.mjs',import.meta.url),{workerData:{dataDir:store.dataDir,mediaDataDir:path.dirname(media.root),projectId},env:{PATH:process.env.PATH??'',SystemRoot:process.env.SystemRoot??''}});let settled=false;
    const fail=(error:Error)=>{if(settled)return;settled=true;reject(error);void worker.terminate();};
    worker.once('message',(result:{bytes?:Uint8Array;error?:{message:string;status:number}})=>{if(settled)return;if(result.error){fail(Object.assign(new Error(result.error.message),{status:result.error.status}));return;}if(!result.bytes){fail(new Error('Project export returned no archive'));return;}settled=true;resolve(Buffer.from(result.bytes.buffer,result.bytes.byteOffset,result.bytes.byteLength));void worker.terminate();});
    worker.once('error',fail);worker.once('exit',code=>{if(!settled)fail(new Error(`Project export worker ended before producing an archive (${code})`));});
  }));
  pending.set(key,task);tail=task.then(()=>undefined,()=>undefined);void task.finally(()=>pending.delete(key)).catch(()=>undefined);return task;
}
