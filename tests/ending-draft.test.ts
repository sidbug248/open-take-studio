import test from 'node:test';
import assert from 'node:assert/strict';
import type { BranchFilm } from '../shared/film-types';
import { restoreEndingDraft } from '../client/ending-draft';

const film:BranchFilm={id:'film-a',name:'Original',opening:{assetId:'opening',inSeconds:0,outSeconds:2},choices:[{id:'a',label:'Light',clip:{assetId:'light',inSeconds:0,outSeconds:3}},{id:'b',label:'Seed',clip:{assetId:'seed',inSeconds:0,outSeconds:3}}],createdAt:'2026-11-03T00:00:00Z',updatedAt:'2026-11-03T00:00:00Z'};
test('fresh journey tolerates absent project film and null browser storage, then restores the loaded film',()=>{
 for(const stored of [undefined,null,{},false,''])assert.deepEqual(restoreEndingDraft(undefined,stored),{film:undefined,direction:undefined});
 assert.equal(restoreEndingDraft(film,null).film,film);
});
test('matching valid saved edits restore without mutating the original, including an intentionally empty direction',()=>{
 const result=restoreEndingDraft(film,{film:{...film,name:'New ending'},direction:''});
 assert.equal(result.film?.name,'New ending');assert.equal(result.direction,'');assert.equal(film.name,'Original');
 const malformedHistory=restoreEndingDraft(film,{film:{...film,sourceMoment:{seconds:null},createdAt:null}}).film;
 assert.equal(malformedHistory?.sourceMoment,film.sourceMoment);assert.equal(malformedHistory?.createdAt,film.createdAt);
});
test('stale or malformed saved films cannot replace the current usable film',()=>{
 for(const saved of [{...film,id:'other'},null,{id:film.id},{...film,choices:null},{...film,opening:null},{...film,choices:[null,null]}])assert.equal(restoreEndingDraft(film,{film:saved}).film,film);
});
