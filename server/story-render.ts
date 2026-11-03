import sharp, { type OverlayOptions } from 'sharp';
import { createHash, randomUUID } from 'node:crypto';
import type { Asset, Json, Take } from '../shared/types.ts';
import type { SceneBinding } from '../shared/scene-types.ts';
import type { Store } from './store.ts';
import type { LocalFileStorage } from './media.ts';

const escape=(text:unknown)=>String(text??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]!));
export interface PreparedStoryPage { asset: Asset; take: Take; }
/** Render and persist immutable bytes, but leave every database change to the
 * caller's atomic commit. A failed batch may leave unreferenced media files. */
export async function prepareStoryPage(store:Store,media:LocalFileStorage,parent:Take,settings:Json,refs:Record<string,string|string[]>,binding:SceneBinding,intent:string):Promise<PreparedStoryPage>{
  const panels=(settings.panels as {assetId:string;caption?:string;shotId?:string}[]|undefined)||[];
  if(!panels.length||panels.length>9)throw new Error('Story updates require one to nine saved image panels.');
  const columns=Math.max(1,Math.min(3,Number(settings.columns)||2)),width=1600,height=settings.pageAspect==='landscape'?1131:settings.pageAspect==='square'?1600:2263;
  const rows=Math.ceil(panels.length/columns),margin=64,gap=28,top=164,bottom=80,pw=Math.floor((width-2*margin-gap*(columns-1))/columns),ph=Math.floor((height-top-bottom-gap*(rows-1))/rows);
  const cap=settings.captions===false?0:Math.min(118,Math.floor(ph*.28)),ih=ph-cap,paper=settings.theme==='paper',ink=paper?'#222':'#f5f5f5',bg=paper?'#f5f3ef':'#141414';
  const composites:OverlayOptions[]=[];
  let labels=`<text x="64" y="98" font-size="46" font-weight="600">${escape(settings.title||parent.name).slice(0,280)}</text>`;
  for(const [i,panel]of panels.entries()){
    const asset=store.getAsset(panel.assetId);if(!asset||asset.projectId!==parent.projectId||asset.kind!=='image')throw new Error('Story panel image is missing from this project.');
    const x=margin+(i%columns)*(pw+gap),y=top+Math.floor(i/columns)*(ph+gap);
    const bytes=await sharp(await media.read(asset)).rotate().resize(pw,ih,{fit:settings.fit==='contain'?'contain':'cover',background:bg}).png().toBuffer();
    composites.push({input:bytes,left:x,top:y});
    if(cap){const words=String(panel.caption||'').split(/\s+/);let line='',lines:string[]=[];const maxChars=Math.floor(pw/12);for(const word of words){if((line+' '+word).length>maxChars){lines.push(line);line=word;}else line+=(line?' ':'')+word;}if(line)lines.push(line);for(const [n,text]of lines.slice(0,3).entries())labels+=`<text x="${x}" y="${y+ih+34+n*27}" font-size="21">${escape(text)}</text>`;}
  }
  labels+='<text x="64" y="'+(height-40)+'" font-size="13" letter-spacing="2">OPEN TAKE STUDIO / STORY PAGE</text>';
  composites.push({input:Buffer.from(`<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg"><g fill="${ink}" font-family="Arial,sans-serif">${labels}</g></svg>`),left:0,top:0});
  const bytes=await sharp({create:{width,height,channels:4,background:bg}}).composite(composites).png().toBuffer();
  const now=new Date().toISOString(),snapshot={...settings,updateIntent:intent};
  const asset:Asset=await media.put({projectId:parent.projectId,name:`${String(settings.title||parent.name).slice(0,130)} · revised page.png`,mimeType:'image/png',bytes,kind:'image',provenance:'local-edit',metadata:{operation:'storyboard-page',parentTakeId:parent.id,sourceAssetId:panels[0].assetId,inputAssetIds:refs,settings:snapshot,sceneBinding:binding}});
  const take:Take={...parent,id:randomUUID(),name:`${String(settings.title||parent.name).slice(0,130)} · new page`,parentTakeId:parent.id,sourceAssetId:panels[0].assetId,inputAssetIds:refs,assetIds:[asset.id],modelId:'local/storyboard-page',provider:'local',prompt:'',settings:snapshot,status:'LOCAL',provenance:'local-edit',favorite:false,jobId:undefined,createdAt:now,updatedAt:now,sceneBinding:binding,changes:[{field:'inputAssetIds',before:parent.inputAssetIds,after:refs}]};
  return {asset,take};
}

const canonical=(value:unknown):string=>Array.isArray(value)?`[${value.map(canonical).join(',')}]`:value&&typeof value==='object'?`{${Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([key,item])=>`${JSON.stringify(key)}:${canonical(item)}`).join(',')}}`:JSON.stringify(value);
/** Standalone composition also preserves its intended submission across replay. */
export async function composeStoryPage(store:Store,media:LocalFileStorage,parent:Take,settings:Json,refs:Record<string,string|string[]>,binding:SceneBinding,intent:string):Promise<Take>{
  const key='story-compose:'+createHash('sha256').update(canonical([parent.projectId,parent.id,intent])).digest('hex');
  const fingerprint=createHash('sha256').update(canonical({parentId:parent.id,settings,refs,binding})).digest('hex');
  const replay=()=>{const receipt=store.getOperationReceipt<Take>(key);if(!receipt)return undefined;if(receipt.fingerprint!==fingerprint)throw Object.assign(new Error('This story update identity already belongs to different inputs.'),{status:409});return receipt.result;};
  const existing=replay();if(existing)return existing;
  const prepared=await prepareStoryPage(store,media,parent,settings,refs,binding,intent);
  return store.transaction(()=>{const concurrent=replay();if(concurrent)return concurrent;store.upsertAsset(prepared.asset);store.upsertTake(prepared.take);store.putOperationReceipt({key,fingerprint,result:prepared.take,createdAt:new Date().toISOString()});return prepared.take;});
}
