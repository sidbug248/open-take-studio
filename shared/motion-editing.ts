import type { MotionComposition } from './motion-types';
const clamp=(value:number,min:number,max:number)=>Math.max(min,Math.min(max,value));
export function moveMotionBeat(composition:MotionComposition,index:number,time:number):MotionComposition {
  if(!Number.isFinite(time)||index<0||index>=composition.beats.length)return composition;
  return {...composition,beats:composition.beats.map((value,i)=>i===index?clamp(time,0,composition.duration-.01):value)};
}
export function moveMotionCue(composition:MotionComposition,id:string,start:number):MotionComposition {
  if(!Number.isFinite(start))return composition;
  return {...composition,cues:composition.cues.map(cue=>{if(cue.id!==id)return cue;const length=cue.end-cue.start,next=clamp(start,0,composition.duration-length);return {...cue,start:next,end:next+length};})};
}
export type MotionTreatment='chrome'|'paper'|'night';
export function applyMotionTreatment(composition:MotionComposition,treatment:MotionTreatment):MotionComposition {
  const looks={chrome:{shape:'torus',background:'#121422',accent:'#b5efff',textColor:'#f4f5f6',cameraOrbit:.3},paper:{shape:'orb',background:'#e8dcc7',accent:'#e95535',textColor:'#292124',cameraOrbit:.16},night:{shape:'knot',background:'#151029',accent:'#ba8bff',textColor:'#f6ede5',cameraOrbit:.45}} as const;
  return {...composition,...looks[treatment]};
}
