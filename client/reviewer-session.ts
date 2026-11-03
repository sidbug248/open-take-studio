import type {StudioStatus} from './ReviewerConnect';

export type WorkspaceStorage = Pick<Storage,'getItem'|'setItem'|'removeItem'> & {promote:(status:StudioStatus)=>void};

/** Visitors cannot read an owner's saved browser state, and allocate no persistent namespace. */
export function createWorkspaceStorage(initial:StudioStatus, persistent:Pick<Storage,'getItem'|'setItem'|'removeItem'>):WorkspaceStorage {
  let status=initial;
  const draft=new Map<string,string>();
  const key=(name:string)=>status.accessMode==='reviewer'?`reviewer:${status.workspaceId}:${name}`:name;
  return {
    getItem(name){if(status.accessMode==='visitor')return draft.get(name)??null;try{return persistent.getItem(key(name));}catch{return null;}},
    setItem(name,value){if(status.accessMode==='visitor')draft.set(name,value);else persistent.setItem(key(name),value);},
    removeItem(name){if(status.accessMode==='visitor')draft.delete(name);else persistent.removeItem(key(name));},
    promote(next){
      if(status.accessMode!=='visitor'||next.accessMode!=='reviewer'||!next.workspaceId)throw new Error('Invalid workspace promotion.');
      status=next;
      for(const [name,value]of draft){try{persistent.setItem(key(name),value);}catch{/* Live state still survives a full browser storage quota. */}}
      draft.clear();
    },
  };
}

export class ReviewerSessionUnavailableError extends Error {
  constructor(readonly reason:'capacity'|'unavailable',readonly retryAfterSeconds?:number){
    super(reason==='capacity'?'Private workspaces are busy right now. Your idea and selected files are still here. Try again shortly.':'Your private workspace could not open yet. Your idea and selected files are still here. Please try again.');
    this.name='ReviewerSessionUnavailableError';
  }
}
export function isReviewerSessionUnavailable(error:unknown):error is ReviewerSessionUnavailableError{return error instanceof ReviewerSessionUnavailableError;}

export async function requestReviewerSession():Promise<StudioStatus>{
  let response:Response;
  try{response=await fetch('/api/reviewer/session',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});}catch{throw new ReviewerSessionUnavailableError('unavailable');}
  const value=await response.json().catch(()=>({}));
  if(!response.ok){const retry=Number(value.retryAfterSeconds||response.headers.get('Retry-After'));throw new ReviewerSessionUnavailableError(response.status===429&&value.code==='reviewer_capacity'?'capacity':'unavailable',Number.isFinite(retry)&&retry>0?retry:undefined);}
  if(value.accessMode!=='reviewer'||!value.workspaceId)throw new ReviewerSessionUnavailableError('unavailable');
  return value as StudioStatus;
}

/** Requests run only on an explicit editing/connect intent; concurrent intents share one session. */
export function createWorkspacePromoter(read:()=>StudioStatus,accept:(status:StudioStatus)=>void,request=requestReviewerSession){
  let pending:Promise<StudioStatus>|undefined;
  return function ensureWorkspace():Promise<StudioStatus>{
    const current=read();
    if(current.accessMode!=='visitor')return Promise.resolve(current);
    if(pending)return pending;
    pending=request().then(next=>{accept(next);return next;}).finally(()=>{pending=undefined;});
    return pending;
  };
}
