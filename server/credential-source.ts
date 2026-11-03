import {createHash} from 'node:crypto';
import type {Store} from './store.ts';

export interface ExecutionCredential {apiKey:string;id:string;expiresAt?:string;signal?:AbortSignal;}
export interface CredentialSource {resolve():ExecutionCredential;available():boolean;}
export class CredentialUnavailableError extends Error {
  readonly code='credential_unavailable';readonly errorType='credential_unavailable';readonly status=401;
  constructor(message='Reconnect the same Comfy key to resume this workspace’s saved jobs.'){super(message);}
}
export const environmentCredentialSource:CredentialSource={
  resolve(){const apiKey=process.env.COMFY_API_KEY?.trim();if(!apiKey)throw new CredentialUnavailableError('Server Comfy credentials are not configured.');return{apiKey,id:'owner-'+createHash('sha256').update(apiKey).digest('hex')};},
  available(){return Boolean(process.env.COMFY_API_KEY?.trim());},
};
/** Never serialize an SDK error/cause wholesale: only safe operational fields cross the boundary. */
export function credentialSafeError(value:unknown,key:string):Error {
  const raw=value as Record<string,unknown>|null;
  const clean=(text:unknown)=>String(text??'Remote service request failed').split(key).join('[redacted]').replace(/comfyui-[A-Za-z0-9_-]+/g,'[redacted]').slice(0,1500);
  const error=new Error(clean(value instanceof Error?value.message:typeof value==='string'?value:'Remote service request failed')) as Error&Record<string,unknown>;
  for(const field of ['code','errorType','httpStatus','status','statusCode','retryAfter','requestId'])if(raw&&['string','number'].includes(typeof raw[field]))error[field]=typeof raw[field]==='string'?clean(raw[field]):raw[field];
  return error;
}
export function redactCredentialValue<T>(value:T,key:string):T {
  if(typeof value==='string')return value.split(key).join('[redacted]') as T;
  if(value instanceof Uint8Array||value===null)return value;
  if(Array.isArray(value))return value.map(item=>redactCredentialValue(item,key)) as T;
  if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([field,item])=>[field.split(key).join('[redacted]'),redactCredentialValue(item,key)])) as T;
  return value;
}
const prepared=new WeakSet<Store>();
function ensureBindings(store:Store){if(prepared.has(store))return;store.db.exec('CREATE TABLE IF NOT EXISTS job_credentials(job_id TEXT PRIMARY KEY REFERENCES jobs(id),scope_id TEXT NOT NULL);');prepared.add(store);}
/** Opaque bindings are private runtime metadata, excluded from production packages. */
export function bindJobCredential(store:Store,jobId:string,source:CredentialSource):ExecutionCredential {
  const credential=source.resolve();ensureBindings(store);
  const row=store.db.prepare('SELECT scope_id FROM job_credentials WHERE job_id=?').get(jobId) as {scope_id:string}|undefined;
  if(row&&row.scope_id!==credential.id)throw new CredentialUnavailableError('This execution belongs to a different Comfy credential. Reconnect its original key.');
  if(!row)store.db.prepare('INSERT INTO job_credentials(job_id,scope_id) VALUES(?,?)').run(jobId,credential.id);
  return credential;
}
export function suspendCredentialJob(store:Store,id:string){store.patchJob(id,{state:'BLOCKED',errorType:'credential_unavailable',errorMessage:'Reconnect the same Comfy key to resume this saved execution. No new request was submitted.',nextPollAt:undefined});}
export function resumeCredentialJobs(store:Store,source:CredentialSource):number {
  const credential=source.resolve();ensureBindings(store);let resumed=0;
  const rows=store.db.prepare("SELECT s.id FROM job_status s LEFT JOIN job_credentials c ON c.job_id=s.id WHERE s.state='BLOCKED' AND json_extract(s.data,'$.errorType')='credential_unavailable' AND (c.scope_id IS NULL OR c.scope_id=?) AND NOT EXISTS(SELECT 1 FROM archived_jobs a WHERE a.job_id=s.id)").all(credential.id) as {id:string}[];
  for(const row of rows){const job=store.getJob(row.id)!;store.patchJob(job.id,{state:job.requestId?'IN_PROGRESS':'PENDING',errorType:undefined,errorMessage:undefined,nextPollAt:undefined});resumed++;}return resumed;
}
