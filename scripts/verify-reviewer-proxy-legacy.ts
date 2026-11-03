/** Read-only release verification. Never creates sessions, sends credentials or submits generation. */
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import AdmZip from 'adm-zip';

if(!process.argv.includes('--live'))throw new Error('Pass --live only after the release owner confirms the deployment is ready. This performs read-only public HTTP checks.');
const option=(name:string)=>process.argv.find(value=>value.startsWith(name+'='))?.slice(name.length+1);
const base=new URL(option('--base')??'https://open-take-studio-review.vercel.app');
if(base.protocol!=='https:'||!/^open-take-studio-review(?:-[a-z0-9-]+)?\.vercel\.app$/.test(base.hostname)||base.username||base.password||base.pathname!=='/'||base.search||base.hash)throw new Error('Expected an authorized Open Take Studio Vercel origin.');
const archive=await readFile('artifacts/submission-2026-11-03/Open-Take-Studio-review-demo-2026-11-03.zip'),digest=(bytes:Buffer)=>createHash('sha256').update(bytes).digest('hex'),archiveSha256='95f13e58d66e165712b6b440961897f8c4bda5f5fbadd0f83061c0534044b76e';
if(digest(archive)!==archiveSha256)throw new Error('Pinned competition archive integrity failed.');
const files=new AdmZip(archive).getEntries().filter(entry=>!entry.isDirectory&&entry.entryName!=='index.html').map(entry=>{const bytes=entry.getData();return{path:entry.entryName,bytes:bytes.length,sha256:digest(bytes)};});
if(files.length!==18)throw new Error('Expected the exact 18 original media/support files.');
const directory=path.resolve('artifacts/deployment-reviewers/proxy/legacy-'+Date.now());await mkdir(directory,{recursive:true});
const receipt:{startedAt:string;base:string;readOnly:true;archiveSha256:string;checks:Record<string,unknown>[];errors:string[];complete?:boolean;finishedAt?:string}={startedAt:new Date().toISOString(),base:base.origin,readOnly:true,archiveSha256,checks:[],errors:[]};
const save=()=>writeFile(path.join(directory,'legacy-verification.json'),JSON.stringify(receipt,null,2));
const headers=(response:Response)=>({contentType:response.headers.get('content-type'),contentLength:response.headers.get('content-length'),contentEncoding:response.headers.get('content-encoding'),cacheControl:response.headers.get('cache-control'),vercelCache:response.headers.get('x-vercel-cache'),hasSetCookie:response.headers.has('set-cookie'),contentRange:response.headers.get('content-range')});
const url=(relative:string)=>new URL('/'+relative.replace(/^\//,''),base);
async function hashResponse(relative:string,expected:{bytes:number;sha256:string}){
  const response=await fetch(url(relative),{redirect:'manual',signal:AbortSignal.timeout(120_000)});
  if(response.status!==200){await response.body?.cancel();throw new Error(`${relative}: HTTP ${response.status}`);}
  if(!response.body)throw new Error(`${relative}: missing response body`);
  let bytes=0;const hash=createHash('sha256');for await(const chunk of response.body as unknown as AsyncIterable<Uint8Array>){bytes+=chunk.byteLength;if(bytes>expected.bytes)throw new Error(`${relative}: response exceeds original length`);hash.update(chunk);}
  const sha256=hash.digest('hex');if(bytes!==expected.bytes||sha256!==expected.sha256)throw new Error(`${relative}: original byte/hash mismatch`);
  receipt.checks.push({path:'/'+relative,status:response.status,bytes,sha256,unchanged:true,...headers(response)});await save();
}
async function check(relative:string,work:()=>Promise<void>){try{await work();}catch(error){receipt.errors.push(`${relative}: ${error instanceof Error?error.message:'verification failed'}`);await save();}}

await check('competition HTML',async()=>{
  const response=await fetch(url('competition/'),{redirect:'manual',signal:AbortSignal.timeout(30_000)}),bytes=Buffer.from(await response.arrayBuffer()),expected=await readFile('reviewer/index.html');
  if(response.status!==200||!bytes.equals(expected))throw new Error(`Competition page does not equal the preserved review source (HTTP ${response.status})`);
  const html=bytes.toString('utf8');if(!html.includes('Make the next moment yours.')||!html.includes('film/index.html')||!html.includes('walkthrough.mp4'))throw new Error('Competition page lost its meaningful content or links');
  receipt.checks.push({path:'/competition/',status:200,sha256:digest(bytes),preservedPage:true,...headers(response)});
  const redirect=await fetch(url('competition'),{redirect:'manual',signal:AbortSignal.timeout(30_000)});await redirect.body?.cancel();if(redirect.status!==307||new URL(redirect.headers.get('location')??'',base).pathname!=='/competition/')throw new Error('Competition slash redirect is not the expected temporary redirect');
  receipt.checks.push({path:'/competition',status:307,location:'/competition/'});
});

let next=0;
await Promise.all([0,1].map(async()=>{while(next<files.length){const item=files[next++];await check(item.path,()=>hashResponse(item.path,item));}}));
await check('portable ZIP',()=>hashResponse('Open-Take-Studio-Review-Demo.zip',{bytes:archive.length,sha256:archiveSha256}));
// Check every old relative URL as resolved from the moved competition directory.
for(const item of files)await check('competition/'+item.path,async()=>{const response=await fetch(url('competition/'+item.path),{method:'HEAD',redirect:'manual',signal:AbortSignal.timeout(30_000)});if(response.status!==200)throw new Error(`Relative asset returned HTTP ${response.status}`);const length=response.headers.get('content-length'),encoding=response.headers.get('content-encoding');if(length!==null&&(!encoding||encoding==='identity')&&Number(length)!==item.bytes)throw new Error('Relative asset size changed');receipt.checks.push({path:'/competition/'+item.path,method:'HEAD',status:200,expectedUncompressedBytes:item.bytes,...headers(response)});});
await check('video Range',async()=>{const expected=new AdmZip(archive).getEntry('walkthrough.mp4')!.getData().subarray(0,2048),response=await fetch(url('walkthrough.mp4'),{headers:{Range:'bytes=0-2047'},redirect:'manual',signal:AbortSignal.timeout(30_000)}),bytes=Buffer.from(await response.arrayBuffer());if(response.status!==206||!bytes.equals(expected)||!response.headers.get('content-range')?.startsWith('bytes 0-2047/'))throw new Error(`Byte range was not preserved (HTTP ${response.status})`);receipt.checks.push({path:'/walkthrough.mp4',range:'bytes=0-2047',status:206,sha256:digest(bytes),...headers(response)});});
await check('public root application',async()=>{const response=await fetch(base,{redirect:'manual',signal:AbortSignal.timeout(30_000)}),html=await response.text();if(response.status!==200||!html.includes('ots-explore-bootstrap')||html.includes('100-second product walkthrough'))throw new Error(`Root is not the actual studio arrival (HTTP ${response.status})`);if(response.headers.has('set-cookie'))throw new Error('Anonymous viewing unexpectedly issued a session cookie');receipt.checks.push({path:'/',status:200,actualApplication:true,noAutomaticSessionCookie:true,...headers(response)});});
receipt.finishedAt=new Date().toISOString();receipt.complete=receipt.errors.length===0;await save();
console.log(JSON.stringify({complete:receipt.complete,checked:receipt.checks.length,originalFiles:files.length,errors:receipt.errors,receipt:path.join(directory,'legacy-verification.json')}));if(!receipt.complete)process.exitCode=1;
