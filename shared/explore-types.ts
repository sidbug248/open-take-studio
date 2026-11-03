import type {AssetPresentation} from './presentation-contract';
import type {MediaKind,Take} from './types';
export interface ExploreProject {id:string;name:string;description:string;updatedAt:string;coverAssetId?:string;selectedTakeId?:string;}
export interface ExploreCard {
  id:string;title:string;project:Pick<ExploreProject,'id'|'name'>;
  take:Pick<Take,'id'|'name'|'kind'|'modelId'|'provider'|'status'|'provenance'|'favorite'|'parentTakeId'|'sourceAssetId'>;
  media:AssetPresentation;tags:string[];
}
export type JourneyAction=
  |{kind:'ending';projectId:string;filmId:string;openingAssetId:string;openingTakeId?:string;frameAssetId?:string;sourceSeconds?:number}
  |{kind:'object';projectId:string;modelAssetId:string;modelTakeId?:string;sceneAssetId:string;roomAssetId?:string}
  |{kind:'motion';projectId:string;compositionAssetId:string;soundtrackAssetId:string;takeId?:string};
export interface ExploreJourney {
  id:string;title:string;description:string;actionLabel:string;action:JourneyAction;
  result:ExploreCard;source?:ExploreCard;
  continuations?:{id:string;label:string;card:ExploreCard}[];
}
export interface ExploreCardPage {items:ExploreCard[];nextCursor?:string;total:number;section:string;revision:string;}
export interface ExploreSection {id:string;label:string;count:number;kind?:MediaKind;}
export interface ExploreBootstrap {
  version:1;revision:string;generatedAt:string;hero:ExploreCard|null;journeys:ExploreJourney[];
  firstPage:ExploreCardPage;sections:ExploreSection[];projects:ExploreProject[];
  heroPreload?:{href:string;imageSrcSet:string;imageSizes:string};
}
export interface ExploreRecipe {
  id:string;name:string;project:Pick<ExploreProject,'id'|'name'>;modelId:string;promptExcerpt:string;
  slots:{key:string;label:string;kind:string;required:boolean}[];ingredients:{key:string;label:string}[];
  preview?:ExploreCard;
}
