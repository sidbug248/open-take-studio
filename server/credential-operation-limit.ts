/** Shared across every workspace; bounded queues do not grow with reviewer count. */
export function operationLimit(maxActive:number,maxWaiting=32){
  let active=0;const waiting:{resolve:(release:()=>void)=>void;reject:(error:Error)=>void;timer:ReturnType<typeof setTimeout>}[]=[];
  const release=()=>{const next=waiting.shift();if(next){clearTimeout(next.timer);next.resolve(release);}else active--;};
  return async()=>{if(active<maxActive){active++;return release;}if(waiting.length>=maxWaiting)throw Object.assign(new Error('The studio is at its remote operation limit. Retry shortly.'),{httpStatus:429,retryAfter:5});return new Promise<()=>void>((resolve,reject)=>{const item={resolve,reject,timer:setTimeout(()=>{const index=waiting.indexOf(item);if(index>=0)waiting.splice(index,1);reject(Object.assign(new Error('Remote operation capacity is temporarily unavailable.'),{httpStatus:429,retryAfter:5}));},30000)};waiting.push(item);});};
}
