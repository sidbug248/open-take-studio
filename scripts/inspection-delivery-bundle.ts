/** Explicit, local-only representative delivery. Does not read/write the database. */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { inflateSync } from 'node:zlib';
import { parse } from 'dotenv';
import AdmZip from 'adm-zip';

const root=process.cwd(), delivery=path.resolve('artifacts/inspection-build/delivery'), target=path.join(delivery,'representative-bundle');
await mkdir(target,{recursive:true});
const configuredKey=parse(await readFile(path.join(root,'.env'),'utf8')).COMFY_API_KEY;
if(!configuredKey||configuredKey.length<8)throw new Error('Configured project credential was not available for the private byte scan.');
const forbiddenSecrets=[Buffer.from(configuredKey),Buffer.from(Buffer.from(configuredKey).toString('base64')),Buffer.from(encodeURIComponent(configuredKey))];
const secretProperty=/^(authorization|x-api-key|api[_-]?key|access[_-]?token|refresh[_-]?token|auth[_-]?token(?:_comfy_org)?|comfy[_-]?api[_-]?key)$/i;
const signedParameter=/^(x-amz-signature|x-goog-signature|signature|sig|access_token|token)$/i;
const sha=(bytes:Buffer)=>createHash('sha256').update(bytes).digest('hex');
const cleanName=(name:string)=>{if(!name||name.includes('\\')||name.startsWith('/')||name.includes(':')||name.split('/').some(part=>!part||part==='.'||part==='..')||/(^|\/)\.env(?:$|\.)|(^|\/)(?:raw-logs?|node_modules|\.git)(?:\/|$)/i.test(name))throw new Error('Unsafe or excluded bundle path');return name;};
const sanitize=(value:any,key=''):any=>{
 if(secretProperty.test(key))return '[credential omitted]';
 if(key==='cloudWorkspace'||key==='account'||key==='email'||key==='userEmail')return '[account detail omitted]';
 if(typeof value==='string'){
  if(/^[A-Za-z]:[\\/]/.test(value))return path.basename(value);
  if(/^https?:\/\//.test(value)){try{const url=new URL(value);if([...url.searchParams.keys()].some(key=>signedParameter.test(key)))return '[temporary media URL omitted]';}catch{}}
  return value;
 }
 if(Array.isArray(value))return value.map(item=>sanitize(item));
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([key,item])=>[key,sanitize(item,key)]));
 return value;
};
let scannedBytes=0,scannedFiles=0,scannedArchives=0,scannedPngText=0,scannedEmbeddedMedia=0;
function scanJson(value:any){if(!value||typeof value!=='object')return;for(const [key,item]of Object.entries(value)){if(secretProperty.test(key)&&typeof item==='string'&&item.trim()&&!/omitted|redact|\*\*|process\.env|\$\{|COMFY_API_KEY/i.test(item))throw new Error('Nonempty credential field in delivery content');scanJson(item);}}
function scanBytes(name:string,bytes:Buffer,depth=0){
 cleanName(name);scannedBytes+=bytes.length;scannedFiles++;if(scannedBytes>1024*1024*1024||depth>5)throw new Error('Delivery scan expansion limit exceeded');
 if(forbiddenSecrets.some(secret=>bytes.includes(secret)))throw new Error('Configured credential detected in selected content; package was not written');
 if(/\.json$/i.test(name)){scanJson(JSON.parse(bytes.toString('utf8')));}
 if(/\.(?:json|txt)$/i.test(name))for(const match of bytes.toString('utf8').matchAll(/data:[\w.+-]+\/[\w.+-]+;base64,([A-Za-z0-9+/]+={0,2})/g)){scanBytes(name+'.embedded.bin',Buffer.from(match[1]!,'base64'),depth+1);scannedEmbeddedMedia++;}
 if(/\.(?:json|csv|md|txt|html)$/i.test(name))for(const match of bytes.toString('utf8').matchAll(/https?:\/\/[^\s"<>\\]+/g)){try{const url=new URL(match[0]);if([...url.searchParams.keys()].some(key=>signedParameter.test(key)))throw new Error('SIGNED_URL');}catch(error){if((error as Error).message==='SIGNED_URL')throw new Error('Temporary signed URL found in delivery text');}}
 if(bytes.length>4&&bytes.readUInt32LE(0)===0x04034b50){scannedArchives++;const archive=new AdmZip(bytes);for(const entry of archive.getEntries()){if(entry.isDirectory)continue;const entryName=cleanName(entry.entryName);if(entry.header.size>300*1024*1024)throw new Error('Oversized nested archive entry');scanBytes(name+'/'+entryName,entry.getData(),depth+1);}}
 if(bytes.length>8&&bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))){let position=8;while(position+12<=bytes.length){const length=bytes.readUInt32BE(position),type=bytes.toString('ascii',position+4,position+8),data=bytes.subarray(position+8,position+8+length);if(position+12+length>bytes.length)throw new Error('Invalid PNG chunk length');if(type==='zTXt'){const separator=data.indexOf(0);if(separator<0)throw new Error('Invalid PNG text');scanBytes(name+'.metadata.txt',inflateSync(data.subarray(separator+2),{maxOutputLength:32*1024*1024}),depth+1);scannedPngText++;}else if(type==='iTXt'){const separator=data.indexOf(0);if(separator<0||separator+3>data.length)throw new Error('Invalid PNG iTXt');let start=separator+3;for(let field=0;field<2;field++){start=data.indexOf(0,start)+1;if(start<=0)throw new Error('Invalid PNG iTXt field');}scanBytes(name+'.metadata.txt',data[separator+1]===1?inflateSync(data.subarray(start),{maxOutputLength:32*1024*1024}):data.subarray(start),depth+1);scannedPngText++;}else if(type==='tEXt'){scanBytes(name+'.metadata.txt',data,depth+1);scannedPngText++;}position+=length+12;}}
}
type Entry={path:string;source?:string;sourceSha256?:string;sha256:string;bytes:number;transformed?:boolean};
const entries:Entry[]=[], zip=new AdmZip();
async function add(name:string,bytes:Buffer,source?:string,transformed=false,original?:Buffer){cleanName(name);scanBytes(name,bytes);await mkdir(path.dirname(path.join(target,name)),{recursive:true});await writeFile(path.join(target,name),bytes);zip.addFile(name,bytes);entries.push({path:name,...(source?{source,sourceSha256:sha(original??bytes)}:{}),sha256:sha(bytes),bytes:bytes.length,...(transformed?{transformed:true}:{})});}
async function copy(name:string,source:string,redact=false){const original=await readFile(path.resolve(source));const bytes=redact?Buffer.from(JSON.stringify(sanitize(JSON.parse(original.toString('utf8'))),null,2)):original;await add(name,bytes,source,redact&&!bytes.equals(original),original);}
await copy('START-HERE.mp4','artifacts/inspection-build/delivery/Open-Take-Studio-Inspection-Demo.mp4');
await copy('evidence/demo-shot-manifest.json','artifacts/inspection-build/delivery/shot-manifest.json',true);
await copy('evidence/demo-video-verification.json','artifacts/inspection-build/delivery/video-verification.json',true);
await copy('evidence/demo-contact-sheet.jpg','artifacts/inspection-build/delivery/demo-contact-sheet.jpg');
for(const file of ['capabilities.csv','models.csv','summary.json'])await copy('coverage/'+file,'artifacts/inspection-build/visual-coverage/'+file);
const requests=JSON.parse(await readFile('artifacts/inspection-build/production/requests.json','utf8'));
const verification=JSON.parse(await readFile('artifacts/inspection-build/production/media-verification.json','utf8'));
const selectedReceipts:any[]=[];
const stillKeys=['saffron-study-3','couture-study-4','botanical-study-1','paper-study-1','pocket-study-3'];
async function selected(key:string,name:string,extension:string){const row=requests.find((item:any)=>item.key===key&&item.state==='COMPLETED');if(!row)throw new Error('Selected generation is not complete');const assetId=row.outputAssetIds[0],bytes=await readFile(path.join(root,'data/media',assetId+'.'+extension)),verified=verification.assets.find((asset:any)=>asset.assetId===assetId);if(!verified||verified.sha256!==sha(bytes)||verified.size!==bytes.length)throw new Error('Selected source hash mismatch');await add(name,bytes,'data/media/'+assetId+'.'+extension);selectedReceipts.push({key,projectId:row.body.projectId,modelId:row.body.modelId,prompt:row.body.prompt,settings:row.body.settings,inputAssetIds:row.body.inputAssetIds,takeId:row.takeId,jobId:row.jobId,requestId:row.requestId,output:{assetId,file:name,bytes:bytes.length,sha256:sha(bytes)},state:row.state,creditsUsed:row.creditsUsed??null});}
for(let i=0;i<stillKeys.length;i++)await selected(stillKeys[i]!,'media/stills/'+String(i+1).padStart(2,'0')+'-'+stillKeys[i]+'.png','png');
const nativeSource='wf-477e70884322fe2eb0fe0f31cd6061f22f5ac9f7';
await copy('media/stills/06-native-prism-atelier.png','data/media/'+nativeSource+'.png');
await selected('h3-text-sea-gate','media/clips/02-tidal-source-for-native-regeneration.mp4','mp4');
const velvet=JSON.parse(await readFile('artifacts/inspection-build/delivery/velvet-source.json','utf8')),velvetProof=JSON.parse(await readFile('artifacts/inspection-build/creator-review/receipt.json','utf8'));
const velvetBytes=await readFile('data/media/'+velvet.assetId+'.mp4');if(sha(velvetBytes)!==velvetProof.downloadedSha256)throw new Error('Fresh journey output hash mismatch');
await add('media/clips/01-velvet-observatory.mp4',velvetBytes,'data/media/'+velvet.assetId+'.mp4');
selectedReceipts.push({...velvet,output:{file:'media/clips/01-velvet-observatory.mp4',sha256:sha(velvetBytes),bytes:velvetBytes.length}});
await selected('eleven-voice-welcome','media/audio/another-door-original-speech.mp3','mp3');
await selected('pocket-mesh-refine','media/3d/pocket-mythologies-textured.glb','glb');
await add('evidence/selected-router-executions.json',Buffer.from(JSON.stringify(sanitize(selectedReceipts),null,2)));
await copy('experiences/01-Prismatic-bloom.playable.zip','artifacts/next-build/prismatic-film/Prismatic-bloom.playable.zip');
await copy('experiences/02-Neon-courier.playable.zip','artifacts/next-build/playable-evidence/Neon-courier.playable.zip');
await copy('experiences/03-Afterlight-Object-Room.zip','artifacts/inspection-build/object-room/Afterlight-Object-Room.zip');
await copy('project/The-Velvet-Observatory.opentake.zip','artifacts/inspection-build/creator-review/The-Velvet-Observatory.opentake.zip');
for(const stem of ['01-prism-atelier','02-image-finish','03-prism-in-motion','04-sea-gate-2k'])for(const suffix of ['editor.json','api.json','dependencies.json','studio.json'])await copy('workflows/'+stem+'.'+suffix,'workflows/native/'+stem+'.'+suffix,true);
for(const [folderName,label]of [['cloud-editor','01-prism-editor-run'],['cloud-editor-finish-reopen','02-finish-editor-run'],['cloud-editor-motion','03-h3-editor-run'],['cloud-editor-regenerate','04-regenerate-editor-run']]){
 for(const suffix of ['editor','api'])await copy('workflows/executed/'+label+'.'+suffix+'.json','artifacts/native-workflows/'+folderName+'/cloud-editor-execution.'+suffix+'.json',true);
 await copy('evidence/native/'+label+'.json','artifacts/native-workflows/'+folderName+'/application-import-receipt.json',true);
}
for(const file of ['app-execution-receipt.json','h3-execution-receipt.json','regenerate-execution-receipt.json','dependency-inspection.json','h3-dependency-inspection.json','regenerate-dependency-inspection.json','cloud-video-input-receipt.json'])await copy('evidence/native/'+file,'artifacts/native-workflows/'+file,true);
await copy('evidence/fresh-browser-journey.json','artifacts/inspection-build/creator-review/receipt.json',true);
await copy('evidence/final-project-package-verification.json','artifacts/inspection-build/package-verification/verification-receipt.json',true);
await copy('evidence/export-responsiveness.json','artifacts/inspection-build/package-verification/responsiveness/receipt.json',true);
await copy('evidence/object-room-independent-player.json','artifacts/inspection-build/object-room/browser-receipt.json',true);
await copy('evidence/motion-six-render-verification.json','artifacts/inspection-build/motion-render-evidence/download-and-probe.json',true);
for(const file of ['image-finish-neutral-completed.png','native-h3-completed-detail.png','native-h3-sampler-detail.png','regeneration-graph-completed.png'])await copy('screenshots/'+file,'artifacts/inspection-build/cloud/'+file);
for(const file of ['04-new-image.png','06-new-video.png','07-restored-video-workspace.png','09-final-production-arrival.png'])await copy('screenshots/'+file,'artifacts/inspection-build/creator-review/'+file);
for(const file of ['03-explore-reduced-motion.png','06-selected-model-controls.png'])await copy('screenshots/phone/'+file,'artifacts/inspection-build/phone-evidence/'+file);
await copy('screenshots/phone/manifest.json','artifacts/inspection-build/phone-evidence/manifest.json',true);
await copy('screenshots/object-room.png','artifacts/inspection-build/object-room/browser/03-light.png');
for(const file of ['model-route-audit.md','licensing.md','feature-coverage.md','capability-inventory-2026-11-03.md','native-comfy-workflows.md','inspection-build-delivery.md','validation.md'])await copy('documentation/'+file,'docs/'+file);
await copy('LICENSE-application.txt','LICENSE');
await copy('editing/inspection-demo-film.ts','scripts/inspection-demo-film.ts');
await copy('editing/inspection-delivery-bundle.ts','scripts/inspection-delivery-bundle.ts');
const readme=`# Open Take Studio / representative delivery\n\nStart with START-HERE.mp4:108.522 seconds of actual media and clearly labelled sampled browser evidence. This is a curated montage, not a continuous interface recording.\n\nMedia contains six representative stills, two original short clips, one original spoken track and one actual textured GLB. evidence/selected-router-executions.json records source identities, requests, prompts/settings and hashes. The native Prism image is an actual workflow output; native workflow receipts distinguish studio executions from archived Cloud-editor runs.\n\nexperiences/ contains three independent players: a branching film, the authored Neon Courier game, and a guided Object Room with real 3D geometry. Extract each ZIP separately and follow its bundled README. Use a local HTTP server where required; these players do not need the running studio or perform inference. Their own runtime licenses remain included.\n\nproject/The-Velvet-Observatory.opentake.zip is the fresh image-to-video project exported through the actual interface. Import it from Studio settings/Projects; imported jobs remain archived history and do not submit again. This package intentionally omits unrelated project databases and raw logs.\n\nworkflows/ retains editable/API graphs, typed studio versions and dependency declarations. workflows/executed/ comes from actual Cloud-editor output metadata. Some LoadImage/LoadVideo filenames are remote-workspace input references: rebind them to media/stills/06-native-prism-atelier.png or media/clips/02-tidal-source-for-native-regeneration.mp4 as appropriate before a new run. Native workflows execute through the separately labelled Comfy Cloud route, not Router. The H3 2K regeneration partner node has provider/service requirements; no all-stage open-weight license claim is made.\n\ncoverage/ describes66 outcomes and253 discovered models:55 demonstrated executable outcomes and11 planned outcomes with labelled illustrations. Model-family illustrations are not generated output proof. Read the exact limitations and route/license audit.\n\nediting/ includes the montage and bundle scripts for use in the application source checkout. Run instructions and dependencies are in the separate application source deliverable; this review bundle does not embed node_modules or credentials.\n\nConfigured credential bytes, their encoded representations, nested archives and PNG text metadata were scanned privately before packaging. No environment file, account popup capture or raw log is included. Receipt transformations remove account details, machine-absolute paths and temporary signed URLs; originals remain in the local workspace.\n\nOriginal application code and editing scripts are MIT licensed. Model output, external service and bundled-runtime obligations remain separate. Nothing has been published. Local studio: http://127.0.0.1:4310\n`;
await add('README.md',Buffer.from(readme));
const manifest={createdAt:new Date().toISOString(),scope:'Explicit representative review bundle; no live database or inference mutation',counts:{stills:6,shortClips:2,audio:1,glb:1,portableExperienceZips:3,editableProjectPackages:1},files:entries};
await add('bundle-manifest.json',Buffer.from(JSON.stringify(manifest,null,2)));
const output=path.join(delivery,'Open-Take-Studio-Representative-Delivery.zip');await writeFile(output,zip.toBuffer());
const rebuilt=new AdmZip(await readFile(output));if(rebuilt.getEntries().filter(entry=>!entry.isDirectory).length!==entries.length)throw new Error('Bundle entry count mismatch');
for(const entry of entries){const restored=rebuilt.getEntry(entry.path)?.getData();if(!restored||sha(restored)!==entry.sha256)throw new Error('Bundle hash mismatch');}
const bytes=await readFile(output),receipt={createdAt:new Date().toISOString(),file:output,bytes:bytes.length,sha256:sha(bytes),fileCount:entries.length,counts:manifest.counts,allPackagedHashesVerified:true,configuredCredentialScanPassed:true,encodedCredentialScanPassed:true,nestedArchivesScanned:scannedArchives,pngTextMetadataChunksScanned:scannedPngText,embeddedMediaScanned:scannedEmbeddedMedia,expandedScanFiles:scannedFiles,expandedScanBytes:scannedBytes,explicitAllowlist:true,environmentFilesIncluded:false,rawLogsIncluded:false,accountPopupCapturesIncluded:false,noLiveAppMutations:true,sourceFilesPreserved:true};
await writeFile(path.join(delivery,'representative-bundle-receipt.json'),JSON.stringify(receipt,null,2));console.log(JSON.stringify({file:output,bytes:bytes.length,files:entries.length,secretScanPassed:true,allHashesVerified:true}));
