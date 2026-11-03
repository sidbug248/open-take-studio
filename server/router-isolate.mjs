import {parentPort,workerData} from 'node:worker_threads';
import {comfy} from '@comfyorg/sdk';
// One immutable key per disposable worker; the HTTP process never switches keys.
const {apiKey,operation,args}=workerData;
comfy.config({credentials:apiKey,baseUrl:'https://api.comfy.org'});
const [model,value,identity]=args;
const clean=value=>String(value??'Remote request failed').split(apiKey).join('[redacted]').slice(0,1500);
try{
  let result;
  if(operation==='submit'){const handle=await comfy.models.submit(model,value,{idempotencyKey:identity,retry:false,timeoutMs:60000});result={requestId:handle.requestId};}
  else if(operation==='run')result=await comfy.models.run(model,value,{idempotencyKey:identity,retry:false,timeoutMs:660000});
  else if(operation==='status')result=await comfy.models.handle(model,value).status({retry:false,timeoutMs:30000});
  else if(operation==='result')result=await comfy.models.handle(model,value).get({retry:false,timeoutMs:60000});
  else if(operation==='cancel')result=await comfy.models.handle(model,value).cancel({retry:false,timeoutMs:15000});
  else throw new Error('Unknown Router operation');
  parentPort.postMessage({ok:true,value:result});
}catch(error){const safe={message:clean(error.message)};for(const field of ['code','errorType','httpStatus','status','statusCode','retryAfter','requestId'])if(['string','number'].includes(typeof error[field]))safe[field]=typeof error[field]==='string'?clean(error[field]):error[field];parentPort.postMessage({ok:false,error:safe});}
