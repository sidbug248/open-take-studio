import {Router,type ErrorRequestHandler} from 'express';
import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import type {Store} from './store.ts';
import type {LocalFileStorage} from './media.ts';
import type {Asset,Take} from '../shared/types.ts';
import type {ObjectRoomDocument,ObjectRoomSaved} from '../shared/object-room-types.ts';
import {objectRoomSchema,ObjectRoomError} from './object-room-schema.ts';
import {sceneFromAsset,resolveSpatialScene} from './spatial-routes.ts';
import {exportObjectRoom} from './object-room-export.ts';
export function roomFromAsset(asset:Asset):ObjectRoomDocument{if(asset.metadata.operation!=='object-room')throw new ObjectRoomError('Choose a saved Object Room');return objectRoomSchema.parse(asset.metadata.objectRoom);}
export async function resolveObjectRoom(store:Store,media:LocalFileStorage,projectId:string,raw:unknown){
  const document=objectRoomSchema.parse(raw),source=store.getAsset(document.sceneAssetId);if(!source||source.projectId!==projectId)throw new ObjectRoomError('The room scene must belong to this project');
  const scene=await resolveSpatialScene(store,media,projectId,sceneFromAsset(source));
  for(const view of document.views){if(!scene.cameraViews.some(camera=>camera.id===view.cameraViewId))throw new ObjectRoomError(`The camera for ${view.name} is missing from the saved scene`);for(const[id,kind]of [[view.imageAssetId,'image'],[view.audioAssetId,'audio']] as const)if(id){const asset=store.getAsset(id);if(!asset||asset.projectId!==projectId||asset.kind!==kind)throw new ObjectRoomError(`${view.name} needs a saved ${kind} from this project`);}}
  return{document,scene,source};
}
export async function saveObjectRoom(store:Store,media:LocalFileStorage,projectId:string,raw:unknown,parentTakeId?:string):Promise<ObjectRoomSaved>{
  if(!store.getProject(projectId))throw new ObjectRoomError('Project not found',404);const{document,scene}=await resolveObjectRoom(store,media,projectId,raw),parent=parentTakeId?store.getTake(parentTakeId):undefined;if(parentTakeId&&(!parent||parent.projectId!==projectId))throw new ObjectRoomError('Parent take belongs to another project');
  const inputAssetIds={scene:document.sceneAssetId,models:[...new Set(scene.objects.flatMap(object=>object.assetId?[object.assetId]:[]))],cues:[...new Set(document.views.flatMap(view=>[view.imageAssetId,view.audioAssetId].filter((value):value is string=>!!value)))]};
  const previewAssetId=document.views.find(view=>view.imageAssetId)?.imageAssetId;
  const asset=await media.put({projectId,name:`${document.name}.object-room.json`,mimeType:'application/json',bytes:Buffer.from(JSON.stringify({format:'open-take-object-room',version:1,document},null,2)),provenance:'local-edit',metadata:{operation:'object-room',objectRoom:document,sourceAssetId:document.sceneAssetId,...(previewAssetId?{previewAssetId,previewDescription:'Saved image cue from this room; open the room for its actual interactive geometry'}:{}),inputAssetIds,renderer:'Three.js',editable:true}});
  const timestamp=new Date().toISOString(),take:Take={id:randomUUID(),projectId,name:document.name,kind:'document',parentTakeId:parent?.id,sourceAssetId:document.sceneAssetId,inputAssetIds,assetIds:[asset.id],modelId:'local/object-room',provider:'local',prompt:document.description,settings:{operation:'object-room',objectRoom:document},status:'LOCAL',provenance:'local-edit',favorite:false,createdAt:timestamp,updatedAt:timestamp,changes:parent?[{field:'settings',before:parent.settings,after:{operation:'object-room',objectRoom:document}}]:[]};
  store.transaction(()=>{store.upsertAsset(asset);store.upsertTake(take);store.upsertProject({...store.getProject(projectId)!,selectedTakeId:take.id,updatedAt:timestamp});});return{asset,take,document,scene};
}
export function createObjectRoomRouter(store:Store,media:LocalFileStorage):Router{
  const router=Router();
  router.post('/projects/:id/object-rooms',async(req,res)=>{const body=z.object({document:objectRoomSchema,parentTakeId:z.string().min(1).max(128).optional()}).strict().parse(req.body);res.status(201).json(await saveObjectRoom(store,media,String(req.params.id),body.document,body.parentTakeId));});
  router.get('/assets/:id/object-room',async(req,res)=>{const asset=store.getAsset(String(req.params.id));if(!asset)throw new ObjectRoomError('Object Room not found',404);const{document,scene}=await resolveObjectRoom(store,media,asset.projectId,roomFromAsset(asset));res.json({asset,document,scene,take:store.listTakes(asset.projectId).find(take=>take.assetIds.includes(asset.id))});});
  router.get('/assets/:id/object-room/export',async(req,res)=>{const asset=store.getAsset(String(req.params.id));if(!asset)throw new ObjectRoomError('Object Room not found',404);const{document,scene}=await resolveObjectRoom(store,media,asset.projectId,roomFromAsset(asset));res.attachment(`${document.name.replace(/[^A-Za-z0-9_-]/g,'-')}.object-room.zip`).type('application/zip').send(await exportObjectRoom(store,media,asset,document,scene));});
  router.use(((error,_req,res,next)=>{if(error instanceof z.ZodError){res.status(400).json({error:error.issues.map(issue=>issue.message).join('; ')});return;}next(error);}) as ErrorRequestHandler);
  return router;
}
