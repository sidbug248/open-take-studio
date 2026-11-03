import type { Json, MediaKind } from './types';

export interface WorkflowNode { class_type: string; inputs: Record<string, unknown>; _meta?: { title?: string; [key:string]:unknown }; }
export type WorkflowGraph = Record<string, WorkflowNode>;
export interface WorkflowBinding {
  key:string; label:string; nodeId:string; inputName:string;
  kind:'string'|'number'|'boolean'|'image'|'video'|'audio';
  required:boolean; defaultValue?:string|number|boolean;
  min?:number; max?:number; options?:string[];
}
export interface WorkflowDependency { nodeId:string; classType:string; models:Record<string,string>; }
export interface WorkflowVersion {
  cloudEditorUrl?:string; cloudWorkspace?:{id:string;name:string};
  format:'open-take-comfy-workflow'; version:1; name:string; description:string;
  editorGraph:Json; apiGraph:WorkflowGraph; bindings:WorkflowBinding[];
  outputNodeIds:string[]; outputKind:MediaKind; dependencies:WorkflowDependency[];
  graphSha256:string; parentVersionAssetId?:string; createdAt:string;
  target:'comfy-cloud';
}
export interface WorkflowProgress {
  value:number; nodesDone:number|null; nodesTotal:number|null;
  currentNode:string|null; currentNodeClass:string|null; step:number|null; steps:number|null; message:string|null;
}
export interface WorkflowExecution {
  origin?:'studio'|'cloud-editor';
  versionAssetId:string; graphSha256:string; target:'comfy-cloud';
  values:Record<string,string|number|boolean|{assetId:string}>;
  uploads?:Record<string,{assetId:string;remoteId:string;sha256:string}>;
  cloudStatus?:string; progress?:WorkflowProgress;
  executedGraphAssetId?:string; expiresAt?:string;
  submissionOutcome?:'not-submitted'|'accepted'|'rejected'|'unknown';
}
export interface WorkflowValidation {
  checkedAt:string; target:'comfy-cloud'; valid:boolean;
  issues:{nodeId:string;field?:string;message:string}[];
  nodes:{nodeId:string;classType:string;available:boolean;partnerNode:boolean;models:Record<string,string>}[];
}
