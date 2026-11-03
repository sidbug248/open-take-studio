export interface GenerationAccessGate {blocked:()=>boolean;onRequired:(message?:string)=>void;}
/** The connection dialog owns this error; creation controls keep their drafts intact. */
export class GenerationConnectionRequiredError extends Error {
  readonly code = 'generation_connection_required';
  constructor(message = 'Connect your Comfy workspace before generating. Your current draft is unchanged.') {
    super(message);
    this.name = 'GenerationConnectionRequiredError';
  }
}
export function isGenerationConnectionRequiredError(error: unknown): error is GenerationConnectionRequiredError {
  return error instanceof GenerationConnectionRequiredError;
}
let generationAccessGate:GenerationAccessGate|undefined;
export function registerGenerationAccessGate(gate:GenerationAccessGate){generationAccessGate=gate;return()=>{if(generationAccessGate===gate)generationAccessGate=undefined;};}
export function isGenerationRequest(path:string,method='GET'){const route=path.split('?')[0];return method.toUpperCase()==='POST'&&(route==='/api/generate'||/^\/api\/workflows\/[^/]+\/run$/.test(route)||/^\/api\/(?:workflow-)?jobs\/[^/]+\/retry$/.test(route));}
export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const generation=isGenerationRequest(path,init?.method);
  if(generation&&generationAccessGate?.blocked()){generationAccessGate.onRequired();throw new GenerationConnectionRequiredError();}
  const headers = new Headers(init?.headers);
  if (init?.body && !(init.body instanceof FormData)) headers.set('Content-Type', 'application/json');
  const response = await fetch(path, { ...init, headers });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: response.statusText }));
    if(generation&&generationAccessGate){const code=error.code||error.errorType;const message=String(error.error||error.message||'');if(['credential_unavailable','credential_required','credential_expired','invalid_credentials','permission_denied','insufficient_credits'].includes(code)||([401,402,403].includes(response.status)&&/comfy|credential|api key|insufficient.*credit/i.test(message))){const connectionMessage=message||'Your Comfy connection needs attention before this request can proceed.';generationAccessGate.onRequired(connectionMessage);throw new GenerationConnectionRequiredError(connectionMessage);}}
    throw new Error(error.error || error.message || `Request failed (${response.status})`);
  }
  return response.json() as Promise<T>;
}
export const json = (value: unknown) => JSON.stringify(value);
export function downloadText(name: string, body: string, type = 'text/plain') {
  const url = URL.createObjectURL(new Blob([body], { type }));
  const link = document.createElement('a'); link.href = url; link.download = name; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
