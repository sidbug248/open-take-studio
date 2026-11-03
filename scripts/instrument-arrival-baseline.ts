import {readFile,writeFile,copyFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const out='artifacts/first-impression/baseline';await mkdir(out,{recursive:true});
const html=await readFile('dist/index.html','utf8');
if(!html.includes('/arrival-probe.js')){await writeFile(out+'/original-index.html',html);await writeFile('dist/index.html',html.replace('<head>','<head><script src="/arrival-probe.js"></script>'));}
await copyFile('public/arrival-probe.js','dist/arrival-probe.js');
await writeFile(out+'/instrumentation.json',JSON.stringify({at:new Date().toISOString(),originalHtmlSha256:createHash('sha256').update(html).digest('hex'),scriptSha256:createHash('sha256').update(await readFile('public/arrival-probe.js')).digest('hex'),functionalBundlesUnchanged:true,activation:'?otsProbe=label',metrics:'PerformanceObserver LCP/longtask/resource timing, actual hero image decode plus RAF, actual playing video frame callback',scope:'Local DOM evidence only, no telemetry requests or state changes',chromeTrace:'DevTools tracing stalled/recorded about:blank; excluded from timing claims'},null,2));
console.log('Opt-in baseline timing probe installed; application bundles unchanged.');
