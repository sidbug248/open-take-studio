import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {workflowPort} from '../server/workflow-port.ts';
const root='artifacts/native-workflows',app=JSON.parse(await readFile(`${root}/app-execution-receipt.json`,'utf8'));
const candidates=[{stem:'03-prism-in-motion',receipt:'h3-execution-receipt.json',sourceFile:app.outputs[0].file,loader:'LoadImage',field:'image',binding:'image',extension:'png'}, {stem:'04-sea-gate-2k',receipt:'regenerate-execution-receipt.json',sourceFile:undefined as string|undefined,loader:'LoadVideo',field:'file',binding:'video',extension:'mp4'}];
const records=[];
for(const candidate of candidates){const receipt=JSON.parse(await readFile(`${root}/${candidate.receipt}`,'utf8'));const response=await fetch(`http://127.0.0.1:4310/api/workflow-jobs/${receipt.jobId}`);if(!response.ok)throw new Error('Native job lookup failed');const job=await response.json() as any;if(!job.workflow.uploads?.[candidate.binding])throw new Error('The source has not been uploaded by the native execution');
  const sourceFile=candidate.sourceFile??receipt.source.file,hash=(await workflowPort.hashInput!(path.resolve(root,sourceFile))).replace(/^blake3:/,''),filename=`${hash}.${candidate.extension}`;
  const editor=JSON.parse(await readFile(`workflows/native/${candidate.stem}.editor.json`,'utf8')),api=JSON.parse(await readFile(`workflows/native/${candidate.stem}.api.json`,'utf8'));
  for(const node of editor.nodes)if(node.type===candidate.loader){node.widgets_values[0]=filename;node.widgets_values_named={...node.widgets_values_named,[candidate.field]:filename};}
  for(const node of Object.values(api) as any[])if(node.class_type===candidate.loader)node.inputs[candidate.field]=filename;
  for(const[format,graph]of[['editor',editor],['api',api]])await writeFile(`workflows/native/${candidate.stem}.cloud-ready.${format}.json`,JSON.stringify(graph,null,2));
  records.push({definition:candidate.stem,sourceFile,sourceAssetId:job.workflow.uploads[candidate.binding].assetId,uploadedCloudAssetId:job.workflow.uploads[candidate.binding].remoteId,sourceSha256:job.workflow.uploads[candidate.binding].sha256,loaderFilename:filename,cloudJobId:job.requestId,state:job.state,verification:'Filename computed by SDK content hash from the same managed file uploaded by this recorded native job. Browser load/reopen verification is recorded separately.'});
}
await writeFile(`${root}/cloud-video-input-receipt.json`,JSON.stringify({preparedAt:new Date().toISOString(),records},null,2));console.log(JSON.stringify(records,null,2));
