import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import type {Asset,Job,Project,Recipe,Take} from '../shared/types.ts';
import type {ExploreBootstrap,ExploreCard,ExploreCardPage,ExploreJourney,ExploreRecipe,JourneyAction} from '../shared/explore-types.ts';
import type {AssetPresentation} from '../shared/presentation-contract.ts';
import type {CatalogueResponse} from '../shared/capability-inventory.ts';
import type {StudioRuntime} from './studio-runtime.ts';
import type {Store} from './store.ts';
import type {ExploreCuration} from './explore-service.ts';
import {buildCatalogue,type CatalogueQuery} from './catalogue-routes.ts';
import {REVIEWER_EXAMPLE_IDS,reviewerMediaUrl,sanitizeReviewerValue} from './reviewer-showcase.ts';

const approved=new Set<string>(REVIEWER_EXAMPLE_IDS);
const sections=[['all','For you'],['image','Image'],['video','Cinema'],['audio','Sound'],['3d','3D & playables'],['performance','Performance'],['stories','Stories & comics'],['marketing','Campaigns']];
const digest=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0,24);
const clean=<T>(value:T)=>sanitizeReviewerValue(value) as T;
const publicId=(id:string)=>'showcase:'+id;
const publicMedia=(asset:Asset)=>asset.kind!=='document'&&(/^(image|video|audio)\//.test(asset.mimeType)||asset.mimeType==='model/gltf-binary');
interface SourceSnapshot {projects:Map<string,Project>;assets:Map<string,Asset>;takes:Map<string,Take>;recipes:Map<string,Recipe>;}

/** Read-only presentation facade. No owner project detail, execution body or
 * unapproved project is ever read into a discovery response. Source identities
 * are explicitly marked until an edit creates a private, remapped copy. */
export class ReviewerDiscovery {
  private cached?:{key:string;value:ExploreBootstrap};
  private pending?:{key:string;value:Promise<ExploreBootstrap>};
  constructor(readonly owner:StudioRuntime){}
  private source():SourceSnapshot {
    const projects=new Map<string,Project>(),assets=new Map<string,Asset>(),takes=new Map<string,Take>(),recipes=new Map<string,Recipe>();
    for(const id of REVIEWER_EXAMPLE_IDS){const project=this.owner.store.getProject(id);if(!project)continue;projects.set(id,project);for(const asset of this.owner.store.listAssets(id))assets.set(asset.id,asset);for(const take of this.owner.store.listTakes(id))takes.set(take.id,take);for(const recipe of this.owner.store.listRecipes(id))recipes.set(recipe.id,recipe);}
    return{projects,assets,takes,recipes};
  }
  private asset(id:string):Asset|undefined{const row=this.owner.store.db.prepare('SELECT project_id FROM assets WHERE id=?').get(id) as {project_id:string}|undefined;if(!row||!approved.has(row.project_id)||!this.owner.store.getProject(row.project_id))return;return this.owner.store.getAsset(id);}
  /** Exact registered rendition URLs only; never disclose a private owner URL. */
  async display(assetId:string):Promise<AssetPresentation|undefined>{
    const asset=this.asset(assetId);if(!asset)return;
    const prior=await this.owner.explore.displays.describe(asset);
    const result:AssetPresentation={original:{assetId:asset.id,projectId:publicId(asset.projectId),sha256:asset.sha256,version:asset.sha256,kind:asset.kind,mimeType:asset.mimeType,bytes:asset.size,url:publicMedia(asset)?reviewerMediaUrl(asset.projectId,asset.id):''},presentationVersion:prior.presentationVersion,state:prior.state};
    const prefix=`/api/display/${asset.id}/${asset.sha256}/${prior.presentationVersion}/`;
    const rewrite=(url:string)=>{if(!url.startsWith(prefix))throw new Error('Unregistered curated rendition');const file=url.slice(prefix.length);if(!/^[a-f0-9]{64}\.(?:webp|jpg|mp4|glb)$/.test(file))throw new Error('Invalid curated rendition');return reviewerMediaUrl(asset.projectId,asset.id,'file:'+file);};
    const validSource=(id:string,sha:string)=>{const source=this.asset(id);return source?.projectId===asset.projectId&&source.sha256===sha;};
    try{
      if(prior.poster&&validSource(prior.poster.sourceAssetId,prior.poster.sourceSha256)){const variants=prior.poster.variants.map(v=>({...v,url:rewrite(v.url)}));result.poster={...prior.poster,url:rewrite(prior.poster.url),variants,srcSet:variants.map(v=>`${v.url} ${v.width}w`).join(', ')};}
      if(prior.preview&&publicMedia(asset)&&validSource(prior.preview.sourceAssetId,prior.preview.sourceSha256))result.preview={...prior.preview,url:rewrite(prior.preview.url)};
      if(prior.mesh&&asset.mimeType==='model/gltf-binary'&&validSource(prior.mesh.sourceAssetId,prior.mesh.sourceSha256))result.mesh={...prior.mesh,url:rewrite(prior.mesh.url)};
      if(prior.waveform&&asset.kind==='audio')result.waveform={duration:prior.waveform.duration,peaks:prior.waveform.peaks.slice(0,256)};
    }catch{return{...result,state:'unprepared',poster:undefined,preview:undefined,mesh:undefined};}
    // Decoder errors can contain machine paths; the original failure remains private.
    if(prior.state==='failed')result.description='The saved preview is unavailable. Open a private copy to inspect this asset.';
    return result;
  }
  presentation(assetId:string){return this.display(assetId);}
  private tags(asset:Asset,take:Take){const tags:string[]=[asset.kind];if(/performance|genjutsu|lip.?sync/i.test(take.modelId+' '+take.prompt))tags.push('performance');if(/storyboard|comic|sequential/i.test(String(asset.metadata.operation)+' '+take.prompt))tags.push('stories');if(/product|campaign|perfume|editorial/i.test(take.prompt))tags.push('marketing');return tags;}
  async card(assetId:string,source=this.source()):Promise<ExploreCard|undefined>{
    const asset=source.assets.get(assetId);if(!asset||!publicMedia(asset))return;const take=[...source.takes.values()].filter(t=>t.projectId===asset.projectId&&t.assetIds.includes(assetId)).sort((a,b)=>b.createdAt.localeCompare(a.createdAt))[0],project=source.projects.get(asset.projectId),media=await this.display(asset.id);if(!take||!project||!media)return;
    return clean({id:asset.id,title:take.name,project:{id:publicId(project.id),name:project.name},take:{id:take.id,name:take.name,kind:take.kind,modelId:take.modelId,provider:take.provider,status:take.status,provenance:take.provenance,favorite:take.favorite,parentTakeId:take.parentTakeId&&source.takes.has(take.parentTakeId)?take.parentTakeId:undefined,sourceAssetId:take.sourceAssetId&&source.assets.has(take.sourceAssetId)?take.sourceAssetId:undefined},media,tags:this.tags(asset,take)});
  }
  private galleryIds(section:string,source:SourceSnapshot){
    const seen=new Set<string>(),groups=new Map<string,string[]>();for(const take of [...source.takes.values()].filter(t=>['COMPLETED','LOCAL','IMPORTED'].includes(t.status)).sort((a,b)=>Number(b.favorite)-Number(a.favorite)||b.createdAt.localeCompare(a.createdAt)||a.id.localeCompare(b.id))){const asset=source.assets.get(take.assetIds[0]??'');if(!asset||!publicMedia(asset)||['asset-poster','video-frame-extraction'].includes(String(asset.metadata.operation))||seen.has(asset.sha256))continue;seen.add(asset.sha256);if(section!=='all'&&!this.tags(asset,take).includes(section))continue;if(!groups.has(take.projectId))groups.set(take.projectId,[]);groups.get(take.projectId)!.push(asset.id);}
    const lists=[...groups.values()];return Array.from({length:40},(_,index)=>lists.flatMap(list=>list[index]?[list[index]]:[])).flat().slice(0,120);
  }
  async page(section='all',cursor?:string,source=this.source()):Promise<ExploreCardPage>{if(!sections.some(([id])=>id===section))throw Object.assign(new Error('Unknown Explore section'),{status:400});const offset=cursor?Number(cursor):0;if(!Number.isSafeInteger(offset)||offset<0||offset>1000)throw Object.assign(new Error('Invalid Explore cursor'),{status:400});const ids=this.galleryIds(section,source),items=(await Promise.all(ids.slice(offset,offset+12).map(id=>this.card(id,source)))).filter((item):item is ExploreCard=>!!item);return{items,section,total:ids.length,nextCursor:offset+12<ids.length?String(offset+12):undefined,revision:digest(ids)};}
  private actionIsOwned(action:JourneyAction,source:SourceSnapshot){const project=source.projects.get(action.projectId);if(!project)return false;for(const [key,value]of Object.entries(action)){if(/AssetId$/.test(key)&&value&&source.assets.get(String(value))?.projectId!==project.id)return false;if(/TakeId$/.test(key)&&value&&source.takes.get(String(value))?.projectId!==project.id)return false;}if(action.kind==='ending')return project.films?.some(film=>film.id===action.filmId&&film.opening.assetId===action.openingAssetId)??false;return true;}
  private async key(curation:ExploreCuration){return digest({database:this.owner.store.db.prepare('PRAGMA data_version').get(),local:this.owner.store.db.prepare('SELECT total_changes() AS changes').get(),curation,display:this.owner.explore.displays.readRevision()});}
  private async curation():Promise<ExploreCuration>{try{const raw=await readFile(this.owner.explore.curationFile,'utf8');if(raw.length>64*1024)throw new Error('Oversized curation');const value=JSON.parse(raw) as ExploreCuration;if(value.version===1&&typeof value.heroAssetId==='string'&&Array.isArray(value.journeys))return value;}catch{}return{version:1,heroAssetId:this.galleryIds('all',this.source())[0]??'',journeys:[]};}
  async bootstrap():Promise<ExploreBootstrap>{const curation=await this.curation(),key=await this.key(curation);if(this.cached?.key===key)return this.cached.value;if(this.pending?.key===key)return this.pending.value;const value=this.buildBootstrap(curation).then(async result=>{if(key===await this.key(await this.curation()))this.cached={key,value:result};return result;});this.pending={key,value};try{return await value;}finally{if(this.pending?.value===value)this.pending=undefined;}}
  private async buildBootstrap(curation:ExploreCuration):Promise<ExploreBootstrap>{
    const source=this.source(),journeys:ExploreJourney[]=[];
    for(const entry of curation.journeys.slice(0,12)){if(!this.actionIsOwned(entry.action,source)||source.assets.get(entry.resultAssetId)?.projectId!==entry.action.projectId||entry.sourceAssetId&&source.assets.get(entry.sourceAssetId)?.projectId!==entry.action.projectId)continue;const result=await this.card(entry.resultAssetId,source);if(!result)continue;
      const journey:ExploreJourney={id:entry.id,title:entry.title,description:entry.description,actionLabel:entry.actionLabel,action:{...entry.action,projectId:publicId(entry.action.projectId)},result,source:entry.sourceAssetId?await this.card(entry.sourceAssetId,source):undefined};
      if(entry.action.kind==='ending'){const action=entry.action,film=source.projects.get(action.projectId)!.films!.find(f=>f.id===action.filmId)!;journey.continuations=(await Promise.all(film.choices.map(async choice=>({id:choice.id,label:choice.label,card:source.assets.get(choice.clip.assetId)?.projectId===action.projectId?await this.card(choice.clip.assetId,source):undefined})))).filter((choice):choice is NonNullable<ExploreJourney['continuations']>[number]=>!!choice.card);}
      // `result` here is a compact media card, not a provider execution result.
      // Preserve that explicit field while sanitizing editable source text.
      journeys.push({...journey,id:clean(journey.id),title:clean(journey.title),description:clean(journey.description),actionLabel:clean(journey.actionLabel),action:clean(journey.action),continuations:journey.continuations?.map(choice=>({...choice,label:clean(choice.label)}))});
    }
    const hero=await this.card(curation.heroAssetId,source)??await this.card(this.galleryIds('all',source)[0]??'',source)??null,firstPage=await this.page('all',undefined,source),projects=[...source.projects.values()].map(p=>clean({id:publicId(p.id),name:p.name,description:p.description,updatedAt:p.updatedAt,coverAssetId:p.coverAssetId&&source.assets.has(p.coverAssetId)?p.coverAssetId:undefined,selectedTakeId:p.selectedTakeId&&source.takes.has(p.selectedTakeId)?p.selectedTakeId:undefined})),counts=sections.map(([id,label])=>({id,label,count:this.galleryIds(id,source).length}));
    return{version:1,revision:digest({hero,journeys,firstPage,projects,counts}),generatedAt:new Date().toISOString(),hero,journeys,firstPage,projects,sections:counts,heroPreload:hero?.media.poster?{href:hero.media.poster.url,imageSrcSet:hero.media.poster.srcSet,imageSizes:'(max-width: 760px) 100vw, 65vw'}:undefined};
  }
  async recipes():Promise<ExploreRecipe[]>{const source=this.source();return Promise.all([...source.recipes.values()].map(async recipe=>{const project=source.projects.get(recipe.projectId)!,take=recipe.sourceTakeId?source.takes.get(recipe.sourceTakeId):undefined,assetId=recipe.previewAssetId??take?.assetIds[0]??Object.values(recipe.inputAssetIds).flat()[0];return clean({id:recipe.id,name:recipe.name,project:{id:publicId(project.id),name:project.name},modelId:recipe.modelId,promptExcerpt:recipe.prompt.slice(0,600),slots:recipe.slots?.map(({key,label,kind,required})=>({key,label,kind,required}))??[],ingredients:recipe.ingredients?.map(({key,label})=>({key,label}))??[],preview:assetId?await this.card(assetId,source):undefined});}));}
  private safeAsset(asset:Asset):Asset {return clean({id:asset.id,projectId:publicId(asset.projectId),name:asset.name,kind:asset.kind,mimeType:asset.mimeType,fileName:'',size:asset.size,sha256:asset.sha256,provenance:asset.provenance,createdAt:asset.createdAt,metadata:{operation:typeof asset.metadata.operation==='string'?asset.metadata.operation:undefined},url:publicMedia(asset)?reviewerMediaUrl(asset.projectId,asset.id):''});}
  /** Reuse normal readiness validation with a restricted repository and compact
   * job projection. Only its final, redacted presentation leaves this method. */
  async catalogue(query:CatalogueQuery={}):Promise<CatalogueResponse>{
    const source=this.source(),jobs=new Map<string,Job>();
    // Read only the two execution-proof scalars omitted by the status projection.
    // Never load private inputs/results or relax demonstration validation.
    const proofFields=this.owner.store.db.prepare("SELECT json_extract(data,'$.resultMetadata.requestId') AS syncRequestId,json_extract(data,'$.workflow.executedGraphAssetId') AS executedGraphAssetId FROM jobs WHERE id=? AND project_id=?");
    for(const projectId of source.projects.keys())for(const job of this.owner.store.listJobSummaries(projectId)){
      let evidence:Job=job;
      if(job.state==='COMPLETED'&&(!job.requestId||job.executionRoute==='comfy-workflow'&&!job.workflow?.executedGraphAssetId)){
        const proof=proofFields.get(job.id,projectId) as {syncRequestId:unknown;executedGraphAssetId:unknown}|undefined;
        evidence={...job};
        if(typeof proof?.syncRequestId==='string')evidence.resultMetadata={requestId:proof.syncRequestId};
        if(evidence.workflow&&typeof proof?.executedGraphAssetId==='string')evidence.workflow={...evidence.workflow,executedGraphAssetId:proof.executedGraphAssetId};
      }
      jobs.set(job.id,evidence);
    }
    const restricted={listTakes:()=>[...source.takes.values()],listProjects:()=>[...source.projects.values()],getProject:(id:string)=>source.projects.get(id),getAsset:(id:string)=>source.assets.get(id),getTake:(id:string)=>source.takes.get(id),getRecipe:(id:string)=>source.recipes.get(id),getJob:(id:string)=>jobs.get(id),isArchivedJob:(id:string)=>!jobs.has(id)||this.owner.store.isArchivedJob(id)} as Store;
    const result=buildCatalogue(restricted,query);
    for(const capability of result.capabilities){capability.examples=capability.examples.filter(example=>source.assets.has(example.assetId)&&publicMedia(source.assets.get(example.assetId)!)).map(example=>clean({...example,projectId:publicId(example.projectId),url:reviewerMediaUrl(example.projectId,example.assetId)}));
      capability.demonstrations=capability.demonstrations.map(demo=>clean({...demo,projectId:publicId(demo.projectId),posterAsset:demo.posterAsset?this.safeAsset(demo.posterAsset):undefined,previewAsset:demo.previewAsset?this.safeAsset(demo.previewAsset):undefined,inputAssets:demo.inputAssets.map(a=>this.safeAsset(a)),outputAssets:demo.outputAssets.map(a=>this.safeAsset(a)),posterUrl:demo.posterAsset&&publicMedia(demo.posterAsset)?reviewerMediaUrl(demo.posterAsset.projectId,demo.posterAsset.id):undefined,previewUrl:demo.previewAsset&&publicMedia(demo.previewAsset)?reviewerMediaUrl(demo.previewAsset.projectId,demo.previewAsset.id):undefined}));
    }
    return clean(result);
  }
}
