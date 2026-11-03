import './config.ts';
import {Worker} from 'node:worker_threads';
import type { Json } from '../shared/types.ts';
import {CredentialUnavailableError,credentialSafeError,environmentCredentialSource,type CredentialSource,type ExecutionCredential} from './credential-source.ts';

export interface RouterStatus { status: string; queuePosition: number|null; errorType: string|null; retryAfterMs: number|null; raw?: Json; }
export interface RouterResult { kind: 'json'|'binary'; data: unknown; contentType?: string; requestId?:string|null; servingProvider?:string|null; droppedParams?:readonly string[]|null; creditsUsed?:string|null; }
export interface RouterPort {
  submit(model:string, inputs:Json, idempotencyKey:string):Promise<{requestId:string}>;
  run?(model:string, inputs:Json, idempotencyKey:string):Promise<RouterResult>;
  status(model:string, requestId:string):Promise<RouterStatus>;
  result(model:string, requestId:string):Promise<RouterResult>;
  cancel(model:string, requestId:string):Promise<unknown>;
}
export type RouterOperation='submit'|'run'|'status'|'result'|'cancel';
export type RouterExecutor=(credential:ExecutionCredential,operation:RouterOperation,args:unknown[])=>Promise<any>;
let active=0;const waiting:{resolve:()=>void;reject:(error:Error)=>void;timer:ReturnType<typeof setTimeout>}[]=[];
async function admission(){if(active<4){active++;return;}if(waiting.length>=32)throw Object.assign(new Error('The studio execution queue is busy. Retry shortly with the same request identity.'),{httpStatus:429,retryAfter:5});await new Promise<void>((resolve,reject)=>{const waiter={resolve,reject,timer:setTimeout(()=>{const i=waiting.indexOf(waiter);if(i>=0)waiting.splice(i,1);reject(Object.assign(new Error('The studio execution queue timed out.'),{httpStatus:429,retryAfter:5}));},30000)};waiting.push(waiter);});}
function release(){const next=waiting.shift();if(next){clearTimeout(next.timer);next.resolve();}else active--;}
function scrub(value:any,key:string):any {if(typeof value==='string')return value.split(key).join('[redacted]');if(value instanceof Uint8Array||value===null)return value;if(Array.isArray(value))return value.map(x=>scrub(x,key));if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k.split(key).join('[redacted]'),scrub(v,key)]));return value;}
/** SDK0.5.0 has global Router config. Each operation therefore owns a fresh SDK isolate. */
const isolatedExecute:RouterExecutor=(credential,operation,args)=>new Promise((resolve,reject)=>{
  if(credential.signal?.aborted){reject(new CredentialUnavailableError());return;}
  const worker=new Worker(new URL('./router-isolate.mjs',import.meta.url),{workerData:{apiKey:credential.apiKey,operation,args},env:{},execArgv:[],stdout:true,stderr:true});
  worker.stdout.resume();worker.stderr.resume();let settled=false;
  const finish=(error?:unknown,value?:unknown)=>{if(settled)return;settled=true;clearTimeout(timer);credential.signal?.removeEventListener('abort',abort);void worker.terminate();error?reject(error):resolve(value);};
  const abort=()=>finish(new CredentialUnavailableError());
  const timer=setTimeout(()=>finish(Object.assign(new Error('Router operation timed out; the saved request identity is retained.'),{errorType:'transport_timeout'})),operation==='run'?675000:operation==='submit'||operation==='result'?75000:45000);
  credential.signal?.addEventListener('abort',abort,{once:true});
  worker.once('message',(message:{ok:boolean;value?:unknown;error?:Record<string,unknown>})=>{if(message.ok)finish(undefined,message.value);else finish(Object.assign(new Error(String(message.error?.message??'Router request failed')),message.error));});
  worker.once('error',error=>finish(credentialSafeError(error,credential.apiKey)));worker.once('exit',code=>{if(!settled)finish(new Error(`Router execution isolate stopped (${code}). Saved request identity retained.`));});
});
export function createRouterPort(source:CredentialSource,options:{execute?:RouterExecutor}={}):RouterPort {
  const execute=async(operation:RouterOperation,args:unknown[])=>{source.resolve();await admission();let credential:ExecutionCredential|undefined;try{credential=source.resolve();return scrub(await(options.execute??isolatedExecute)(credential,operation,args),credential.apiKey);}catch(error){throw credential?credentialSafeError(error,credential.apiKey):error;}finally{release();}};
  return{submit:(...args)=>execute('submit',args),run:(...args)=>execute('run',args),status:(...args)=>execute('status',args),result:(...args)=>execute('result',args),cancel:(...args)=>execute('cancel',args)};
}
export const routerPort=createRouterPort(environmentCredentialSource);
