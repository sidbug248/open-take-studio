// A separate, read-only HTTP test host for the exported website. No app modules,
// credentials, database, API routes or paths outside the export are accessible.
import {createServer} from 'node:http';
import {readFile,stat,realpath} from 'node:fs/promises';
import path from 'node:path';
const root=await realpath(path.resolve(process.argv[2]||'artifacts/next-build/playable-evidence/neon-courier'));
const types={'.html':'text/html; charset=utf-8','.json':'application/json','.mp4':'video/mp4','.png':'image/png','.txt':'text/plain','.md':'text/plain'};
createServer(async(req,res)=>{try{
 if(!['GET','HEAD'].includes(req.method)||!['127.0.0.1:4314','localhost:4314'].includes(req.headers.host)){res.writeHead(403).end();return;}
 const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);const target=path.resolve(root,'.'+(pathname==='/'?'/index.html':pathname));
 const resolved=await realpath(target===root?path.join(root,'index.html'):target);if(!resolved.startsWith(root+path.sep)){res.writeHead(403).end();return;}
 const info=await stat(resolved);if(!info.isFile()){res.writeHead(404).end();return;}const bytes=await readFile(resolved);
 res.setHeader('Content-Type',types[path.extname(resolved)]||'application/octet-stream');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Accept-Ranges','bytes');res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src 'self' data:; media-src 'self'; connect-src 'none'; frame-ancestors 'none'");
 const range=/^bytes=(\d+)-(\d*)$/.exec(req.headers.range||'');if(range){const start=Number(range[1]),end=Math.min(range[2]?Number(range[2]):bytes.length-1,bytes.length-1);if(start>end||start>=bytes.length){res.writeHead(416).end();return;}res.writeHead(206,{'Content-Range':`bytes ${start}-${end}/${bytes.length}`,'Content-Length':end-start+1});res.end(req.method==='HEAD'?undefined:bytes.subarray(start,end+1));return;}
 res.setHeader('Content-Length',bytes.length);res.end(req.method==='HEAD'?undefined:bytes);
 }catch{res.writeHead(404).end('Not found');}}).listen(4314,'127.0.0.1',()=>console.log('Standalone exported playable: http://127.0.0.1:4314'));
