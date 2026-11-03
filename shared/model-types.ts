export type ModelKind = 'image' | 'video' | 'audio' | '3d' | 'document';
export type ModelSetting = string | number | boolean;
export type ModelControl = {
  key: string;
  label: string;
  type: 'number' | 'select' | 'boolean' | 'text';
  default?: ModelSetting;
  options?: (string | number)[];
  min?: number;
  max?: number;
  step?: number;
  description?: string;
};
export type ModelInput = {
  key: string;
  label: string;
  kind: 'image' | 'video' | 'audio';
  required?: boolean;
  multiple?: boolean;
  maxItems?: number;
  description?: string;
  /** Resolved by the server from a selected project asset, never a browser URL. */
  transport?: 'data-uri' | 'cloud-asset-url';
};
export type ModelDescriptor = {
  id: string;
  name: string;
  provider: string;
  kind: ModelKind;
  capabilities: string[];
  description: string;
  documentation: string;
  verifiedAt: string;
  controls: ModelControl[];
  inputs: ModelInput[];
  promptField?: string;
  promptRequired?: boolean;
  status: 'implemented' | 'experimental' | 'unavailable';
  delivery: 'queue' | 'sync';
  notes?: string;
  outputFormat?: 'json' | 'binary';
};
export type ModelBuildContext = {
  prompt: string;
  settings: Record<string, unknown>;
  inputData: Record<string, string | string[]>;
};
export type ModelMedia = { url?: string; bytes?: Uint8Array; mimeType?: string; name?: string; kind?: ModelKind | 'document' };
