import type {Request,RequestHandler} from 'express';
import type {Store} from './store.ts';
export type StudioPermission='read'|'write'|'generate'|'share';
export interface AccessContext {kind:'local-owner'|'workspace-owner'|'scoped-token';subjectId:string;projectIds?:readonly string[];permissions:readonly StudioPermission[];}
const contexts=new WeakMap<Request,AccessContext>();
export const accessFor=(request:Request)=>contexts.get(request);
export const setAccess=(request:Request,context:AccessContext)=>contexts.set(request,context);
export function requireOwner(request:Request){const access=accessFor(request);if(!access||access.kind==='scoped-token')throw Object.assign(new Error('Owner authentication is required.'),{status:access?403:401});return access;}
export function requireProjectAccess(store:Store,request:Request,projectId:string,permission:StudioPermission='read'){
  const access=accessFor(request);if(!access)throw Object.assign(new Error('Authentication is required.'),{status:401});
  // The current deployment is a private, single-owner workspace. Scoped review
  // credentials never inherit its owner grant or access another named project.
  if(!access.permissions.includes(permission)||(access.kind==='scoped-token'&&!access.projectIds?.includes(projectId)))throw Object.assign(new Error('This project is not available to this credential.'),{status:403});
  const project=store.getProject(projectId);if(!project)throw Object.assign(new Error('Project not found.'),{status:404});return project;
}
export function requireAssetAccess(store:Store,request:Request,assetId:string,permission:StudioPermission='read'){
  const asset=store.getAsset(assetId);if(!asset)throw Object.assign(new Error('Asset not found.'),{status:404});requireProjectAccess(store,request,asset.projectId,permission);return asset;
}
/** Apply after the owner gate and before every existing authoring/media router. */
export function projectAuthorization(store:Store):RequestHandler {return(req,_res,next)=>{try{
  const permission:StudioPermission=['GET','HEAD','OPTIONS'].includes(req.method)?'read':/\/(?:generate|run|retry)(?:\/|$)/.test(req.path)?'generate':'write';
  const match=/^\/(projects|assets|takes|jobs|shots|recipes|display)\/([^/]+)/.exec(req.path);
  if(match){const [,kind,id]=match;if(kind==='projects'&&!['import','export'].includes(id))requireProjectAccess(store,req,id,permission);
    else if(kind==='assets'||kind==='display')requireAssetAccess(store,req,id,permission);
    else if(kind!=='projects'){const value=kind==='takes'?store.getTake(id):kind==='jobs'?store.getJob(id):kind==='shots'?store.getShot(id):store.getRecipe(id);if(value)requireProjectAccess(store,req,value.projectId,permission);}}
  if(req.body&&typeof req.body.projectId==='string')requireProjectAccess(store,req,req.body.projectId,permission);
  next();
}catch(error){next(error);}};}
