import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import express, { type ErrorRequestHandler } from 'express';
import { createStore } from '../server/store.ts';
import { LocalFileStorage } from '../server/media.ts';
import { createProjectRouter, normalizeUploadFileName } from '../server/project-routes.ts';
import type { Asset, Project } from '../shared/types.ts';

test('multipart Unicode filenames survive upload and download while explicit names and Latin-1 stay intact',async()=>{
  const root=path.resolve('data/test-fixtures');await mkdir(root,{recursive:true});const directory=await mkdtemp(path.join(root,'unicode-upload-')),store=createStore(directory),media=new LocalFileStorage(directory);const app=express();app.use(express.json());app.use('/api',createProjectRouter(store,media));app.use(((error,_req,res,_next)=>res.status(error.status??400).json({error:error.message})) as ErrorRequestHandler);
  const server=await new Promise<ReturnType<typeof app.listen>>((resolve,reject)=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));s.on('error',reject);});const base=`http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
  try{
    const project=await(await fetch(`${base}/projects`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'Unicode production'})})).json() as Project;
    const wav=Buffer.alloc(46);wav.write('RIFF',0);wav.writeUInt32LE(38,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(8000,24);wav.writeUInt32LE(16000,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(2,40);
    for(const name of ['Mara · Narration.wav','雨と海 — 音声.wav','München.wav']){const body=new FormData();body.set('file',new Blob([new Uint8Array(wav)],{type:'audio/wav'}),name);const response=await fetch(`${base}/projects/${project.id}/assets`,{method:'POST',body});assert.equal(response.status,201);const asset=await response.json() as Asset;assert.equal(asset.name,name);assert.equal(store.getAsset(asset.id)?.name,name);const download=await fetch(`${base}/assets/${asset.id}/file?download=1`);assert.equal(download.status,200);assert.deepEqual(Buffer.from(await download.arrayBuffer()),wav);assert.ok(!download.headers.get('content-disposition')?.includes('Â'));}
    const body=new FormData();body.set('file',new Blob([new Uint8Array(wav)],{type:'audio/wav'}),'Original · bytes.wav');body.set('name','Exact requested Ã© · name.wav');const named=await(await fetch(`${base}/projects/${project.id}/assets`,{method:'POST',body})).json() as Asset;assert.equal(named.name,'Exact requested Ã© · name.wav');
    assert.equal(normalizeUploadFileName('München.wav'),'München.wav');assert.equal(normalizeUploadFileName('already 日本語.wav'),'already 日本語.wav');assert.equal(normalizeUploadFileName('bad\u00c3name.wav'),'bad\u00c3name.wav');assert.equal(normalizeUploadFileName('Mara Â· Narration.wav'),'Mara · Narration.wav');
  }finally{await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));store.close();assert.equal(path.dirname(directory),root);await rm(directory,{recursive:true,force:true});}
});
