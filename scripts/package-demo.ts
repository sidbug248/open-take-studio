import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import AdmZip from 'adm-zip';
const root=path.resolve('artifacts/next-build'),zip=new AdmZip();
const files=[
 'prismatic-film/Prismatic-bloom.playable.zip','prismatic-film/follow-light.mp4','prismatic-film/enter-seed.mp4',
 'playable-evidence/Neon-courier.playable.zip','exports/Prismatic-garden-next-idea-456f5fdb.opentake.zip',
 'creator-journey/Creator-journey.mp4','catalogue-walkthrough/Catalogue-walkthrough.mp4',
 'spatial-evidence/Spatial-stage-actual-browser-recording.mp4','music-evidence/music-interaction-recording.mp4',
 'music-evidence/01-neon-pulse.mp4','music-evidence/02-delayed-impact.mp4',
 'shared-state-evidence/Shared-state-interaction.mp4','playable-evidence/Playable-interaction.mp4',
 'prismatic-film/Film-interaction.mp4','catalogue-production/electric-source-clay-comparison.mp4',
 'extended-collection/Midnight-Courier-01.png','final-arrival.jpg','prismatic-film/final-player.jpg',
 'exports/verification-receipt.json','final-production-summary.json','final-player-verification.json',
 'interaction-recordings.json','prismatic-film/frame-verification.json',
];
const manifest=[];
for(const file of files){const bytes=await readFile(path.join(root,file));zip.addFile(file,bytes);manifest.push({file,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});}
zip.addFile('README.txt',Buffer.from('OPEN TAKE STUDIO — CREATIVE DEMONSTRATION\n\nExtract this outer archive. Each .playable.zip contains a separate portable website: extract it completely and serve its folder with a static HTTP server. Both were tested independently of the studio. The Neon export is an actual authored game; the Prismatic export plays completed clips and choices without inference.\n\nImport the .opentake.zip in Projects to continue editing in Open Take Studio. Historical jobs are archived and do not run on import. A Comfy Router key and currently available compatible models are needed only for new generation.\n\nThe MP4s under creator-journey, catalogue-walkthrough, spatial-evidence, shared-state-evidence, and filenames containing interaction are timestamped browser-capture recordings with variable cadence and shortened processing gaps. They are not 60fps captures. Other MP4s are actual completed media exports.\n\nOriginal application code is MIT licensed. Generated media and third-party model/service dependencies retain their applicable terms. No public hosting or all-stage open-weight execution is claimed.\n'));
zip.addFile('application-LICENSE.txt',await readFile('LICENSE'));zip.addFile('licensing.md',await readFile('docs/licensing.md'));
const dir=path.join(root,'delivery');await mkdir(dir,{recursive:true});const bytes=zip.toBuffer();await writeFile(path.join(dir,'Open-Take-Studio-demo.zip'),bytes);await writeFile(path.join(dir,'demo-manifest.json'),JSON.stringify({createdAt:new Date().toISOString(),bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),files:manifest},null,2));console.log(JSON.stringify({file:path.join(dir,'Open-Take-Studio-demo.zip'),bytes:bytes.length,files:manifest.length}));
