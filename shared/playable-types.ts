import type {Asset,Take} from './types';
export interface PlayableDocument {version:1;name:string;description:string;backgroundAssetId?:string;backgroundSha256?:string;winAssetId?:string;winSha256?:string;accent:string;starCount:number;speed:number;seed:number;durationSeconds:number;}
export interface PlayableSaved {document:PlayableDocument;asset:Asset;take:Take;}
export interface PlayableState {status:'ready'|'playing'|'paused'|'won'|'lost';collected:number;total:number;remaining:number;energy:number;}
export const createPlayableDocument=(name='Neon courier / signal run'):PlayableDocument=>({version:1,name,description:'Collect every signal star, then reach the portal. Keep clear of the patrol lights.',accent:'#c4afff',starCount:6,speed:180,seed:17,durationSeconds:90});
