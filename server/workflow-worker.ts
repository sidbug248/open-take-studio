import { createHash } from 'node:crypto';
import type { Store } from './store.ts';
import { LocalFileStorage, MAX_MEDIA_BYTES, MediaValidationError } from './media.ts';
import type { Job } from '../shared/types.ts';
import type { WorkflowGraph, WorkflowVersion } from '../shared/workflow-types.ts';
import type { WorkflowPort, WorkflowSnapshot } from './workflow-port.ts';
import { WorkflowError, rejectWorkflowSecrets } from './workflow-schema.ts';
import { safeMessage } from './config.ts';

const terminal=new Set(['COMPLETED','FAILED','BLOCKED','EXPIRED']);
const now=()=>new Date().toISOString();
export class WorkflowWorker {
  private timer?:ReturnType<typeof setInterval>;
  private active=new Set<string>();
  private streams=new Map<string,AbortController>();
  constructor(private store:Store,private media:LocalFileStorage,private port:WorkflowPort,private keyConfigured:()=>boolean){}
  start(){if(this.timer)return;this.timer=setInterval(()=>void this.tick(),1500);this.timer.unref();void this.tick();}
  stop(){if(this.timer)clearInterval(this.timer);this.timer=undefined;for(const controller of this.streams.values())controller.abort();this.streams.clear();}
  async tick(){const capacity=Math.max(0,2-this.active.size);if(!capacity)return;const due=this.store.listRunnableJobs({executionRoute:'comfy-workflow',dueAt:now(),excludeIds:[...this.active],limit:capacity});await Promise.all(due.map(job=>this.process(job.id)));}
  async process(id:string){
    const initial=this.store.getJob(id);if(!initial||initial.executionRoute!=='comfy-workflow'||!initial.workflow||terminal.has(initial.state)||this.store.isArchivedJob(id)||this.active.has(id))return;
    this.active.add(id);let job=initial;
    try{
      if(!this.keyConfigured()){this.store.patchJob(id,{state:'BLOCKED',errorType:'missing_credentials',errorMessage:'Configure COMFY_API_KEY in the project .env, then retry this native job.'});return;}
      if(!job.requestId){
        if(job.workflow!.submissionOutcome==='unknown'||job.state==='SUBMITTING'){
          this.store.patchJob(id,{state:'BLOCKED',errorType:'submission_unknown',errorMessage:'Cloud submission may have been accepted before its ID was saved. Check Cloud history and attach that execution ID; this take will not be submitted again automatically.'});return;
        }
        const asset=this.store.getAsset(job.workflow!.versionAssetId);if(!asset||asset.projectId!==job.projectId)throw new WorkflowError('Workflow version is missing');
        const definition=asset.metadata.workflowVersion as unknown as WorkflowVersion;
        const graph=structuredClone(definition.apiGraph) as WorkflowGraph;
        const uploads={...job.workflow!.uploads};
        for(const binding of definition.bindings){const value=job.workflow!.values[binding.key];if(value===undefined)continue;
          if(typeof value==='object'){
            const source=this.store.getAsset(value.assetId);if(!source||source.projectId!==job.projectId)throw new WorkflowError('A workflow input is missing from this project');
            let uploaded=uploads[binding.key];
            if(!uploaded||uploaded.assetId!==source.id||uploaded.sha256!==source.sha256){uploaded={assetId:source.id,sha256:source.sha256,remoteId:await this.port.upload(this.media.path(source))};uploads[binding.key]=uploaded;job=this.store.patchJob(id,{workflow:{...job.workflow!,uploads}});}
            graph[binding.nodeId].inputs[binding.inputName]={__type:'core/ASSET',info:{id:uploaded.remoteId}};
          }else graph[binding.nodeId].inputs[binding.inputName]=value;
        }
        const validation=await this.port.validate(graph);
        if(!validation.valid){this.store.patchJob(id,{state:'BLOCKED',errorType:'workflow_dependencies',errorMessage:validation.issues.map(issue=>`${issue.nodeId}${issue.field?'.'+issue.field:''}: ${issue.message}`).join('; ').slice(0,1500),resultMetadata:{validation},workflow:{...job.workflow!,submissionOutcome:'not-submitted'}});return;}
        job=this.store.patchJob(id,{state:'SUBMITTING',inputs:{graph},attempts:job.attempts+1,submittedAt:job.submittedAt??now(),errorType:undefined,errorMessage:undefined,workflow:{...job.workflow!,submissionOutcome:'unknown'}});
        const accepted=await this.port.submit(graph,job.idempotencyKey);
        job=this.store.patchJob(id,{requestId:accepted.id,workflow:{...job.workflow!,submissionOutcome:'accepted'}});
        await this.observe(job,accepted);return;
      }
      if(job.state==='COLLECTING'&&job.result){await this.collect(job,job.result as WorkflowSnapshot);return;}
      await this.observe(job,await this.port.get(job.requestId));
    }catch(error){
      const current=this.store.getJob(id)!;const e=error as {code?:string;httpStatus?:number;retryAfter?:number;details?:unknown};
      const message=safeMessage(error),retryMs=Math.max(3000,Math.min(300000,(e.retryAfter??5)*1000));
      if(current.requestId){
        if(error instanceof WorkflowError||error instanceof MediaValidationError)this.store.patchJob(id,{state:'FAILED',errorType:'workflow_collection',errorMessage:message,completedAt:now()});
        else if(e.httpStatus===404||e.httpStatus===410)this.store.patchJob(id,{state:'EXPIRED',errorType:e.code??'workflow_expired',errorMessage:message});
        else this.store.patchJob(id,{state:current.state==='COLLECTING'?'COLLECTING':'RETRY_WAIT',errorType:e.code??'cloud_connection',errorMessage:message,nextPollAt:new Date(Date.now()+retryMs).toISOString()});
      }else if(current.workflow?.submissionOutcome==='unknown'){
        const rejected=e.httpStatus!==undefined&&[400,401,402,403,422,429].includes(e.httpStatus)&&e.code!=='idempotency_key_reuse';
        this.store.patchJob(id,{state:rejected&&e.httpStatus===429?'RETRY_WAIT':'BLOCKED',errorType:rejected?(e.code??'submission_rejected'):'submission_unknown',errorMessage:rejected?message:`Submission outcome unknown. Check Cloud history before attaching an execution ID. ${message}`,nextPollAt:rejected&&e.httpStatus===429?new Date(Date.now()+retryMs).toISOString():undefined,workflow:{...current.workflow,submissionOutcome:rejected?'rejected':'unknown'}});
      }else this.store.patchJob(id,{state:e.httpStatus===429?'RETRY_WAIT':'BLOCKED',errorType:e.code??'workflow_input',errorMessage:message,nextPollAt:e.httpStatus===429?new Date(Date.now()+retryMs).toISOString():undefined});
    }finally{this.active.delete(id);}
  }
  private watch(job:Job){if(!job.requestId||!this.port.watch||this.streams.has(job.id)||this.streams.size>=4)return;const controller=new AbortController();this.streams.set(job.id,controller);void this.port.watch(job.requestId,progress=>{const current=this.store.getJob(job.id);if(current?.workflow&&!terminal.has(current.state)&&Number.isFinite(progress.value)&&progress.value>=0&&progress.value<=1)this.store.patchJob(job.id,{workflow:{...current.workflow,progress}});},controller.signal).catch(()=>undefined).finally(()=>this.streams.delete(job.id));}
  private async observe(job:Job,snapshot:WorkflowSnapshot){
    const status=snapshot.status;const wf={...job.workflow!,cloudStatus:status,progress:snapshot.progress??job.workflow!.progress,expiresAt:snapshot.expiresAt};
    if(status==='succeeded'&&!snapshot.error){job=this.store.patchJob(job.id,{state:'COLLECTING',result:snapshot,workflow:wf,queuePosition:undefined});this.streams.get(job.id)?.abort();await this.collect(job,snapshot);return;}
    if(['failed','canceled','expired'].includes(status)||snapshot.error){this.store.patchJob(job.id,{state:status==='expired'?'EXPIRED':'FAILED',workflow:wf,errorType:status,errorMessage:safeMessage(typeof snapshot.error==='string'?snapshot.error:JSON.stringify(snapshot.error??`Cloud job ${status}`)),completedAt:now(),queuePosition:undefined});this.streams.get(job.id)?.abort();return;}
    job=this.store.patchJob(job.id,{state:status==='queued'?'IN_QUEUE':'IN_PROGRESS',workflow:wf,queuePosition:snapshot.queuePosition,nextPollAt:new Date(Date.now()+3000).toISOString(),errorType:undefined,errorMessage:undefined});this.watch(job);
  }
  private async collect(job:Job,snapshot:WorkflowSnapshot){
    const version=this.store.getAsset(job.workflow!.versionAssetId)!.metadata.workflowVersion as unknown as WorkflowVersion;
    const outputs=snapshot.outputs.filter(output=>version.outputNodeIds.includes(output.nodeId));
    if(!outputs.length){this.store.patchJob(job.id,{state:'FAILED',errorType:'empty_workflow_outputs',errorMessage:'Cloud completed without files from the selected output nodes.',completedAt:now()});return;}
    for(const output of outputs){
      if(!Number.isSafeInteger(output.sizeBytes)||output.sizeBytes<=0||output.sizeBytes>MAX_MEDIA_BYTES)throw new WorkflowError('Cloud output exceeds the supported 300 MiB media limit');
      const assetId='wf-'+createHash('sha256').update(job.id+':'+output.id).digest('hex').slice(0,40);
      let asset=this.store.getAsset(assetId);
      if(!asset){const bytes=await this.port.download(snapshot.id,output.id);if(bytes.byteLength!==output.sizeBytes)throw new WorkflowError('Cloud output size does not match its execution record');
        asset=await this.media.put({id:assetId,projectId:job.projectId,name:output.name,mimeType:output.contentType,bytes,provenance:job.workflow!.origin==='cloud-editor'?'imported':'generated',metadata:{operation:'comfy-workflow-output',executionRoute:'comfy-workflow',workflowVersionAssetId:job.workflow!.versionAssetId,graphSha256:job.workflow!.graphSha256,jobId:job.id,sourceExecution:{kind:'comfy-cloud',origin:job.workflow!.origin??'studio',requestId:snapshot.id,remoteAssetId:output.id,nodeId:output.nodeId,originalFilename:output.name}}});}
      this.store.transaction(()=>{this.store.upsertAsset(asset!);const take=this.store.getTake(job.takeId)!;this.store.upsertTake({...take,assetIds:[...new Set([...take.assetIds,asset!.id])],updatedAt:now()});});
    }
    job=this.store.getJob(job.id)!;
    if(!job.workflow!.executedGraphAssetId){const graph=await this.port.executedGraph(snapshot.id);rejectWorkflowSecrets(graph);const artifact=await this.media.put({projectId:job.projectId,name:`${version.name} · executed API graph.json`,mimeType:'application/json',bytes:Buffer.from(JSON.stringify(graph,null,2)),provenance:job.workflow!.origin==='cloud-editor'?'imported':'generated',metadata:{operation:'comfy-executed-graph',workflowVersionAssetId:job.workflow!.versionAssetId,jobId:job.id,sourceExecution:{kind:'comfy-cloud',origin:job.workflow!.origin??'studio',requestId:snapshot.id}}});this.store.upsertAsset(artifact);job=this.store.patchJob(job.id,{workflow:{...job.workflow!,executedGraphAssetId:artifact.id}});}
    this.store.patchJob(job.id,{state:'COMPLETED',completedAt:now(),errorType:undefined,errorMessage:undefined,nextPollAt:undefined});
    if(job.workflow!.origin==='cloud-editor')this.store.archiveJob(job.id);
    const project=this.store.getProject(job.projectId)!,take=this.store.getTake(job.takeId)!;const cover=take.assetIds.map(id=>this.store.getAsset(id)).find(asset=>asset?.kind==='image');this.store.upsertProject({...project,selectedTakeId:take.id,coverAssetId:cover?.id??project.coverAssetId,updatedAt:now()});
  }
  isActive(id:string){return this.active.has(id);}
}
