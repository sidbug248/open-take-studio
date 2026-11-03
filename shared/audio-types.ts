import type { Asset, Take } from './types';
export interface AudioMixTrack { id:string;assetId:string;name:string;start:number;offset:number;duration:number;gain:number;fadeIn:number;fadeOut:number;muted:boolean; }
export interface AudioMixDocument {version:1;name:string;duration:number;tracks:AudioMixTrack[];}
export interface AudioMixSaved {document:AudioMixDocument;asset:Asset;take:Take;}
export const createAudioMix=(name='Voices, texture & space'):AudioMixDocument=>({version:1,name,duration:20,tracks:[]});
