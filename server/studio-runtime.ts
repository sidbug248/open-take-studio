import express,{Router} from 'express';
import {createStore, type Store} from './store.ts';
import {LocalFileStorage} from './media.ts';
import {createProjectRouter} from './project-routes.ts';
import {createGenerationRouter} from './generation-routes.ts';
import {createRouterPort,type RouterPort} from './router-port.ts';
import {GenerationWorker} from './worker.ts';
import {createSceneRouter} from './scene-routes.ts';
import {createFilmRouter} from './film-routes.ts';
import {createCatalogueRouter} from './catalogue-routes.ts';
import {createMotionRouter} from './motion-routes.ts';
import {createSpatialRouter} from './spatial-routes.ts';
import {createPlayableRouter} from './playable-routes.ts';
import {createPresentationRouter} from './media-presentation.ts';
import {WorkflowWorker} from './workflow-worker.ts';
import {createWorkflowPort,type WorkflowPort} from './workflow-port.ts';
import {createWorkflowRouter} from './workflow-routes.ts';
import {createAudioMixRouter} from './audio-mix.ts';
import {createObjectRoomRouter} from './object-room-routes.ts';
import {ExploreService} from './explore-service.ts';
import {createExploreRouter} from './explore-routes.ts';
import {DisplayPreparationWorker} from './display-worker.ts';
import {projectAuthorization} from './auth-access.ts';
import {createRuntimeAdmission} from './runtime-security.ts';
import {environmentCredentialSource,type CredentialSource} from './credential-source.ts';
import type {RuntimeConfig} from './runtime-config.ts';
import {createProductionGraphRouter,drainProductionGraphWork} from './production-graph.ts';
import {createReviewRouter,createSharedReviewRouter} from './review-routes.ts';
import {PublishingService} from './publishing.ts';
import {StudioMcpService} from './studio-mcp.ts';
import {drainDeliveryWork} from './delivery-package.ts';
import {createDocumentStoryRouter,drainDocumentStoryWork} from './document-story.ts';

export interface StudioRuntimeOptions {dataDir:string;settings:RuntimeConfig;credentials?:CredentialSource;routerPort?:RouterPort;workflowPort?:WorkflowPort;startWorkers?:boolean;workspaceId?:string;workspaceExpiresAt?:string;publishingAvailable?:()=>boolean;}
export interface StudioRuntime {store:Store;media:LocalFileStorage;explore:ExploreService;router:Router;worker:GenerationWorker;workflowWorker:WorkflowWorker;displayWorker:DisplayPreparationWorker;credentials:CredentialSource;publishing:PublishingService;mcp:StudioMcpService;sharedReview:Router;start():void;close():Promise<void>;}
/** Every route and background worker captures one immutable workspace repository.
 * A reviewer request can never fall through to the owner's repository. */
export function createStudioRuntime(options:StudioRuntimeOptions):StudioRuntime {
  const store=createStore(options.dataDir),media=new LocalFileStorage(options.dataDir),credentials=options.credentials??environmentCredentialSource;
  const remote=options.routerPort??createRouterPort(credentials),native=options.workflowPort??createWorkflowPort(credentials);
  const worker=new GenerationWorker(store,media,remote,{keyConfigured:()=>credentials.available(),credentialSource:credentials});
  const workflowWorker=new WorkflowWorker(store,media,native,()=>credentials.available(),credentials);
  const explore=new ExploreService(store,media),displayWorker=new DisplayPreparationWorker(store,media),router=Router();
  const workspaceId=options.workspaceId??'owner';
  const publishing=new PublishingService(store,media,{available:options.publishingAvailable,workspaceExpiresAt:options.workspaceExpiresAt}),mcp=new StudioMcpService(store,media,{workspaceId,workspaceExpiresAt:options.workspaceExpiresAt});
  const sharedReview=createSharedReviewRouter(store,media,{workspaceId,workspaceExpiresAt:options.workspaceExpiresAt,secureCookies:options.settings.mode==='hosted'});
  router.use(express.json({limit:'2mb'}));
  router.use((req,_res,next)=>{try{if(req.body&&credentials.available()&&JSON.stringify(req.body).includes(credentials.resolve().apiKey))throw Object.assign(new Error('Do not include an API key in creative content or settings. Use Connect Comfy.'),{status:400});next();}catch(error){next(error);}});
  router.use('/api',(_req,res,next)=>{res.setHeader('Cache-Control','no-store');next();});
  router.use('/api',projectAuthorization(store),createRuntimeAdmission(store,{...options.settings,dataDir:options.dataDir}));
  router.use('/api',createExploreRouter(explore,displayWorker));
  router.use('/api',createGenerationRouter(store,media,worker,credentials));
  router.use('/api',createWorkflowRouter(store,media,workflowWorker,native,credentials));
  router.use('/api',createPresentationRouter(store,media));
  router.use('/api',createAudioMixRouter(store,media));
  router.use('/api',createObjectRoomRouter(store,media));
  router.use('/api',createCatalogueRouter(store));
  router.use('/api',createMotionRouter(store,media));
  router.use('/api',createSpatialRouter(store,media));
  router.use('/api',createPlayableRouter(store,media));
  router.use('/api',createSceneRouter(store,media));
  router.use('/api',createFilmRouter(store,media));
  router.use('/api',createProductionGraphRouter(store,media));
  router.use('/api',createDocumentStoryRouter(store,media));
  router.use('/api',createReviewRouter(store,media,{workspaceId,workspaceExpiresAt:options.workspaceExpiresAt,secureCookies:options.settings.mode==='hosted'}));
  router.use('/api',publishing.managementRouter());
  router.use('/api',mcp.managementRouter());
  router.use('/api',createProjectRouter(store,media));
  router.use('/api',(_req,res)=>res.status(404).json({error:'API route not found.'}));
  let started=false,closed=false;
  const runtime:StudioRuntime={store,media,explore,router,worker,workflowWorker,displayWorker,credentials,publishing,mcp,sharedReview,
    start(){if(started)return;started=true;worker.start();workflowWorker.start();displayWorker.start();publishing.start();},
    async close(){if(closed)return;closed=true;const [a,b]=await Promise.all([worker.drain(24000),workflowWorker.drain(24000),displayWorker.stop(),publishing.stop(),drainProductionGraphWork(store),drainDocumentStoryWork(store),mcp.drain()]);await drainDeliveryWork(store);if(a&&b)store.close();},
  };
  if(options.startWorkers)runtime.start();return runtime;
}
