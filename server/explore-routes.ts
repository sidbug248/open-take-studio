import {Router,type ErrorRequestHandler} from 'express';
import {z} from 'zod';
import {ExploreService} from './explore-service.ts';
import type {DisplayPreparationWorker} from './display-worker.ts';

export function createExploreRouter(service:ExploreService,worker?:DisplayPreparationWorker){
  const router=Router(),asset=(id:string)=>{const found=service.store.getAsset(id);if(!found)throw Object.assign(new Error('Asset not found'),{status:404});return found;};
  router.get('/explore/bootstrap',async(_req,res)=>res.json(await service.bootstrap()));
  router.get('/explore/cards',async(req,res)=>res.json(await service.page(String(req.query.section??'all'),typeof req.query.cursor==='string'?req.query.cursor:undefined)));
  router.get('/explore/recipes',async(_req,res)=>res.json(await service.recipes()));
  router.get('/assets/:id/display',async(req,res)=>res.json(await service.displays.describe(asset(String(req.params.id)))));
  router.post('/assets/:id/display/prepare',async(req,res)=>{const source=asset(String(req.params.id)),options=z.object({hero:z.boolean().optional(),sourceInSeconds:z.number().finite().nonnegative().optional(),sourceOutSeconds:z.number().finite().positive().optional()}).strict().parse(req.body??{});if(!worker)throw Object.assign(new Error('Display preparation worker is unavailable'),{status:503});void worker.prepare(source.id,options).catch(()=>{});res.status(202).json({assetId:source.id,state:'preparing'});});
  router.get('/display/:id/:sha/:version/:file',async(req,res)=>{const source=asset(String(req.params.id));if(source.sha256!==req.params.sha){res.sendStatus(404);return;}let file:string;try{file=await service.displays.file(source,String(req.params.version),String(req.params.file));}catch{res.sendStatus(404);return;}const extension=file.split('.').at(-1)!;res.setHeader('Cache-Control','private, max-age=31536000, immutable');res.setHeader('ETag',`"${String(req.params.file).split('.')[0]}"`);res.setHeader('X-Content-Type-Options','nosniff');res.type(({webp:'image/webp',jpg:'image/jpeg',mp4:'video/mp4',glb:'model/gltf-binary'} as Record<string,string>)[extension]);res.sendFile(file);});
  router.use(((error,_req,res,next)=>{if(error instanceof z.ZodError){res.status(400).json({error:error.issues.map(issue=>issue.message).join('; ')});return;}next(error);}) as ErrorRequestHandler);
  return router;
}
