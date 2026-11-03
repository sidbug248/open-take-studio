import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import { createStore } from '../server/store.ts';
import { LocalFileStorage } from '../server/media.ts';
import { exportProject, importProject } from '../server/project-routes.ts';

test('project import preserves external Cloud asset IDs while remapping local production references',async()=>{
  const root=path.resolve('data/test-fixtures');await mkdir(root,{recursive:true});const directory=await mkdtemp(path.join(root,'film-provenance-'));const store=createStore(directory),media=new LocalFileStorage(directory),now=new Date().toISOString();
  try{
    store.upsertProject({id:'provenance-project',name:'External examples',description:'',createdAt:now,updatedAt:now});const cloudSource={assetId:'external-cloud-id',workspaceId:'external-workspace',filename:'original.png'};const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jLXsAAAAASUVORK5CYII=','base64');const source=await media.put({projectId:'provenance-project',name:'Original example',bytes:png,mimeType:'image/png',provenance:'imported',metadata:{cloudSource}});store.upsertAsset(source);const derived=await media.put({projectId:'provenance-project',name:'Local derivative',bytes:png,mimeType:'image/png',provenance:'local-edit',metadata:{sourceAssetId:source.id}});store.upsertAsset(derived);
    const imported=await importProject(store,media,await exportProject(store,media,'provenance-project'));const assets=store.listAssets(imported.id),importedSource=assets.find(a=>a.name===source.name)!,importedDerived=assets.find(a=>a.name===derived.name)!;assert.deepEqual(importedSource.metadata.cloudSource,cloudSource);assert.notEqual(importedSource.id,source.id);assert.equal(importedDerived.metadata.sourceAssetId,importedSource.id);
  }finally{store.close();assert.equal(path.dirname(directory),root);await rm(directory,{recursive:true,force:true});}
});
