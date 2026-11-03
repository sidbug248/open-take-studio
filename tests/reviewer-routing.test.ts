import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

interface Route {src:string;dest?:string;methods?:string[];status?:number;headers?:Record<string,string>;transforms?:{type:string;op:string;target:{key:string};args?:string;env?:string[]}[];}
const config=JSON.parse(await readFile(new URL('../reviewer/vercel.json',import.meta.url),'utf8')) as {routes:Route[];proxy?:unknown;functions?:unknown};
function resolve(path:string,method='GET'){
  const pathname=path.split('?')[0],route=config.routes.find(item=>(!item.methods||item.methods.includes(method))&&new RegExp(item.src,'i').test(pathname));
  assert.ok(route,`No route for ${method} ${path}`);
  return{route,destination:route.dest?pathname.replace(new RegExp(route.src,'i'),route.dest):undefined};
}

test('live studio entry and authoring routes use one native external rewrite with no Function or middleware',()=>{
  assert.equal(config.proxy,undefined);assert.equal(config.functions,undefined);
  for(const [path,method]of[['/','GET'],['/api/explore/bootstrap','GET'],['/assets/app-123.js','GET'],['/auth/login','POST'],['/api/reviewer/connect','POST'],['/api/projects/p/assets','POST'],['/api/projects/p/export','GET'],['/api/assets/a/file?download=1','GET']]){
    const value=resolve(path,method);assert.equal(value.destination,'https://open-take-studio.onrender.com'+path.split('?')[0]);
    assert.equal(value.route.headers?.['x-vercel-enable-rewrite-caching'],'0');
    assert.equal(value.route.headers?.['CDN-Cache-Control'],'no-store');
  }
});

test('proxy authentication is an overwrite-only private request transform, never a response credential',()=>{
  const proxy=resolve('/api/reviewer/connect','POST').route;
  const secret=proxy.transforms?.find(item=>item.target.key==='x-ots-proxy-secret'&&item.type==='request.headers');
  assert.deepEqual(secret,{type:'request.headers',op:'set',target:{key:'x-ots-proxy-secret'},args:'$OTS_VERCEL_PROXY_SECRET',env:['OTS_VERCEL_PROXY_SECRET']});
  assert.ok(proxy.transforms?.some(item=>item.target.key==='x-ots-proxy-secret'&&item.type==='response.headers'&&item.op==='delete'));
  assert.ok(!Object.keys(proxy.headers??{}).some(name=>/secret|credential|cookie|authorization/i.test(name)));
  assert.ok(!proxy.transforms?.some(item=>item.type==='request.headers'&&['origin','cookie','host','x-forwarded-for','x-vercel-forwarded-for'].includes(item.target.key)),'Native identity and browser CSRF headers must not be fabricated');
});

test('competition media URLs remain static and the moved page resolves its original relative assets',()=>{
  const files=['walkthrough.mp4','directed-object.mp4','motion-film.mp4','Open-Take-Studio-Review-Demo.zip','README.md','APP-LICENSE.txt','film/index.html','film/manifest.json','film/LICENSE.txt','film/README.txt','film/media/clip.mp4','film/posters/frame.png','film/source-frame/frame.png','downloads/package.zip'];
  for(const file of files){assert.equal(resolve('/'+file).destination,'/'+file);assert.equal(resolve('/competition/'+file).destination,'/'+file);}
  assert.equal(resolve('/competition').route.status,307);assert.equal(resolve('/competition').route.headers?.Location,'/competition/');
  assert.equal(resolve('/competition/').destination,'/competition/index.html');assert.equal(resolve('/competition/index.html').destination,'/competition/index.html');
  assert.equal(resolve('/competition/film').route.headers?.Location,'/competition/film/');assert.equal(resolve('/competition/film/').destination,'/film/index.html');
  assert.equal(resolve('/competition/api/private').route.status,404);
});
