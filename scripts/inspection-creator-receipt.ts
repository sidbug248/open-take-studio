import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {Store} from '../server/store.ts';
import {config} from '../server/config.ts';

const dir=path.resolve('artifacts/inspection-build/creator-review');
const store=new Store(config.dataDir);
const projectId='f03f4e1f-d214-464a-9743-77fd14575fa8';
const assetId='0d787035-4f90-4e01-8b1d-159ff197e86d';
const asset=store.getAsset(assetId)!;
const downloaded=await readFile(path.join(dir,'Velvet-Observatory.mp4'));
const downloadedSha256=createHash('sha256').update(downloaded).digest('hex');
if(downloadedSha256!==asset.sha256)throw new Error('Browser download differs from managed output');
const before=JSON.parse(await readFile(path.join(dir,'before-restart-jobs.json'),'utf8'));
const after=JSON.parse(await readFile(path.join(dir,'after-restart-jobs.json'),'utf8'));
if(JSON.stringify(before.jobs)!==JSON.stringify(after.jobs))throw new Error('Restart changed saved job identity or outcome');
const receipt={verifiedAt:new Date().toISOString(),projectId,assetId,downloadedSha256,bytes:downloaded.length,
  freshBrowserJourney:['opening prompt','automatic draft project','explicit FLUX image generation','completed image displayed','Animate selected image','explicit H3 motion and audio direction','completed actual video playback','browser download','editable project package download','saved project reopened'],
  observedVideo:{width:1344,height:768,duration:5.167,playbackTime:3.251325,paused:false,error:null},
  restoredContext:{selectedVideo:true,sourceImage:true,parentTake:true,motionPrompt:true},
  restart:{sameSavedRequestIds:true,sameIdempotencyKeys:true,attempts:1,liveInFlightRecoveryClaim:false,note:'Both jobs completed before this restart. Recovery during execution is covered by the integration tests, not this live observation.'},
  portableFilm:{mainAppStopped:true,openingOut:2,firstChoice:{label:'Follow the light',source:'98df205b-8109-4daf-8473-58253c746f6e.mp4',endAt:4},secondChoice:{label:'Enter the seed',source:'fb62a3f9-23ad-4636-9e3b-6d398a63a9bd.mp4',observedPlayingAt:.086249,duration:4.458333},noGenerationOnChoice:true},
  captureKind:'Actual browser observations and sampled screenshots; not an uninterrupted screen recording',
  screenshots:['01-arrival.png','02-fresh-draft.png','03-generating.png','04-new-image.png','05-animate-submitted.png','06-new-video.png','07-restored-video-workspace.png','portable-film-choice.png','portable-film-second-choice.png']};
await writeFile(path.join(dir,'receipt.json'),JSON.stringify(receipt,null,2));
console.log(JSON.stringify({projectId,assetId,downloadVerified:true,bytes:downloaded.length,restartIdentitiesUnchanged:true}));
store.close();
