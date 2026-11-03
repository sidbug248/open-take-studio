// This server imports no studio code, configuration, database or credentials.
import {createServer} from 'node:http';
import {createReadStream} from 'node:fs';
import {realpath,stat,mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
const root=await realpath(path.resolve('artifacts/first-impression/exports/Prismatic-player')),port=4335;
const types={'.html':'text/html; charset=utf-8','.json':'application/json','.mp4':'video/mp4','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.txt':'text/plain; charset=utf-8'};
const server=createServer(async(req,res)=>{try{
  if(!['GET','HEAD'].includes(req.method)||!['127.0.0.1:4335','localhost:4335'].includes(req.headers.host)){res.writeHead(403).end();return;}
  const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname),candidate=path.resolve(root,'.'+(pathname==='/'?'/index.html':pathname)),file=await realpath(candidate);if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}const info=await stat(file);if(!info.isFile()){res.writeHead(404).end();return;}
  res.setHeader('Content-Type',types[path.extname(file)]??'application/octet-stream');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Accept-Ranges','bytes');res.setHeader('Cache-Control','no-cache');res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src 'self' data:; media-src 'self'; connect-src 'none'; frame-ancestors 'none'; object-src 'none'; base-uri 'none'");
  let start=0,end=info.size-1,status=200;if(req.headers.range){const match=/^bytes=(\d*)-(\d*)$/.exec(req.headers.range);if(!match||(!match[1]&&!match[2])){res.writeHead(416,{'Content-Range':`bytes */${info.size}`}).end();return;}start=match[1]?Number(match[1]):Math.max(0,info.size-Number(match[2]));end=match[1]&&match[2]?Math.min(Number(match[2]),info.size-1):info.size-1;if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start>end||start>=info.size){res.writeHead(416,{'Content-Range':`bytes */${info.size}`}).end();return;}status=206;res.setHeader('Content-Range',`bytes ${start}-${end}/${info.size}`);}
  res.writeHead(status,{'Content-Length':end-start+1});if(req.method==='HEAD'){res.end();return;}const stream=createReadStream(file,{start,end});stream.on('error',()=>res.destroy());res.on('close',()=>stream.destroy());stream.pipe(res);
}catch{res.writeHead(404).end('Not found');}});
server.on('error',error=>{console.error(error.message);process.exitCode=1;});server.listen(port,'127.0.0.1',async()=>{const receipt={startedAt:new Date().toISOString(),pid:process.pid,url:`http://127.0.0.1:${port}`,root,methods:['GET','HEAD'],connectSrc:'none',productionModulesImported:false,databaseAccess:false};await writeFile(path.resolve('artifacts/first-impression/exports/Prismatic-player-host.json'),JSON.stringify(receipt,null,2));console.log(JSON.stringify(receipt));});
