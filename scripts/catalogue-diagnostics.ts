// Read-only result diagnostics for an already accepted Router request.
import '../server/config.ts';
import { safeMessage } from '../server/config.ts';
import { comfy } from '@comfyorg/sdk';
import { downloadMedia } from '../server/download.ts';
import { sanitizeSvg, rasterizeSvg } from '../server/svg.ts';
const [modelId, requestId] = process.argv.slice(2);
if (!modelId || !requestId) throw new Error('Pass the existing model and request ID.');
comfy.config({ credentials: process.env.COMFY_API_KEY?.trim(), baseUrl: 'https://api.comfy.org' });
try {
  const result = await comfy.models.handle(modelId, requestId).get({ retry: false, timeoutMs: 30000 });
  console.log(JSON.stringify({ kind: result.kind, requestId: result.requestId, creditsUsed: result.creditsUsed ?? null, hasResult: true }));
  if (process.argv.includes('--svg-properties') && result.kind === 'json') {
    const url = (result.data as any).data?.[0]?.url;
    if (typeof url !== 'string') throw new Error('Expected a vector media result.');
    const { bytes } = await downloadMedia(url), source = bytes.toString('utf8');
    const styleProperties = [...new Set([...source.matchAll(/\bstyle=["']([^"']*)["']/g)].flatMap(match => match[1]!.split(';').map(part => part.split(':')[0]?.trim()).filter(Boolean)))];
    const elementNames = [...new Set([...source.matchAll(/<([A-Za-z][\w:-]*)\b/g)].map(match => match[1]))];
    const displayValues = [...new Set([...source.matchAll(/(?:^|["';\s])display\s*:\s*([^;"']+)/g)].map(match => match[1]!.trim()))];
    const attributeNames = [...new Set([...source.matchAll(/\s([A-Za-z][\w:-]*)\s*=/g)].map(match => match[1]))];
    console.log(JSON.stringify({ bytes: bytes.length, styleProperties, displayValues, elementNames, attributeNames }));
    if (process.argv.includes('--validate-vector')) { const sanitized = sanitizeSvg(bytes), png = await rasterizeSvg(sanitized.bytes); console.log(JSON.stringify({ safeVectorBytes: sanitized.bytes.length, rasterPreviewBytes: png.length, width: sanitized.width, height: sanitized.height, metadataOmitted: sanitized.metadataOmitted, safeToCollect: true })); }
  }
} catch (error) {
  const detail = error as any;
  console.log(JSON.stringify({ modelId, requestId, httpStatus: detail.httpStatus, errorType: detail.errorType, diagnosticRequestId: detail.requestId, message: safeMessage(error) }));
}
