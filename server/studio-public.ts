import {Router} from 'express';
import type {StudioRuntime} from './studio-runtime.ts';
import {matchStudioMcpPath} from './studio-mcp.ts';

/** Only token-authenticated review/MCP modules are reachable before workspace
 * authentication. An unknown or expired workspace can never select owner data. */
export function createStudioPublicRouter(options:{owner:StudioRuntime;reviewerRuntime?:(id:string)=>StudioRuntime|undefined}){
 const router=Router();
 router.use((req,res,next)=>{
  const mcp=matchStudioMcpPath(req.path);
  const review=/^\/(?:review|api\/shared-review)\/([A-Za-z0-9_-]{1,128})\/([A-Za-z0-9_-]{1,128})(?:\/|$)/.exec(req.path);
  if(!mcp&&!review){next();return;}
  const workspaceId=mcp?.workspaceId??review![1]!;
  let runtime:StudioRuntime|undefined;
  try{runtime=workspaceId==='owner'?options.owner:options.reviewerRuntime?.(workspaceId);}catch{}
  if(!runtime){res.status(404).setHeader('Cache-Control','no-store');res.json({error:'This shared workspace is unavailable or expired.'});return;}
  res.setHeader('Cache-Control','private, no-store');
  if(mcp){void runtime.mcp.handleTransport(req,res).catch(next);return;}
  runtime.sharedReview(req,res,error=>{if(error)next(error);else res.status(404).json({error:'Review route not found.'});});
 });
 return router;
}
