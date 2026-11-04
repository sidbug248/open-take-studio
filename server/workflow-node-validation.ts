import type { WorkflowGraph, WorkflowValidation } from '../shared/workflow-types.ts';

type Spec = [unknown, Record<string, any>?];
type Field = {spec:Spec;required:boolean};

/** Expand only the selected V3 dynamic-combo branch into its dotted API fields. */
function nodeFields(schema:any,inputs:Record<string,unknown>):Map<string,Field>{
  const fields=new Map<string,Field>();
  const visit=(groups:any,prefix='')=>{
    for(const group of ['required','optional'] as const){
      for(const [name,raw] of Object.entries(groups?.[group]??{})){
        if(!Array.isArray(raw))continue;
        const key=prefix+name,spec=raw as Spec;fields.set(key,{spec,required:group==='required'});
        if(spec[0]==='COMFY_DYNAMICCOMBO_V3'){
          const options=Array.isArray(spec[1]?.options)?spec[1]!.options:[];
          const selected=options.find((option:any)=>option&&option.key===inputs[key]);
          if(selected)visit(selected.inputs,key+'.');
        }
      }
    }
  };
  visit(schema.input);return fields;
}
function isAsset(value:unknown):boolean{return !!value&&typeof value==='object'&&!Array.isArray(value)&&(value as {__type?:string}).__type==='core/ASSET';}
export function validateWorkflowNodeInputs(nodeId:string,graph:WorkflowGraph,schema:any,info:Record<string,any>):WorkflowValidation['issues']{
  const issues:WorkflowValidation['issues']=[],node=graph[nodeId],fields=nodeFields(schema,node.inputs);
  const issue=(field:string,message:string)=>issues.push({nodeId,field,message});
  for(const [field,{spec,required}] of fields){
    if(!Object.hasOwn(node.inputs,field)){
      if(required&&spec[1]?.default===undefined)issue(field,`Required node input ${field} is missing`);
      continue;
    }
    const value=node.inputs[field],kind=spec[0],options=spec[1]??{};
    if(Array.isArray(value)&&value.length===2&&typeof value[0]==='string'&&Number.isInteger(value[1])){
      const source=graph[value[0]],outputs=source&&info[source.class_type]?.output;
      if(!source||Number(value[1])<0)issue(field,'Linked node output is missing');
      else if(Array.isArray(outputs)&&value[1]>=outputs.length)issue(field,'Linked node output index is outside the source outputs');
      continue;
    }
    if(isAsset(value)){
      const loader=Object.entries(options).some(([key,flag])=>key.endsWith('_upload')&&flag===true)||(/^Load(?:Image|Audio|Video)/.test(node.class_type)&&/^(?:image|audio|video|file|filename)$/.test(field));
      if(!loader)issue(field,'Uploaded assets must bind to a loader file widget, not a media socket or numeric control');
      continue;
    }
    const choices=Array.isArray(kind)?kind:kind==='COMBO'?options.options:kind==='COMFY_DYNAMICCOMBO_V3'?options.options?.map((option:any)=>option.key):undefined;
    if(Array.isArray(choices)){
      const values=options.multiselect===true&&Array.isArray(value)?value:[value];
      if(values.some(item=>!choices.includes(item)))issue(field,`${String(value)} is not a currently supported ${field} option`);
    }
    if(kind==='INT'&&(!Number.isInteger(value)||typeof value!=='number')||
       kind==='FLOAT'&&(typeof value!=='number'||!Number.isFinite(value))||
       kind==='BOOLEAN'&&typeof value!=='boolean'||
       kind==='STRING'&&typeof value!=='string')issue(field,`${field} does not match its ${String(kind)} node input type`);
    if(typeof value==='number'&&(!Number.isFinite(value)||typeof options.min==='number'&&value<options.min||typeof options.max==='number'&&value>options.max))issue(field,`${field} is outside the node's supported range`);
    const maximum=options.maxLength??options.max_length;
    if(typeof value==='string'&&typeof maximum==='number'&&value.length>maximum)issue(field,`${field} exceeds its ${maximum}-character limit`);
  }
  // A child belonging to a different selected dynamic branch must not leak into
  // the submitted provider body (for example Pro settings on Standard dubbing).
  const dynamicParents=[...fields].filter(([,field])=>field.spec[0]==='COMFY_DYNAMICCOMBO_V3').map(([key])=>key+'.');
  for(const field of Object.keys(node.inputs))if(!fields.has(field)&&dynamicParents.some(prefix=>field.startsWith(prefix)))issue(field,'This control is not available for the selected option');
  return issues;
}
