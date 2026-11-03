import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,readFile,readdir,rm} from 'node:fs/promises';
import {setTimeout as delay} from 'node:timers/promises';
import path from 'node:path';
import {spawn} from 'node:child_process';
import sharp from 'sharp';
import {Store} from '../server/store.ts';
import {LocalFileStorage} from '../server/media.ts';
import {DISPLAY_VERSION,DisplayMediaStore} from '../server/display-media.ts';
import type {Asset} from '../shared/types.ts';

async function verifyWindowsLockedRevision(revisionFile:string,prepare:()=>Promise<unknown>){
  if(process.platform!=='win32')return;
  // A real Windows handle without FILE_SHARE_DELETE models an antivirus scanner,
  // while leaving the continuous-reader/concurrent-preparation coverage below intact.
  const command='$stream=[System.IO.File]::Open($env:OTS_TEST_REVISION_PATH,[System.IO.FileMode]::Open,[System.IO.FileAccess]::Read,[System.IO.FileShare]::ReadWrite);[Console]::Out.WriteLine("READY");[Console]::Out.Flush();[void][Console]::In.ReadLine();$stream.Dispose();';
  const child=spawn('powershell.exe',['-NoProfile','-NonInteractive','-Command',command],{windowsHide:true,env:{...process.env,OTS_TEST_REVISION_PATH:revisionFile},stdio:['pipe','pipe','pipe']});
  let prepared:Promise<{ok:boolean;error?:unknown}>|undefined,settled=false,output='';
  child.stderr.resume();
  const exited=new Promise<void>(resolve=>child.once('close',()=>resolve()));
  try{
    await new Promise<void>((resolve,reject)=>{
      const timer=setTimeout(()=>reject(new Error('Windows revision lock fixture did not become ready.')),10000);
      const ready=()=>{if(output.includes('READY')){clearTimeout(timer);resolve();}};
      child.stdout.on('data',chunk=>{output+=String(chunk);ready();});
      child.once('error',error=>{clearTimeout(timer);reject(error);});
      child.once('exit',code=>{clearTimeout(timer);if(!output.includes('READY'))reject(new Error('Windows revision lock fixture exited early: '+code));});
    });
    const original=JSON.parse(await readFile(revisionFile,'utf8'));
    prepared=prepare().then(()=>({ok:true}),error=>({ok:false,error})).then(result=>{settled=true;return result;});
    await delay(1300);
    assert.equal(settled,false,'publication should wait for the real Windows lock beyond the former 620ms retry window');
    assert.deepEqual(JSON.parse(await readFile(revisionFile,'utf8')),original,'the previous complete revision stays available while replacement is blocked');
    child.stdin.end('release\n');
    const result=await prepared;if(!result.ok)throw result.error;
    await exited;
    assert.notEqual(JSON.parse(await readFile(revisionFile,'utf8')).revision,original.revision);
  }finally{
    if(!child.stdin.destroyed)child.stdin.end('release\n');
    if(child.exitCode===null)child.kill();
    await exited;await prepared;
  }
}
test('concurrent display preparation publishes complete revision JSON across store instances without losing renditions',{timeout:30000},async()=>{
  const base=path.resolve('data/test-fixtures');await mkdir(base,{recursive:true});
  const directory=await mkdtemp(path.join(base,'display-revision-')),store=new Store(directory),media=new LocalFileStorage(directory);
  const displayA=new DisplayMediaStore(store,media),displayB=new DisplayMediaStore(store,media),createdAt=new Date().toISOString();
  store.upsertProject({id:'p',name:'Concurrent previews',description:'',createdAt,updatedAt:createdAt});
  try{
    const assets:Asset[]=[];
    for(let index=0;index<15;index++){
      const bytes=await sharp({create:{width:96,height:64,channels:4,background:{r:index*16,g:40,b:220-index*12,alpha:1}}}).png().toBuffer();
      const asset=await media.put({projectId:'p',name:'Frame '+index+'.png',mimeType:'image/png',kind:'image',provenance:'imported',bytes});store.upsertAsset(asset);assets.push(asset);
    }
    await displayA.prepare(assets[0]);
    const initial=JSON.parse(await readFile(displayA.revisionFile,'utf8'));assert.equal(initial.version,DISPLAY_VERSION);
    await verifyWindowsLockedRevision(displayA.revisionFile,()=>displayB.prepare(assets[0],{hero:true}));
    let finished=false,observations=0;
    const jobs=assets.slice(1,13).map((asset,index)=>(index%2?displayA:displayB).prepare(asset));
    jobs.push(...assets.slice(13).map(async(asset,index)=>{await (index%2?displayA:displayB).recordFailure(asset,new Error('Fixture decode failure'));return displayA.describe(asset);}));
    const work=Promise.allSettled(jobs).finally(()=>{finished=true;});
    const readDuringPublication=(async()=>{
      do{
        // Use the same short-lived revision snapshot as both public Explore readers.
        const revision=JSON.parse(displayA.readRevision());
        assert.equal(revision.version,DISPLAY_VERSION);
        assert.match(revision.revision,/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/);
        observations++;await delay(1);
      }while(!finished);
    })();
    const [completed,observed]=await Promise.allSettled([work,readDuringPublication]);
    if(completed.status==='rejected')throw completed.reason;if(observed.status==='rejected')throw observed.reason;
    const outcomes=completed.value;
    for(const result of outcomes)assert.equal(result.status,'fulfilled',result.status==='rejected'?String(result.reason):'');
    assert.ok(observations>1,'revision was read while concurrent work was in progress');
    const final=JSON.parse(await readFile(displayB.revisionFile,'utf8'));assert.notEqual(final.revision,initial.revision);
    for(const asset of assets.slice(0,13)){
      const presentation=await displayB.describe(asset);assert.equal(presentation.state,'ready');
      const poster=presentation.poster!;assert.equal(poster.sourceSha256,asset.sha256);
      const file=poster.url.split('/').at(-1)!;const rendition=await readFile(await displayA.file(asset,DISPLAY_VERSION,file));
      assert.equal((await sharp(rendition).metadata()).width,96);
      assert.equal(store.getAsset(asset.id)?.sha256,asset.sha256);
    }
    for(const asset of assets.slice(13))assert.equal((await displayB.describe(asset)).state,'failed');
    const files=await readdir(path.dirname(displayA.revisionFile));
    assert.deepEqual(files.filter(file=>file.startsWith('display-revision.json')),['display-revision.json']);
    assert.equal(store.listAssets('p').length,15);
  }finally{store.close();assert.equal(path.dirname(directory),base);await rm(directory,{recursive:true,force:true});}
});
