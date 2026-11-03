import type {Request} from 'express';

export interface RequestOrigin {origin:string;proxied:boolean;clientIp:string;ipSource:'render-hop'|'vercel-verified';}
const origins=new WeakMap<Request,RequestOrigin>();
export const setRequestOrigin=(request:Request,value:RequestOrigin)=>origins.set(request,value);
export const requestOrigin=(request:Request)=>origins.get(request);
export const clientAddress=(request:Request)=>origins.get(request)?.clientIp??request.ip??request.socket.remoteAddress??'unknown';
