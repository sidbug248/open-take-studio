/** Hosted BYOK boundary check. Never submits a funded generation or reads the owner's API key. */
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import AdmZip from 'adm-zip';
import {parse} from 'dotenv';
import sharp from 'sharp';
import type {Asset,Project,ProjectDetail,Take} from '../shared/types.ts';

const base=new URL(process.env.OTS_REVIEWER_VERIFY_ORIGIN||'https://open-take-studio.onrender.com').origin;
if(!base.startsWith('https://')&&!/^http:\/\/127\.0\.0\.1:\d+$/.test(base))throw new Error('Verification requires HTTPS or explicit loopback.');
const resumeIndex=process.argv.indexOf('--resume'),resume=resumeIndex<0?undefined:process.argv[resumeIndex+1];
if(process.argv.includes('--generate'))throw new Error('This script deliberately has no generation mode.');
const directory=path.resolve(resume||`artifacts/deployment-reviewers/run-${Date.now()}`),receiptPath=path.join(directory,'receipt.json');
const privateDirectory=path.resolve('data/reviewer-verification',path.basename(directory)),privatePath=path.join(privateDirectory,'sessions.json');
await mkdir(directory,{recursive:true});await mkdir(privateDirectory,{recursive:true,mode:0o700});
type Reviewer={label:string;cookie:string;projectId?:string;assetId?:string;takeId?:string;sha256?:string};
const invalidKey='ots-invalid-reviewer-verification-key-no-real-credential';
let probeKey='';
// A decoded/renderable PNG, not merely a magic-byte upload fixture. Resuming a
// prior run checks its recorded SHA and leaves that run's original bytes alone.
const png=await sharp({create:{width:96,height:64,channels:3,background:'#c5a3ff'}}).png().toBuffer();
const sha=(bytes:Buffer)=>createHash('sha256').update(bytes).digest('hex');
let reviewers:Reviewer[]=resume?JSON.parse(await readFile(privatePath,'utf8')):[];
let receipt:any=resume?JSON.parse(await readFile(receiptPath,'utf8')):{startedAt:new Date().toISOString(),origin:base,scope:'Two isolated reviewer workspaces; invalid-key verification; missing-key admission rejection; imported fixture save, download, export and reopen. No funded generation.',events:[]};
const secrets=()=>[invalidKey,probeKey,...reviewers.flatMap(r=>[r.cookie,r.cookie.slice(r.cookie.indexOf('=')+1)])].filter(Boolean);
const clean=(value:unknown)=>{let text=String(value);for(const secret of secrets())text=text.split(secret).join('[redacted]');return text.slice(0,2000);};
async function save(){await writeFile(privatePath,JSON.stringify(reviewers,null,2),{mode:0o600});await writeFile(receiptPath,JSON.stringify(receipt,null,2));}
async function note(event:string,value:Record<string,unknown>={}){receipt.events.push({at:new Date().toISOString(),event,...value});await save();console.log(JSON.stringify({event,...value}));}
async function request(reviewer:Reviewer|undefined,route:string,options:RequestInit={}){const headers=new Headers(options.headers);headers.set('Origin',base);if(reviewer)headers.set('Cookie',reviewer.cookie);return fetch(base+route,{...options,headers,redirect:'manual',signal:AbortSignal.timeout(120000)});}
async function json<T>(reviewer:Reviewer|undefined,route:string,method='GET',body?:unknown){const response=await request(reviewer,route,{method,...(body===undefined?{}:{headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})});if(!response.ok)throw new Error(`${method} ${route}: HTTP ${response.status}: ${clean(await response.text())}`);return response.json() as Promise<T>;}
function check(value:unknown,message:string):asserts value{if(!value)throw new Error(message);}
async function denial(reviewer:Reviewer|undefined,route:string){const response=await request(reviewer,route);check([401,403,404].includes(response.status),`Private route leaked: ${route} HTTP ${response.status}`);await response.body?.cancel();}
try{
  const health=await fetch(base+'/api/health',{signal:AbortSignal.timeout(20000)});check(health.ok,'Hosted health is unavailable');
  if(!resume){
    for(const label of['A','B']){const response=await request(undefined,'/auth/reviewer',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});check([200,303].includes(response.status),'Reviewer entry failed');const raw=response.headers.getSetCookie().find(value=>value.startsWith('__Host-ots_reviewer='));check(raw,'Reviewer cookie was not issued');check(/HttpOnly/.test(raw)&&/Secure/.test(raw)&&/SameSite=Lax/.test(raw),'Reviewer cookie flags are missing');reviewers.push({label,cookie:raw.split(';')[0]});await save();}
    check(reviewers[0].cookie!==reviewers[1].cookie,'Reviewers shared a session token');
    await note('two-independent-reviewer-sessions-created');
    const invalid=await request(reviewers[0],'/api/reviewer/connect',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({apiKey:invalidKey})});check(invalid.status===400,'Invalid Comfy key was not rejected');const invalidText=await invalid.text();check(!invalidText.includes(invalidKey),'Invalid-key response leaked the entered value');await note('invalid-key-rejected-without-generation',{status:invalid.status});
    for(const reviewer of reviewers){
      const project=await json<Project>(reviewer,'/api/projects','POST',{name:`Reviewer isolation ${reviewer.label} · imported fixture`,description:'Hosted verification fixture. A tiny original PNG is imported for save/export testing; no AI generation occurred.'});reviewer.projectId=project.id;await save();
      const rejected=await request(reviewer,'/api/generate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({projectId:project.id,clientRequestId:`missing-key-${reviewer.label}-${Date.now()}`,modelId:'bfl/flux-3-image',prompt:'This request must be rejected before admission because no key is connected.',settings:{},inputAssetIds:{}})});check([400,401,409].includes(rejected.status),'A missing-key reviewer admitted generation');await rejected.body?.cancel();
      const form=new FormData();form.set('file',new Blob([png],{type:'image/png'}),'reviewer-owned-fixture.png');form.set('name',`Reviewer ${reviewer.label} private fixture`);form.set('provenance','imported');const upload=await request(reviewer,`/api/projects/${project.id}/assets`,{method:'POST',body:form});check(upload.ok,`Fixture upload failed HTTP ${upload.status}`);const asset=await upload.json() as Asset;check(asset.sha256===sha(png),'Fixture bytes changed');reviewer.assetId=asset.id;reviewer.sha256=asset.sha256;await save();
      const take=await json<Take>(reviewer,`/api/projects/${project.id}/takes/import`,'POST',{assetId:asset.id,name:`Saved fixture ${reviewer.label}`});reviewer.takeId=take.id;await json(reviewer,`/api/takes/${take.id}`,'PATCH',{favorite:true});await json(reviewer,`/api/projects/${project.id}`,'PATCH',{selectedTakeId:take.id,coverAssetId:asset.id});await save();
    }
  }
  check(reviewers.length===2&&reviewers.every(r=>r.projectId&&r.assetId&&r.takeId),'Two complete saved reviewer fixtures are required');
  for(const reviewer of reviewers){
    const peer=reviewers.find(value=>value!==reviewer)!;
    const allowedPublic=new Set(['showcase:456f5fdb-e79b-4946-9122-dc17e7a291e3','showcase:1bec0508-6565-4cf8-9666-f07d224351a1','showcase:1659408b-f807-418b-8a67-3c2404e0d12e']),scoped=(projects:Array<{id:string}>)=>projects.some(p=>p.id===reviewer.projectId)&&projects.every(p=>p.id===reviewer.projectId||allowedPublic.has(p.id));
    const bootstrap=await json<{projects:Array<{id:string}>}>(reviewer,'/api/explore/bootstrap');check(scoped(bootstrap.projects),'Explore API crossed reviewer storage boundaries');
    const page=await request(reviewer,'/'),html=await page.text(),embedded=/<script type="application\/json" id="ots-explore-bootstrap">([\s\S]*?)<\/script>/.exec(html);check(page.ok&&embedded,'Reviewer HTML bootstrap is missing');const injected=JSON.parse(embedded[1]) as {projects:Array<{id:string}>};check(scoped(injected.projects),'HTML bootstrap exposed another workspace');
    const detail=await json<ProjectDetail>(reviewer,`/api/projects/${reviewer.projectId}`);check(detail.project.selectedTakeId===reviewer.takeId,'Saved take selection was lost');check(detail.takes.find(t=>t.id===reviewer.takeId)?.favorite,'Favorite edit was lost');check(detail.jobs.length===0,'Missing-key attempt unexpectedly created an executable job');
    const asset=detail.assets.find(a=>a.id===reviewer.assetId);check(asset?.provenance==='imported','Fixture provenance was lost');const media=await request(reviewer,asset.url+'?download=1');check(media.ok,'Reviewer cannot download its own media');check(sha(Buffer.from(await media.arrayBuffer()))===reviewer.sha256,'Downloaded media differs');
    for(const route of[`/api/projects/${peer.projectId}`,`/api/projects/${peer.projectId}/export`,`/api/assets/${peer.assetId}/file`,`/api/display/${peer.assetId}/poster`,`/api/projects/1bec0508-6565-4cf8-9666-f07d224351a1`,`/api/projects/1bec0508-6565-4cf8-9666-f07d224351a1/export`,`/api/assets/e5ebae2e-4573-49e8-96af-61b7c472fa2c/file`,`/api/runtime/backup`])await denial(reviewer,route);
    await denial(undefined,asset.url);
    const exported=await request(reviewer,`/api/projects/${reviewer.projectId}/export`);check(exported.ok,'Reviewer export failed');const bytes=Buffer.from(await exported.arrayBuffer()),zip=new AdmZip(bytes),manifest=JSON.parse(zip.readAsText('manifest.json'));check(manifest.project.id===reviewer.projectId,'Export crossed workspace boundaries');check(manifest.jobs.length===0,'Export contains unexpected executions');for(const entry of zip.getEntries())if(!entry.isDirectory)for(const secret of secrets())check(!entry.getData().includes(Buffer.from(secret)),'Package contains a credential or session token');await writeFile(path.join(directory,`Reviewer-${reviewer.label}.opentake.zip`),bytes);
    await note(resume?'reviewer-post-restart-reopened':'reviewer-save-download-export-isolation-verified',{reviewer:reviewer.label,projectId:reviewer.projectId,assetId:reviewer.assetId,takeId:reviewer.takeId,mediaSha256:reviewer.sha256,packageBytes:bytes.length,jobs:0});
  }
  if(process.argv.includes('--unfunded-connect')){
    // Explicit opt-in only: verifies a known exhausted key through free metadata
    // probes. No inference request follows this connection and it is disconnected.
    probeKey=parse(await readFile('.env.hosted','utf8')).COMFY_API_KEY?.trim()??'';check(probeKey,'Private hosted Comfy key is unavailable');const reviewer=reviewers[0];
    try{
      for(let attempt=1;attempt<=2;attempt++){
        const connected=await json<{credential:{state:string;connected:boolean}}>(reviewer,'/api/reviewer/connect','POST',{apiKey:probeKey});check(!JSON.stringify(connected).includes(probeKey),'Connect response exposed the entered credential');check(connected.credential.connected&&connected.credential.state==='insufficient_credits','Expected the explicitly unfunded key to report insufficient_credits');
        await note(attempt===1?'live-unfunded-key-connected':'same-unfunded-key-reconnected',{credentialState:connected.credential.state,generationSubmitted:false});
        const disconnected=await json<{credential:{connected:boolean}}>(reviewer,'/api/reviewer/connect','DELETE');check(!disconnected.credential.connected,'Disconnect did not remove the active credential');
      }
      const detail=await json<ProjectDetail>(reviewer,`/api/projects/${reviewer.projectId}`);check(detail.jobs.length===0,'Connect checks unexpectedly created a generation job');receipt.liveUnfundedConnectVerified=true;
    }finally{await json(reviewer,'/api/reviewer/connect','DELETE').catch(()=>undefined);probeKey='';}
  }
  receipt.completedAt=new Date().toISOString();receipt.passed=true;receipt.liveGenerationVerified=false;receipt.limitations=['No funded reviewer key was supplied, so live generation and provider polling were not exercised. Concurrent key routing, no-credit behavior, disconnect/expiry and restart idempotency are covered by mocked integration tests.'];delete receipt.error;await save();console.log(JSON.stringify({passed:true,receiptPath,resumeCommand:`npx tsx scripts/verify-hosted-reviewers.ts --resume "${directory}"`,liveGenerationVerified:false}));
}catch(error){receipt.passed=false;receipt.error=clean(error instanceof Error?error.message:error);await save();console.error(JSON.stringify({passed:false,error:receipt.error,receiptPath}));process.exitCode=1;}
