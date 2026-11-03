import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createServer} from 'node:http';
import sharp from 'sharp';
import {Store} from '../server/store.ts';
import {LocalFileStorage} from '../server/media.ts';
import {PublishingService,hasPendingPublications} from '../server/publishing.ts';
import {MastodonAdapter,PublishingError,normalizePublishingOrigin,publicIPv4,type PublishRequest} from '../server/publishing-adapter.ts';
import type {Publication} from '../shared/publishing-types.ts';

async function fixture(t:test.TestContext){
 const directory=await mkdtemp(path.join(os.tmpdir(),'ots-publishing-')),store=new Store(directory),media=new LocalFileStorage(directory);let now=Date.UTC(2026,10,3,15),posts=0,uploads=0,processing=1,postFails=false;
 const requests:{path:string;method:string;headers:Record<string,unknown>;bytes:Buffer}[]=[];
 const server=createServer(async(req,res)=>{const chunks:Buffer[]=[];for await(const chunk of req)chunks.push(Buffer.from(chunk));const bytes=Buffer.concat(chunks);requests.push({path:req.url??'',method:req.method??'',headers:req.headers,bytes});res.setHeader('Content-Type','application/json');
  if(req.url==='/api/v1/accounts/verify_credentials'){res.end(JSON.stringify({id:'account-1',acct:'studio-fixture'}));return;}
  if(req.url==='/api/v2/media'){uploads++;res.statusCode=202;res.end(JSON.stringify({id:'media-'+uploads,url:null}));return;}
  if(req.url?.startsWith('/api/v1/media/')){res.end(JSON.stringify({id:'media-1',url:processing-->0?null:'https://example.org/fixture.png'}));return;}
  if(req.url==='/api/v1/statuses'){posts++;res.statusCode=postFails?503:200;res.end(JSON.stringify(postFails?{error:'provider unavailable'}:{id:'post-1',url:'https://mastodon.example/@fixture/post-1'}));return;}res.statusCode=404;res.end('{}');
 });
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));const address=server.address() as {port:number};
 const request:PublishRequest=async(_origin,token,method,apiPath,body,headers)=>{const response=await fetch('http://127.0.0.1:'+address.port+apiPath,{method,headers:{Authorization:'Bearer '+token,...headers},body:body as never});return{status:response.status,body:await response.json() as Record<string,unknown>};};
 const adapter=new MastodonAdapter(request);const create=()=>new PublishingService(store,media,{adapter,now:()=>now});let service=create();
 for(const id of ['project-a','project-b'])store.upsertProject({id,name:id,description:'Fixture',createdAt:new Date(now).toISOString(),updatedAt:new Date(now).toISOString()});
 const bytes=await sharp({create:{width:48,height:32,channels:3,background:'#8060cc'}}).png().toBuffer(),asset=store.upsertAsset(await media.put({projectId:'project-a',name:'original.png',bytes,mimeType:'image/png',provenance:'local-edit'}));
 t.after(async()=>{await service.stop();server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));store.close();await rm(directory,{recursive:true,force:true});});
 return{store,media,asset,directory,requests,get service(){return service;},restart(){service=create();return service;},setNow(value:number){now=value;},now:()=>now,get posts(){return posts;},get uploads(){return uploads;},failPosts(){postFails=true;}};
}
const token='test-publishing-token-never-real';
async function prepared(f:Awaited<ReturnType<typeof fixture>>,requestId='draft-1'){
 const connection=await f.service.connect('project-a',{origin:'https://mastodon.example',token});
 const draft=f.service.draft('project-a',{connectionId:connection.id,caption:'A saved original, ready for review.',visibility:'unlisted',dueAt:new Date(f.now()+60000).toISOString(),assetIds:[f.asset.id],altText:{[f.asset.id]:'Purple fixture'},clientRequestId:requestId});
 return{connection,draft};
}
test('publishing sends exact approved bytes through provider contract, survives restart, and does not duplicate',async t=>{
 const f=await fixture(t),{draft}=await prepared(f);
 assert.equal(f.posts,0);await f.service.tick();assert.equal(f.uploads,0);
 assert.throws(()=>f.service.approve('project-a',draft.id,'stale','owner',true),/exact draft/);
 f.service.approve('project-a',draft.id,draft.fingerprint,'owner',true);
 assert.equal(hasPendingPublications(f.directory),true);
 await f.service.tick();assert.equal(f.uploads,0);
 f.setNow(f.now()+60000);await f.service.tick();assert.equal(f.uploads,1);assert.equal(f.posts,0);
 f.restart();for(let i=0;i<5;i++)await f.service.tick();
 const done=f.service.get('project-a',draft.id);assert.equal(done.state,'published');assert.equal(done.remoteId,'post-1');assert.equal(f.posts,1);assert.equal(f.uploads,1);
 const upload=f.requests.find(r=>r.path==='/api/v2/media')!;assert.ok(upload.bytes.includes(await f.media.read(f.asset)));assert.ok(upload.bytes.includes(Buffer.from('Purple fixture')));
 const post=f.requests.find(r=>r.path==='/api/v1/statuses')!;assert.equal(post.headers['idempotency-key'],draft.id);assert.deepEqual(JSON.parse(post.bytes.toString()),{status:draft.caption,visibility:'unlisted',media_ids:['media-1']});
 assert.equal(hasPendingPublications(f.directory),false);
});
test('publishing secrets are encrypted, workspaces are scoped, and disconnect cancels queued posts',async t=>{
 const f=await fixture(t),{connection,draft}=await prepared(f);
 assert.ok(!JSON.stringify(f.store.listScopedRecords('publishing-connection')).includes(token));
 assert.ok(!JSON.stringify(f.service.connections('project-a')).includes('sealed'));
 assert.throws(()=>f.service.get('project-b',draft.id),/not found/);
 assert.throws(()=>f.service.draft('project-b',{connectionId:connection.id,caption:'x',visibility:'public',dueAt:new Date(f.now()+60000).toISOString(),assetIds:[f.asset.id],clientRequestId:'cross'}),/not connected/);
 const other=await f.service.connect('project-b',{origin:'https://mastodon.example',token});
 assert.throws(()=>f.service.draft('project-b',{connectionId:other.id,caption:'x',visibility:'public',dueAt:new Date(f.now()+60000).toISOString(),assetIds:[f.asset.id],clientRequestId:'cross2'}),/not in this project/);
 f.service.approve('project-a',draft.id,draft.fingerprint,'owner',true);f.service.disconnect('project-a',connection.id);f.setNow(f.now()+61000);await f.service.tick();assert.equal(f.service.get('project-a',draft.id).state,'cancelled');assert.equal(f.posts,0);assert.equal(f.uploads,0);
 const row=f.store.getScopedRecord<{sealed?:string}>('publishing-connection',connection.id)!;assert.equal(row.data.sealed,undefined);
});
test('ambiguous send and interrupted posting require manual reconciliation, never automatic duplicate posts',async t=>{
 const f=await fixture(t),{draft}=await prepared(f);f.service.approve('project-a',draft.id,draft.fingerprint,'owner',true);f.setNow(f.now()+61000);f.failPosts();
 for(let i=0;i<5;i++)await f.service.tick();assert.equal(f.posts,1);assert.equal(f.service.get('project-a',draft.id).state,'uncertain');
 f.restart();for(let i=0;i<3;i++)await f.service.tick();assert.equal(f.posts,1);
 const row=f.store.getScopedRecord<Publication>('publication',draft.id)!;row.data.state='sending';row.data.stage='post';f.store.upsertScopedRecord(row);f.restart();assert.equal(f.service.get('project-a',draft.id).state,'uncertain');await f.service.tick();assert.equal(f.posts,1);
});
test('unapproved, cancelled, missed and corrupted-media publications cannot send',async t=>{
 const f=await fixture(t),{draft}=await prepared(f);
 f.setNow(f.now()+61000);await f.service.tick();assert.equal(f.uploads,0);
 f.service.cancel('project-a',draft.id);await f.service.tick();assert.equal(f.posts,0);
 const second=await prepared(f,'draft-2');f.service.approve('project-a',second.draft.id,second.draft.fingerprint,'owner',true);f.setNow(f.now()+17*60000);await f.service.tick();assert.equal(f.service.get('project-a',second.draft.id).state,'failed');assert.equal(f.uploads,0);
 const third=await prepared(f,'draft-3');f.service.approve('project-a',third.draft.id,third.draft.fingerprint,'owner',true);await writeFile(f.media.path(f.asset),Buffer.from('changed'));f.setNow(f.now()+61000);await f.service.tick();assert.equal(f.service.get('project-a',third.draft.id).state,'failed');assert.equal(f.uploads,0);
});
test('publishing refuses private endpoints, unsafe URLs and invalid tokens before networking',async t=>{
 const f=await fixture(t);for(const address of ['127.0.0.1','10.0.0.3','169.254.169.254','100.100.100.200','192.168.1.1','172.16.2.3','::1','::ffff:127.0.0.1','198.18.0.1'])assert.equal(publicIPv4(address),false,address);
 assert.equal(publicIPv4('1.1.1.1'),true);
 for(const origin of ['http://mastodon.example','https://127.0.0.1','https://localhost','https://x:y@mastodon.example','https://mastodon.example:444','https://mastodon.example/path'])assert.throws(()=>normalizePublishingOrigin(origin),PublishingError);
 await assert.rejects(()=>f.service.connect('project-a',{origin:'https://mastodon.example',token:'comfyui-not-a-social-token'}),/Mastodon user token/);assert.equal(f.requests.length,0);
});
