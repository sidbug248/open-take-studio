import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { request } from 'node:https';
import type { IncomingMessage } from 'node:http';

const MAX_BYTES = 300 * 1024 * 1024;
export function isPrivateAddress(address: string): boolean {
  const a = address.toLowerCase().replace(/^\[|\]$/g,'');
  if (a.includes(':')) return a === '::' || a === '::1' || a.startsWith('fc') || a.startsWith('fd') || /^fe[89ab]/.test(a) || a.startsWith('::ffff:') || a.startsWith('2001:db8:');
  const p = a.split('.').map(Number);
  return p[0]===0 || p[0]===10 || p[0]===127 || p[0]>=224 || (p[0]===169&&p[1]===254) || (p[0]===172&&p[1]>=16&&p[1]<=31) || (p[0]===192&&p[1]===168) || (p[0]===100&&p[1]>=64&&p[1]<=127);
}
async function publicUrl(value:string) {
  const u = new URL(value);
  if(u.protocol !== 'https:' || u.username || u.password || (u.port && u.port!=='443')) throw new Error('Media must use a public HTTPS URL.');
  const host=u.hostname.replace(/^\[|\]$/g,'');
  const addresses=isIP(host)?[{address:host,family:isIP(host)}]:await lookup(host,{all:true});
  if(!addresses.length || addresses.some(x=>isPrivateAddress(x.address))) throw new Error('Private network media URLs are not allowed.');
  return {url:u,address:addresses.find(a=>a.family===4)||addresses[0]};
}
export async function downloadMedia(url:string):Promise<{bytes:Buffer;mimeType:string}> {
  if(url.startsWith('data:')) {
    const match=/^data:([\w.+/-]+);base64,([A-Za-z0-9+/=\s]+)$/.exec(url);
    if(!match) throw new Error('Unsupported media data URI.');
    if(match[2].length>MAX_BYTES*1.4) throw new Error('Media exceeds 300 MB limit.');
    return {bytes:Buffer.from(match[2],'base64'),mimeType:match[1]};
  }
  let current=url;
  for(let redirects=0;redirects<5;redirects++) {
    const {url:u,address}=await publicUrl(current);
    // Pin the already-validated address; do not resolve the hostname a second time.
    // The URL hostname remains the TLS server name and HTTP Host.
    const res=await new Promise<IncomingMessage>((resolve,reject)=>{
      const req=request(u,{agent:false,family:address.family,lookup:(_host,_options,callback)=>callback(null,address.address,address.family),signal:AbortSignal.timeout(120_000)},resolve);
      req.on('error',reject);req.end();
    });
    const status=res.statusCode||0;
    if([301,302,303,307,308].includes(status)) {const next=res.headers.location;res.destroy();if(!next) throw new Error('Media redirect has no destination.'); current=new URL(next,u).href;continue;}
    if(status<200||status>=300) {res.destroy();throw new Error(`Media download returned HTTP ${status}. Retry collection to recover the same generation.`);}
    if(Number(res.headers['content-length'])>MAX_BYTES){res.destroy();throw new Error('Media exceeds 300 MB limit.');}
    const chunks:Uint8Array[]=[];let total=0;
    for await(const chunk of res){total+=chunk.length;if(total>MAX_BYTES){res.destroy();throw new Error('Media exceeds 300 MB limit.');}chunks.push(chunk);}
    if(!total) throw new Error('Empty media response.');
    return {bytes:Buffer.concat(chunks),mimeType:res.headers['content-type']?.split(';')[0]||'application/octet-stream'};
  }
  throw new Error('Too many media redirects.');
}
