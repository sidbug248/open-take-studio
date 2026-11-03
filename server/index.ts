import { config, rootDir, safeMessage } from './config.ts';
import express from 'express';
import { createServer } from 'node:http';
import path from 'node:path';
import { createStore } from './store.ts';
import { LocalFileStorage } from './media.ts';
import { createProjectRouter } from './project-routes.ts';
import { createGenerationRouter } from './generation-routes.ts';
import { routerPort } from './router-port.ts';
import { GenerationWorker } from './worker.ts';
import { createSceneRouter } from './scene-routes.ts';
import { createFilmRouter } from './film-routes.ts';
import { createCatalogueRouter } from './catalogue-routes.ts';
import { createMotionRouter } from './motion-routes.ts';
import { createSpatialRouter } from './spatial-routes.ts';
import { createPlayableRouter } from './playable-routes.ts';
import { createPresentationRouter } from './media-presentation.ts';
import { WorkflowWorker } from './workflow-worker.ts';
import { workflowPort } from './workflow-port.ts';
import { createWorkflowRouter } from './workflow-routes.ts';
import { createAudioMixRouter } from './audio-mix.ts';
import { createObjectRoomRouter } from './object-room-routes.ts';
import {ExploreService} from './explore-service.ts';
import {createExploreRouter} from './explore-routes.ts';
import {DisplayPreparationWorker} from './display-worker.ts';
import {createProductionDelivery} from './http-delivery.ts';
import {AuthSessions,createAuthRouter} from './auth-session.ts';
import {securityBoundary,createRuntimeAdmission} from './runtime-security.ts';
import {projectAuthorization} from './auth-access.ts';
import {WorkspaceBackupService,createRuntimeBackupRouter} from './runtime-backup.ts';

const store=createStore(config.dataDir);
const media=new LocalFileStorage(config.dataDir);
const worker=new GenerationWorker(store,media,routerPort,{keyConfigured:()=>config.keyConfigured});
const workflowWorker=new WorkflowWorker(store,media,workflowPort,()=>config.keyConfigured);
const explore=new ExploreService(store,media),displayWorker=new DisplayPreparationWorker(store,media);
const backupService=new WorkspaceBackupService(store);
let shuttingDown=false;
const app=express();app.disable('x-powered-by');
app.use((_req,res,next)=>{if(shuttingDown){res.status(503).setHeader('Retry-After','10');res.end('Studio is restarting; saved jobs will recover.');return;}next();});
app.set('trust proxy',config.trustProxyHops);
app.use(securityBoundary(config));
app.get('/api/health',(_req,res)=>res.json(config.mode==='hosted'?{ok:true,version:'0.1.0'}:{ok:true,keyConfigured:config.keyConfigured,version:'0.1.0',storagePath:config.dataDir,sdkVersion:'0.5.0'}));
const sessions=new AuthSessions(store,config);
app.use(sessions.identify());
app.use(createAuthRouter(sessions));
app.use(sessions.gate());
app.get('/api/studio/status',(_req,res)=>{res.setHeader('Cache-Control','no-store');res.json({ok:true,version:'0.1.0',keyConfigured:config.keyConfigured,mode:config.mode,sdkVersion:'0.5.0'});});
app.use('/api',(_req,res,next)=>{res.setHeader('Cache-Control','no-store');next();});
app.use(express.json({limit:'2mb'}));
app.use('/api',projectAuthorization(store),createRuntimeAdmission(store,config));
app.use('/api',createRuntimeBackupRouter(store,backupService));
app.use('/api',createExploreRouter(explore,displayWorker));
app.use('/api',createGenerationRouter(store,media,worker));
app.use('/api',createWorkflowRouter(store,media,workflowWorker,workflowPort));
app.use('/api',createPresentationRouter(store,media));
app.use('/api',createAudioMixRouter(store,media));
app.use('/api',createObjectRoomRouter(store,media));
app.use('/api',createCatalogueRouter(store));
app.use('/api',createMotionRouter(store,media));
app.use('/api',createSpatialRouter(store,media));
app.use('/api',createPlayableRouter(store,media));
app.use('/api',createSceneRouter(store,media));
app.use('/api',createFilmRouter(store,media));
app.use('/api',createProjectRouter(store,media));
app.use('/api',(_req,res)=>res.status(404).json({error:'API route not found.'}));
const server=createServer(app);
if(process.argv.includes('--production')||config.mode==='hosted'){
  app.use(createProductionDelivery(path.join(rootDir,'dist'),explore));
}else{
  const {createServer:createViteServer}=await import('vite');
  const vite=await createViteServer({root:rootDir,server:{middlewareMode:true,ws:{server},allowedHosts:['127.0.0.1','localhost']},appType:'spa'});
  app.use(vite.middlewares);
}
app.use((err:unknown,_req:express.Request,res:express.Response,_next:express.NextFunction)=>{if(!res.headersSent)res.status((err as {status?:number}).status||500).json({error:safeMessage(err)});});
server.maxConnections=100;server.headersTimeout=15000;server.requestTimeout=120000;
server.listen(config.port,config.bindHost,()=>{worker.start();workflowWorker.start();displayWorker.start();if(config.mode==='hosted')backupService.start();console.log('Open Take Studio: '+(config.publicOrigin||'http://127.0.0.1:'+config.port));console.log(`Router credentials: ${config.keyConfigured?'configured on server':'missing — add COMFY_API_KEY to '+path.join(rootDir,'.env')}`);});
server.on('error',err=>{console.error(safeMessage(err));process.exitCode=1;});
async function close(){
  if(shuttingDown)return;shuttingDown=true;
  const connectionsClosed=new Promise<void>(resolve=>server.close(()=>resolve()));
  const deadline=setTimeout(()=>{console.error('Shutdown deadline reached; persisted jobs will recover on restart.');process.exit(0);},28000);deadline.unref();
  const [routerDrained,nativeDrained]=await Promise.all([worker.drain(24000),workflowWorker.drain(24000),displayWorker.stop(),backupService.stop().catch(()=>undefined),connectionsClosed]);
  if(routerDrained&&nativeDrained){store.close();clearTimeout(deadline);process.exit(0);}
  // Do not close SQLite under an unfinished remote callback. The process exits
  // at the deadline; the last durable request identity remains recoverable.
}
process.on('SIGINT',close);process.on('SIGTERM',close);
