import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import type {AddressInfo} from 'node:net';
import {securityBoundary} from '../server/runtime-security.ts';
import {readRuntimeConfig} from '../server/runtime-config.ts';
import {clientAddress,requestOrigin} from '../server/request-origin.ts';

const origin='https://studio.onrender.com',proxy='https://submitted.vercel.app',secret='q'.repeat(43);
test('native proxy requires private proof, preserves per-origin CSRF, and trusts only a single authenticated client IP',async t=>{
  const settings={...readRuntimeConfig({},process.cwd()),mode:'hosted' as const,publicOrigin:origin,vercelProxyOrigin:proxy,vercelProxySecret:secret};
  const app=express();app.set('trust proxy',1);app.use((req,_res,next)=>{req.headers.host=String(req.headers['x-fixture-host']??'studio.onrender.com');next();});app.use(securityBoundary(settings));app.all('/api/check',(req,res)=>res.json({...requestOrigin(req),clientIp:clientAddress(req),proofRemoved:!req.headers['x-ots-proxy-secret']}));
  const server=app.listen(0,'127.0.0.1');await new Promise<void>(resolve=>server.once('listening',resolve));t.after(()=>new Promise<void>(resolve=>server.close(()=>resolve())));
  const base=`http://127.0.0.1:${(server.address() as AddressInfo).port}/api/check`,headers={'X-Forwarded-Proto':'https','X-Forwarded-For':'192.0.2.99, 198.51.100.7'};
  const direct=await fetch(base,{headers:{...headers,'X-Vercel-Forwarded-For':'203.0.113.66'}});assert.deepEqual(await direct.json(),{origin,proxied:false,ipSource:'render-hop',clientIp:'198.51.100.7',proofRemoved:true});
  for(const [key,value]of[['CDN-Cache-Control','private, no-store'],['Vercel-CDN-Cache-Control','no-store']])assert.equal(direct.headers.get(key),value);
  const trusted={...headers,'X-OTS-Proxy-Secret':secret,'X-Vercel-Forwarded-For':'203.0.113.8'};
  const actual=await fetch(base,{method:'POST',headers:{...trusted,Origin:proxy}});assert.equal(actual.status,200);assert.deepEqual(await actual.json(),{origin:proxy,proxied:true,ipSource:'vercel-verified',clientIp:'203.0.113.8',proofRemoved:true});
  for(const bad of['', '203.0.113.8, 198.51.100.1','not-an-ip'])assert.equal((await fetch(base,{headers:{...trusted,'X-Vercel-Forwarded-For':bad}})).status,403);
  assert.equal((await fetch(base,{headers:{...trusted,'X-OTS-Proxy-Secret':'z'.repeat(43)}})).status,403);
  assert.equal((await fetch(base,{headers:{...headers,'X-Fixture-Host':'evil.test'}})).status,403);
  assert.equal((await fetch(base,{method:'POST',headers:{...headers,Origin:proxy}})).status,403,'Proxy Origin alone never proves proxy ingress');
  assert.equal((await fetch(base,{method:'POST',headers:{...trusted,Origin:origin}})).status,403,'A Render browser origin cannot be replayed as a Vercel browser request');
  assert.equal((await fetch(base,{method:'POST',headers:trusted})).status,403);
  assert.equal((await fetch(base,{method:'POST',headers:{...trusted,Origin:'https://evil.test'}})).status,403);
  assert.equal((await fetch(base,{method:'POST',headers:{...headers,Origin:origin}})).status,200);
});

test('proxy configuration requires an explicit separate HTTPS origin and strong private proof',()=>{
  const env={OTS_MODE:'hosted',OTS_DATA_DIR:process.cwd(),OTS_PUBLIC_ORIGIN:origin,OTS_PERSISTENT_STORAGE_CONFIRMED:'true',OTS_OWNER_PASSWORD_HASH:'scrypt$'+'x'.repeat(32)+'$'+'z'.repeat(86)};
  assert.throws(()=>readRuntimeConfig({...env,OTS_VERCEL_PROXY_ORIGIN:proxy},process.cwd()),/secret/);
  assert.throws(()=>readRuntimeConfig({...env,OTS_VERCEL_PROXY_ORIGIN:origin,OTS_VERCEL_PROXY_SECRET:secret},process.cwd()),/separate HTTPS/);
  const configured=readRuntimeConfig({...env,OTS_VERCEL_PROXY_ORIGIN:proxy,OTS_VERCEL_PROXY_SECRET:secret},process.cwd());assert.equal(configured.vercelProxyOrigin,proxy);
});
