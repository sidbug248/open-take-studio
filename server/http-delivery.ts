import {Router,static as serveStatic} from 'express';
import {readFile,stat} from 'node:fs/promises';
import {brotliCompress,gzip,constants} from 'node:zlib';
import {promisify} from 'node:util';
import path from 'node:path';
import type {ExploreService} from './explore-service.ts';
const br=promisify(brotliCompress),gz=promisify(gzip);
const attribute=(value:string)=>value.replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;');
/** Immutable build assets, and small injected Explore data available before React starts. */
export function createProductionDelivery(directory:string,explore:Pick<ExploreService,'bootstrap'>){
  const router=Router();let cache:{key:string;html:Buffer;br:Buffer;gzip:Buffer}|undefined;
  router.get('/assets/:file',async(req,res,next)=>{const file=String(req.params.file);if(!/^[\w.-]+$/.test(file)||!/-[A-Za-z0-9_-]{6,}\.(?:js|css)$/.test(file)){next();return;}const source=path.join(directory,'assets',file),encoding=req.acceptsEncodings('br','gzip','identity');if(encoding===false){res.sendStatus(406);return;}const compressed=encoding==='br'?source+'.br':encoding==='gzip'?source+'.gz':source;try{await stat(compressed);}catch{next();return;}res.vary('Accept-Encoding');res.setHeader('Cache-Control','public, max-age=31536000, immutable');res.type(file.endsWith('.js')?'application/javascript':'text/css');if(encoding!=='identity')res.setHeader('Content-Encoding',encoding);res.sendFile(compressed);});
  router.use(serveStatic(directory,{index:false,setHeaders(res,file){res.setHeader('Cache-Control',/[/\\]assets[/\\]/.test(file)?'public, max-age=31536000, immutable':'no-cache');}}));
  router.get('/{*path}',async(req,res)=>{const [template,bootstrap]=await Promise.all([readFile(path.join(directory,'index.html'),'utf8'),explore.bootstrap()]),key=bootstrap.revision+template;if(cache?.key!==key){const payload=JSON.stringify(bootstrap).replaceAll('<','\\u003c').replaceAll('\u2028','\\u2028').replaceAll('\u2029','\\u2029'),hero=bootstrap.heroPreload,preload=hero?`<link rel="preload" as="image" fetchpriority="high" href="${attribute(hero.href)}" imagesrcset="${attribute(hero.imageSrcSet)}" imagesizes="${attribute(hero.imageSizes)}">`:'';const html=Buffer.from(template.replace('</head>',`${preload}<script type="application/json" id="ots-explore-bootstrap">${payload}</script></head>`));const [brotli,gzipBytes]=await Promise.all([br(html,{params:{[constants.BROTLI_PARAM_QUALITY]:5}}),gz(html)]);cache={key,html,br:brotli,gzip:gzipBytes};}const encoding=req.acceptsEncodings('br','gzip','identity');if(encoding===false){res.sendStatus(406);return;}res.vary('Accept-Encoding');res.type('html').setHeader('Cache-Control','private, no-store');if(encoding!=='identity')res.setHeader('Content-Encoding',encoding);res.send(cache[encoding==='br'?'br':encoding==='gzip'?'gzip':'html']);});
  return router;
}
