import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { ArrowLeft, ArrowRight, Download, GripVertical, Play, Plus, RefreshCw, Save, Trash2, X } from 'lucide-react';
import type { Asset, GenerationRequest, ProjectDetail } from '../shared/types';
import type { ModelDescriptor } from '../shared/model-types';
import type { ProductionGraphDocument, ProductionGraphEdge, ProductionGraphNode, ProductionGraphRun, ProductionGraphRunResponse, ProductionGraphVersion, ProductionNodeKind } from '../shared/production-graph-types';
import { emptyProductionGraph, productionNodeNames, productionPorts } from '../shared/production-graph-types';
import { api, json, isGenerationConnectionRequiredError } from './api';
import './production-canvas.css';

export interface ProductionCanvasProps {
  project:ProjectDetail; onChanged:()=>void; onClose:()=>void;
  onGenerate?:(request:GenerationRequest)=>void|Promise<void>;
}
const uid=()=>crypto.randomUUID();
function startingGraph(assets:Asset[]):ProductionGraphDocument {
  const images=assets.filter(a=>a.kind==='image').slice(0,2);
  if(!images.length)return emptyProductionGraph();
  const nodes:ProductionGraphNode[]=images.map((a,i)=>({id:uid(),kind:'asset',assetId:a.id,label:a.name.slice(0,70),x:40,y:40+i*270}));
  const sheet:ProductionGraphNode={id:uid(),kind:'storyboard',label:'Storyboard',title:'My next story',columns:2,x:390,y:160};
  const delivery:ProductionGraphNode={id:uid(),kind:'delivery',label:'Delivery',caption:'',x:740,y:160};
  return {version:1,kind:'production-graph',name:'Storyboard delivery',nodes:[...nodes,sheet,delivery],edges:[...nodes.map(n=>({id:uid(),from:n.id,fromPort:'output' as const,to:sheet.id,toPort:'images'})),{id:uid(),from:sheet.id,fromPort:'output',to:delivery.id,toPort:'media'}]};
}
export function ProductionCanvas({project,onChanged,onClose,onGenerate}:ProductionCanvasProps) {
  const [document,setDocument]=useState<ProductionGraphDocument>(()=>startingGraph(project.assets));
  const [versions,setVersions]=useState<ProductionGraphVersion[]>([]),[models,setModels]=useState<ModelDescriptor[]>([]),[savedVersion,setSavedVersion]=useState<string>();
  const [run,setRun]=useState<ProductionGraphRun>(),[runs,setRuns]=useState<ProductionGraphRun[]>([]),[outputs,setOutputs]=useState<Asset[]>([]);
  const [selected,setSelected]=useState<string>(),[selectedWire,setSelectedWire]=useState<string>();
  const [fromNode,setFromNode]=useState(''),[toNode,setToNode]=useState(''),[toPort,setToPort]=useState('');
  const [hydrated,setHydrated]=useState(false);
  const [pendingPort,setPendingPort]=useState<string>(),[dirty,setDirty]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
  const runIntent=useRef<string|undefined>(undefined),drag=useRef<{id:string;x:number;y:number;pointerX:number;pointerY:number}|null>(null),closeButton=useRef<HTMLButtonElement>(null);
  const draftKey='open-take-production-draft:'+project.project.id;
  const context=useMemo(()=>({assets:[...project.assets,...outputs.filter(a=>!project.assets.some(p=>p.id===a.id))],recipes:project.recipes,models}),[project,outputs,models]);
  const node=document.nodes.find(n=>n.id===selected),wire=document.edges.find(e=>e.id===selectedWire);
  const target=document.nodes.find(n=>n.id===toNode),targetPorts=target?productionPorts(target,context).inputs:[];
  const width=Math.max(1200,...document.nodes.map(n=>n.x+330)),height=Math.max(650,...document.nodes.map(n=>n.y+330));
  useEffect(()=>{
    closeButton.current?.focus();
    let cancelled=false;
    Promise.all([api<{versions:ProductionGraphVersion[];runs:ProductionGraphRun[]}>('/api/projects/'+project.project.id+'/production-graphs'),api<{models:ModelDescriptor[]}>('/api/models')]).then(([saved,modelList])=>{
      if(cancelled)return;setVersions(saved.versions);setRuns(saved.runs);setModels(modelList.models);
      let restored=false;
      try{const raw=localStorage.getItem(draftKey);if(raw){const draft=JSON.parse(raw);if(draft.document?.kind==='production-graph'&&Array.isArray(draft.document.nodes)&&Array.isArray(draft.document.edges)){setDocument(draft.document);setSavedVersion(draft.savedVersion);setDirty(draft.dirty!==false);restored=true;}}}catch{/* A corrupt browser draft cannot overwrite a saved version. */}
      if(!restored&&saved.versions[0]){setDocument(saved.versions[0].document);setSavedVersion(saved.versions[0].asset.id);setDirty(false);}
      setHydrated(true);
    }).catch(e=>!cancelled&&setError(e.message));
    return()=>{cancelled=true;};
  },[project.project.id,draftKey]);
  useEffect(()=>{if(!hydrated)return;try{localStorage.setItem(draftKey,JSON.stringify({document,savedVersion,dirty}));}catch{/* Server versions remain available when browser storage is full. */}},[document,savedVersion,dirty,draftKey,hydrated]);
  useEffect(()=>{
    if(!run?.nodes.some(n=>n.jobId&&n.state==='waiting'))return;
    const timer=window.setInterval(()=>{void api<ProductionGraphRunResponse>('/api/production-graph-runs/'+run.id+'/advance',{method:'POST',body:'{}'}).then(result=>{setRun(result.run);setOutputs(result.assets);if(result.run.state==='complete')onChanged();}).catch(e=>setError(e.message));},5000);
    return()=>window.clearInterval(timer);
  },[run?.id,run?.state,run?.nodes.some(n=>n.jobId&&n.state==='waiting')]);
  function change(next:ProductionGraphDocument){if(busy)return;setDocument(next);setDirty(true);setRun(undefined);runIntent.current=undefined;setError('');}
  function updateNode(id:string,patch:Partial<ProductionGraphNode>){change({...document,nodes:document.nodes.map(n=>n.id===id?{...n,...patch} as ProductionGraphNode:n)});}
  function chooseNode(id:string){setSelected(id);setSelectedWire(undefined);setToNode(id);setToPort('');}
  function addNode(kind:ProductionNodeKind){
    if(document.nodes.length>=48){setError('A production graph supports up to 48 nodes.');return;}
    const base={id:uid(),label:productionNodeNames[kind],x:50+(document.nodes.length%3)*330,y:50+Math.floor(document.nodes.length/3)*270};
    let added:ProductionGraphNode;
    if(kind==='asset'){const asset=context.assets.find(a=>a.kind==='image')??context.assets[0];if(!asset){setError('Add a source asset to this project first.');return;}added={...base,kind,assetId:asset.id};}
    else if(kind==='resize')added={...base,kind,width:1024,height:1024,fit:'contain',background:'#17121f'};
    else if(kind==='storyboard')added={...base,kind,columns:2,title:'My storyboard'};
    else if(kind==='delivery')added={...base,kind,caption:''};
    else {const recipe=project.recipes[0];if(!recipe){setError('Save a generation recipe in this project first.');return;}added={...base,kind,recipeId:recipe.id};}
    change({...document,nodes:[...document.nodes,added]});chooseNode(added.id);
  }
  function connect(from=fromNode,to=toNode,port=toPort||targetPorts[0]?.key){
    const source=document.nodes.find(n=>n.id===from),destination=document.nodes.find(n=>n.id===to);
    if(!source||!destination||!port){setError('Choose an output node, target node, and input port.');return;}
    const output=productionPorts(source,context).outputs[0],input=productionPorts(destination,context).inputs.find(p=>p.key===port);
    if(from===to||!input||!output.kinds.every(k=>input.kinds.includes(k))){setError('Choose compatible media ports on different nodes.');return;}
    if(document.edges.some(e=>e.from===from&&e.to===to&&e.toPort===port)){setError('That connection already exists.');return;}
    if(!input.multiple&&document.edges.some(e=>e.to===to&&e.toPort===port)){setError('Remove the existing wire before replacing this input.');return;}
    const edges=[...document.edges,{id:uid(),from,fromPort:'output' as const,to,toPort:port}];
    const visit=(id:string,seen:Set<string>):boolean=>id===from||(!seen.has(id)&&(seen.add(id),edges.filter(e=>e.from===id).some(e=>visit(e.to,seen))));
    if(visit(to,new Set())){setError('That wire would create a cycle.');return;}
    change({...document,edges});setPendingPort(undefined);setNotice('Connected '+source.label+' to '+destination.label+'.');
  }
  function removeNode(){if(!node)return;change({...document,nodes:document.nodes.filter(n=>n.id!==node.id),edges:document.edges.filter(e=>e.from!==node.id&&e.to!==node.id)});setSelected(undefined);}
  function beginDrag(event:ReactPointerEvent<HTMLButtonElement>,item:ProductionGraphNode){if(event.button!==0)return;chooseNode(item.id);event.currentTarget.setPointerCapture(event.pointerId);drag.current={id:item.id,x:item.x,y:item.y,pointerX:event.clientX,pointerY:event.clientY};}
  function moveDrag(event:ReactPointerEvent<HTMLButtonElement>){const start=drag.current;if(!start)return;updateNode(start.id,{x:Math.max(0,Math.min(4000,Math.round(start.x+event.clientX-start.pointerX))),y:Math.max(0,Math.min(3000,Math.round(start.y+event.clientY-start.pointerY)))});}
  async function save():Promise<ProductionGraphVersion>{
    const result=await api<ProductionGraphVersion>('/api/projects/'+project.project.id+'/production-graphs',{method:'POST',body:json({document,parentVersionAssetId:savedVersion})});
    setSavedVersion(result.asset.id);setVersions(current=>[result,...current]);setDirty(false);setNotice('Saved a new, immutable graph version.');onChanged();return result;
  }
  async function action(work:()=>Promise<void>){setBusy(true);setError('');try{await work();}catch(e){if(!isGenerationConnectionRequiredError(e))setError(e instanceof Error?e.message:'This action could not finish. Your graph is preserved.');}finally{setBusy(false);}}
  function acceptRun(result:ProductionGraphRunResponse){setRun(result.run);setOutputs(result.assets);setRuns(old=>[result.run,...old.filter(r=>r.id!==result.run.id)]);onChanged();}
  async function runLocal(){
    const version=dirty||!savedVersion?(await save()).asset.id:savedVersion;
    if(!runIntent.current||run?.state==='complete')runIntent.current=uid();
    acceptRun(await api<ProductionGraphRunResponse>('/api/assets/'+version+'/production-graph/runs',{method:'POST',body:json({clientRequestId:runIntent.current})}));
    setNotice('Local execution finished. Recipe nodes wait for your separate Generate action.');
  }
  async function generate(nodeId:string){
    const step=run?.nodes.find(n=>n.nodeId===nodeId);if(!run||!step?.request)return;
    if(onGenerate){await onGenerate(step.request);setNotice('Recipe opened in the generation flow. Refresh this run after submitting it.');return;}
    const result=await api<{job:{id:string}}>('/api/generate',{method:'POST',body:json(step.request)});
    acceptRun(await api<ProductionGraphRunResponse>('/api/production-graph-runs/'+run.id+'/nodes/'+nodeId+'/attach-generation',{method:'POST',body:json({jobId:result.job.id})}));
  }
  function loadVersion(assetId:string){if(busy)return;const found=versions.find(v=>v.asset.id===assetId);if(!found)return;setDocument(found.document);setSavedVersion(assetId);setDirty(false);setRun(undefined);setSelected(undefined);runIntent.current=undefined;setNotice('Opened saved version. Editing creates a new version.');}
  const close=()=>{onClose();};
  return <section className="production-canvas" role="dialog" aria-modal="true" aria-labelledby="production-canvas-title" onKeyDown={e=>{
    if(e.key==='Escape'){if(pendingPort){setPendingPort(undefined);return;}close();}
    if(e.key==='Tab'){const elements=Array.from(e.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled),select:not(:disabled),input:not(:disabled),textarea:not(:disabled),a[href],[tabindex="0"]')).filter(el=>el.getClientRects().length);const first=elements[0],last=elements.at(-1);if(e.shiftKey&&globalThis.document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&globalThis.document.activeElement===last){e.preventDefault();first?.focus();}}
  }}>
    <header className="production-canvas-heading"><div><span className="production-eyebrow">SHAPE THE PROCESS</span><h2 id="production-canvas-title">Production canvas</h2><p>Connect saved media, local edits, recipes, and delivery. Run local nodes uses no Comfy credits.</p></div><button ref={closeButton} onClick={close} aria-label="Close production canvas"><X size={20}/></button></header>
    <div className="production-toolbar">
      <label className="production-name">Production name<input value={document.name} maxLength={120} onChange={e=>change({...document,name:e.target.value})}/></label>
      <label>Saved version<select aria-label="Saved graph version" value={savedVersion??''} onChange={e=>loadVersion(e.target.value)}><option value="">Unsaved draft</option>{versions.map((v,i)=><option key={v.asset.id} value={v.asset.id}>{v.document.name} · {new Date(v.asset.createdAt).toLocaleString()} {i===0?'(latest)':''}</option>)}</select></label>
      <button disabled={busy} onClick={()=>void action(async()=>{await save();})}><Save size={16}/>{dirty?'Save version':'Save a copy'}</button>
      <button className="production-primary" disabled={busy||!document.nodes.length} onClick={()=>void action(runLocal)}><Play size={16}/>{busy?'Working…':run?.state==='complete'?'Start another local run':'Run local nodes'}</button>
      <button disabled={busy} onClick={()=>{change(startingGraph(project.assets));setSavedVersion(undefined);setSelected(undefined);}}><Plus size={16}/>New graph</button>
    </div>
    <div className="production-addbar" aria-label="Add production node">{(['asset','resize','storyboard','delivery','recipe'] as ProductionNodeKind[]).map(kind=><button key={kind} disabled={busy||(kind==='recipe'&&!project.recipes.length)||(kind==='asset'&&!context.assets.length)} onClick={()=>addNode(kind)}><Plus size={14}/>{productionNodeNames[kind]}</button>)}<span>Drag a node header, or focus it and use arrow keys. Click an output, then an input.</span></div>
    {error&&<div className="production-error" role="alert">{error}</div>}
    <div className="production-notice" role="status">{pendingPort?'Choose a compatible input port to finish the wire. Escape cancels.':notice||'Draft changes stay in this browser. Save a version to keep them in the project.'}</div>
    <div className="production-workspace">
      <div className="production-canvas-scroll" tabIndex={0} aria-label="Scrollable production node canvas">
        <div className="production-board" style={{width,height}}>
          <svg className="production-wires" width={width} height={height} aria-label="Node connections">
            {document.edges.map(edge=>{
              const from=document.nodes.find(n=>n.id===edge.from),to=document.nodes.find(n=>n.id===edge.to);if(!from||!to)return null;
              const index=Math.max(0,productionPorts(to,context).inputs.findIndex(p=>p.key===edge.toPort));
              const x1=from.x+242,y1=from.y+94,x2=to.x,y2=to.y+94+index*30,d='M '+x1+' '+y1+' C '+(x1+100)+' '+y1+', '+(x2-100)+' '+y2+', '+x2+' '+y2;
              return <g key={edge.id} tabIndex={0} role="button" aria-label={'Select connection from '+from.label+' to '+to.label+' '+edge.toPort} onClick={()=>{setSelectedWire(edge.id);setSelected(undefined);}} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();setSelectedWire(edge.id);setSelected(undefined);}if(e.key==='Delete'){change({...document,edges:document.edges.filter(w=>w.id!==edge.id)});}}}><path className="production-wire-hit" d={d}/><path className={selectedWire===edge.id?'production-wire selected':'production-wire'} d={d}/></g>;
            })}
          </svg>
          {document.nodes.map(item=>{
            const ports=productionPorts(item,context),step=run?.nodes.find(n=>n.nodeId===item.id),source=item.kind==='asset'?context.assets.find(a=>a.id===item.assetId):undefined;
            return <article className={'production-node '+(selected===item.id?'selected ':'')+(step?.state??'')} key={item.id} style={{left:item.x,top:item.y,height:Math.max(228,128+ports.inputs.length*30)}} aria-label={item.label+' node'}>
              <button className="production-node-grip" onPointerDown={e=>beginDrag(e,item)} onPointerMove={moveDrag} onPointerUp={()=>{drag.current=null;}} onPointerCancel={()=>{drag.current=null;}} onClick={()=>chooseNode(item.id)} onKeyDown={e=>{const moves:Record<string,[number,number]>={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]};if(moves[e.key]){e.preventDefault();const step=e.shiftKey?50:10;updateNode(item.id,{x:Math.max(0,Math.min(4000,item.x+moves[e.key][0]*step)),y:Math.max(0,Math.min(3000,item.y+moves[e.key][1]*step))});}if(e.key==='Delete'){e.preventDefault();change({...document,nodes:document.nodes.filter(n=>n.id!==item.id),edges:document.edges.filter(edge=>edge.from!==item.id&&edge.to!==item.id)});}}}><GripVertical size={15}/><strong>{item.label}</strong></button>
              <span className="production-node-kind">{productionNodeNames[item.kind]}{step?' · '+step.state:''}</span>
              {ports.inputs.map((port,index)=><button key={port.key} className={'production-port input '+(pendingPort?'available':'')} style={{top:80+index*30}} aria-label={'Connect to '+item.label+' '+port.label+' input'} title={port.kinds.join(', ')+(port.multiple?' · multiple':'')} onClick={()=>pendingPort?connect(pendingPort,item.id,port.key):(chooseNode(item.id),setToPort(port.key))}><i/>{port.label}</button>)}
              <button className={'production-port output '+(pendingPort===item.id?'active':'')} style={{top:80}} aria-label={'Start connection from '+item.label+' output'} onClick={()=>{setPendingPort(pendingPort===item.id?undefined:item.id);setFromNode(item.id);}}>{ports.outputs[0]?.label}<i/></button>
              {source?.kind==='image'&&<img className="production-source-preview" src={source.url} alt={source.name} loading="lazy"/>}
              {item.kind!=='asset'&&<p className="production-node-description">{item.kind==='resize'?item.width+' × '+item.height+' · '+item.fit:item.kind==='storyboard'?item.columns+' columns · up to 12 images':item.kind==='delivery'?'ZIP with source files and caption':'Explicit Generate · Comfy credits'}</p>}
              <button className="production-node-edit" onClick={()=>chooseNode(item.id)}>Edit node <ArrowRight size={13}/></button>
            </article>;
          })}
          {!document.nodes.length&&<div className="production-empty"><h3>Your next production starts here.</h3><p>Add a source asset, connect an image transform, then package the result.</p></div>}
        </div>
      </div>
      <aside className="production-inspector" aria-label="Node and connection editor">
        {node?<><h3>{productionNodeNames[node.kind]}</h3><label>Node name<input value={node.label} maxLength={100} onChange={e=>updateNode(node.id,{label:e.target.value})}/></label>
          {node.kind==='asset'&&<label>Saved source<select value={node.assetId} onChange={e=>updateNode(node.id,{assetId:e.target.value})}>{context.assets.map(a=><option key={a.id} value={a.id}>{a.kind} · {a.name}</option>)}</select></label>}
          {node.kind==='resize'&&<><div className="production-two-fields"><label>Width<input type="number" min={16} max={4096} value={node.width} onChange={e=>updateNode(node.id,{width:Number(e.target.value)})}/></label><label>Height<input type="number" min={16} max={4096} value={node.height} onChange={e=>updateNode(node.id,{height:Number(e.target.value)})}/></label></div><label>Fit<select value={node.fit} onChange={e=>updateNode(node.id,{fit:e.target.value as 'contain'|'cover'})}><option value="contain">Contain · preserve whole image</option><option value="cover">Cover · crop to fill</option></select></label><label>Background<input type="color" value={node.background} onChange={e=>updateNode(node.id,{background:e.target.value})}/></label></>}
          {node.kind==='storyboard'&&<><label>Sheet title<input value={node.title} maxLength={160} onChange={e=>updateNode(node.id,{title:e.target.value})}/></label><label>Columns<select value={node.columns} onChange={e=>updateNode(node.id,{columns:Number(e.target.value) as 1|2|3|4})}>{[1,2,3,4].map(n=><option key={n} value={n}>{n}</option>)}</select></label></>}
          {node.kind==='delivery'&&<label>Caption / delivery note<textarea rows={5} maxLength={4000} value={node.caption} onChange={e=>updateNode(node.id,{caption:e.target.value})}/></label>}
          {node.kind==='recipe'&&<><label>Saved recipe<select value={node.recipeId} onChange={e=>updateNode(node.id,{recipeId:e.target.value,prompt:undefined})}>{project.recipes.map(r=><option key={r.id} value={r.id}>{r.name}</option>)}</select></label><label>Prompt<textarea rows={5} maxLength={20000} value={node.prompt??project.recipes.find(r=>r.id===node.recipeId)?.prompt??''} onChange={e=>updateNode(node.id,{prompt:e.target.value})}/></label><p className="production-muted">Run local nodes prepares this request. Generation starts only with its separate Generate button and your connected Comfy key.</p></>}
          <button className="production-danger" onClick={removeNode}><Trash2 size={15}/>Remove node and wires</button>
        </>:wire?<><h3>Selected connection</h3><p>{document.nodes.find(n=>n.id===wire.from)?.label} → {document.nodes.find(n=>n.id===wire.to)?.label}</p><button className="production-danger" onClick={()=>{change({...document,edges:document.edges.filter(e=>e.id!==wire.id)});setSelectedWire(undefined);}}><Trash2 size={15}/>Remove connection</button></>:<><h3>Build your flow</h3><p>Select a node to change its inputs. The canvas saves every rendered result back to this project.</p></>}
        <details className="production-connect" open><summary>Connect nodes with controls</summary><label>Output node<select value={fromNode} onChange={e=>setFromNode(e.target.value)}><option value="">Choose source</option>{document.nodes.map(n=><option key={n.id} value={n.id}>{n.label}</option>)}</select></label><label>Input node<select value={toNode} onChange={e=>{setToNode(e.target.value);setToPort('');}}><option value="">Choose target</option>{document.nodes.filter(n=>productionPorts(n,context).inputs.length).map(n=><option key={n.id} value={n.id}>{n.label}</option>)}</select></label><label>Input port<select value={toPort||targetPorts[0]?.key||''} onChange={e=>setToPort(e.target.value)}>{targetPorts.map(p=><option key={p.key} value={p.key}>{p.label} · {p.kinds.join('/')}</option>)}</select></label><button disabled={busy||!fromNode||!toNode} onClick={()=>connect()}><ArrowRight size={15}/>Connect</button></details>
      </aside>
    </div>
    <section className="production-runs"><header><div><h3>Production runs</h3><p>Outputs stay saved in the project. Reopening or refreshing a run reuses its existing results.</p></div><label>Run history<select value={run?.id??''} onChange={e=>{const selectedRun=runs.find(r=>r.id===e.target.value);if(!selectedRun)return;loadVersion(selectedRun.graphVersionAssetId);void action(async()=>{acceptRun(await api<ProductionGraphRunResponse>('/api/production-graph-runs/'+selectedRun.id));});}}><option value="">Choose a run</option>{runs.map(r=><option key={r.id} value={r.id}>{new Date(r.createdAt).toLocaleString()} · {r.state}</option>)}</select></label>{run&&<button disabled={busy} onClick={()=>void action(async()=>{acceptRun(await api<ProductionGraphRunResponse>('/api/production-graph-runs/'+run.id+'/advance',{method:'POST',body:'{}'}));})}><RefreshCw size={15}/>Refresh / resume</button>}</header>
      {run?<ol>{run.nodes.map(step=>{const item=document.nodes.find(n=>n.id===step.nodeId);return <li key={step.nodeId} className={step.state}><div><strong>{item?.label??step.nodeId}</strong><span className="production-state">{step.state}</span>{step.message&&<p>{step.message}</p>}</div><div className="production-step-actions">{step.state==='ready'&&step.request&&<button disabled={busy} className="production-primary" onClick={()=>void action(()=>generate(step.nodeId))}><Play size={14}/>Generate with Comfy credits</button>}{step.assetIds.map(aid=>{const a=context.assets.find(a=>a.id===aid);return a&&<a key={aid} href={a.url} download={a.name} target="_blank" rel="noreferrer"><Download size={14}/>{a.name}</a>;})}</div></li>;})}</ol>:<p className="production-muted">Save and run a connected graph to see its progress and downloadable results.</p>}
    </section>
  </section>;
}
export default ProductionCanvas;
