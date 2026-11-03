import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { playerHtml, type PlayerManifest } from '../server/film-player.ts';

class Element {
  textContent='';hidden=false;value='0';className='';dataset:Record<string,string>={};children:Element[]=[];attributes:Record<string,string>={};listeners:Record<string,((e:any)=>unknown)[]>={};onclick?:()=>unknown;oninput?:()=>unknown;
  src='';poster='';currentTime=0;readyState=1;paused=true;muted=false;disabled=false;
  constructor(readonly tagName='div'){}
  append(...items:Element[]){this.children.push(...items);}
  setAttribute(name:string,value:string){this.attributes[name]=value;}
  getAttribute(name:string){return name==='src'?this.src:this.attributes[name];}
  addEventListener(name:string,fn:(e:any)=>unknown){(this.listeners[name]??=[]).push(fn);}
  removeEventListener(name:string,fn:(e:any)=>unknown){this.listeners[name]=(this.listeners[name]??[]).filter(f=>f!==fn);}
  emit(name:string,event:unknown={}){for(const fn of this.listeners[name]??[])fn(event);}
  querySelector(name:string){return this.children.find(child=>child.tagName===name);}
  focus(){}
  matches(selector:string){return selector.split(',').includes(this.tagName);}
  async click(){await this.onclick?.();for(const fn of this.listeners.click??[])await fn({target:this});}
  async play(){this.paused=false;this.emit('play');}
  pause(){this.paused=true;this.emit('pause');}
  load(){}
  requestVideoFrameCallback(_fn:()=>void){}
}

test('exported viewer runs without application APIs, respects both clip boundaries, replays, and escapes labels',async()=>{
  const malicious='</script><img src=x onerror=alert(1)>';
  const manifest:PlayerManifest={format:'open-take-playable-film',version:1,name:malicious,createdAt:new Date().toISOString(),opening:{assetId:'opening',file:'media/opening.mp4',poster:'posters/opening.png',inSeconds:.4,outSeconds:1.4},choices:[{id:'a',label:malicious,clip:{assetId:'quiet',file:'media/quiet.mp4',poster:'posters/quiet.png',inSeconds:.25,outSeconds:1.75}},{id:'b',label:'Return to sea',clip:{assetId:'opening',file:'media/opening.mp4',poster:'posters/opening.png',inSeconds:2,outSeconds:3.5}}],credits:[{name:malicious,provenance:'imported',modelId:'imported/example'}]};
  const html=playerHtml(manifest);assert.ok(!html.includes(malicious));assert.ok(html.includes('&lt;/script&gt;'));assert.ok(html.includes('\\u003c/script>'));assert.ok(!html.includes('fetch('));assert.ok(!html.includes('/api/'));
  const elements=new Map<string,Element>();for(const match of html.matchAll(/<(\w+)[^>]*\bid="([^"]+)"/g))elements.set(match[2],new Element(match[1]));elements.get('film-data')!.textContent=html.match(/<script id="film-data" type="application\/json">([\s\S]*?)<\/script>/)![1];
  const document=new Element('document') as Element&{getElementById:(id:string)=>Element|undefined;createElement:(name:string)=>Element};document.getElementById=id=>elements.get(id);document.createElement=name=>new Element(name);
  const script=html.match(/<script>([\s\S]*?)<\/script>/)![1];vm.runInNewContext(script,{document,setInterval:()=>undefined,console});const el=(id:string)=>elements.get(id)!;const video=el('video');assert.equal(video.muted,true);assert.equal(el('title').textContent,malicious);assert.equal(el('credits').children[0].textContent,malicious+' · imported · imported/example');
  await el('start').click();assert.equal(video.src,'media/opening.mp4');assert.equal(video.currentTime,.4);assert.equal(video.paused,false);assert.equal(el('overlay').hidden,true);
  video.currentTime=1.6;video.emit('timeupdate');assert.equal(video.currentTime,1.4,'Delayed browser updates must clamp to the saved out point');assert.equal(video.paused,true);assert.equal(el('state').textContent,'Your next take');assert.equal(el('choices').hidden,false);
  await el('choices').children[0].click();assert.equal(video.src,'media/quiet.mp4');assert.equal(video.currentTime,.25);assert.equal(video.paused,false);video.currentTime=1.75;video.emit('timeupdate');assert.equal(video.paused,true);assert.equal(el('endActions').hidden,false);assert.equal(video.src,'media/quiet.mp4');assert.equal(el('overlayTitle').textContent,malicious);
  await el('another').click();assert.equal(video.src,'media/opening.mp4');assert.equal(video.currentTime,1.4,'Returning to a choice restores the opening decision frame');assert.equal(video.paused,true);assert.equal(el('path').textContent,'Opening → Your choice');assert.equal(el('time').textContent,'0:01 / 0:01');let prevented=false;document.emit('keydown',{key:'2',target:new Element('body'),preventDefault(){prevented=true;}});await Promise.resolve();await Promise.resolve();assert.equal(prevented,true);assert.equal(video.src,'media/opening.mp4');assert.equal(video.currentTime,2);video.currentTime=3.5;video.emit('timeupdate');assert.equal(el('state').textContent,'The end · Return to sea');
  await el('sound').click();assert.equal(video.muted,false);assert.equal(el('sound').attributes['aria-pressed'],'true');await el('replayEnd').click();assert.equal(video.src,'media/opening.mp4');assert.equal(video.currentTime,.4);assert.equal(video.paused,false);
  document.hidden=true;document.emit('visibilitychange');assert.equal(video.paused,true,'Leaving the tab stops intentional sound');document.hidden=false;document.emit('visibilitychange');assert.equal(video.paused,true,'Returning does not restart sound without an explicit action');await el('toggle').click();assert.equal(video.paused,false);
  video.emit('error');assert.equal(el('error').hidden,false);assert.equal(el('toggle').disabled,false,'A media error must not leave the transport stuck disabled');await el('replay').click();assert.equal(el('error').hidden,true,'An explicit retry clears the old error');
});
