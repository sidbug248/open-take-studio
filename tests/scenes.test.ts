import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { randomUUID } from 'node:crypto';
import express from 'express';
import sharp from 'sharp';
import { createStore } from '../server/store.ts';
import { LocalFileStorage } from '../server/media.ts';
import { createSceneRouter, planScene, recipePreflight } from '../server/scene-routes.ts';
import { composeStoryPage } from '../server/story-render.ts';
import { exportProject, importProject } from '../server/project-routes.ts';
import type { Take, Project } from '../shared/types.ts';

async function fixture(){const base=path.resolve('data/test-fixtures');await mkdir(base,{recursive:true});const directory=await mkdtemp(path.join(base,'ots-scenes-')),store=createStore(directory),media=new LocalFileStorage(directory),now=new Date().toISOString(),project:Project={id:randomUUID(),name:'Scene test',description:'',createdAt:now,updatedAt:now};store.upsertProject(project);const assets=[];for(const color of ['red','blue','green']){const a=await media.put({projectId:project.id,name:color+'.png',bytes:await sharp({create:{width:256,height:256,channels:3,background:color}}).png().toBuffer(),mimeType:'image/png',provenance:'imported'});store.upsertAsset(a);assets.push(a);}const [a,b,c]=assets;
const scene={id:'scene-test',name:'Subject',currentRevisionId:'rev-old',createdAt:now,revisions:[{id:'rev-old',createdAt:now,direction:'Original',inputs:{subject:a.id}}]};store.upsertProject({...project,scenes:[scene]});
const make=(id:string,kind:Take['kind'],modelId:string,inputs:Take['inputAssetIds'],output:string[],settings:Take['settings']={}):Take=>({id,projectId:project.id,name:id,kind,modelId,provider:'test',prompt:'A scene',settings,inputAssetIds:inputs,assetIds:output,status:'COMPLETED',provenance:'generated',favorite:false,createdAt:now,updatedAt:now,changes:[],sceneBinding:{sceneId:scene.id,revisionId:'rev-old',useDirection:false}});
const image=make('image','image','bfl/flux-3-image',{images:[a.id]},[b.id],{aspect_ratio:'1:1',resolution:'1k'}),video=make('video','video','minimax/minimax-h3',{first_frame:a.id},[],{duration:4,resolution:'768P'}),page=make('page','image','local/storyboard-page',{panel_images:[a.id]},[],{operation:'storyboard-page',title:'The subject',columns:1,pageAspect:'square',panels:[{assetId:a.id,caption:'Original caption'}]});for(const t of [image,video,page])store.upsertTake(t);
return {store,media,project,scene,a,b,c,image,video,page,cleanup:async()=>{store.close();assert.equal(path.dirname(path.resolve(directory)),base);await rm(directory,{recursive:true,force:true});}};}

test('shared input impact follows real references across image, video and story; unchanged sources reuse and fresh is explicit',async()=>{const f=await fixture();try{const unchanged=planScene(f.store,f.project.id,f.scene.id,{baseRevisionId:'rev-old',direction:'Original',inputs:{subject:f.a.id}});assert.ok(unchanged.outputs.every(o=>o.action==='reuse'));const changed=planScene(f.store,f.project.id,f.scene.id,{baseRevisionId:'rev-old',direction:'Original',inputs:{subject:f.c.id}});assert.deepEqual(changed.outputs.map(o=>o.action),['generate','generate','compose']);assert.deepEqual(changed.outputs[0].request?.inputAssetIds,{images:[f.c.id]});assert.equal(changed.outputs[1].request?.inputAssetIds?.first_frame,f.c.id);assert.equal((changed.outputs[2].settings?.panels as any[])[0].assetId,f.c.id);assert.deepEqual(f.store.getTake('image')?.inputAssetIds,{images:[f.a.id]});const fresh=planScene(f.store,f.project.id,f.scene.id,{baseRevisionId:'rev-old',direction:'Original',inputs:{subject:f.a.id},freshTakeIds:['video']});assert.equal(fresh.outputs.find(o=>o.takeId==='video')?.action,'generate');assert.deepEqual(fresh.outputs.find(o=>o.takeId==='video')?.reusedAssetIds,[f.a.id]);}finally{await f.cleanup();}});

test('downstream output is blocked until a newly generated source is selected; unknown controls cannot run',async()=>{const f=await fixture();try{f.store.upsertTake({...f.video,inputAssetIds:{first_frame:f.b.id}});const plan=planScene(f.store,f.project.id,f.scene.id,{baseRevisionId:'rev-old',inputs:{subject:f.c.id},direction:'Original'});assert.equal(plan.outputs.find(o=>o.takeId==='video')?.action,'blocked');assert.deepEqual(plan.outputs.find(o=>o.takeId==='video')?.dependencies,['image']);const invalid=planScene(f.store,f.project.id,f.scene.id,{baseRevisionId:'rev-old',inputs:{subject:f.a.id},direction:'Original',settingsByTake:{image:{steps:99}}});assert.equal(invalid.outputs.find(o=>o.takeId==='image')?.action,'blocked');}finally{await f.cleanup();}});

test('story selective update creates real PNG once, preserves old page, packages and reopens scene lineage',async()=>{const f=await fixture();try{const plan=planScene(f.store,f.project.id,f.scene.id,{baseRevisionId:'rev-old',direction:'Original',inputs:{subject:f.c.id}});const p=f.store.getProject(f.project.id)!;f.store.upsertProject({...p,scenes:[{...f.scene,currentRevisionId:plan.revision.id,revisions:[...f.scene.revisions,plan.revision]}]});const out=plan.outputs.find(o=>o.takeId==='page')!;const binding={sceneId:f.scene.id,revisionId:plan.revision.id,useDirection:false};const take=await composeStoryPage(f.store,f.media,f.page,out.settings!,out.inputAssetIds!,binding,'same-intent');const again=await composeStoryPage(f.store,f.media,f.page,out.settings!,out.inputAssetIds!,binding,'same-intent');assert.equal(again.id,take.id);assert.equal(take.parentTakeId,'page');const media=f.store.getAsset(take.assetIds[0])!;assert.equal((await sharp(await f.media.read(media)).metadata()).width,1600);assert.deepEqual(f.store.getTake('page')?.inputAssetIds,{panel_images:[f.a.id]});const zip=await exportProject(f.store,f.media,f.project.id);const imported=await importProject(f.store,f.media,zip);const reopened=f.store.projectDetail(imported.id)!;const revised=reopened.takes.find(t=>t.name===take.name)!;assert.notEqual(revised.sceneBinding?.sceneId,f.scene.id);assert.ok(reopened.project.scenes?.some(s=>s.id===revised.sceneBinding?.sceneId&&s.revisions.some(r=>r.id===revised.sceneBinding?.revisionId)));}finally{await f.cleanup();}});

test('recipe preflight validates replacements and PATCH preserves specific reproduction limits', async () => {
  const f = await httpFixture();
  try {
    const recipe = { id: 'recipe', projectId: f.project.id, name: 'Subject motion', modelId: 'minimax/minimax-h3', prompt: 'Turn toward the light', settings: { duration: 4, resolution: '768P' }, inputAssetIds: { first_frame: f.a.id }, createdAt: new Date().toISOString(), slots: [{ key: 'subject', label: 'Your subject', inputKey: 'first_frame', kind: 'image' as const, required: true, defaultAssetId: f.a.id }], reproductionLimits: ['This recipe needs the supplied opening frame; recasting may change the character.'] };
    const result = recipePreflight(f.store, recipe, { subject: f.c.id });
    assert.equal(result.ready, true);
    assert.equal(result.request.inputAssetIds?.first_frame, f.c.id);
    assert.deepEqual(result.changedInputs, ['first_frame']);
    assert.ok(result.limitations.some(s => s.includes('identical')));
    assert.equal(recipePreflight(f.store, recipe, { subject: 'missing' }).ready, false);
    f.store.upsertRecipe(recipe);
    for (const patch of [{ name: 'Renamed motion' }, { slots: [{ ...recipe.slots[0], label: 'Opening frame' }] }]) {
      const response = await f.patchRecipe(recipe.id, patch);
      assert.equal(response.status, 200);
      assert.deepEqual((await response.json()).reproductionLimits, recipe.reproductionLimits);
      assert.deepEqual(f.store.getRecipe(recipe.id)?.reproductionLimits, recipe.reproductionLimits);
    }
    const { reproductionLimits, ...legacy } = recipe;
    f.store.upsertRecipe({ ...legacy, id: 'legacy-recipe' });
    const legacyResponse = await f.patchRecipe('legacy-recipe', { name: 'Legacy renamed' });
    assert.equal(legacyResponse.status, 200);
    assert.ok((await legacyResponse.json()).reproductionLimits.length > 0, 'recipes without saved limits receive the default limits');
  } finally { await f.cleanup(); }
});

async function httpFixture() {
  const f = await fixture();
  const app = express(); app.use(express.json()); app.use('/api', createSceneRouter(f.store, f.media));
  const server = await new Promise<ReturnType<typeof app.listen>>(resolve => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
  });
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/projects/${f.project.id}/scenes/${f.scene.id}`;
  return { ...f, patchRecipe: (id: string, body: unknown) => fetch(new URL(`/api/recipes/${encodeURIComponent(id)}`, url), { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }), request: (action: string, body: unknown) => fetch(`${url}/${action}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }), cleanup: async () => {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    await f.cleanup();
  } };
}

test('explicit story facts invalidate only bound outputs and preserve earlier scene facts', async()=>{
 const f=await fixture();try{
 const scene={...f.scene,revisions:f.scene.revisions.map(r=>({...r,facts:{event:'The beacon fails',time:'Night'}}))};f.store.upsertProject({...f.store.getProject(f.project.id)!,scenes:[scene]});
 f.store.upsertTake({...f.image,sceneBinding:{...f.image.sceneBinding!,factKeys:['event']}});
 f.store.upsertTake({...f.page,sceneBinding:{...f.page.sceneBinding!,factKeys:['event','time']}});
 const plan=planScene(f.store,f.project.id,scene.id,{baseRevisionId:'rev-old',direction:'Original',inputs:{subject:f.a.id},facts:{event:'A vessel answers',time:'Night'}});
 const image=plan.outputs.find(o=>o.takeId==='image')!,video=plan.outputs.find(o=>o.takeId==='video')!,page=plan.outputs.find(o=>o.takeId==='page')!;
 assert.equal(image.action,'generate');assert.ok(image.changedFields.includes('facts.event'));assert.match(image.request!.prompt,/event: A vessel answers/);assert.deepEqual(image.reusedAssetIds,[f.a.id]);
 assert.equal(video.action,'reuse');assert.equal(page.action,'compose');assert.equal((page.settings!.panels as any[])[0].caption,'A vessel answers · Night');
 assert.equal(f.store.getProject(f.project.id)!.scenes![0].revisions[0].facts!.event,'The beacon fails');
 }finally{await f.cleanup();}
});

test('restoring facts appends a revision without generation and replays safely',async()=>{
 const f=await httpFixture();try{
 const old={...f.scene.revisions[0],facts:{event:'The beacon fails'}},next={...old,id:'rev-next',facts:{event:'A vessel answers'}};
 f.store.upsertProject({...f.store.getProject(f.project.id)!,scenes:[{...f.scene,currentRevisionId:next.id,revisions:[old,next]}]});
 const body={revisionId:old.id,clientRequestId:'restore-event-test'};const response=await f.request('restore',body);assert.equal(response.status,200);const first=await response.json();const again=await f.request('restore',body);assert.deepEqual(await again.json(),first);
 const scene=f.store.getProject(f.project.id)!.scenes![0];assert.equal(scene.revisions.length,3);assert.equal(scene.revisions.at(-1)!.facts!.event,'The beacon fails');assert.equal(f.store.listJobs(f.project.id).length,0);assert.equal(f.store.listTakes(f.project.id).length,3);
 }finally{await f.cleanup();}
});

test('visual recipe binds the complete prompt and replacement reference without stale Mara identity',async()=>{
 const f=await fixture();try{
 const recipe={id:'recipe-visual',projectId:f.project.id,name:'Follow the signal',modelId:'minimax/minimax-h3',prompt:'Mara in a yellow raincoat',promptTemplate:'{{subject}} in {{environment}}. Motion: {{motion}}',ingredients:[{key:'subject',label:'Subject',defaultValue:'the subject in the reference'},{key:'environment',label:'World',defaultValue:'a stormy coast'},{key:'motion',label:'Action',defaultValue:'turn toward the light'}],settings:{duration:4,resolution:'768P'},inputAssetIds:{first_frame:f.a.id},slots:[{key:'subject',label:'Subject',inputKey:'first_frame',kind:'image' as const,required:true,defaultAssetId:f.a.id}],createdAt:new Date().toISOString()};
 const preflight=recipePreflight(f.store,recipe,{subject:f.c.id},{environment:'a sunlit greenhouse',motion:'reach for a glass flower'});
 assert.equal(preflight.ready,true);assert.equal(preflight.request.inputAssetIds!.first_frame,f.c.id);assert.match(preflight.request.prompt,/sunlit greenhouse/);assert.match(preflight.request.prompt,/reach for a glass flower/);assert.doesNotMatch(preflight.request.prompt,/Mara|yellow raincoat/);
 const {promptTemplate,ingredients,...legacy}=recipe;assert.equal(recipePreflight(f.store,legacy,{subject:f.c.id}).ready,false);
 }finally{await f.cleanup();}
});

test('removing a named input blocks every dependent output and preserves existing assets and revision', async () => {
  const f = await fixture();
  try {
    const plan = planScene(f.store, f.project.id, f.scene.id, { baseRevisionId: 'rev-old', direction: 'Original', inputs: {} });
    assert.equal(plan.changed, true);
    assert.equal(plan.outputs.length, 3);
    for (const output of plan.outputs) {
      assert.equal(output.action, 'blocked');
      assert.ok(output.changedFields.includes('removed:subject'));
      assert.equal(output.request, undefined);
      assert.match(output.reason, /Removed input subject/);
    }
    assert.equal(f.store.getProject(f.project.id)?.scenes?.[0].currentRevisionId, 'rev-old');
    assert.deepEqual(f.store.getTake('image')?.inputAssetIds, { images: [f.a.id] });
    assert.equal(f.store.listJobs(f.project.id).length, 0);
  } finally { await f.cleanup(); }
});

test('an affected upstream output blocks the entire dependency chain even when takes are not topologically ordered', async () => {
  const f = await fixture();
  try {
    const replacement = await f.media.put({ projectId: f.project.id, name: 'replacement.png', bytes: await sharp({ create: { width: 256, height: 256, channels: 3, background: 'yellow' } }).png().toBuffer(), mimeType: 'image/png', provenance: 'imported' });
    f.store.upsertAsset(replacement);
    f.store.upsertTake({ ...f.image, createdAt: '2026-01-03T00:00:00Z' });
    f.store.upsertTake({ ...f.video, createdAt: '2026-01-01T00:00:00Z', kind: 'image', modelId: 'bfl/flux-3-image', settings: f.image.settings, inputAssetIds: { images: [f.b.id] }, assetIds: [f.c.id] });
    f.store.upsertTake({ ...f.page, createdAt: '2026-01-02T00:00:00Z', inputAssetIds: { panel_images: [f.c.id] }, settings: { ...f.page.settings, panels: [{ assetId: f.c.id, caption: 'Downstream' }] } });
    const plan = planScene(f.store, f.project.id, f.scene.id, { baseRevisionId: 'rev-old', direction: 'Original', inputs: { subject: replacement.id } });
    const byId = new Map(plan.outputs.map(output => [output.takeId, output]));
    assert.equal(byId.get('image')?.action, 'generate');
    assert.equal(byId.get('video')?.action, 'blocked');
    assert.deepEqual(byId.get('video')?.dependencies, ['image']);
    assert.equal(byId.get('page')?.action, 'blocked');
    assert.deepEqual(byId.get('page')?.dependencies, ['video']);
    assert.equal(byId.get('page')?.request, undefined);
    assert.equal(f.store.listTakes(f.project.id).length, 3);
    assert.equal(f.store.listJobs(f.project.id).length, 0);
  } finally { await f.cleanup(); }
});

test('HTTP scene apply replay returns the same local page and generation identities without creating a job', async () => {
  const f = await httpFixture();
  try {
    const body = { baseRevisionId: 'rev-old', direction: 'Original', inputs: { subject: f.c.id }, selectedTakeIds: ['image', 'page'], clientRequestId: 'scene-replay-identity' };
    const first = await f.request('apply', body); assert.equal(first.status, 200); const initial = await first.json();
    const second = await f.request('apply', body); assert.equal(second.status, 200); const replay = await second.json();
    assert.equal(replay.composedTakes[0].id, initial.composedTakes[0].id);
    assert.deepEqual(replay.requests, initial.requests);
    assert.equal(f.store.listTakes(f.project.id).filter(take => take.parentTakeId === 'page').length, 1);
    assert.equal(f.store.getProject(f.project.id)?.scenes?.[0].revisions.length, 2);
    assert.equal(f.store.listJobs(f.project.id).length, 0, 'apply prepares requests; it must not dispatch generation');
  } finally { await f.cleanup(); }
});

test('HTTP scene apply refuses a reused identity with changed content before changing revision or outputs', async () => {
  const f = await httpFixture();
  try {
    const body = { baseRevisionId: 'rev-old', direction: 'Original', inputs: { subject: f.c.id }, selectedTakeIds: ['page'], clientRequestId: 'scene-conflict-identity' };
    const first = await f.request('apply', body); assert.equal(first.status, 200); const initial = await first.json();
    const before = structuredClone(f.store.getProject(f.project.id));
    const changed = await f.request('apply', { ...body, baseRevisionId: initial.scene.currentRevisionId, settingsByTake: { page: { ...f.page.settings, title: 'Different intended page' } } });
    assert.equal(changed.status, 409);
    assert.deepEqual(f.store.getProject(f.project.id), before);
    assert.equal(f.store.listTakes(f.project.id).filter(take => take.parentTakeId === 'page').length, 1);
  } finally { await f.cleanup(); }
});

test('concurrent identical HTTP scene applies create one local page and return one identity', async () => {
  const f = await httpFixture();
  try {
    const body = { baseRevisionId: 'rev-old', direction: 'Original', inputs: { subject: f.c.id }, selectedTakeIds: ['page'], clientRequestId: 'scene-concurrent-identity' };
    const responses = await Promise.all([f.request('apply', body), f.request('apply', body)]);
    assert.deepEqual(responses.map(response => response.status), [200, 200]);
    const results = await Promise.all(responses.map(response => response.json()));
    assert.equal(results[0].composedTakes[0].id, results[1].composedTakes[0].id);
    assert.equal(f.store.listTakes(f.project.id).filter(take => take.parentTakeId === 'page').length, 1);
  } finally { await f.cleanup(); }
});

test('failed local composition leaves scene revision and saved outputs unchanged', async () => {
  const f = await httpFixture();
  try {
    const before = structuredClone(f.store.getProject(f.project.id));
    const read = f.media.read.bind(f.media);
    f.media.read = async asset => { if (asset.id === f.c.id) throw new Error('Fixture media read failure'); return read(asset); };
    const result = await f.request('apply', { baseRevisionId: 'rev-old', direction: 'Original', inputs: { subject: f.c.id }, selectedTakeIds: ['page'], clientRequestId: 'scene-failed-render' });
    assert.ok(result.status >= 400);
    assert.deepEqual(f.store.getProject(f.project.id), before);
    assert.equal(f.store.listTakes(f.project.id).length, 3);
    assert.equal(f.store.listAssets(f.project.id).length, 3);
  } finally { await f.cleanup(); }
});

test('stale scene apply and unbound selected outputs are rejected before composition', async () => {
  const f = await httpFixture();
  try {
    const initial = await f.request('apply', { baseRevisionId: 'rev-old', direction: 'Original', inputs: { subject: f.c.id }, selectedTakeIds: ['image'], clientRequestId: 'scene-first-advance' });
    assert.equal(initial.status, 200);
    const before = structuredClone(f.store.getProject(f.project.id));
    const stale = await f.request('apply', { baseRevisionId: 'rev-old', direction: 'Changed elsewhere', inputs: { subject: f.c.id }, selectedTakeIds: ['page'], clientRequestId: 'scene-stale-advance' });
    assert.equal(stale.status, 409);
    const current = before!.scenes![0].currentRevisionId;
    const foreignSelection = await f.request('apply', { baseRevisionId: current, direction: 'Original', inputs: { subject: f.c.id }, selectedTakeIds: ['not-bound'], clientRequestId: 'scene-unknown-output' });
    assert.equal(foreignSelection.status, 400);
    assert.deepEqual(f.store.getProject(f.project.id), before);
    assert.equal(f.store.listTakes(f.project.id).length, 3);
  } finally { await f.cleanup(); }
});

test('scene apply receipt survives a new database connection and router instance', async () => {
  const f = await httpFixture();
  let reopened: ReturnType<typeof createStore> | undefined;
  let server: ReturnType<ReturnType<typeof express>['listen']> | undefined;
  try {
    const body = { baseRevisionId: 'rev-old', direction: 'Original', inputs: { subject: f.c.id }, selectedTakeIds: ['image', 'page'], clientRequestId: 'scene-durable-replay' };
    const first = await f.request('apply', body); assert.equal(first.status, 200); const original = await first.json();
    reopened = createStore(f.store.dataDir);
    const app = express(); app.use(express.json()); app.use('/api', createSceneRouter(reopened, f.media));
    server = await new Promise<ReturnType<typeof app.listen>>(resolve => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)); });
    const response = await fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}/api/projects/${f.project.id}/scenes/${f.scene.id}/apply`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), original);
    assert.equal(reopened.listTakes(f.project.id).filter(take => take.parentTakeId === 'page').length, 1);
  } finally {
    if (server) await new Promise<void>((resolve, reject) => server!.close(error => error ? reject(error) : resolve()));
    reopened?.close(); await f.cleanup();
  }
});

test('story plan rejects cross-project panel settings before any scene revision or render', async () => {
  const f = await httpFixture();
  try {
    const other = { ...f.project, id: randomUUID(), name: 'Other project' }; f.store.upsertProject(other);
    const foreign = await f.media.put({ projectId: other.id, name: 'foreign.png', bytes: await f.media.read(f.c), mimeType: 'image/png', provenance: 'imported' }); f.store.upsertAsset(foreign);
    const body = { baseRevisionId: 'rev-old', direction: 'Original', inputs: { subject: f.a.id }, settingsByTake: { page: { ...f.page.settings, panels: [{ assetId: foreign.id }] } }, selectedTakeIds: ['page'], clientRequestId: 'scene-foreign-panels' };
    const plan = planScene(f.store, f.project.id, f.scene.id, body);
    assert.equal(plan.outputs.find(output => output.takeId === 'page')?.action, 'blocked');
    const response = await f.request('apply', body); assert.equal(response.status, 400);
    assert.equal(f.store.getProject(f.project.id)?.scenes?.[0].currentRevisionId, 'rev-old');
    assert.equal(f.store.listTakes(f.project.id).length, 3);
  } finally { await f.cleanup(); }
});

test('a failure rendering a later selected page commits none of the prepared page records', async () => {
  const f = await httpFixture();
  try {
    f.store.upsertTake({ ...f.page, id: 'page-two', name: 'Second page' });
    const before = structuredClone(f.store.getProject(f.project.id)), read = f.media.read.bind(f.media); let reads = 0;
    f.media.read = async asset => { if (asset.id === f.c.id && ++reads === 2) throw new Error('Second page unavailable'); return read(asset); };
    const response = await f.request('apply', { baseRevisionId: 'rev-old', direction: 'Original', inputs: { subject: f.c.id }, selectedTakeIds: ['page', 'page-two'], clientRequestId: 'scene-batch-atomic' });
    assert.ok(response.status >= 400);
    assert.deepEqual(f.store.getProject(f.project.id), before);
    assert.equal(f.store.listTakes(f.project.id).length, 4);
    assert.equal(f.store.listAssets(f.project.id).length, 3);
  } finally { await f.cleanup(); }
});

for (const change of ['unrelated-project-field', 'selected-output-binding'] as const) {
  test(`scene commit rechecks after rendering: ${change}`, async () => {
    const f = await httpFixture();
    let release!: () => void;
    try {
      let started!: () => void;
      const pause = new Promise<void>(resolve => { release = resolve; });
      const reachedRender = new Promise<void>(resolve => { started = resolve; });
      const read = f.media.read.bind(f.media);
      f.media.read = async asset => { if (asset.id === f.c.id) { started(); await pause; } return read(asset); };
      const pending = f.request('apply', { baseRevisionId: 'rev-old', direction: 'Original', inputs: { subject: f.c.id }, selectedTakeIds: ['page'], clientRequestId: `scene-concurrent-${change}` });
      await reachedRender;
      if (change === 'unrelated-project-field') f.store.upsertProject({ ...f.store.getProject(f.project.id)!, description: 'Edited while the page rendered' });
      else f.store.upsertTake({ ...f.page, sceneBinding: undefined });
      release();
      const response = await pending;
      if (change === 'unrelated-project-field') {
        assert.equal(response.status, 200);
        assert.equal(f.store.getProject(f.project.id)?.description, 'Edited while the page rendered');
        assert.equal(f.store.listTakes(f.project.id).length, 4);
      } else {
        assert.equal(response.status, 409);
        assert.equal(f.store.getProject(f.project.id)?.scenes?.[0].currentRevisionId, 'rev-old');
        assert.equal(f.store.getTake('page')?.sceneBinding, undefined);
        assert.equal(f.store.listTakes(f.project.id).length, 3);
        assert.equal(f.store.listAssets(f.project.id).length, 3);
      }
    } finally { release?.(); await f.cleanup(); }
  });
}
