import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createStore } from '../server/store.ts';
import { LocalFileStorage } from '../server/media.ts';
import { importProject } from '../server/project-routes.ts';
import type { ProjectDetail } from '../shared/types.ts';

const base='http://127.0.0.1:4310';
const root=path.resolve('artifacts/validation');await mkdir(root,{recursive:true});
const directory=path.join(root,'package-reopen-'+Date.now());const store=createStore(directory),media=new LocalFileStorage(directory);
const results=[];
try{
  for(const id of process.argv.slice(2)){
    const detail=await (await fetch(`${base}/api/projects/${id}`)).json() as ProjectDetail;
    const response=await fetch(`${base}/api/projects/${id}/export`);if(!response.ok)throw new Error('Export failed');
    const bytes=Buffer.from(await response.arrayBuffer());const file=`${detail.project.name.startsWith('Mara')?'mara-imported':'coastal-light'}.opentake.zip`;
    await writeFile(path.join(root,file),bytes);
    const imported=await importProject(store,media,bytes);const copy=store.projectDetail(imported.id)!;
    if(copy.assets.length!==detail.assets.length||copy.takes.length!==detail.takes.length)throw new Error('Roundtrip count mismatch');
    if(copy.assets.some(a=>!detail.assets.some(b=>a.sha256===b.sha256&&a.size===b.size)))throw new Error('Media mismatch');
    for(const take of copy.takes){
      for(const ref of Object.values(take.inputAssetIds).flat())if(!copy.assets.some(a=>a.id===ref))throw new Error('Broken canonical asset relationship');
      if(take.parentTakeId&&!copy.takes.some(t=>t.id===take.parentTakeId))throw new Error('Broken parent relationship');
    }
    for(const asset of copy.assets){
      const metadata=asset.metadata;
      if(metadata.inputAssetIds)for(const ref of Object.values(metadata.inputAssetIds as Record<string,string|string[]>).flat())if(!copy.assets.some(a=>a.id===ref))throw new Error('Broken metadata input relationship');
      const panels=(metadata.settings as {panels?:{assetId:string}[]})?.panels;
      if(panels)for(const panel of panels)if(!copy.assets.some(a=>a.id===panel.assetId))throw new Error('Broken story panel relationship');
    }
    if(store.listRunnableJobs().length)throw new Error('Imported jobs must never resume');
    results.push({originalProject:id,importedProject:copy.project.id,assets:copy.assets.length,takes:copy.takes.length,archivedJobs:copy.jobs.length,packageBytes:bytes.length,file,allMediaAndRelationshipsVerified:true});
  }
}finally{store.close();}
const reopened=createStore(directory);const reopenCount=reopened.listProjects().length;reopened.close();
const receipt={checkedAt:new Date().toISOString(),isolatedStorage:directory,reopenCount,results};await writeFile(path.join(root,'package-roundtrip-receipt.json'),JSON.stringify(receipt,null,2));console.log(JSON.stringify(receipt,null,2));
