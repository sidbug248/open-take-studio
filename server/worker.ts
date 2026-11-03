import type { Store } from './store.ts';
import type { LocalFileStorage } from './media.ts';
import type { RouterPort, RouterResult } from './router-port.ts';
import type { Job, JobState, MediaKind } from '../shared/types.ts';
import { extractModelMedia } from './model-registry.ts';
import { downloadMedia } from './download.ts';
import { safeMessage } from './config.ts';

export type WorkerOptions={keyConfigured:()=>boolean;now?:()=>number;download?:typeof downloadMedia;extract?:typeof extractModelMedia;};
const permanent=new Set(['insufficient_credits','not_enabled','model_not_found','invalid_input','content_policy_violation','unauthorized','forbidden','cancelled','queue_timeout','request_not_found']);
export class GenerationWorker {
  private timer?:ReturnType<typeof setInterval>;
  private active=new Set<string>();
  private stopping=false;
  private now:()=>number;
  constructor(private store:Store,private media:LocalFileStorage,private router:RouterPort,private options:WorkerOptions){this.now=options.now||Date.now;}
  start(){if(this.timer)return;this.stopping=false;this.timer=setInterval(()=>void this.tick(),1000);this.timer.unref();void this.tick();}
  stop(){this.stopping=true;if(this.timer)clearInterval(this.timer);this.timer=undefined;}
  async drain(timeoutMs=25000){this.stop();const deadline=Date.now()+timeoutMs;while(this.active.size&&Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,25));return this.active.size===0;}
  async tick(){
    if(this.stopping)return;
    const capacity=Math.max(0,4-this.active.size);if(!capacity)return;
    const due=this.store.listRunnableJobs({executionRoute:'router',dueAt:new Date(this.now()).toISOString(),excludeIds:[...this.active],limit:capacity});
    await Promise.all(due.map(j=>this.process(j.id)));
  }
  async process(id:string){
    if(this.stopping)return;
    if(this.active.has(id)||this.store.isArchivedJob(id))return;
    const initial=this.store.getJob(id);if(!initial||initial.executionRoute==='comfy-workflow'||['COMPLETED','FAILED','EXPIRED','BLOCKED'].includes(initial.state))return;
    this.active.add(id);
    let job=initial;
    try {
      if(job.result && job.delivery!=='sync'){
        job=this.store.patchJob(id,{state:'COLLECTING',collectAttempts:(job.collectAttempts||0)+1});
        await this.collect(job,{kind:'json',data:job.result,...job.resultMetadata});return;
      }
      if(!this.options.keyConfigured()) {this.store.patchJob(id,{state:'BLOCKED',errorType:'missing_credentials',errorMessage:'Add COMFY_API_KEY to the project .env and restart the server. Then retry this job.'});return;}
      if(job.delivery==='sync'){
        if(job.attempts>0 && this.now()-Date.parse(job.createdAt)>23*3600_000){this.store.patchJob(id,{state:'BLOCKED',errorType:'admission_unknown',errorMessage:'Synchronous result recovery is outside the safe replay window. Check workspace history before creating a new take.'});return;}
        if(!this.router.run)throw new Error('Synchronous Router adapter missing.');
        job=this.store.patchJob(id,{state:'IN_PROGRESS',routerStatus:'SYNCHRONOUS_ROUTER_CALL',attempts:job.attempts+1,submittedAt:job.submittedAt||new Date(this.now()).toISOString()});
        const result=await this.router.run(job.modelId,job.inputs,job.idempotencyKey);
        await this.collect(job,result);return;
      }
      if(!job.requestId){
        // An ambiguous admission must not be automatically replayed after its retention window.
        if(job.attempts>0 && this.now()-Date.parse(job.createdAt)>23*3600_000){this.store.patchJob(id,{state:'BLOCKED',errorType:'admission_unknown',errorMessage:'Submission identity is over 23 hours old. Check the workspace ledger before creating another take.'});return;}
        job=this.store.patchJob(id,{state:'SUBMITTING',attempts:job.attempts+1,errorMessage:undefined,errorType:undefined});
        const handle=await this.router.submit(job.modelId,job.inputs,job.idempotencyKey);
        job=this.store.patchJob(id,{requestId:handle.requestId,state:'IN_QUEUE',submittedAt:job.submittedAt||new Date(this.now()).toISOString(),nextPollAt:new Date(this.now()+1500).toISOString()});
        return;
      }
      const update=await this.router.status(job.modelId,job.requestId);
      if(update.status==='COMPLETED' && update.errorType){
        this.store.patchJob(id,{state:'FAILED',errorType:update.errorType,errorMessage:`Router finished with ${update.errorType}. No successful output was returned.`,completedAt:new Date(this.now()).toISOString()});return;
      }
      if(update.status!=='COMPLETED'){
        const state:JobState=update.status==='IN_QUEUE'?'IN_QUEUE':'IN_PROGRESS';
        this.store.patchJob(id,{state,queuePosition:update.queuePosition??undefined,errorType:undefined,errorMessage:undefined,nextPollAt:new Date(this.now()+Math.max(1000,update.retryAfterMs??5000)).toISOString(),routerStatus:update.status} as Partial<Job>);
        return;
      }
      job=this.store.patchJob(id,{state:'COLLECTING',collectAttempts:(job.collectAttempts||0)+1,errorType:undefined,errorMessage:undefined});
      const result=await this.router.result(job.modelId,job.requestId!);
      await this.collect(job,result);
    }catch(err){
      const e=err as {errorType?:string;httpStatus?:number;status?:number;statusCode?:number;retryAfter?:number;message?:string;requestId?:string;};
      const httpStatus=e.httpStatus??e.status??e.statusCode;
      const errorType=httpStatus===410?'expired':e.errorType||'transport_or_collection_error';
      const terminal=permanent.has(errorType)||errorType==='provider_output_error'||(httpStatus!=null&&[400,401,402,403,404,422].includes(httpStatus));
      const state:JobState=errorType==='expired'?'EXPIRED':terminal?(errorType==='insufficient_credits'||errorType==='not_enabled'?'BLOCKED':'FAILED'):((!job.requestId&&job.attempts>=5)||(job.collectAttempts||0)>=5)?'BLOCKED':'RETRY_WAIT';
      const delay=Math.max(5_000,(e.retryAfter??0)*1000,Math.min(60_000,5_000*2**Math.min(job.attempts,4)));
      this.store.patchJob(id,{state,errorType,errorMessage:safeMessage(err),httpStatus,diagnosticRequestId:e.requestId??undefined,nextPollAt:new Date(this.now()+delay).toISOString()});
    }finally{this.active.delete(id);}
  }
  private async collect(job:Job,result:RouterResult){
    const take=this.store.getTake(job.takeId);if(!take)throw new Error('Take record missing.');
    const saved=this.store.listAssets(job.projectId).filter(a=>a.metadata.jobId===job.id);
    const assetIds:string[]=[];
    this.store.patchJob(job.id,{result:result.kind==='json'?result.data:{kind:'binary',contentType:result.contentType},resultMetadata:{requestId:result.requestId,servingProvider:result.servingProvider,droppedParams:result.droppedParams,creditsUsed:result.creditsUsed??null}} as Partial<Job>);
    let items: {binary?:Buffer;mimeType?:string;name?:string;url?:string;kind?:MediaKind}[];
    try {
      items=result.kind==='binary'?[{binary:Buffer.from(result.data as Uint8Array),mimeType:result.contentType||'application/octet-stream',name:take.name}]:
        (this.options.extract||extractModelMedia)(job.modelId,result.data).map(item=>({...item,binary:item.bytes?Buffer.from(item.bytes):undefined}));
      if(!items.length)throw new Error('Model completed but its documented output contains no media. Execution result retained for inspection.');
    }catch(error){throw Object.assign(error instanceof Error?error:new Error(String(error)),{errorType:'provider_output_error'});}
    for(let i=0;i<items.length;i++){
      const existing=saved.find(a=>a.metadata.outputIndex===i);
      if(existing){assetIds.push(existing.id);continue;}
      const item=items[i];
      const file=item.binary?{bytes:item.binary,mimeType:item.mimeType!}:await (this.options.download||downloadMedia)((item as {url:string}).url);
      const mime=file.mimeType==='application/octet-stream'?(item.mimeType||file.mimeType):file.mimeType;
      const asset=await this.media.put({projectId:job.projectId,name:item.name||take.name,mimeType:mime,bytes:file.bytes,kind:item.kind||take.kind,provenance:'generated',metadata:{jobId:job.id,outputIndex:i,modelId:job.modelId,provider:job.provider,requestId:job.requestId,servingProvider:result.servingProvider??null,requestedProvider:job.provider}});
      this.store.upsertAsset(asset);assetIds.push(asset.id);
    }
    this.store.transaction(()=>{
      this.store.upsertTake({...take,assetIds,status:'COMPLETED',updatedAt:new Date(this.now()).toISOString()});
      this.store.patchJob(job.id,{state:'COMPLETED',completedAt:new Date(this.now()).toISOString(),nextPollAt:undefined,errorType:undefined,errorMessage:undefined});
      const project=this.store.getProject(job.projectId)!;
      this.store.upsertProject({...project,selectedTakeId:take.id,coverAssetId:project.coverAssetId||(take.kind==='image'?assetIds[0]:undefined),updatedAt:new Date(this.now()).toISOString()});
    });
  }
  retry(id:string){
    const job=this.store.getJob(id);if(!job)throw new Error('Job not found.');
    if(this.store.isArchivedJob(id))throw new Error('Imported execution history cannot be retried. Branch the take to create new work.');
    if(job.state==='COMPLETED'||job.state==='EXPIRED')throw new Error('This job cannot be retried.');
    if(job.errorType==='not_enabled')throw new Error('Router queue access is not enabled for this account/model. Resolve access before creating a new intended submission.');
    if(job.requestId && job.state==='FAILED')throw new Error('Router returned a terminal failure. Branch this take for a new intended generation.');
    if(job.errorType==='admission_unknown')throw new Error('Review the workspace ledger first; this admission is outside the safe replay window.');
    return this.store.patchJob(id,{state:job.requestId?'IN_PROGRESS':'PENDING',collectAttempts:0,errorMessage:undefined,errorType:undefined,nextPollAt:new Date(this.now()).toISOString()});
  }
  async cancel(id:string){
    const job=this.store.getJob(id);if(!job||this.store.isArchivedJob(id))throw new Error('Active job not found.');
    if(job.delivery==='sync' && job.attempts>0)throw new Error('This provider uses a synchronous Router call; cancellation is unavailable after it starts.');
    if(this.active.has(id)&&!job.requestId)throw new Error('Admission is in flight. Wait for its request ID before requesting cancellation.');
    if(!job.requestId)return this.store.patchJob(id,{state:'FAILED',errorType:'cancelled',errorMessage:'Cancelled before Router submission.'});
    await this.router.cancel(job.modelId,job.requestId);
    return this.store.patchJob(id,{errorMessage:'Cancellation requested. Router status will confirm the outcome; a running generation may still finish.',nextPollAt:new Date(this.now()+3000).toISOString()});
  }
}
