import type { BranchFilm, FilmClip } from '../shared/film-types';

const object=(value:unknown):Record<string,unknown>|undefined=>value!==null&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:undefined;
function clip(value:unknown):value is FilmClip{const item=object(value);return !!item&&typeof item.assetId==='string'&&typeof item.inSeconds==='number'&&Number.isFinite(item.inSeconds)&&typeof item.outSeconds==='number'&&Number.isFinite(item.outSeconds);}

/** Saved browser edits may be absent or malformed while project data is still loading. */
export function restoreEndingDraft(source:BranchFilm|undefined,value:unknown):{film:BranchFilm|undefined;direction?:string}{
 const saved=object(value),candidate=object(saved?.film);
 const usable=!!source&&!!candidate&&candidate.id===source.id&&typeof candidate.name==='string'&&clip(candidate.opening)&&Array.isArray(candidate.choices)&&candidate.choices.length>=2&&candidate.choices.length<=8&&candidate.choices.every(choice=>{const item=object(choice);return !!item&&typeof item.id==='string'&&typeof item.label==='string'&&clip(item.clip);});
 return {film:usable?{...source,name:candidate!.name as string,choices:candidate!.choices as BranchFilm['choices']} as BranchFilm:source,direction:source&&typeof saved?.direction==='string'?saved.direction:undefined};
}
