import test from 'node:test';
import assert from 'node:assert/strict';
import {createWorkspaceStorage,createWorkspacePromoter,requestReviewerSession,ReviewerSessionUnavailableError} from '../client/reviewer-session.ts';
import type {StudioStatus} from '../client/ReviewerConnect';

const visitor:StudioStatus={mode:'hosted',version:'test',accessMode:'visitor',keyConfigured:false};
const reviewer:StudioStatus={...visitor,accessMode:'reviewer',workspaceId:'private-review',credential:{state:'missing'}};
function memoryStore(){const values=new Map<string,string>();return{values,getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>{values.set(key,value);},removeItem:(key:string)=>{values.delete(key);}};}

test('anonymous state never reads or writes owner/reviewer browser state, then promotes its live draft in place',()=>{
  const persistent=memoryStore();persistent.setItem('ots:project','owner-project');persistent.setItem('reviewer:old:ots:project','old-review');
  const storage=createWorkspaceStorage(visitor,persistent);
  assert.equal(storage.getItem('ots:project'),null);
  storage.setItem('ots:landing','explore');storage.setItem('opening-prompt','A violet glass garden');
  assert.equal(persistent.values.size,2,'Browsing does not allocate a persistent visitor namespace');
  storage.promote(reviewer);
  assert.equal(storage.getItem('opening-prompt'),'A violet glass garden');
  assert.equal(persistent.getItem('reviewer:private-review:opening-prompt'),'A violet glass garden');
  assert.equal(persistent.getItem('ots:project'),'owner-project');
  storage.setItem('ots:project','new-project');
  assert.equal(persistent.getItem('reviewer:private-review:ots:project'),'new-project');
});

test('workspace allocation is lazy and concurrent explicit intents share one promotion without replaying creative actions',async()=>{
  let status=visitor,requests=0,accepted=0;
  let resolve!:(status:StudioStatus)=>void;
  const ensure=createWorkspacePromoter(()=>status,next=>{status=next;accepted++;},()=>{requests++;return new Promise<StudioStatus>(done=>{resolve=done;});});
  assert.equal(requests,0);
  const first=ensure(),second=ensure();assert.equal(first,second);assert.equal(requests,1);
  resolve(reviewer);assert.equal(await first,reviewer);assert.equal(await second,reviewer);assert.equal(accepted,1);
  await ensure();assert.equal(requests,1,'An active workspace is reused without another session POST');
});

test('capacity leaves the visitor and its prompt/file references intact until an explicit retry succeeds',async()=>{
  let status=visitor,requests=0;
  const draft={prompt:'Still here',files:[new File(['pixels'],'reference.png',{type:'image/png'})],outcome:'film'};
  const file=draft.files[0];
  const ensure=createWorkspacePromoter(()=>status,next=>{status=next;},async()=>{requests++;if(requests===1)throw new ReviewerSessionUnavailableError('capacity',30);return reviewer;});
  await assert.rejects(ensure(),error=>error instanceof ReviewerSessionUnavailableError&&error.reason==='capacity'&&error.retryAfterSeconds===30);
  assert.equal(status,visitor);assert.equal(requests,1);assert.equal(draft.prompt,'Still here');assert.equal(draft.files[0],file);
  await Promise.resolve();assert.equal(requests,1,'Capacity never schedules an automatic allocation or creative retry');
  await ensure();assert.equal(status,reviewer);assert.equal(requests,2);assert.equal(draft.files[0],file);
});

test('session HTTP errors expose a safe retry message, preserve retry-after, and never issue generation',async()=>{
  const originalFetch=globalThis.fetch;const requests:string[]=[];
  globalThis.fetch=async(input,options)=>{requests.push(String(input));assert.equal(options?.method,'POST');return Response.json({code:'reviewer_capacity',error:'internal storage path must not reach UI',retryAfterSeconds:45},{status:429});};
  try{await assert.rejects(requestReviewerSession(),error=>error instanceof ReviewerSessionUnavailableError&&error.retryAfterSeconds===45&&!error.message.includes('internal storage'));assert.deepEqual(requests,['/api/reviewer/session']);}finally{globalThis.fetch=originalFetch;}
});

test('owner and already active reviewer state never request a visitor session',async()=>{
  let requests=0;
  for(const status of[{...visitor,accessMode:'owner' as const},reviewer]){
    const ensure=createWorkspacePromoter(()=>status,()=>{throw new Error('No promotion expected');},async()=>{requests++;return reviewer;});
    assert.equal(await ensure(),status);
  }
  assert.equal(requests,0);
});
