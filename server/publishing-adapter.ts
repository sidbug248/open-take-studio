import https from 'node:https';
import {lookup} from 'node:dns/promises';
import {isIP} from 'node:net';
import {randomUUID} from 'node:crypto';
import type {PublicationVisibility} from '../shared/publishing-types.ts';

export interface PublishResponse {status:number;body:Record<string,unknown>;}
export type PublishRequest=(origin:string,token:string,method:'GET'|'POST',path:string,body?:Buffer,headers?:Record<string,string>)=>Promise<PublishResponse>;
export interface PublishAdapter {
 verify(origin:string,token:string):Promise<{id:string;account:string}>;
 upload(origin:string,token:string,input:{bytes:Buffer;name:string;mimeType:string;alt:string}):Promise<{id:string;ready:boolean}>;
 mediaReady(origin:string,token:string,id:string):Promise<boolean>;
 post(origin:string,token:string,input:{caption:string;visibility:PublicationVisibility;mediaIds:string[];idempotencyKey:string}):Promise<{id:string;url?:string}>;
}
export class PublishingError extends Error {constructor(message:string,public status=400,public uncertain=false){super(message);}}
export function normalizePublishingOrigin(value:string):string{
 let url:URL;try{url=new URL(value);}catch{throw new PublishingError('Enter the HTTPS address of your Mastodon server.');}
 if(url.protocol!=='https:'||url.username||url.password||url.port||url.pathname!=='/'||url.search||url.hash||isIP(url.hostname)||url.hostname==='localhost'||!url.hostname.includes('.'))throw new PublishingError('Use a public HTTPS Mastodon server without a path, port or credentials.');
 return url.origin;
}
export function publicIPv4(value:string):boolean{
 if(isIP(value)!==4)return false;
 const [a,b,c]=value.split('.').map(Number);
 return !(a===0||a===10||a===127||a>=224||a===169&&b===254||a===172&&b>=16&&b<=31||a===192&&(b===168||b===0||b===2)||a===100&&b>=64&&b<=127||a===198&&(b===18||b===19||b===51&&c===100)||a===203&&b===0&&c===113);
}
/** Resolve and pin a public address for this request. Never follow redirects or
 * permit user-controlled paths. IPv6-only instances are deliberately unsupported. */
export const safePublishRequest:PublishRequest=async(origin,token,method,apiPath,body,extra={})=>{
 const url=new URL(normalizePublishingOrigin(origin));
 if(!/^\/api\/(?:v1\/(?:accounts\/verify_credentials|statuses|media\/[A-Za-z0-9_-]{1,100})|v2\/media)$/.test(apiPath))throw new PublishingError('Unsupported publishing endpoint.');
 let dnsTimer:ReturnType<typeof setTimeout>|undefined;
 const addresses=await Promise.race([lookup(url.hostname,{all:true,family:4}),new Promise<never>((_resolve,reject)=>{dnsTimer=setTimeout(()=>reject(new PublishingError('The publishing server address could not be resolved in time.',502)),5000);dnsTimer.unref();})]).finally(()=>{if(dnsTimer)clearTimeout(dnsTimer);});
 if(!addresses.length||addresses.some(item=>!publicIPv4(item.address)))throw new PublishingError('The publishing server must resolve to public internet addresses.');
 const address=addresses[0]!.address;
 let absoluteTimer:ReturnType<typeof setTimeout>|undefined;
 return new Promise<PublishResponse>((resolve,reject)=>{
   const request=https.request({hostname:url.hostname,port:443,servername:url.hostname,path:apiPath,method,agent:false,
     lookup:((_hostname:unknown,options:unknown,callback:(...args:unknown[])=>void)=>{if((options as {all?:boolean})?.all)callback(null,[{address,family:4}]);else callback(null,address,4);}) as never,
     headers:{Authorization:'Bearer '+token,Accept:'application/json','User-Agent':'OpenTakeStudio/0.1',...(body?{'Content-Length':String(body.length)}:{}),...extra}},
     response=>{const chunks:Buffer[]=[];let count=0;response.on('data',(chunk:Buffer)=>{count+=chunk.length;if(count>1024*1024){response.destroy();reject(new PublishingError('Publishing response was too large.',502,true));}else chunks.push(chunk);});response.on('end',()=>{try{const status=response.statusCode??502;if(status>=300&&status<400)throw new PublishingError('Publishing redirects are not followed.',502,method==='POST');const parsed=JSON.parse(Buffer.concat(chunks).toString('utf8')||'{}');resolve({status,body:parsed});}catch(error){reject(error instanceof PublishingError?error:new PublishingError('Publishing server returned an unreadable response.',502,method==='POST'));}});response.on('error',()=>reject(new PublishingError('Publishing connection ended before a response.',502,method==='POST')));});
   absoluteTimer=setTimeout(()=>request.destroy(new Error('deadline')),25000);absoluteTimer.unref();
   request.setTimeout(15000,()=>request.destroy(new Error('timeout')));
   request.on('error',()=>reject(new PublishingError('Publishing server could not be reached. Check its status and your connection.',502,method==='POST')));
   request.end(body);
 }).finally(()=>{if(absoluteTimer)clearTimeout(absoluteTimer);});
};
function validId(value:unknown):string{if(typeof value!=='string'||!/^[A-Za-z0-9_-]{1,100}$/.test(value))throw new PublishingError('Publishing server returned an invalid receipt.',502,true);return value;}
function accepted(response:PublishResponse,posting=false){if(response.status<200||response.status>=300)throw new PublishingError(response.status===401||response.status===403?'This publishing token is not authorized. Reconnect with the required permissions.':response.status===429?'The publishing server rate limit was reached. Reschedule this draft later.':'The publishing server rejected the request (HTTP '+response.status+').',response.status===401||response.status===403?403:502,posting&&response.status>=500);}
export class MastodonAdapter implements PublishAdapter {
 constructor(private request:PublishRequest=safePublishRequest){}
 async verify(origin:string,token:string){const result=await this.request(origin,token,'GET','/api/v1/accounts/verify_credentials');accepted(result);return{id:validId(result.body.id),account:String(result.body.acct??result.body.username??'').replace(/[\u0000-\u001f]/g,'').slice(0,240)};}
 async upload(origin:string,token:string,input:{bytes:Buffer;name:string;mimeType:string;alt:string}){
   const boundary='ots-'+randomUUID(),name=input.name.replace(/[^A-Za-z0-9_.-]/g,'_').slice(0,120)||'media';
   const body=Buffer.concat([Buffer.from('--'+boundary+'\r\nContent-Disposition: form-data; name="description"\r\n\r\n'+input.alt+'\r\n--'+boundary+'\r\nContent-Disposition: form-data; name="file"; filename="'+name+'"\r\nContent-Type: '+input.mimeType+'\r\n\r\n'),input.bytes,Buffer.from('\r\n--'+boundary+'--\r\n')]);
   const result=await this.request(origin,token,'POST','/api/v2/media',body,{'Content-Type':'multipart/form-data; boundary='+boundary});accepted(result);return{id:validId(result.body.id),ready:result.status===200&&typeof result.body.url==='string'};
 }
 async mediaReady(origin:string,token:string,id:string){const result=await this.request(origin,token,'GET','/api/v1/media/'+validId(id));if(result.status===206||result.status===202)return false;accepted(result);return typeof result.body.url==='string';}
 async post(origin:string,token:string,input:{caption:string;visibility:PublicationVisibility;mediaIds:string[];idempotencyKey:string}){
   const body=Buffer.from(JSON.stringify({status:input.caption,visibility:input.visibility,media_ids:input.mediaIds}));
   const result=await this.request(origin,token,'POST','/api/v1/statuses',body,{'Content-Type':'application/json','Idempotency-Key':input.idempotencyKey});accepted(result,true);
   const id=validId(result.body.id);let url:string|undefined;try{const candidate=new URL(String(result.body.url));if(candidate.protocol==='https:'&&!candidate.username&&!candidate.password)url=candidate.href;}catch{}
   return{id,url};
 }
}
