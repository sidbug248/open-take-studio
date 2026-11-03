import http from 'node:http';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';

export type ArrivalProfile='no-store'|'normal'|'limited';
const hopByHop=new Set(['connection','proxy-connection','keep-alive','transfer-encoding','te','trailer','upgrade','proxy-authorization','proxy-authenticate']);
const wait=(ms:number)=>new Promise<void>(resolve=>setTimeout(resolve,ms));
const drain=(response:http.ServerResponse)=>new Promise<void>((resolve,reject)=>{const cleanup=()=>{response.off('drain',ready);response.off('close',closed);},ready=()=>{cleanup();resolve();},closed=()=>{cleanup();reject(new Error('QA client closed'));};if(response.destroyed){reject(new Error('QA client closed'));return;}response.once('drain',ready);response.once('close',closed);});
/** Paths with presentation-generating GET handlers are deliberately excluded. */
export function isReadOnlyArrivalPath(pathname:string){
  if(pathname==='/'||pathname==='/index.html'||/^\/(?:arrival-probe\.js|favicon\.(?:ico|svg|png))$/.test(pathname))return true;
  if(/^\/assets\/[A-Za-z0-9_.-]+$/.test(pathname))return true;
  return /^\/api\/(?:health|models|catalogue(?:\/[A-Za-z0-9_/-]+)?|explore\/(?:bootstrap|cards|recipes)|projects(?:\/[A-Za-z0-9_-]+(?:\/status)?)?|assets\/[A-Za-z0-9_-]+\/(?:display|file)|display\/[A-Za-z0-9_-]+\/[a-f0-9]{64}\/display-v[0-9]+\/[a-f0-9]{64}\.(?:webp|jpg|mp4|glb))$/.test(pathname);
}

/** All responses share this queue; the bound is aggregate response BODY bandwidth. */
class SharedBodyBudget {
  private tail:Promise<void>=Promise.resolve();private nextAt=0;
  constructor(readonly bytesPerSecond:number){}
  async write(response:http.ServerResponse,bytes:Buffer){
    for(let offset=0;offset<bytes.length;offset+=16_384){const part=bytes.subarray(offset,Math.min(bytes.length,offset+16_384));const scheduled=this.tail.then(async()=>{if(response.destroyed)throw new Error('QA client closed');const now=performance.now(),deadline=this.nextAt?Math.max(this.nextAt,now-16_384/this.bytesPerSecond*1000):now;await wait(Math.max(0,deadline-now));if(response.destroyed)throw new Error('QA client closed');this.nextAt=deadline+part.length/this.bytesPerSecond*1000;if(!response.write(part))await drain(response);});this.tail=scheduled.catch(()=>{});await scheduled;}
  }
}

export function createArrivalQaProxy(options:{profile:ArrivalProfile;upstreamPort?:number}){
  const upstreamPort=options.upstreamPort??4310,budget=options.profile==='limited'?new SharedBodyBudget(1_250_000):undefined;
  const agent=new http.Agent({keepAlive:true,maxSockets:24});
  const server=http.createServer((req,res)=>{
    const host=req.headers.host??'',remote=req.socket.remoteAddress;
    if(!/^(?:127\.0\.0\.1|localhost)(?::\d+)?$/.test(host)||!['127.0.0.1','::1','::ffff:127.0.0.1'].includes(remote??'')){res.writeHead(403).end('Loopback QA access only.');return;}
    if(req.method!=='GET'&&req.method!=='HEAD'){res.writeHead(405,{Allow:'GET, HEAD'}).end('Read-only arrival QA proxy.');return;}
    if(!req.url?.startsWith('/')||req.url.startsWith('//')){res.writeHead(400).end('Only local relative request paths are allowed.');return;}
    let target:URL;try{target=new URL(req.url,'http://127.0.0.1');}catch{res.writeHead(400).end();return;}
    if(!isReadOnlyArrivalPath(target.pathname)){res.writeHead(403).end('This endpoint is outside the read-only arrival measurement.');return;}
    const headers:http.OutgoingHttpHeaders={};for(const[key,value]of Object.entries(req.headers))if(!hopByHop.has(key)&&!['host','origin','referer','cookie','authorization','content-length','expect'].includes(key))headers[key]=value;
    headers.host=`127.0.0.1:${upstreamPort}`;if(options.profile!=='normal'){delete headers['if-none-match'];delete headers['if-modified-since'];headers['cache-control']='no-cache';}
    const upstream=http.request({hostname:'127.0.0.1',port:upstreamPort,method:req.method,path:target.pathname+target.search,headers,agent},async incoming=>{
      incoming.pause();try{if(options.profile==='limited')await wait(40);if(res.destroyed){incoming.destroy();return;}const responseHeaders:http.OutgoingHttpHeaders={};for(const[key,value]of Object.entries(incoming.headers))if(!hopByHop.has(key))responseHeaders[key]=value;
        if(options.profile!=='normal'){responseHeaders['cache-control']='no-store';responseHeaders.pragma='no-cache';responseHeaders.expires='0';}
        responseHeaders['x-open-take-qa-profile']=options.profile;responseHeaders['x-open-take-qa-upstream']='127.0.0.1:4310';
        res.writeHead(incoming.statusCode??502,responseHeaders);
        if(req.method==='HEAD'){incoming.resume();res.end();return;}
        for await(const chunk of incoming){const bytes=Buffer.isBuffer(chunk)?chunk:Buffer.from(chunk);if(budget)await budget.write(res,bytes);else if(!res.write(bytes))await drain(res);}res.end();
      }catch{incoming.destroy();if(!res.headersSent)res.writeHead(502);res.end();}
    });
    upstream.setTimeout(30_000,()=>upstream.destroy(new Error('Local upstream timed out')));upstream.on('error',()=>{if(!res.headersSent)res.writeHead(502,{'Content-Type':'text/plain'});res.end('Local production server is unavailable.');});res.on('close',()=>{if(!res.writableEnded)upstream.destroy();});upstream.end();
  });
  server.on('close',()=>agent.destroy());return server;
}

if(process.argv[1]?.endsWith('arrival-qa-proxy.ts')){
  const arg=(name:string)=>process.argv[process.argv.indexOf(name)+1],profile=arg('--mode') as ArrivalProfile,port=Number(arg('--port'));
  if(!['no-store','normal','limited'].includes(profile)||![4330,4331,4332].includes(port))throw new Error('Use --mode no-store|normal|limited --port4330|4331|4332');
  const server=createArrivalQaProxy({profile});server.on('error',error=>{console.error(error.message);process.exitCode=1;});
  server.listen(port,'127.0.0.1',async()=>{const directory=path.resolve('artifacts/first-impression/arrival-proxies');await mkdir(directory,{recursive:true});const receipt={startedAt:new Date().toISOString(),pid:process.pid,port,url:`http://127.0.0.1:${port}`,upstream:'http://127.0.0.1:4310',profile,methods:['GET','HEAD'],upstreamMutatingGetRoutesBlocked:true,responseBodies:'Forwarded unchanged, including compressed bytes and video ranges.',cache:profile==='normal'?'Upstream cache policy retained':'Fresh port origin with Cache-Control:no-store; conditional revalidation headers removed. Browser/OS/server caches are not cleared.',network:profile==='limited'?{addedResponseLatencyMs:40,aggregateResponseBodyBitsPerSecond:10_000_000,packetBytes:16_384,scope:'Local proxy shaping in addition to actual server delay; no simulated upload bandwidth.'}:{addedLatencyMs:0,bandwidthShaping:false},cpuThrottled:false,databaseMutations:false,limits:'Arrival measurement only. Editing and generation POSTs are intentionally disabled. Not a physical phone or full cellular-network simulation.'};await writeFile(path.join(directory,`profile-${port}.json`),JSON.stringify(receipt,null,2));console.log(JSON.stringify(receipt));});
  process.on('SIGINT',()=>server.close());process.on('SIGTERM',()=>server.close());
}
