import { useEffect, useRef } from 'react';

export function useDialog(onClose:()=>void,active=true){
  const ref=useRef<HTMLElement>(null),close=useRef(onClose);close.current=onClose;
  useEffect(()=>{if(!active)return;const opener=document.activeElement as HTMLElement|null;const nodes=()=>Array.from(ref.current?.querySelectorAll<HTMLElement>('button:not(:disabled),a[href],input:not(:disabled),textarea:not(:disabled),select:not(:disabled),summary,[tabindex="0"]')||[]).filter(element=>element.getClientRects().length>0);nodes()[0]?.focus();
    const key=(event:KeyboardEvent)=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close.current();return;}if(event.key!=='Tab')return;const list=nodes(),first=list[0],last=list.at(-1);if(!list.length){event.preventDefault();return;}if(event.shiftKey&&(document.activeElement===first||!ref.current?.contains(document.activeElement))){event.preventDefault();last?.focus();}else if(!event.shiftKey&&(document.activeElement===last||!ref.current?.contains(document.activeElement))){event.preventDefault();first?.focus();}};
    document.addEventListener('keydown',key,true);return()=>{document.removeEventListener('keydown',key,true);if(opener?.isConnected)opener.focus();};
  },[active]);return ref;
}
