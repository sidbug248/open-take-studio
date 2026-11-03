import test from 'node:test';
import assert from 'node:assert/strict';
import {api,isGenerationRequest,isGenerationConnectionRequiredError,registerGenerationAccessGate} from '../client/api.ts';

test('missing reviewer credentials open the dialog before Router, native and retry requests reach fetch',async()=>{
  const originalFetch=globalThis.fetch;
  const fetched:string[]=[];
  globalThis.fetch=async input=>{fetched.push(String(input));return Response.json({ok:true});};
  let required=0;
  const release=registerGenerationAccessGate({blocked:()=>true,onRequired:()=>{required++;}});
  try{
    const routes=['/api/generate','/api/workflows/saved-version/run','/api/jobs/router-job/retry','/api/workflow-jobs/native-job/retry'];
    for(const route of routes){
      assert.equal(isGenerationRequest(route+'?fixture=1','post'),true);
      await assert.rejects(api(route,{method:'POST',body:'{}'}),error=>isGenerationConnectionRequiredError(error)&&/Connect your Comfy workspace/.test(error.message));
    }
    assert.equal(required,routes.length);
    assert.deepEqual(fetched,[],'Credential dialog must precede every remote admission');
    for(const [route,method]of[['/api/generate','GET'],['/api/projects/source/assets','POST'],['/api/projects/source/motion/render','POST'],['/api/workflows/version/validate','POST'],['/api/projects/source/story-page','POST']]){
      assert.equal(isGenerationRequest(route,method),false);
      assert.deepEqual(await api(route,{method}),{ok:true});
    }
    assert.equal(fetched.length,5,'Local editing, validation and status requests remain usable without a key');
    assert.equal(required,4);
  }finally{release();globalThis.fetch=originalFetch;}
});

test('generation gate cleanup cannot remove a newer gate and connecting never replays an earlier request',async()=>{
  const originalFetch=globalThis.fetch;
  let requests=0,oldDialog=0,newDialog=0,blocked=true;
  globalThis.fetch=async()=>{requests++;return Response.json({ok:true});};
  const releaseOld=registerGenerationAccessGate({blocked:()=>true,onRequired:()=>{oldDialog++;}});
  const releaseCurrent=registerGenerationAccessGate({blocked:()=>blocked,onRequired:()=>{newDialog++;}});
  try{
    releaseOld();
    await assert.rejects(api('/api/generate',{method:'POST'}),/Connect your Comfy workspace/);
    assert.equal(newDialog,1);assert.equal(oldDialog,0);assert.equal(requests,0);
    blocked=false;
    await Promise.resolve();
    assert.equal(requests,0,'A connection-state change alone must not submit or replay generation');
    assert.deepEqual(await api('/api/generate',{method:'POST'}),{ok:true});
    assert.equal(requests,1,'Only a new explicit request may reach the provider admission API');
    releaseCurrent();
    assert.deepEqual(await api('/api/generate',{method:'POST'}),{ok:true});
    assert.equal(requests,2,'Owner access is not left behind a stale reviewer gate');
  }finally{releaseOld();releaseCurrent();globalThis.fetch=originalFetch;}
});

test('a server credential failure opens the dialog once and never automatically retries',async()=>{
  const originalFetch=globalThis.fetch;
  let requests=0;const messages:(string|undefined)[]=[];
  globalThis.fetch=async()=>{requests++;return Response.json({code:'insufficient_credits',error:'This Comfy workspace has no available credits.'},{status:402});};
  const release=registerGenerationAccessGate({blocked:()=>false,onRequired:message=>messages.push(message)});
  try{
    await assert.rejects(api('/api/workflows/version/run',{method:'POST'}),error=>isGenerationConnectionRequiredError(error)&&/no available credits/.test(error.message));
    await Promise.resolve();
    assert.equal(requests,1);assert.deepEqual(messages,['This Comfy workspace has no available credits.']);
  }finally{release();globalThis.fetch=originalFetch;}
});

test('ordinary validation failures remain ordinary errors without opening the connection dialog',async()=>{
  const originalFetch=globalThis.fetch;
  let requests=0,dialogs=0;
  globalThis.fetch=async()=>{requests++;return Response.json({error:'The reference image is too small.'},{status:400});};
  const release=registerGenerationAccessGate({blocked:()=>false,onRequired:()=>{dialogs++;}});
  try{
    await assert.rejects(api('/api/generate',{method:'POST'}),error=>error instanceof Error&&!isGenerationConnectionRequiredError(error)&&error.message==='The reference image is too small.');
    assert.equal(requests,1);assert.equal(dialogs,0);
  }finally{release();globalThis.fetch=originalFetch;}
});
