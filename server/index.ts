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

const store=createStore(config.dataDir);
const media=new LocalFileStorage(config.dataDir);
const worker=new GenerationWorker(store,media,routerPort,{keyConfigured:()=>config.keyConfigured});
const workflowWorker=new WorkflowWorker(store,media,workflowPort,()=>config.keyConfigured);
const explore=new ExploreService(store,media),displayWorker=new DisplayPreparationWorker(store,media);
const app=express();app.disable('x-powered-by');
app.use((req,res,next)=>{
  // Loopback-only studio. Reject hostile browser origins / DNS rebinding.
  const host=(req.headers.host||'').split(':')[0];
  if(!['127.0.0.1','localhost'].includes(host)){res.status(403).json({error:'Local access only.'});return;}
  const origin=req.headers.origin;
  if(origin&&!['http://127.0.0.1:'+config.port,'http://localhost:'+config.port].includes(origin)){res.status(403).json({error:'Cross-origin requests are not allowed.'});return;}
  res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');next();
});
app.use('/api',(_req,res,next)=>{res.setHeader('Cache-Control','no-store');next();});
app.use((req,res,next)=>{if(/^\/(?:\.env(?:[./]|$)|\.git(?:\/|$)|data(?:\/|$)|imports(?:\/|$)|artifacts(?:\/|$)|server(?:\/|$)|scripts(?:\/|$))/i.test(req.path)){res.status(403).type('text/plain').send('Private project files are not served.');return;}next();});
app.use(express.json({limit:'2mb'}));
app.get('/api/health',(_req,res)=>res.json({ok:true,keyConfigured:config.keyConfigured,version:'0.1.0',storagePath:config.dataDir,sdkVersion:'0.5.0'}));
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
if(process.argv.includes('--production')){
  app.use(createProductionDelivery(path.join(rootDir,'dist'),explore));
}else{
  const {createServer:createViteServer}=await import('vite');
  const vite=await createViteServer({root:rootDir,server:{middlewareMode:true,ws:{server},allowedHosts:['127.0.0.1','localhost']},appType:'spa'});
  app.use(vite.middlewares);
}
app.use((err:unknown,_req:express.Request,res:express.Response,_next:express.NextFunction)=>{res.status((err as {status?:number}).status||500).json({error:safeMessage(err)});});
server.listen(config.port,'127.0.0.1',()=>{worker.start();workflowWorker.start();displayWorker.start();console.log(`Open Take Studio: http://127.0.0.1:${config.port}`);console.log(`Router credentials: ${config.keyConfigured?'configured on server':'missing — add COMFY_API_KEY to '+path.join(rootDir,'.env')}`);});
server.on('error',err=>{console.error(safeMessage(err));process.exitCode=1;});
async function close(){worker.stop();workflowWorker.stop();await displayWorker.stop();server.close(()=>{store.close();process.exit(0);});setTimeout(()=>process.exit(0),3000).unref();}
process.on('SIGINT',close);process.on('SIGTERM',close);
