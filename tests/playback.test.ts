import test from 'node:test';
import assert from 'node:assert/strict';
import { PlaybackCoordinator } from '../client/playback';

function preview(coordinator:PlaybackCoordinator,id:string,priority:number,scope?:string){let running=false;const handle=coordinator.register({id,scope,priority,visibleRatio:1,eligible:true,onGrant:()=>{running=true;},onRevoke:()=>{running=false;}});return {...handle,running:()=>running};}
test('discovery budget favors hero and visible previews, then reallocates offscreen capacity',()=>{
 const coordinator=new PlaybackCoordinator();coordinator.configure({budget:2});const hero=preview(coordinator,'hero',100),first=preview(coordinator,'first',10),second=preview(coordinator,'second',9);
 assert.equal(hero.running(),true);assert.equal(first.running(),true);assert.equal(second.running(),false);
 hero.update({visibleRatio:0});assert.equal(hero.running(),false);assert.equal(second.running(),true);
 coordinator.configure({hidden:true});assert.equal(first.running(),false);assert.equal(second.running(),false);
 coordinator.configure({hidden:false});assert.equal(first.running(),true);assert.equal(second.running(),true);
});
test('an explicit comparison owns both clips and suspends discovery until released',()=>{
 const coordinator=new PlaybackCoordinator(),hero=preview(coordinator,'hero',100);let interrupted=0;
 const release=coordinator.acquire('comparison',()=>interrupted++);assert.equal(hero.running(),false);assert.equal(coordinator.getOwner(),'comparison');
 const releaseFilm=coordinator.acquire('film',()=>{});assert.equal(interrupted,1);release();assert.equal(coordinator.getOwner(),'film');assert.equal(hero.running(),false);
 releaseFilm();assert.equal(hero.running(),true);assert.equal(coordinator.getOwner(),null);
});
test('reduced motion and data saving require a deliberate preview request',()=>{
 const coordinator=new PlaybackCoordinator();coordinator.configure({reduced:true,budget:0});const card=preview(coordinator,'card',10);
 assert.equal(card.running(),false);card.update({explicit:true});assert.equal(card.running(),true);card.update({eligible:false});assert.equal(card.running(),false);
});
test('owner-scoped ending previews may run while unrelated discovery stays suspended',()=>{
 const coordinator=new PlaybackCoordinator(),hero=preview(coordinator,'hero',100),choice=preview(coordinator,'choice',10,'film');
 coordinator.acquire('film',()=>{});assert.equal(hero.running(),false);assert.equal(choice.running(),true);
});
test('hidden pages interrupt explicit ownership once and preserve caller-owned state',()=>{
 const coordinator=new PlaybackCoordinator();let interruptions=0,playhead=2.75;
 coordinator.acquire('sound',()=>{interruptions++;});coordinator.configure({hidden:true});coordinator.configure({hidden:true});
 assert.equal(interruptions,1);assert.equal(playhead,2.75);assert.equal(coordinator.getOwner(),'sound');
});
test('reacquiring the same session does not let a stale cleanup release its new token',()=>{
 const coordinator=new PlaybackCoordinator();let interruptions=0;const oldRelease=coordinator.acquire('film',()=>interruptions++),newRelease=coordinator.acquire('film',()=>interruptions++);
 oldRelease();assert.equal(coordinator.getOwner(),'film');assert.equal(interruptions,0);newRelease();assert.equal(coordinator.getOwner(),null);
});
test('a scrolled-away explicit preview releases its lease so visible discovery resumes',()=>{
 const coordinator=new PlaybackCoordinator(),hero=preview(coordinator,'hero',100),card=preview(coordinator,'card',10,'card-session');
 const release=coordinator.acquire('card-session',()=>{});card.update({explicit:true});
 assert.equal(card.running(),true);assert.equal(hero.running(),false);
 card.update({visibleRatio:0,explicit:false});release();
 assert.equal(card.running(),false);assert.equal(hero.running(),true);assert.equal(coordinator.getOwner(),null);
 card.update({visibleRatio:1});assert.equal(card.running(),true);
});
test('an interrupted discovery owner can release immediately without releasing the new creative session',()=>{
 const coordinator=new PlaybackCoordinator(),hero=preview(coordinator,'hero',100);let releasePreview=()=>{};
 releasePreview=coordinator.acquire('preview',()=>releasePreview());const releaseFilm=coordinator.acquire('film',()=>{});
 assert.equal(coordinator.getOwner(),'film');assert.equal(hero.running(),false);releaseFilm();assert.equal(hero.running(),true);
});
test('hidden-page preview cleanup resumes visible discovery when the page returns',()=>{
 const coordinator=new PlaybackCoordinator(),hero=preview(coordinator,'hero',100);let releasePreview=()=>{};
 releasePreview=coordinator.acquire('preview',()=>releasePreview());coordinator.configure({hidden:true});assert.equal(coordinator.getOwner(),null);assert.equal(hero.running(),false);
 coordinator.configure({hidden:false});assert.equal(hero.running(),true);
});
