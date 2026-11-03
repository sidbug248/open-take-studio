import './config.ts';
import { comfy } from '@comfyorg/sdk';
import type { Json } from '../shared/types.ts';

// This is the Router namespace. The separate Cloud workflow client is never used.
comfy.config({ credentials: process.env.COMFY_API_KEY?.trim() || undefined, baseUrl: 'https://api.comfy.org' });
export interface RouterStatus { status: string; queuePosition: number|null; errorType: string|null; retryAfterMs: number|null; raw?: Json; }
export interface RouterResult { kind: 'json'|'binary'; data: unknown; contentType?: string; requestId?:string|null; servingProvider?:string|null; droppedParams?:readonly string[]|null; creditsUsed?:string|null; }
export interface RouterPort {
  submit(model:string, inputs:Json, idempotencyKey:string):Promise<{requestId:string}>;
  run?(model:string, inputs:Json, idempotencyKey:string):Promise<RouterResult>;
  status(model:string, requestId:string):Promise<RouterStatus>;
  result(model:string, requestId:string):Promise<RouterResult>;
  cancel(model:string, requestId:string):Promise<unknown>;
}
export const routerPort:RouterPort = {
  submit: (model, inputs, idempotencyKey) => comfy.models.submit(model, inputs, { idempotencyKey, retry:false, timeoutMs:60_000 }),
  run: (model,inputs,idempotencyKey) => comfy.models.run(model,inputs,{idempotencyKey,retry:false,timeoutMs:660_000}),
  status: (model, id) => comfy.models.handle(model,id).status({retry:false,timeoutMs:30_000}),
  result: (model,id) => comfy.models.handle(model,id).get({retry:false,timeoutMs:60_000}),
  cancel: (model,id) => comfy.models.handle(model,id).cancel({retry:false,timeoutMs:15_000}),
};
