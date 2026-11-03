import type {Job,MediaKind} from './types';

/** Display renditions never replace this original identity in editing, inference or export. */
export interface PresentationOriginal {
  assetId:string;projectId:string;sha256:string;version:string;
  kind:MediaKind;mimeType:string;url:string;bytes:number;
}
export interface PosterVariant {url:string;width:number;height:number;bytes:number;mimeType:'image/webp'|'image/jpeg';}
export interface PresentationPoster {
  url:string;srcSet:string;width:number;height:number;variants:PosterVariant[];
  kind:'source'|'rendered'|'geometry'|'waveform'|'illustration'|'reference';
  sourceAssetId:string;sourceSha256:string;
}
export interface PresentationVideo {
  url:string;width:number;height:number;duration:number;bytes:number;mimeType:'video/mp4';
  silent:true;sourceInSeconds:number;sourceOutSeconds:number;sourceAssetId:string;sourceSha256:string;
}
export interface PresentationMesh {
  url:string;bytes:number;mimeType:'model/gltf-binary';sourceAssetId:string;sourceSha256:string;
  purpose:'discovery-only';triangles?:number;textureMaxSize:number;
}
export interface AssetPresentation {
  original:PresentationOriginal;presentationVersion:string;state:'ready'|'partial'|'unprepared'|'failed';
  poster?:PresentationPoster;preview?:PresentationVideo;mesh?:PresentationMesh;
  waveform?:{peaks:number[];duration:number};description?:string;
}
export interface JobStatusSummary extends Omit<Job,'inputs'|'result'|'resultMetadata'> {
  inputs:Record<string,never>;archived:boolean;bodiesOmitted:true;
}
export interface ProjectStatusSummary {
  projectId:string;revision:string;version:string;activeJobCount:number;assetCount:number;takeCount:number;
  jobs:JobStatusSummary[];pollAfterMs:number;
}
