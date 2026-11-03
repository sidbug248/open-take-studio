import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {mediaToolPaths,runMediaTool} from '../server/film-media.ts';
const {ffmpeg,ffprobe}=mediaToolPaths();
const sources=[
 ['creator-journey','frames.json','Creator-journey.mp4'],
 ['playable-evidence','interaction-frames.json','Playable-interaction.mp4'],
 ['prismatic-film','interaction-frames.json','Film-interaction.mp4'],
 ['shared-state-evidence','frames.json','Shared-state-interaction.mp4'],
 ['catalogue-walkthrough','manifest.json','Catalogue-walkthrough.mp4'],
] as const;
const results=[];
for(const[folder,manifest,output]of sources){
 const dir=path.resolve('artifacts/next-build',folder),parsed=JSON.parse(await readFile(path.join(dir,manifest),'utf8')),frames=Array.isArray(parsed)?parsed:parsed.frames;
 if(!frames.length)throw new Error('No captured browser frames: '+folder);
 let concat='';
 for(let i=0;i<frames.length;i++){
  const time=frames[i].time??frames[i].at??Date.parse(frames[i].capturedAt),next=frames[i+1]?.time??frames[i+1]?.at??Date.parse(frames[i+1]?.capturedAt);
  const duration=i===frames.length-1?1.5:Math.max(.1,Math.min(1.5,(next-time)/1000));
  const file=frames[i].file;if(!/^[\w.-]+$/.test(file))throw new Error('Invalid captured frame path');
  concat+=`file '${file}'\nduration ${duration}\n`;
 }
 concat+=`file '${frames.at(-1).file}'\n`;
 const list=path.join(dir,'interaction-concat.txt');await writeFile(list,concat);
 await runMediaTool(ffmpeg,['-nostdin','-v','error','-y','-f','concat','-safe','0','-i',list,'-vf','scale=1280:-2','-fps_mode','vfr','-c:v','libx264','-crf','20','-pix_fmt','yuv420p','-movflags','+faststart',path.join(dir,output)]);
 const probe=JSON.parse((await runMediaTool(ffprobe,['-v','error','-show_format','-of','json',path.join(dir,output)])).toString());
 results.push({folder,output,frames:frames.length,duration:Number(probe.format.duration),source:'Actual CUA browser captures with timestamps; variable cadence. Processing gaps shortened to 1.5 seconds. Silent interaction recording, not a 60fps capture or simulated UI.'});
}
await writeFile('artifacts/next-build/interaction-recordings.json',JSON.stringify({createdAt:new Date().toISOString(),results},null,2));
console.log(JSON.stringify(results));
