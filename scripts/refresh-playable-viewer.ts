import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import AdmZip from 'adm-zip';
import {playableHtml} from '../server/playable-routes.ts';
const root=path.resolve('artifacts/next-build/playable-evidence'),folder=path.join(root,'neon-courier'),manifest=JSON.parse(await readFile(path.join(folder,'game.json'),'utf8')),html=playableHtml(manifest.document,manifest.backgroundPath,manifest.winPath);await writeFile(path.join(folder,'index.html'),html);const zipFile=path.join(root,'Neon-courier.playable.zip'),zip=new AdmZip(await readFile(zipFile));zip.updateFile('index.html',Buffer.from(html));const bytes=zip.toBuffer();await writeFile(zipFile,bytes);const receiptFile=path.join(root,'verification-receipt.json'),receipt=JSON.parse(await readFile(receiptFile,'utf8'));receipt.standalonePackage.sha256=createHash('sha256').update(bytes).digest('hex');receipt.viewerUpdatedAt=new Date().toISOString();await writeFile(receiptFile,JSON.stringify(receipt,null,2));console.log('Standalone game HTML and ZIP refreshed from the shared runtime; artwork and rules preserved.');
