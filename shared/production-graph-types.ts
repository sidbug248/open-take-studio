import type { Asset, GenerationRequest, MediaKind, Recipe } from './types';
import type { ModelDescriptor } from './model-types';

export type ProductionNodeKind = 'asset' | 'resize' | 'storyboard' | 'delivery' | 'recipe';
interface NodePosition { id:string; label:string; x:number; y:number; }
export type ProductionGraphNode = NodePosition & (
  | { kind:'asset'; assetId:string }
  | { kind:'resize'; width:number; height:number; fit:'contain'|'cover'; background:string }
  | { kind:'storyboard'; columns:1|2|3|4; title:string }
  | { kind:'delivery'; caption:string }
  | { kind:'recipe'; recipeId:string; prompt?:string }
);
export interface ProductionGraphEdge { id:string; from:string; fromPort:'output'; to:string; toPort:string; }
export interface ProductionGraphDocument {
  version:1; kind:'production-graph'; name:string;
  nodes:ProductionGraphNode[]; edges:ProductionGraphEdge[];
}
export interface ProductionPort { key:string; label:string; kinds:MediaKind[]; multiple:boolean; required:boolean; maxItems:number; }
export interface ProductionGraphContext { assets:Asset[]; recipes:Recipe[]; models:ModelDescriptor[]; }
export interface ProductionPorts { inputs:ProductionPort[]; outputs:ProductionPort[]; }
export type ProductionNodeState = 'waiting'|'running'|'ready'|'complete'|'failed';
export interface ProductionNodeRun {
  nodeId:string; state:ProductionNodeState; inputAssetIds:string[]; assetIds:string[];
  takeId?:string; jobId?:string; message?:string; request?:GenerationRequest;
}
export interface ProductionGraphRun {
  id:string; projectId:string; graphVersionAssetId:string; graphFingerprint:string;
  clientRequestId:string; createdAt:string; updatedAt:string;
  state:'running'|'waiting'|'complete'|'failed'; nodes:ProductionNodeRun[];
}
export interface ProductionGraphVersion { asset:Asset; document:ProductionGraphDocument; parentVersionAssetId?:string; }
export interface ProductionGraphRunResponse { run:ProductionGraphRun; assets:Asset[]; }

const kinds:MediaKind[]=['image','video','audio','3d','document'];
const port=(key:string,label:string,accepted:MediaKind[],multiple=false,required=true,maxItems=1):ProductionPort =>
  ({key,label,kinds:accepted,multiple,required,maxItems});
/** Browser and server share these visible, typed port definitions. */
export function productionPorts(node:ProductionGraphNode,context:ProductionGraphContext):ProductionPorts {
  if(node.kind==='asset') {
    const asset=context.assets.find(a=>a.id===node.assetId);
    return {inputs:[],outputs:[port('output',asset?.kind??'Media',asset?[asset.kind]:kinds)]};
  }
  if(node.kind==='resize')return {inputs:[port('image','Image',['image'])],outputs:[port('output','Image',['image'])]};
  if(node.kind==='storyboard')return {inputs:[port('images','Images',['image'],true,true,12)],outputs:[port('output','Contact sheet',['image'])]};
  if(node.kind==='delivery')return {inputs:[port('media','Media',kinds,true,true,20)],outputs:[port('output','ZIP package',['document'])]};
  const recipe=context.recipes.find(r=>r.id===node.recipeId);
  const model=context.models.find(m=>m.id===recipe?.modelId);
  return {
    inputs:(model?.inputs??[]).map(i=>port(i.key,i.label,[i.kind],!!i.multiple,!!i.required,i.multiple?(i.maxItems??12):1)),
    outputs:[port('output',model?.kind??'Result',model?[model.kind]:kinds)]
  };
}
export const productionNodeNames:Record<ProductionNodeKind,string> = {
  asset:'Source asset',resize:'Resize image',storyboard:'Contact sheet',delivery:'Delivery package',recipe:'Generation recipe'
};
export function emptyProductionGraph():ProductionGraphDocument {
  return {version:1,kind:'production-graph',name:'Untitled production',nodes:[],edges:[]};
}
