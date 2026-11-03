import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,rm} from 'node:fs/promises';
import path from 'node:path';
import type {AddressInfo} from 'node:net';
import express,{type Request} from 'express';
import {Store} from '../server/store.ts';
import {readRuntimeConfig} from '../server/runtime-config.ts';
import {AuthSessions,createAuthRouter,hashOwnerPassword} from '../server/auth-session.ts';
import {securityBoundary,createRuntimeAdmission} from '../server/runtime-security.ts';
import {setAccess,requireProjectAccess} from '../server/auth-access.ts';

test('hosted mode fails closed without HTTPS, credentials, and an explicitly confirmed persistent directory',()=>{
  assert.equal(readRuntimeConfig({},process.cwd()).mode,'local');
  assert.throws(()=>readRuntimeConfig({OTS_MODE:'hosted'},process.cwd()),/OTS_DATA_DIR/);
  assert.throws(()=>readRuntimeConfig({OTS_MODE:'hosted',OTS_DATA_DIR:path.resolve('data'),OTS_PUBLIC_ORIGIN:'http://example.test'},process.cwd()),/HTTPS/);
});

test('hosted owner sessions protect HTML/media, reject forged origin, survive reopening, and revoke on logout',async()=>{
  const base=path.resolve('data/test-fixtures');await mkdir(base,{recursive:true});const dir=await mkdtemp(path.join(base,'auth-'));let store=new Store(dir);
  const password='isolated fixture password only',hash=await hashOwnerPassword(password),settings=readRuntimeConfig({OTS_MODE:'hosted',OTS_DATA_DIR:dir,OTS_PUBLIC_ORIGIN:'https://studio.example.test',OTS_OWNER_PASSWORD_HASH:hash,OTS_PERSISTENT_STORAGE_CONFIRMED:'true'},process.cwd());
  const sessions=new AuthSessions(store,settings),app=express();app.set('trust proxy',1);app.use((req,_res,next)=>{req.headers.host=String(req.headers['x-fixture-host']??req.headers.host);next();});app.use(securityBoundary(settings));app.use(sessions.identify());app.use(createAuthRouter(sessions));app.use(sessions.gate());app.get('/',(_q,r)=>r.send('PRIVATE BOOTSTRAP'));app.get('/api/assets/owned/file',(_q,r)=>r.send('PRIVATE MEDIA'));
  const server=app.listen(0,'127.0.0.1');await new Promise<void>(resolve=>server.once('listening',resolve));const url=`http://127.0.0.1:${(server.address() as AddressInfo).port}`,headers={'X-Fixture-Host':'studio.example.test','X-Forwarded-Proto':'https'};
  try{
    const first=await fetch(url+'/',{headers,redirect:'manual'});assert.equal(first.status,303);assert.equal(first.headers.get('location'),'/login');assert.ok(!(await first.text()).includes('PRIVATE BOOTSTRAP'));
    assert.equal((await fetch(url+'/api/assets/owned/file',{headers})).status,401);
    assert.equal((await fetch(url+'/auth/login',{method:'POST',headers:{...headers,Origin:'https://evil.test','Content-Type':'application/json'},body:JSON.stringify({password}),redirect:'manual'})).status,403);
    const login=await fetch(url+'/auth/login',{method:'POST',headers:{...headers,Origin:'https://studio.example.test','Content-Type':'application/json'},body:JSON.stringify({password}),redirect:'manual'});assert.equal(login.status,200);const cookie=login.headers.get('set-cookie')!;assert.match(cookie,/HttpOnly/);assert.match(cookie,/Secure/);assert.match(cookie,/SameSite=Lax/);const token=sessions.token(cookie);
    assert.equal(sessions.valid(token),true);assert.equal((store.db.prepare('SELECT token_hash FROM studio_sessions').get() as {token_hash:string}).token_hash.includes(token),false);
    const reopened=new Store(dir);try{assert.equal(new AuthSessions(reopened,settings).valid(token),true);}finally{reopened.close();}
    assert.equal(await(await fetch(url+'/api/assets/owned/file',{headers:{...headers,Cookie:cookie.split(';')[0]}})).text(),'PRIVATE MEDIA');
    const scoped={} as Request;setAccess(scoped,{kind:'scoped-token',subjectId:'review',projectIds:['one'],permissions:['read']});assert.throws(()=>requireProjectAccess(store,scoped,'other'),/not available/);assert.throws(()=>requireProjectAccess(store,scoped,'one','write'),/not available/);
    const logout=await fetch(url+'/auth/logout',{method:'POST',headers:{...headers,Origin:'https://studio.example.test',Cookie:cookie.split(';')[0]},redirect:'manual'});assert.equal(logout.status,303);assert.equal(sessions.valid(token),false);
    assert.equal((await fetch(url+'/api/assets/owned/file',{headers:{...headers,Cookie:cookie.split(';')[0]}})).status,401);
  }finally{await new Promise<void>(resolve=>server.close(()=>resolve()));store.close();await rm(dir,{recursive:true,force:true});}
});

test('hosted generation admission bounds the hourly identities without parsing history and rejects low disk',async()=>{
  const base=path.resolve('data/test-fixtures');await mkdir(base,{recursive:true});const dir=await mkdtemp(path.join(base,'admission-')),store=new Store(dir),settings={...readRuntimeConfig({},process.cwd()),mode:'hosted' as const,dataDir:dir,maxGenerationPerHour:1};let free=2*1024**3;
  const app=express();app.use(express.json());app.use(createRuntimeAdmission(store,settings,async()=>free));app.post('/generate',(_q,r)=>r.json({accepted:true}));const server=app.listen(0,'127.0.0.1');await new Promise<void>(resolve=>server.once('listening',resolve));const url=`http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try{const post=(id:string)=>fetch(url+'/generate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({projectId:'fixture',clientRequestId:id})});assert.equal((await post('first')).status,200);assert.equal((await post('first')).status,200);assert.equal((await post('second')).status,429);free=0;assert.equal((await post('first')).status,507);}finally{await new Promise<void>(resolve=>server.close(()=>resolve()));store.close();await rm(dir,{recursive:true,force:true});}
});
