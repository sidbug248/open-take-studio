/** Read-only Cloud retrieval; optional --import archives an already successful execution through the application API. */
import '../server/config.ts';
import {Comfy} from '@comfyorg/sdk';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {mediaToolPaths,runMediaTool} from '../server/film-media.ts';
import {rejectWorkflowSecrets,workflowGraphSchema} from '../server/workflow-schema.ts';
import type {WorkflowGraph,WorkflowBinding} from '../shared/workflow-types.ts';

const arg=(key:string)=>{const at=process.argv.indexOf(key);return at<0?undefined:process.argv[at+1];};
const regenerate=process.argv.includes('--regenerate'),prefix=arg('--prefix')??(regenerate?'OpenTakeStudio/native/sea_gate_2k_cloud_v1':'OpenTakeStudio/native/prism_motion_cloud_v1'),cloudUrl=arg('--cloud-url');
if(!cloudUrl||!/^https:\/\/cloud\.comfy\.org\/#[-a-f0-9]{36}$/.test(cloudUrl))throw new Error('Supply the browser-verified saved --cloud-url');
const stem=regenerate?'04-sea-gate-2k':'03-prism-in-motion',name=regenerate?'Sea Gate 2K · Cloud editor v1':'Prism in Motion · Cloud editor v1',directory=path.resolve('artifacts/native-workflows',regenerate?'cloud-editor-regenerate':'cloud-editor-motion');await mkdir(directory,{recursive:true});
const response=await fetch('https://cloud.comfy.org/api/assets?include_public=false&limit=100&sort=created_at&tags_any=output,temp&tags_none=missing',{headers:{'X-API-Key':process.env.COMFY_API_KEY??''},signal:AbortSignal.timeout(45000)});if(!response.ok)throw new Error(`Cloud asset index HTTP ${response.status}`);
const raw=await response.json() as any,list=Array.isArray(raw)?raw:Object.values(raw).find(Array.isArray) as any[],source=list?.find(item=>JSON.stringify(item).includes(prefix));
if(!source?.job_id)throw new Error('The selected completed Cloud video output is not available in workspace history yet');
const client=new Comfy({apiKey:process.env.COMFY_API_KEY,clientInfo:'open-take-studio/video-recovery'}),job=await client.jobs.get(source.job_id),executed=await job.getWorkflow();if(job.status!=='succeeded')throw new Error(`Cloud execution is ${job.status}; retrieval does not submit or retry`);
rejectWorkflowSecrets(executed);const graph=workflowGraphSchema.parse((executed as any).workflow??(executed as any).graph);if(executed.format!=='api')throw new Error('Expected the exact executed API graph');
await writeFile(path.join(directory,'cloud-executed-workflow.api.json'),JSON.stringify(executed,null,2));await writeFile(path.join(directory,'cloud-editor-execution.api.json'),JSON.stringify(graph,null,2));
const outputs:any[]=[];let embeddedEditor:unknown;
for(const output of job.outputs){const bytes=Buffer.from(await output.toBytes({timeoutMs:120000})),file=`${output.id}-${path.basename(output.name).replace(/[^A-Za-z0-9._-]/g,'-')}`;await writeFile(path.join(directory,file),bytes);
  const probe=JSON.parse((await runMediaTool(mediaToolPaths().ffprobe,['-v','error','-protocol_whitelist','file,pipe','-show_format','-show_streams','-of','json',path.join(directory,file)])).toString('utf8'));
  const tags=probe.format?.tags??{},video=probe.streams?.find((s:any)=>s.codec_type==='video'),audio=probe.streams?.find((s:any)=>s.codec_type==='audio');
  if(tags.workflow){const editor=JSON.parse(tags.workflow);rejectWorkflowSecrets(editor);embeddedEditor=editor;await writeFile(path.join(directory,'cloud-editor-execution.editor.json'),JSON.stringify(editor,null,2));}
  if(tags.prompt){const prompt=JSON.parse(tags.prompt);rejectWorkflowSecrets(prompt);await writeFile(path.join(directory,'cloud-output-embedded-prompt.json'),JSON.stringify(prompt,null,2));}
  outputs.push({remoteAssetId:output.id,nodeId:output.nodeId,originalFilename:output.name,file,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),metadataKeys:Object.keys(tags),width:video?.width,height:video?.height,frames:Number(video?.nb_frames),frameRate:video?.avg_frame_rate,duration:Number(probe.format?.duration),audioCodec:audio?.codec_name,audioChannels:audio?.channels});
}
if(!outputs.length)throw new Error('The successful Cloud execution has no collected outputs');
const template=JSON.parse(await readFile(`workflows/native/${stem}.studio.json`,'utf8'));let editorGraph=embeddedEditor,editorProvenance='Recovered from the actual output MP4 workflow metadata';
if(!editorGraph){editorGraph=JSON.parse(await readFile(`workflows/native/${stem}.cloud-ready.editor.json`,'utf8'));for(const node of(editorGraph as any).nodes??[]){const api=graph[String(node.id)];if(api?.class_type==='SaveVideo'&&typeof api.inputs.filename_prefix==='string'){node.widgets_values[0]=api.inputs.filename_prefix;node.widgets_values_named={...node.widgets_values_named,filename_prefix:api.inputs.filename_prefix};}}editorProvenance='Reconstructed from the imported editable fixture and exact executed SaveVideo prefix; MP4 did not contain editable workflow metadata';await writeFile(path.join(directory,'cloud-editor-execution.editor.json'),JSON.stringify(editorGraph,null,2));}
const bindings:WorkflowBinding[]=template.bindings;for(const binding of bindings)if(!graph[binding.nodeId])throw new Error(`Executed graph changed node IDs; verify the ${binding.key} binding before import`);
const receipt={retrievedAt:new Date().toISOString(),mode:'Read-only recovery; no execution submitted',workflowName:name,workflowUrl:cloudUrl,workspaceId:source.workspace_id??'w-90148e74-2552-485e-aba8-90fe66066824',workspaceEvidence:source.workspace_id?'Cloud asset record':'Verified root browser workspace and authenticated project key',jobId:job.id,status:job.status,createdAt:job.createdAt.toISOString(),completedAt:job.completedAt?.toISOString(),outputSourceMatch:prefix,editorProvenance,outputs};await writeFile(path.join(directory,'recovery-receipt.json'),JSON.stringify(receipt,null,2));console.log(JSON.stringify(receipt,null,2));
if(process.argv.includes('--import')){
  const prior=JSON.parse(await readFile(`artifacts/native-workflows/${regenerate?'regenerate-execution-receipt.json':'h3-execution-receipt.json'}`,'utf8')),base='http://127.0.0.1:4310/api',projectId=prior.projectId;
  const request=async(route:string,body?:unknown,method='POST'):Promise<any>=>{const res=await fetch(base+route,body===undefined?undefined:{method,headers:{'content-type':'application/json'},body:JSON.stringify(body)});if(!res.ok)throw new Error(`${route}: ${await res.text()}`);return res.json();};
  const sourceAssetId=regenerate?prior.source.assetId:prior.sourceAssetId,parentTakeId=regenerate?prior.source.takeId:prior.parentTakeId,cloudReference={cloudEditorUrl:cloudUrl,cloudWorkspace:{id:receipt.workspaceId,name:'NYC Build Night'}},versions=await request(`/projects/${projectId}/workflows`),sha=createHash('sha256').update(JSON.stringify(graph)).digest('hex');
  const version=versions.find((v:any)=>v.workflow.name===name&&v.workflow.graphSha256===sha)??await request(`/projects/${projectId}/workflows`,{name,description:`Existing successful Cloud editor execution imported as archived history. ${editorProvenance}.`,apiGraph:graph,editorGraph,bindings,outputNodeIds:template.outputNodeIds,outputKind:'video',parentVersionAssetId:prior.workflowVersionAssetId,...cloudReference});
  await request(`/workflows/${version.asset.id}/cloud-reference`,cloudReference,'PATCH');
  const admitted=await request(`/workflows/${version.asset.id}/import-execution`,{requestId:job.id,name:`${name} · imported execution`,inputAssetIds:{[regenerate?'video':'image']:sourceAssetId},sourceAssetId,parentTakeId});let completed:any;
  for(let i=0;i<90;i++){completed=await request(`/workflow-jobs/${admitted.job.id}`);if(['COMPLETED','FAILED','BLOCKED','EXPIRED'].includes(completed.state))break;await new Promise(resolve=>setTimeout(resolve,1000));}
  if(completed.state!=='COMPLETED'||!completed.archived||completed.attempts!==0)throw new Error(`Imported execution did not finish as archived history: ${completed.state}`);
  const detail=await request(`/projects/${projectId}`),take=detail.takes.find((t:any)=>t.id===completed.takeId),assets=take.assetIds.map((id:string)=>detail.assets.find((a:any)=>a.id===id));if(take.provenance!=='imported'||assets.some((a:any)=>a.provenance!=='imported'||!outputs.some(o=>o.sha256===a.sha256)))throw new Error('Imported output provenance/hash mismatch');
  const result={importedAt:new Date().toISOString(),projectId,workflowVersionAssetId:version.asset.id,takeId:take.id,jobId:completed.id,cloudJobId:job.id,...cloudReference,editorProvenance,origin:completed.workflow.origin,archived:true,submissionAttempts:completed.attempts,inputAssetIds:take.inputAssetIds,parentTakeId,sourceAssetId,assets:assets.map((a:any)=>({id:a.id,sha256:a.sha256,bytes:a.size,provenance:a.provenance}))};await writeFile(path.join(directory,'application-import-receipt.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
}
