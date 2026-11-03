import {Worker} from 'node:worker_threads';
import type {Store} from './store.ts';
import type {AssetPresentation} from '../shared/presentation-contract.ts';
import {DisplayMediaStore} from './display-media.ts';
import type {LocalFileStorage} from './media.ts';

type Options={hero?:boolean;sourceInSeconds?:number;sourceOutSeconds?:number};
/** One off-thread preparation queue. Discovery GETs only read already prepared files. */
export class DisplayPreparationWorker {
  private thread?:Worker;private timer?:ReturnType<typeof setInterval>;private active?:string;
  private pending=new Map<string,{options:Options;resolve:(v:AssetPresentation)=>void;reject:(e:Error)=>void;promise:Promise<AssetPresentation>}>();
  private scanned=new Map<string,string>();private scanning=false;private stopped=false;readonly display:DisplayMediaStore;
  constructor(readonly store:Store,media:LocalFileStorage){this.display=new DisplayMediaStore(store,media);}
  prepare(assetId:string,options:Options={}):Promise<AssetPresentation>{
    if(this.stopped)return Promise.reject(new Error('Display preparation worker stopped'));
    const found=this.pending.get(assetId);if(found)return found.promise;
    let resolve!:(v:AssetPresentation)=>void,reject!:(e:Error)=>void;const promise=new Promise<AssetPresentation>((yes,no)=>{resolve=yes;reject=no;});this.pending.set(assetId,{options,resolve,reject,promise});this.pump();return promise;
  }
  private pump(){if(this.stopped)return;if(this.active||!this.pending.size)return;if(!this.thread){this.thread=new Worker(new URL('./display-worker-thread.mjs',import.meta.url),{workerData:{dataDir:this.store.dataDir},env:{PATH:process.env.PATH??'',SystemRoot:process.env.SystemRoot??''}});this.thread.on('message',message=>{const job=this.pending.get(message.assetId);this.pending.delete(message.assetId);this.active=undefined;if(message.error)job?.reject(new Error(message.error));else job?.resolve(message.result);this.pump();});this.thread.on('error',error=>{for(const item of this.pending.values())item.reject(error instanceof Error?error:new Error(String(error)));this.pending.clear();this.active=undefined;this.thread=undefined;});}const [assetId,job]=this.pending.entries().next().value!;this.active=assetId;this.thread.postMessage({assetId,options:job.options});}
  async scan(){if(this.stopped||this.scanning)return;this.scanning=true;try{const rows=this.store.db.prepare("SELECT id,json_extract(data,'$.sha256') AS sha256,coalesce(json_extract(data,'$.metadata.posterAssetId'),'') AS posterId FROM assets ORDER BY json_extract(data,'$.createdAt') DESC").all() as {id:string;sha256:string;posterId:string}[];for(const row of rows){if(this.stopped)break;const revision=row.sha256+row.posterId;if(this.scanned.get(row.id)===revision)continue;this.scanned.set(row.id,revision);const asset=this.store.getAsset(row.id);if(!asset)continue;const presentation=await this.display.describe(asset);if(presentation.state==='unprepared'||(row.posterId&&presentation.poster?.sourceAssetId!==row.posterId))void this.prepare(row.id).catch(()=>{setTimeout(()=>this.scanned.delete(row.id),60000).unref();});}}finally{this.scanning=false;}}
  start(){this.stopped=false;void this.scan();this.timer=setInterval(()=>void this.scan(),10000);this.timer.unref();}
  async stop(){this.stopped=true;if(this.timer)clearInterval(this.timer);this.timer=undefined;const thread=this.thread;this.thread=undefined;for(const item of this.pending.values())item.reject(new Error('Display preparation worker stopped'));this.pending.clear();this.active=undefined;if(thread)await thread.terminate();}
}
