/** One-off READ-ONLY recovery of the user's existing Cloud artifacts. Never submits workflows. */
import dotenv from 'dotenv';
import {mkdir,readFile,writeFile,copyFile} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
dotenv.config({path:path.resolve('.env'),override:true,quiet:true});
const root=path.resolve('imports/comfy-cloud');
await mkdir(path.join(root,'media','OpenTakeStudio','video_draft'),{recursive:true});
await mkdir(path.join(root,'workflows'),{recursive:true});
const refs: {filename:string;id:string;subfolder:string;originalFilename:string}[]=[
 {filename:'770198fb9232af672430f62e8562a4123eef29eb49e49b38331f2e982e54b48e.mp4',id:'2f3f0023-3ced-4ab5-90bc-6f482b70585e',subfolder:'OpenTakeStudio/video_draft',originalFilename:'mara_i2v_00001_.mp4'},
 {filename:'395c43c6d887f7437957dad9d1c413ba9be0d268fae39190c3f2143061605982.png',id:'af5e9465-cc61-4ac4-b167-4ca6109a3d2b',subfolder:'OpenTakeStudio/image_draft',originalFilename:''},
 {filename:'0c296e01137a69aa6c8602325de12dcfbb4c194e39e631791040c97d67dbfcb7.png',id:'3c28e6c1-c046-459e-a70d-f763b5c5ebe2',subfolder:'OpenTakeStudio/image_draft',originalFilename:''},
 {filename:'6b7feb32705f0005059244d88de6c0b88065896d00662a4153eade9fb952fe41.png',id:'c0d9e8bf-0af4-42a1-a26c-2d0f0af9d014',subfolder:'OpenTakeStudio/image_draft',originalFilename:''},
 {filename:'514e336eb3cf8c53ed66969a691957d20d67dce17ad0c7d3d206fb9a1b3bac31.png',id:'4a3db28c-bb09-4c2f-85a4-7c957bb182c2',subfolder:'OpenTakeStudio/image_draft',originalFilename:''}
];
const receipt:any={retrievedAt:new Date().toISOString(),source:'https://cloud.comfy.org',workspaceId:'w-90148e74-2552-485e-aba8-90fe66066824',workflowUrl:'https://cloud.comfy.org/#53407a25-3b43-4b6f-a069-dc8461faf890',mode:'read-only artifact recovery; no workflows submitted',assets:[]};
for(const ref of refs){
 const params=new URLSearchParams({filename:ref.filename,id:ref.id,subfolder:ref.subfolder,type:'output',workspace_id:receipt.workspaceId});
 const response=await fetch(`https://cloud.comfy.org/api/view?${params}`,{headers:{'X-API-Key':process.env.COMFY_API_KEY??''},redirect:'manual',signal:AbortSignal.timeout(30000)});
 const record:any={...ref,httpStatus:response.status};
 if(response.status===302){
  const signed=response.headers.get('location');if(!signed)throw new Error('Cloud omitted output redirect');
  const target=new URL(signed);if(target.protocol!=='https:'||target.hostname!=='storage.googleapis.com')throw new Error('Unexpected Cloud storage destination');
  const disposition=target.searchParams.get('response-content-disposition')??'';
  const originalPath=/filename="([^"]+)"/.exec(disposition)?.[1];
  if(originalPath){record.originalPath=originalPath;record.originalFilename=path.posix.basename(originalPath);}
  if(!record.originalFilename)record.originalFilename=ref.filename;
  // Deliberately no API credential is sent to the storage host.
  const file=await fetch(target,{signal:AbortSignal.timeout(60000)});record.downloadStatus=file.status;
  if(file.ok){const bytes=Buffer.from(await file.arrayBuffer());const output=path.join(root,'media',ref.subfolder,record.originalFilename);await mkdir(path.dirname(output),{recursive:true});await writeFile(output,bytes);record.localPath=path.relative(root,output);record.bytes=bytes.length;record.sha256=createHash('sha256').update(bytes).digest('hex');record.contentType=file.headers.get('content-type');record.status='downloaded';if(ref.filename.endsWith('.png')){record.dimensions={width:bytes.readUInt32BE(16),height:bytes.readUInt32BE(20)};const metadata:Record<string,unknown>={};for(let cursor=8;cursor+12<=bytes.length;){const length=bytes.readUInt32BE(cursor),type=bytes.toString('ascii',cursor+4,cursor+8);if(cursor+12+length>bytes.length)break;if(type==='tEXt'){const text=bytes.subarray(cursor+8,cursor+8+length).toString('utf8'),separator=text.indexOf('\0');const key=text.slice(0,separator),value=text.slice(separator+1);try{metadata[key]=JSON.parse(value);}catch{metadata[key]=value;}}cursor+=12+length;}record.embeddedMetadataKeys=Object.keys(metadata);if(Object.keys(metadata).length){const metadataFile=path.join(root,'media',ref.subfolder,record.originalFilename+'.metadata.json');await writeFile(metadataFile,JSON.stringify(metadata,null,2));record.metadataPath=path.relative(root,metadataFile);}}}
 }else record.status='not-downloaded';
 receipt.assets.push(record);console.log(JSON.stringify({assetId:ref.id,status:record.status,httpStatus:record.httpStatus,downloadStatus:record.downloadStatus,bytes:record.bytes}));
}
await writeFile(path.join(root,'recovery-receipt.json'),JSON.stringify(receipt,null,2));
receipt.workflows=[];
for(const filename of ['Open Take Studio — 01 Image Draft.json','Open Take Studio — 01 Image Draft.api.json','Open Take Studio — 02 Image to Video.json','Open Take Studio — 02 Image to Video.api.json']){
 const original=path.join(process.env.USERPROFILE??'C:/Users/msid7','Downloads',filename);
 try{const content=await readFile(original);if(process.env.COMFY_API_KEY&&content.includes(Buffer.from(process.env.COMFY_API_KEY)))throw new Error('A workflow export unexpectedly contains the configured credential; copying stopped');JSON.parse(content.toString('utf8'));await copyFile(original,path.join(root,'workflows',filename));receipt.workflows.push({filename,localPath:'workflows/'+filename,bytes:content.length,sha256:createHash('sha256').update(content).digest('hex'),format:filename.endsWith('.api.json')?'ComfyUI API graph, reference only':'editable ComfyUI workflow'});console.log(JSON.stringify({workflow:filename,status:'copied'}));}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;receipt.workflows.push({filename,status:'not-found'});}
}
await writeFile(path.join(root,'recovery-receipt.json'),JSON.stringify(receipt,null,2));
