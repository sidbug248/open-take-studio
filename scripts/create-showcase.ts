import { mkdir, writeFile } from 'node:fs/promises';
const base='http://127.0.0.1:4310';
async function request(path:string,method='GET',body?:unknown){const r=await fetch(base+'/api'+path,{method,headers:{'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});const value=await r.json();if(!r.ok)throw new Error(value.error||`HTTP ${r.status}`);return value;}
const list=await request('/projects');
for(const [id,name]of [['97d0268d-35f7-43f2-8ebc-539fef34485c','Coastal Light'],['8836985f-6d32-4686-bf0b-d5d7bcfe4118','Mara · The last light']])await request('/projects/'+id,'PATCH',{name});
const examples=[
  {name:'Liquid daylight',prompt:'An extraordinary editorial still life photographed on a vivid cobalt blue seamless studio set: a sculptural transparent amber glass perfume bottle with no label, a curved sheet of translucent tangerine resin, one sliced blood orange suspended mid-air and a small pool of water making sharp caustic patterns. Hard afternoon sunlight, saturated colors, elegant tactile materials, crisp shadows. The bottle dominates the right center of the composition, generous negative space left. Luxury experimental product photography, shot on medium format, photorealistic, no text, no logos, no typography.',ratio:'4:3'},
  {name:'Midnight on wheels',prompt:'A striking original risograph comic cover illustration, a tiny brave fox riding a skateboard down a huge twisting pink concrete staircase through an ultramarine blue futuristic city at night, enormous cyan crescent moon, strong diagonal composition, coral-orange fox with flapping oversized teal jacket, limited screenprint palette of midnight indigo hot pink cyan and orange, bold flat angular shapes, paper grain and imperfect ink texture, playful kinetic energy, adult editorial illustration, no text no letters no logos, full bleed composition.',ratio:'3:4'}
];
const receipts=[];
for(const [i,example]of examples.entries()){
  const project=list.find((p:any)=>p.name===example.name)||await request('/projects','POST',{name:example.name,description:'Original Open Take Studio showcase. Generated through Comfy Router during the creative experience redesign; prompt, model and execution references are retained.'});
  const body={projectId:project.id,modelId:'bfl/flux-3-image',prompt:example.prompt,settings:{aspect_ratio:example.ratio,resolution:'1k'},inputAssetIds:{},name:example.name,clientRequestId:`showcase-redesign-20261103-${i}`};
  const result=await request('/generate','POST',body);receipts.push({projectId:project.id,takeId:result.take.id,jobId:result.job.id,name:example.name});
}
await mkdir('artifacts/redesign',{recursive:true});await writeFile('artifacts/redesign/showcase-submissions.json',JSON.stringify(receipts,null,2));console.log(JSON.stringify(receipts,null,2));
