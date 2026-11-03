import type {RequestHandler} from 'express';
import {statfs} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import type {RuntimeConfig} from './runtime-config.ts';
import type {Store} from './store.ts';
export function securityBoundary(settings:RuntimeConfig):RequestHandler{return(req,res,next)=>{
  const expected=settings.mode==='hosted'?new URL(settings.publicOrigin!).host:undefined,host=(req.headers.host??'').toLowerCase();
  const localHosts=[`127.0.0.1:${settings.port}`,`localhost:${settings.port}`],health=req.path==='/api/health'&&['GET','HEAD'].includes(req.method);
  if(settings.mode==='hosted'?(host!==expected&&!(health&&localHosts.includes(host))):!localHosts.includes(host)){res.status(403).json({error:'This host is not allowed.'});return;}
  const origin=req.headers.origin,allowed=settings.mode==='hosted'?[settings.publicOrigin!]:localHosts.map(host=>'http://'+host);
  if(origin&&!allowed.includes(origin)){res.status(403).json({error:'Cross-origin access is not allowed.'});return;}
  if(settings.mode==='hosted'&&!health){
    if(!req.secure){res.status(400).json({error:'HTTPS is required.'});return;}
    if(!['GET','HEAD','OPTIONS'].includes(req.method)&&(!origin||!allowed.includes(origin))){res.status(403).json({error:'A same-origin request is required.'});return;}
    res.setHeader('Strict-Transport-Security','max-age=31536000');
    res.setHeader('Content-Security-Policy',"object-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
  }
  res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Frame-Options','DENY');
  if(/^\/(?:\.env(?:[./]|$)|\.git(?:\/|$)|data(?:\/|$)|imports(?:\/|$)|artifacts(?:\/|$)|server(?:\/|$)|scripts(?:\/|$)|node_modules(?:\/|$))/i.test(req.path)){res.status(403).type('text/plain').send('Private workspace files are not served.');return;}
  next();
};}
export function createRuntimeAdmission(store:Store,settings:RuntimeConfig,freeBytes:()=>Promise<number>=async()=>{const disk=await statfs(settings.dataDir);return disk.bavail*disk.bsize;}):RequestHandler {
  if(settings.mode==='local')return(_req,_res,next)=>next();
  store.db.exec('CREATE TABLE IF NOT EXISTS runtime_admissions (identity TEXT PRIMARY KEY, kind TEXT NOT NULL, admitted_at INTEGER NOT NULL); CREATE INDEX IF NOT EXISTS runtime_admissions_kind_time ON runtime_admissions(kind,admitted_at);');
  let activeWrites=0,pendingGenerations=0,activeHeavyReads=0;
  const minuteBuckets=new Map<string,{count:number;end:number}>();
  return async(req,res,next)=>{const write=!['GET','HEAD','OPTIONS'].includes(req.method),heavyRead=!write&&/(?:export|package|waveform|thumbnail|presentation|poster)(?:\/|$)/.test(req.path);let release:(()=>void)|undefined;
    try{
      if(heavyRead){if(activeHeavyReads>=1){res.setHeader('Retry-After','3');res.status(429).json({error:'Another export or preview preparation is running. Try again shortly.'});return;}activeHeavyReads++;let released=false;release=()=>{if(!released){released=true;activeHeavyReads--;}};res.once('finish',release);res.once('close',release);}
      if(!write){next();return;}
      const migration=/^\/runtime\/migrations(?:\/|$)/.test(req.path),now=Date.now(),upload=(req.headers['content-type']??'').startsWith('multipart/form-data');
      for(const[key,bucket]of minuteBuckets)if(bucket.end<=now)minuteBuckets.delete(key);
      for(const[kind,limit]of[[migration?'migration':'write',migration?6000:settings.maxWriteRequestsPerMinute],...(upload?[['upload',settings.maxUploadsPerMinute] as const]:[])] as const){const bucket=minuteBuckets.get(kind)??{count:0,end:now+60000};if(bucket.count>=limit){res.setHeader('Retry-After',String(Math.max(1,Math.ceil((bucket.end-now)/1000))));res.status(429).json({error:'Workspace request limit reached. Try again shortly.'});return;}bucket.count++;minuteBuckets.set(kind,bucket);}
      if(activeWrites>=(migration?8:settings.maxConcurrentWrites)){res.setHeader('Retry-After','3');res.status(429).json({error:'The workspace is finishing other uploads or renders. Try again shortly.'});return;}
      if(Number(req.headers['content-length']??0)>310*1024*1024){res.status(413).json({error:'Request exceeds the 310 MiB hosted limit.'});return;}
      activeWrites++;let released=false,generationReserved=false;release=()=>{if(!released){released=true;activeWrites--;if(generationReserved)pendingGenerations--;}};res.once('finish',release);res.once('close',release);
      let bytes=0;req.on('data',(chunk:Buffer)=>{bytes+=chunk.length;if(bytes>310*1024*1024&&!res.headersSent){res.status(413).json({error:'Request exceeds the 310 MiB hosted limit.'});res.once('finish',()=>req.destroy());}});
      if(await freeBytes()<settings.minFreeDiskBytes){res.status(507).json({error:'Persistent storage is nearly full. Download a backup and expand the disk before adding more work.'});return;}
      if(req.path==='/generate'||/^\/workflows\/[^/]+\/run$/.test(req.path)||/^\/(?:jobs|workflow-jobs)\/[^/]+\/retry$/.test(req.path)){
        const native=/^\/workflows\//.test(req.path),assetId=native?req.path.split('/')[2]:undefined,projectId=native?store.getAsset(assetId!)?.projectId:req.body?.projectId;
        const clientId=req.body?.clientRequestId,identity=typeof clientId==='string'&&typeof projectId==='string'?(native?`native:${projectId}:${clientId}`:createHash('sha256').update(`ots:${projectId}:${clientId}`).digest('hex')):req.path;
        const previous=store.getJobByIdempotencyKey(identity);
        if(!previous){const count=(store.db.prepare("SELECT count(*) AS n FROM job_status s WHERE state IN ('PENDING','SUBMITTING','IN_QUEUE','IN_PROGRESS','COLLECTING','RETRY_WAIT') AND NOT EXISTS(SELECT 1 FROM archived_jobs a WHERE a.job_id=s.id)").get() as {n:number}).n;
          if(count+pendingGenerations>=settings.maxActiveJobs){res.setHeader('Retry-After','10');res.status(429).json({error:'The workspace has reached its active generation limit.'});return;}
          store.db.prepare('DELETE FROM runtime_admissions WHERE admitted_at<?').run(now-3600000);
          const seen=store.db.prepare('SELECT 1 FROM runtime_admissions WHERE identity=?').get(identity),admitted=(store.db.prepare("SELECT count(*) AS n FROM runtime_admissions WHERE kind='generation'").get() as {n:number}).n;
          if(!seen&&admitted>=settings.maxGenerationPerHour){res.setHeader('Retry-After','3600');res.status(429).json({error:'The hourly generation limit has been reached.'});return;}
          if(!seen)store.db.prepare("INSERT INTO runtime_admissions VALUES(?,'generation',?)").run(identity,now);
          pendingGenerations++;generationReserved=true;
        }
      }
      next();
    }catch(error){release?.();next(error);}
  };
}
