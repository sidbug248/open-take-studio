import { useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowUpRight, Search, X, type LucideIcon } from 'lucide-react';
import { useDialog } from './useDialog';

export type Instrument={id:string;name:string;description:string;icon:LucideIcon;section:string};
export function InstrumentMenu({items,onChoose,onClose}:{items:Instrument[];onChoose:(id:string)=>void;onClose:()=>void}){
 const [query,setQuery]=useState('');const dialog=useDialog(onClose);
 const shown=items.filter(item=>`${item.name} ${item.description} ${item.section}`.toLowerCase().includes(query.toLowerCase()));
 return createPortal(<div className="instrument-backdrop" onClick={onClose}><section ref={dialog} className="instrument-menu" role="dialog" aria-modal="true" aria-label="Find a creative instrument" onClick={event=>event.stopPropagation()}><header><Search size={20}/><input autoFocus aria-label="Search instruments" placeholder="What do you want to make or change?" value={query} onChange={event=>setQuery(event.target.value)}/><button className="icon-button" aria-label="Close instruments" onClick={onClose}><X size={19}/></button></header><div className="instrument-results">{[...new Set(shown.map(item=>item.section))].map(section=><section key={section}><h2>{section}</h2>{shown.filter(item=>item.section===section).map(item=><button key={item.id} onClick={()=>onChoose(item.id)}><span><item.icon size={20}/></span><div><strong>{item.name}</strong><small>{item.description}</small></div><ArrowUpRight size={16}/></button>)}</section>)}{!shown.length&&<p>No instrument matches. Try image, sound, scene, or history.</p>}</div><footer>Everything stays connected to this project.<kbd>Esc</kbd></footer></section></div>,document.body);
}
