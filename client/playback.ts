export type PreviewRegistration = {
  id:string; scope?:string; priority:number; visibleRatio:number; eligible:boolean; explicit?:boolean;
  onGrant:()=>void; onRevoke:()=>void;
};
type Environment={hidden:boolean;reduced:boolean;budget:number};

/** One explicit creative session owns sound; discovery shares a bounded silent budget. */
export class PlaybackCoordinator {
  private previews=new Map<string,PreviewRegistration>();
  private granted=new Set<string>();
  private owner:{id:string;token:symbol;interrupt:()=>void}|null=null;
  private listeners=new Set<(owner:string|null)=>void>();
  private environment:Environment={hidden:false,reduced:false,budget:4};
  getOwner(){return this.owner?.id||null;}
  subscribe(listener:(owner:string|null)=>void){this.listeners.add(listener);listener(this.getOwner());return()=>{this.listeners.delete(listener);};}
  configure(environment:Partial<Environment>){const wasHidden=this.environment.hidden;this.environment={...this.environment,...environment};if(this.environment.hidden&&!wasHidden&&this.owner)this.owner.interrupt();this.reconcile();}
  acquire(id:string,interrupt:()=>void){const prior=this.owner,token=Symbol(id);this.owner={id,token,interrupt};if(prior&&prior.id!==id)prior.interrupt();this.notify();this.reconcile();return()=>{if(this.owner?.token!==token)return;this.owner=null;this.notify();this.reconcile();};}
  register(preview:PreviewRegistration){this.remove(preview.id);this.previews.set(preview.id,preview);this.reconcile();return {update:(next:Partial<Omit<PreviewRegistration,'id'>>)=>{const current=this.previews.get(preview.id);if(current){Object.assign(current,next);this.reconcile();}},release:()=>this.remove(preview.id)};}
  pauseDiscovery(){for(const id of this.granted)this.previews.get(id)?.onRevoke();this.granted.clear();}
  private notify(){for(const listener of this.listeners)listener(this.getOwner());}
  private remove(id:string){if(this.granted.delete(id))this.previews.get(id)?.onRevoke();this.previews.delete(id);this.reconcile();}
  private reconcile(){
    const env=this.environment;
    const candidates=env.hidden?[]:[...this.previews.values()].filter(item=>item.eligible&&item.visibleRatio>=.25&&(!env.reduced||item.explicit)&&(!this.owner||item.scope===this.owner.id)).sort((a,b)=>Number(!!b.explicit)-Number(!!a.explicit)||b.priority-a.priority||b.visibleRatio-a.visibleRatio);
    const capacity=env.budget===0?candidates.filter(item=>item.explicit).length:env.budget;
    const next=new Set(candidates.slice(0,capacity).map(item=>item.id));
    for(const id of this.granted)if(!next.has(id))this.previews.get(id)?.onRevoke();
    const previous=this.granted;this.granted=next;
    for(const id of next)if(!previous.has(id))this.previews.get(id)?.onGrant();
  }
}

export const playback=new PlaybackCoordinator();
export const acquirePlayback=(ownerId:string,onInterrupted:()=>void)=>playback.acquire(ownerId,onInterrupted);
export const subscribePlayback=(listener:(ownerId:string|null)=>void)=>playback.subscribe(listener);
export const getPlaybackOwner=()=>playback.getOwner();
export const registerDiscoveryPreview=(registration:PreviewRegistration)=>playback.register(registration);
export const pauseDiscovery=()=>playback.pauseDiscovery();
export function motionIsReduced(){return typeof window!=='undefined'&&(document.documentElement.dataset.reducedMotion==='true'||matchMedia('(prefers-reduced-motion: reduce)').matches);}
if(typeof window!=='undefined'){
  const query=matchMedia('(prefers-reduced-motion: reduce)');
  const update=()=>{
    const device=navigator as Navigator&{deviceMemory?:number;connection?:{saveData?:boolean}};
    const constrained=innerWidth<760||(device.deviceMemory!==undefined&&device.deviceMemory<=4)||(navigator.hardwareConcurrency>0&&navigator.hardwareConcurrency<=4);
    playback.configure({hidden:document.hidden,reduced:motionIsReduced(),budget:device.connection?.saveData?0:constrained?2:4});
  };
  document.addEventListener('visibilitychange',update);window.addEventListener('resize',update,{passive:true});window.addEventListener('ots:motion-preference',update);query.addEventListener('change',update);update();
}
