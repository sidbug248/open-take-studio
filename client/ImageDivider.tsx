import { useEffect,useRef,useState } from 'react';
import { ChevronsLeftRight } from 'lucide-react';
import type { Asset } from '../shared/types';

export function ImageDivider({left,right,storageKey}:{left:Asset;right:Asset;storageKey?:string}){
 const [position,setPosition]=useState(()=>{try{return storageKey?Math.max(0,Math.min(100,Number(localStorage.getItem(storageKey)||50))):50;}catch{return 50;}});
 useEffect(()=>{if(storageKey)try{localStorage.setItem(storageKey,String(position));}catch{}},[position,storageKey]);const surface=useRef<HTMLDivElement>(null);
 function move(clientX:number){const rect=surface.current?.getBoundingClientRect();if(rect)setPosition(Math.min(100,Math.max(0,(clientX-rect.left)/rect.width*100)));}
 return <div className="divider-comparison"><div ref={surface} className="divider-stage" onPointerDown={event=>{event.currentTarget.setPointerCapture(event.pointerId);move(event.clientX);}} onPointerMove={event=>{if(event.currentTarget.hasPointerCapture(event.pointerId))move(event.clientX);}}><img src={right.url} alt={`Take B: ${right.name}`}/><img className="divider-front" src={left.url} alt={`Take A: ${left.name}`} style={{clipPath:`inset(0 ${100-position}% 0 0)`}}/><span className="divider-label before">A · {left.name}</span><span className="divider-label after">B · {right.name}</span><div className="divider-handle" style={{left:`${position}%`}}><span><ChevronsLeftRight size={21}/></span></div><input type="range" aria-label="Image comparison divider" aria-valuetext={`${Math.round(position)} percent take A, ${100-Math.round(position)} percent take B`} min={0} max={100} step={1} value={position} onChange={event=>setPosition(Number(event.target.value))}/></div><p>Drag the divider. Arrow keys move 1%; Home and End reveal either take. Both images retain their full frame.</p></div>;
}
