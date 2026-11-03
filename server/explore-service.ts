import {readFile,mkdir,writeFile,rename} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
import path from 'node:path';
import type {Store} from './store.ts';
import type {LocalFileStorage} from './media.ts';
import type {Asset,Take} from '../shared/types.ts';
import type {ExploreBootstrap,ExploreCard,ExploreCardPage,ExploreJourney,ExploreProject,ExploreRecipe,JourneyAction} from '../shared/explore-types.ts';
import {DisplayMediaStore} from './display-media.ts';
export interface ExploreCuration {version:1;heroAssetId:string;journeys:{id:string;title:string;description:string;actionLabel:string;resultAssetId:string;sourceAssetId?:string;action:JourneyAction}[];}
const sections=[['all','For you'],['image','Image'],['video','Cinema'],['audio','Sound'],['3d','3D & playables'],['performance','Performance'],['stories','Stories & comics'],['marketing','Campaigns']];
const hash=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0,24);
export class ExploreService {
  readonly displays:DisplayMediaStore;readonly curationFile:string;
  private bootstrapCache?:{key:string;value:ExploreBootstrap};
  private bootstrapPending?:{key:string;value:Promise<ExploreBootstrap>};
  constructor(readonly store:Store,readonly media:LocalFileStorage){this.displays=new DisplayMediaStore(store,media);this.curationFile=path.join(store.dataDir,'presentation','curation.json');}
  projects():ExploreProject[]{return(this.store.db.prepare("SELECT json_object('id',id,'name',json_extract(data,'$.name'),'description',json_extract(data,'$.description'),'updatedAt',json_extract(data,'$.updatedAt'),'coverAssetId',json_extract(data,'$.coverAssetId'),'selectedTakeId',json_extract(data,'$.selectedTakeId')) AS data FROM projects ORDER BY json_extract(data,'$.createdAt'),id").all() as {data:string}[]).map(row=>{const p=JSON.parse(row.data);if(p.coverAssetId===null)delete p.coverAssetId;if(p.selectedTakeId===null)delete p.selectedTakeId;return p;});}
  private galleryRows(){return this.store.db.prepare("SELECT a.id AS assetId,t.id AS takeId,t.project_id AS projectId,json_extract(a.data,'$.kind') AS kind,json_extract(a.data,'$.metadata.operation') AS operation,json_extract(t.data,'$.prompt') AS prompt,json_extract(t.data,'$.modelId') AS modelId,json_extract(t.data,'$.favorite') AS favorite,json_extract(t.data,'$.createdAt') AS createdAt,json_extract(a.data,'$.sha256') AS sha256 FROM takes t JOIN assets a ON a.id=json_extract(t.data,'$.assetIds[0]') WHERE json_extract(t.data,'$.status') IN ('COMPLETED','LOCAL','IMPORTED') AND json_extract(a.data,'$.kind') IN ('image','video','audio','3d') AND coalesce(json_extract(a.data,'$.metadata.operation'),'') NOT IN ('asset-poster','video-frame-extraction') ORDER BY coalesce(json_extract(t.data,'$.favorite'),0) DESC,json_extract(t.data,'$.createdAt') DESC,t.id LIMIT 600").all() as {assetId:string;takeId:string;projectId:string;kind:string;operation?:string;prompt:string;modelId:string;favorite:number;createdAt:string;sha256:string}[];}
  galleryIds(section='all',rows=this.galleryRows()){
    const seen=new Set<string>(),groups=new Map<string,typeof rows>();for(const row of rows){if(seen.has(row.sha256))continue;seen.add(row.sha256);let tags=[row.kind];if(/performance|genjutsu|lip.?sync/i.test(row.modelId+' '+row.prompt))tags.push('performance');if(/storyboard|comic|sequential/i.test(row.operation+' '+row.prompt))tags.push('stories');if(/product|campaign|perfume|editorial/i.test(row.prompt))tags.push('marketing');if(section!=='all'&&!tags.includes(section))continue;if(!groups.has(row.projectId))groups.set(row.projectId,[]);groups.get(row.projectId)!.push(row);}
    const lists=[...groups.values()];return Array.from({length:8},(_,i)=>lists.flatMap(list=>list[i]?[list[i].assetId]:[])).flat().slice(0,120);
  }
  async card(assetId:string):Promise<ExploreCard|undefined>{const asset=this.store.getAsset(assetId);if(!asset)return;const row=this.store.db.prepare('SELECT t.data FROM takes t JOIN json_each(t.data,\'$.assetIds\') ids ON ids.value=? WHERE t.project_id=? ORDER BY json_extract(t.data,\'$.createdAt\') DESC LIMIT 1').get(assetId,asset.projectId) as {data:string}|undefined;if(!row)return;const take=JSON.parse(row.data) as Take,project=this.store.db.prepare("SELECT id,json_extract(data,'$.name') AS name FROM projects WHERE id=?").get(asset.projectId) as {id:string;name:string}|undefined;if(!project)return;const tags:string[]=[asset.kind];if(/performance|genjutsu|lip.?sync/i.test(take.modelId+' '+take.prompt))tags.push('performance');if(/storyboard|comic|sequential/i.test(String(asset.metadata.operation)+' '+take.prompt))tags.push('stories');if(/product|campaign|perfume|editorial/i.test(take.prompt))tags.push('marketing');
    return{id:asset.id,title:take.name,project:{id:project.id,name:project.name},take:{id:take.id,name:take.name,kind:take.kind,modelId:take.modelId,provider:take.provider,status:take.status,provenance:take.provenance,favorite:take.favorite,parentTakeId:take.parentTakeId,sourceAssetId:take.sourceAssetId},media:await this.displays.describe(asset),tags};}
  async page(section='all',cursor?:string,rows=this.galleryRows()):Promise<ExploreCardPage>{if(!sections.some(s=>s[0]===section))throw Object.assign(new Error('Unknown Explore section'),{status:400});const offset=cursor?Number(cursor):0;if(!Number.isSafeInteger(offset)||offset<0||offset>1000)throw Object.assign(new Error('Invalid Explore cursor'),{status:400});const ids=this.galleryIds(section,rows),items=(await Promise.all(ids.slice(offset,offset+12).map(id=>this.card(id)))).filter((v):v is ExploreCard=>!!v);return{items,total:ids.length,section,nextCursor:offset+12<ids.length?String(offset+12):undefined,revision:hash(ids)};}
  defaultCuration():ExploreCuration {
    const prism=this.store.getProject('456f5fdb-e79b-4946-9122-dc17e7a291e3'),film=prism?.films?.find(f=>f.id==='c952d42b-0aea-4fe0-9c23-2206a28523c2'),journeys:ExploreCuration['journeys']=[];
    if(prism&&film)journeys.push({id:'change-ending',title:'Change the ending',description:'One real moment. Two possible worlds. Choose a saved path, then make your own.',actionLabel:'Change this ending',resultAssetId:film.opening.assetId,sourceAssetId:film.sourceMoment?.frameAssetId,action:{kind:'ending',projectId:prism.id,filmId:film.id,openingAssetId:film.opening.assetId,openingTakeId:film.opening.takeId,frameAssetId:film.sourceMoment?.frameAssetId,sourceSeconds:film.sourceMoment?.seconds}});
    const model=this.store.getAsset('1519ad03-9178-4983-90fc-ddee63d8d355');if(model)journeys.push({id:'direct-object',title:'Direct the object',description:'Shape the light. Find a viewpoint. Make a real object feel like yours.',actionLabel:'Direct this object',resultAssetId:model.id,action:{kind:'object',projectId:model.projectId,modelAssetId:model.id,sceneAssetId:'568ca4b5-5328-456a-8120-cb0325efb4bf',roomAssetId:'4b042c17-2bad-410e-adc6-5d3931011c3e'}});
    const motion=this.store.getAsset('7821bd26-cd59-48bb-be22-50cd47c7afef');if(motion)journeys.push({id:'move-sound',title:'Move the sound',description:'A voice becomes a visual rhythm. Shift a cue and watch the composition respond.',actionLabel:'Make this sound move',resultAssetId:motion.id,sourceAssetId:'d8f1c40e-a3e6-47f1-ada5-2d91dc7e1c25',action:{kind:'motion',projectId:motion.projectId,compositionAssetId:'683ffb05-6cb9-44e3-877f-6f3af580516f',soundtrackAssetId:'d8f1c40e-a3e6-47f1-ada5-2d91dc7e1c25'}});
    return{version:1,heroAssetId:film?.opening.assetId??this.galleryIds()[0]??'',journeys};
  }
  async curation():Promise<ExploreCuration>{try{const record=JSON.parse(await readFile(this.curationFile,'utf8'));if(record.version===1&&Array.isArray(record.journeys))return record;}catch{}return this.defaultCuration();}
  async saveCuration(record:ExploreCuration){if(record.version!==1||!Array.isArray(record.journeys)||record.journeys.length>12)throw new Error('Invalid Explore curation');for(const entry of record.journeys){if(!this.store.getProject(entry.action.projectId))throw new Error('Curated project is missing');for(const id of[entry.resultAssetId,entry.sourceAssetId,...Object.entries(entry.action).filter(([key])=>/AssetId$/.test(key)).map(([,value])=>value as string)])if(id&&this.store.getAsset(id)?.projectId!==entry.action.projectId)throw new Error('Curated media must belong to its original project');}if(record.heroAssetId&&!this.store.getAsset(record.heroAssetId))throw new Error('Curated hero is missing');await mkdir(path.dirname(this.curationFile),{recursive:true});const file=this.curationFile+'.'+randomUUID();await writeFile(file,JSON.stringify(record,null,2));await rename(file,this.curationFile);}
  private async bootstrapKey(curation:ExploreCuration){
    // data_version detects other SQLite connections; total_changes also detects this
    // connection's writes, including edits that deliberately preserve timestamps.
    // Neither query reads historical job/input JSON. A worker publishes the display
    // marker only after its descriptor is atomically ready on disk.
    const database=this.store.db.prepare('PRAGMA data_version').get(),local=this.store.db.prepare('SELECT total_changes() AS changes').get();
    const display=this.displays.readRevision();
    return hash({database,local,curation,display});
  }
  async bootstrap():Promise<ExploreBootstrap>{
    const curation=await this.curation(),key=await this.bootstrapKey(curation);
    if(this.bootstrapCache?.key===key)return this.bootstrapCache.value;
    if(this.bootstrapPending?.key===key)return this.bootstrapPending.value;
    const value=this.buildBootstrap(curation).then(async result=>{
      // A concurrent save may land while descriptor files are being read. Do not
      // cache that transitional snapshot under the newer version's identity.
      if(key===await this.bootstrapKey(await this.curation()))this.bootstrapCache={key,value:result};
      return result;
    });
    this.bootstrapPending={key,value};
    try{return await value;}finally{if(this.bootstrapPending?.value===value)this.bootstrapPending=undefined;}
  }
  private async buildBootstrap(curation:ExploreCuration):Promise<ExploreBootstrap>{const journeys:ExploreJourney[]=[];for(const entry of curation.journeys){try{const result=await this.card(entry.resultAssetId);if(!result)continue;const journey:ExploreJourney={...entry,result,source:entry.sourceAssetId?await this.card(entry.sourceAssetId):undefined};if(entry.action.kind==='ending'){const action=entry.action,film=this.store.getProject(action.projectId)?.films?.find(f=>f.id===action.filmId);if(!film)continue;journey.continuations=(await Promise.all(film.choices.map(async choice=>({id:choice.id,label:choice.label,card:await this.card(choice.clip.assetId)})))).filter((c):c is NonNullable<ExploreJourney['continuations']>[number]=>!!c.card);}journeys.push(journey);}catch{}}
    const rows=this.galleryRows(),hero=await this.card(curation.heroAssetId)??null,firstPage=await this.page('all',undefined,rows),projects=this.projects(),sectionCounts=sections.map(([id,label])=>({id,label,count:this.galleryIds(id,rows).length})),revision=hash({curation,hero,journeys,firstPage,sections:sectionCounts,projects});return{version:1,revision,generatedAt:new Date().toISOString(),hero,journeys,firstPage,sections:sectionCounts,projects,heroPreload:hero?.media.poster?{href:hero.media.poster.url,imageSrcSet:hero.media.poster.srcSet,imageSizes:'(max-width: 760px) 100vw, 65vw'}:undefined};
  }
  async recipes():Promise<ExploreRecipe[]>{const rows=this.store.listRecipes();return Promise.all(rows.map(async recipe=>{const project=this.store.getProject(recipe.projectId)!,take=recipe.sourceTakeId?this.store.getTake(recipe.sourceTakeId):undefined,assetId=recipe.previewAssetId??take?.assetIds[0]??Object.values(recipe.inputAssetIds).flat()[0];return{id:recipe.id,name:recipe.name,project:{id:project.id,name:project.name},modelId:recipe.modelId,promptExcerpt:recipe.prompt.slice(0,600),slots:recipe.slots?.map(({key,label,kind,required})=>({key,label,kind,required}))??[],ingredients:recipe.ingredients?.map(({key,label})=>({key,label}))??[],preview:assetId?await this.card(assetId):undefined};}));}
}
