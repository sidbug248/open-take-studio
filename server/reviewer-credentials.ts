import {DatabaseSync} from 'node:sqlite';
import {mkdirSync} from 'node:fs';
import path from 'node:path';
import {createCipheriv,createDecipheriv,createHash,createHmac,randomBytes,randomUUID,timingSafeEqual} from 'node:crypto';
import {CredentialUnavailableError,type CredentialSource,type ExecutionCredential} from './credential-source.ts';

type Verification='verified'|'insufficient_credits';
interface Row {id:string;token_hash:string;expires_at:number;scope_id:string|null;fingerprint:string|null;ciphertext:string|null;iv:string|null;tag:string|null;credential_expires_at:number|null;verification:Verification|null;last_error_code:string|null;}
export interface ReviewerSession {id:string;expiresAt:string;}
export interface ReviewerStatus extends ReviewerSession {state:'connected'|'disconnected'|'expired';connected:boolean;credentialScopeId?:string;credentialExpiresAt?:string;verification?:Verification;lastErrorCode?:string;}
export type CredentialProbe=(apiKey:string)=>Promise<Verification>;
export const probeReviewerCredential:CredentialProbe=async apiKey=>{
  const response=await fetch('https://api.comfy.org/v2/models?limit=1',{headers:{Authorization:`Bearer ${apiKey}`,Accept:'application/json'},redirect:'error',signal:AbortSignal.timeout(15000)});
  await response.body?.cancel();
  if(response.status===401)throw Object.assign(new Error('Comfy rejected this key. Check the workspace API key and try again.'),{status:400,code:'invalid_credentials'});
  if(response.status===403)throw Object.assign(new Error('This Comfy key does not have permission to use Router.'),{status:403,code:'permission_denied'});
  if(response.status===402)return'insufficient_credits';
  if(!response.ok)throw Object.assign(new Error(`Comfy key verification is temporarily unavailable (HTTP ${response.status}). No generation was submitted.`),{status:503,code:'verification_unavailable'});
  // Optional documented read-only balance discovery. A Router-only key remains
  // valid if Cloud billing permission is absent; unknown funding is not success proof.
  try{const billing=await fetch('https://cloud.comfy.org/api/billing/usage/timeseries?months=1&group_by=product&granularity=month',{headers:{'X-API-Key':apiKey},redirect:'error',signal:AbortSignal.timeout(10000)});if(billing.ok){const body=await billing.json() as {summary?:{balance?:{amount_cents?:number}}};if(typeof body.summary?.balance?.amount_cents==='number'&&body.summary.balance.amount_cents<=0)return'insufficient_credits';}else await billing.body?.cancel();}catch{/* Cloud permissions/network do not invalidate a verified Router credential. */}
  return'verified';
};
/** Keys exist encrypted only in this private vault, never in project records or exports. */
export class ReviewerCredentials {
  private db:DatabaseSync;private key:Buffer;private now:()=>number;private probe:CredentialProbe;
  private leases=new Map<string,{controller:AbortController;timer:ReturnType<typeof setTimeout>;expiresAt:number}>();
  private connecting=new Set<string>();
  private revocations=new Map<string,number>();
  private sweep:ReturnType<typeof setInterval>;private closed=false;
  constructor(directory:string,encryptionKey:string,options:{now?:()=>number;probe?:CredentialProbe}={}){
    const key=/^[a-f0-9]{64}$/i.test(encryptionKey)?Buffer.from(encryptionKey,'hex'):Buffer.from(encryptionKey,'base64url');
    if(key.length!==32||!encryptionKey)throw new Error('Reviewer credentials require a32-byte OTS_CREDENTIAL_ENCRYPTION_KEY');this.key=key;this.now=options.now??Date.now;this.probe=options.probe??probeReviewerCredential;
    mkdirSync(directory,{recursive:true,mode:0o700});this.db=new DatabaseSync(path.join(directory,'reviewer-vault.sqlite'));
    this.db.exec('PRAGMA journal_mode=WAL; PRAGMA secure_delete=ON; PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS reviewer_sessions(id TEXT PRIMARY KEY,token_hash TEXT NOT NULL UNIQUE,expires_at INTEGER NOT NULL,scope_id TEXT,fingerprint TEXT,ciphertext TEXT,iv TEXT,tag TEXT,credential_expires_at INTEGER,verification TEXT,last_error_code TEXT);');
    if(!(this.db.prepare('PRAGMA table_info(reviewer_sessions)').all() as {name:string}[]).some(row=>row.name==='last_error_code'))this.db.exec('ALTER TABLE reviewer_sessions ADD COLUMN last_error_code TEXT');
    this.expire();this.sweep=setInterval(()=>this.expire(),60000);this.sweep.unref();
  }
  createSession():ReviewerSession&{token:string}{const id=randomUUID(),token=randomBytes(32).toString('base64url'),expiresAt=this.now()+7*86400_000;this.db.prepare('INSERT INTO reviewer_sessions(id,token_hash,expires_at) VALUES(?,?,?)').run(id,this.hash(token),expiresAt);return{id,token,expiresAt:new Date(expiresAt).toISOString()};}
  listSessions():ReviewerSession[]{return(this.db.prepare('SELECT id,expires_at FROM reviewer_sessions WHERE expires_at>?').all(this.now()) as {id:string;expires_at:number}[]).map(row=>({id:row.id,expiresAt:new Date(row.expires_at).toISOString()}));}
  identify(token:string|undefined):ReviewerSession|undefined {if(!token||!/^[A-Za-z0-9_-]{43}$/.test(token))return;const row=this.db.prepare('SELECT id,expires_at FROM reviewer_sessions WHERE token_hash=? AND expires_at>?').get(this.hash(token),this.now()) as {id:string;expires_at:number}|undefined;return row?{id:row.id,expiresAt:new Date(row.expires_at).toISOString()}:undefined;}
  private hash(value:string){return createHash('sha256').update(value).digest('hex');}
  private row(id:string):Row {const row=this.db.prepare('SELECT * FROM reviewer_sessions WHERE id=?').get(id) as unknown as Row|undefined;if(!row||row.expires_at<=this.now())throw new CredentialUnavailableError('This reviewer session expired. Start a new isolated workspace.');return row;}
  private fingerprint(key:string){return createHmac('sha256',this.key).update('reviewer-key\0'+key).digest('hex');}
  private revokeLease(id:string){const lease=this.leases.get(id);if(lease){clearTimeout(lease.timer);lease.controller.abort(new CredentialUnavailableError());this.leases.delete(id);}}
  private renewLease(id:string,expiresAt:number){const lease=this.leases.get(id);if(!lease)return;clearTimeout(lease.timer);lease.expiresAt=expiresAt;lease.timer=setTimeout(()=>this.erase(id),Math.max(1,expiresAt-this.now()));lease.timer.unref();}
  private erase(id:string){this.revocations.set(id,(this.revocations.get(id)??0)+1);this.revokeLease(id);this.db.prepare('UPDATE reviewer_sessions SET ciphertext=NULL,iv=NULL,tag=NULL WHERE id=?').run(id);this.db.exec('PRAGMA wal_checkpoint(TRUNCATE)');}
  expire(){const rows=this.db.prepare('SELECT id FROM reviewer_sessions WHERE ciphertext IS NOT NULL AND (credential_expires_at<=? OR expires_at<=?)').all(this.now(),this.now()) as {id:string}[];for(const row of rows)this.erase(row.id);}
  status(id:string):ReviewerStatus {const row=this.row(id),expired=Boolean(row.credential_expires_at&&row.credential_expires_at<=this.now());if(expired&&row.ciphertext)this.erase(id);const connected=Boolean(row.ciphertext&&!expired);return{id,expiresAt:new Date(row.expires_at).toISOString(),state:connected?'connected':expired?'expired':'disconnected',connected,credentialScopeId:row.scope_id??undefined,credentialExpiresAt:row.credential_expires_at?new Date(row.credential_expires_at).toISOString():undefined,verification:row.verification??undefined,lastErrorCode:row.last_error_code??undefined};}
  async connect(id:string,rawKey:string):Promise<ReviewerStatus>{
    if(this.connecting.has(id))throw Object.assign(new Error('This workspace is already checking a key.'),{status:409});
    const apiKey=typeof rawKey==='string'?rawKey.trim():'';if(apiKey.length<16||apiKey.length>4096||/[\s\u0000-\u001f]/.test(apiKey))throw Object.assign(new Error('Enter a valid Comfy API key.'),{status:400});
    const prior=this.row(id),fingerprint=this.fingerprint(apiKey),revision=this.revocations.get(id)??0;if(prior.fingerprint&&!timingSafeEqual(Buffer.from(prior.fingerprint),Buffer.from(fingerprint)))throw Object.assign(new Error('This workspace is bound to its original Comfy key. Start a new reviewer workspace to use a different key.'),{status:409,code:'credential_scope_mismatch'});
    this.connecting.add(id);try{
      const verification=await this.probe(apiKey);if(this.closed)throw new CredentialUnavailableError('The studio is restarting; connect again when ready.');this.row(id);if((this.revocations.get(id)??0)!==revision)throw new CredentialUnavailableError('Key connection was canceled. Connect again when ready.');const scope=prior.scope_id??randomUUID(),expiresAt=this.now()+12*3600_000,iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',this.key,iv);cipher.setAAD(Buffer.from(`${id}\0${scope}\0${expiresAt}`));const encrypted=Buffer.concat([cipher.update(apiKey,'utf8'),cipher.final()]);this.renewLease(id,expiresAt);
      this.db.prepare('UPDATE reviewer_sessions SET scope_id=?,fingerprint=?,ciphertext=?,iv=?,tag=?,credential_expires_at=?,verification=?,last_error_code=NULL WHERE id=?').run(scope,fingerprint,encrypted.toString('base64url'),iv.toString('base64url'),cipher.getAuthTag().toString('base64url'),expiresAt,verification,id);
      return this.status(id);
    }catch(error){const message=error instanceof Error?error.message:'Credential verification failed',code=String((error as {code?:string})?.code??'verification_unavailable');if(!this.closed)this.db.prepare('UPDATE reviewer_sessions SET last_error_code=? WHERE id=?').run(code,id);throw Object.assign(new Error(message.split(apiKey).join('[redacted]')),{status:(error as {status?:number})?.status??503,code});}finally{this.connecting.delete(id);}
  }
  disconnect(id:string):ReviewerStatus {this.row(id);this.erase(id);return this.status(id);}
  resolve(id:string):ExecutionCredential {
    const row=this.row(id);if(!row.ciphertext||!row.credential_expires_at||row.credential_expires_at<=this.now()){if(row.ciphertext)this.erase(id);throw new CredentialUnavailableError();}
    const decipher=createDecipheriv('aes-256-gcm',this.key,Buffer.from(row.iv!,'base64url'));decipher.setAAD(Buffer.from(`${id}\0${row.scope_id}\0${row.credential_expires_at}`));decipher.setAuthTag(Buffer.from(row.tag!,'base64url'));let apiKey:string;try{apiKey=Buffer.concat([decipher.update(Buffer.from(row.ciphertext,'base64url')),decipher.final()]).toString('utf8');}catch{throw new CredentialUnavailableError('Saved credential cannot be decrypted. Reconnect its original Comfy key.');}
    let lease=this.leases.get(id);if(!lease){const controller=new AbortController(),timer=setTimeout(()=>this.erase(id),Math.max(1,row.credential_expires_at-this.now()));timer.unref();lease={controller,timer,expiresAt:row.credential_expires_at};this.leases.set(id,lease);}
    return{apiKey,id:row.scope_id!,expiresAt:new Date(row.credential_expires_at).toISOString(),signal:lease.controller.signal};
  }
  source(id:string):CredentialSource{return{resolve:()=>this.resolve(id),available:()=>{try{return this.status(id).connected;}catch{return false;}}};}
  close(){this.closed=true;clearInterval(this.sweep);for(const id of this.leases.keys())this.revokeLease(id);this.db.close();this.key.fill(0);}
}
