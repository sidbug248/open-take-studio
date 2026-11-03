import type { GenerationRequest, Json } from './types';

/** Named, explicit production inputs. Revisions never alter existing takes. */
export type StoryFactKey='location'|'time'|'event'|'intent'|'wardrobe'|'camera'|'sound';
export type StoryFacts=Partial<Record<StoryFactKey,string>>;
export interface SceneRevision { id:string; createdAt:string; direction:string; inputs:Record<string,string>; facts?:StoryFacts; }
export interface Scene { id:string; name:string; currentRevisionId:string; revisions:SceneRevision[]; createdAt:string; }
export interface SceneBinding { sceneId:string; revisionId:string; useDirection:boolean; factKeys?:StoryFactKey[]; }
export interface RecipeSlot { key:string; label:string; inputKey:string; kind:'image'|'video'|'audio'; required:boolean; defaultAssetId?:string; }
export interface ImpactOutput { takeId:string; name:string; kind:string; action:'reuse'|'generate'|'compose'|'blocked'; reason:string; changedFields:string[]; reusedAssetIds:string[]; dependencies:string[]; request?:GenerationRequest; settings?:Json; inputAssetIds?:Record<string,string|string[]>; }
export interface ScenePlan { sceneId:string; baseRevisionId:string; revision:SceneRevision; changed:boolean; outputs:ImpactOutput[]; limitations:string[]; }
