import type { Asset, Take } from './types.ts';

export interface FilmClip { assetId:string; takeId?:string; inSeconds:number; outSeconds:number; }
export interface FilmSourceMoment { assetId:string; takeId?:string; seconds:number; frameAssetId:string; }
export interface FilmChoice { id:string; label:string; clip:FilmClip; }
export interface BranchFilm {
  id:string; name:string; opening:FilmClip; sourceMoment?:FilmSourceMoment; parentFilmId?:string;
  choices:FilmChoice[]; createdAt:string; updatedAt:string;
}
export interface ExtractedFrameResult { asset:Asset; take:Take; requestedSeconds:number; actualSeconds:number; frameIndex:number; sourceDuration:number; }
export interface RenderedFilmResult { asset:Asset; take:Take; filmId:string; choiceId:string; duration:number; }
