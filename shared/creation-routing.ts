import type { Asset } from './types';
import type { ModelDescriptor } from './model-types';

/** Outcome routing assigns only declared model inputs. Originals always remain in the project. */
export function creationRoute(outcome:string,models:ModelDescriptor[],assets:Asset[],override?:string){
 const preferred=override||({film:'minimax/minimax-h3',video:'minimax/minimax-h3',performance:'higgsfield/higgsfield-genjutsu-motion-transfer-v1.0','3d':'meshy/meshy-7.1',image:'bfl/flux-3-image',marketing:'bfl/flux-3-image'} as Record<string,string>)[outcome];
 const kind=outcome==='audio'?'audio':outcome==='document'?'document':'image';
 const model=preferred?models.find(m=>m.id===preferred&&m.status!=='unavailable'):models.find(m=>m.kind===kind&&m.status!=='unavailable');
 const inputs:Record<string,string|string[]>={},used=new Set<string>();
 const slots=model?.id==='minimax/minimax-h3'?(assets.some(a=>a.kind==='image')?model.inputs.filter(i=>i.key==='first_frame'):model.inputs.filter(i=>i.key.startsWith('reference_'))):model?.inputs||[];
 for(const input of slots){const matches=assets.filter(a=>a.kind===input.kind&&!used.has(a.id));if(!matches.length)continue;const selected=matches.slice(0,input.multiple?(input.maxItems||matches.length):1);inputs[input.key]=input.multiple?selected.map(a=>a.id):selected[0].id;selected.forEach(a=>used.add(a.id));}
 const view=outcome==='motion'?'motion':['playable','playables'].includes(outcome)?'playable':outcome==='spatial'?'spatial':outcome==='stories'?'shots':'studio';
 return {modelId:model?.id||preferred||'bfl/flux-3-image',inputAssetIds:view==='studio'?inputs:{},view,initialAudioAssetId:assets.find(a=>a.kind==='audio')?.id,initialAssetId:assets.find(a=>a.kind==='image'||a.kind==='3d')?.id,unassigned:assets.filter(a=>!used.has(a.id)).map(a=>a.id)};
}
