import { flushSync } from 'react-dom';

let active:ViewTransition|undefined;
/** Interruptible, state-backed transitions. No artificial loading or inferred progress. */
export function stageTransition(update:()=>void){
  if(!document.startViewTransition||document.documentElement.dataset.reducedMotion==='true'||matchMedia('(prefers-reduced-motion: reduce)').matches){update();return;}
  active?.skipTransition();
  active=document.startViewTransition(()=>flushSync(update));
  active.finished.catch(()=>{});
}
