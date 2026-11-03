import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import path from 'node:path';
import type { Asset, Json, MediaKind } from '../shared/types.ts';
import { looksLikeSvg, sanitizeSvg, rasterizeSvg } from './svg.ts';

export const MAX_MEDIA_BYTES = 300 * 1024 * 1024;
export class MediaValidationError extends Error { readonly status=400; }
const mimeExtensions: Record<string, string> = {'image/png':'png','image/jpeg':'jpg','image/webp':'webp','image/avif':'avif','image/gif':'gif','video/mp4':'mp4','video/webm':'webm','video/quicktime':'mov','audio/mpeg':'mp3','audio/wav':'wav','audio/ogg':'ogg','audio/flac':'flac','audio/mp4':'m4a','model/gltf-binary':'glb','application/zip':'zip','application/json':'json','text/plain':'txt','text/vtt':'vtt','application/pdf':'pdf'};
const ascii = (b: Buffer, offset: number, count: number) => b.subarray(offset, offset+count).toString('ascii');
export function identifyMedia(bytes: Buffer, claimedMime = 'application/octet-stream'): {mimeType:string;kind:MediaKind;extension:string} {
  if (!bytes.length || bytes.length > MAX_MEDIA_BYTES) throw new MediaValidationError('Media must contain data and be no larger than 300 MiB');
  let mime = '';
  if (bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) mime='image/png';
  else if (bytes[0]===0xff && bytes[1]===0xd8 && bytes[2]===0xff) mime='image/jpeg';
  else if (ascii(bytes,0,4)==='RIFF' && ascii(bytes,8,4)==='WEBP') mime='image/webp';
  else if (['GIF87a','GIF89a'].includes(ascii(bytes,0,6))) mime='image/gif';
  else if (ascii(bytes,4,4)==='ftyp') { const brand=ascii(bytes,8,4); mime=['avif','avis'].includes(brand)?'image/avif':brand==='M4A '?'audio/mp4':brand==='qt  '?'video/quicktime':'video/mp4'; }
  else if (bytes.subarray(0,4).equals(Buffer.from([0x1a,0x45,0xdf,0xa3]))) mime='video/webm';
  else if (ascii(bytes,0,4)==='RIFF' && ascii(bytes,8,4)==='WAVE') mime='audio/wav';
  else if (ascii(bytes,0,3)==='ID3' || (bytes[0]===0xff && (bytes[1]! & 0xe0)===0xe0)) mime='audio/mpeg';
  else if (ascii(bytes,0,4)==='OggS') mime='audio/ogg';
  else if (ascii(bytes,0,4)==='fLaC') mime='audio/flac';
  else if (ascii(bytes,0,4)==='glTF') mime='model/gltf-binary';
  else if (ascii(bytes,0,4)==='PK\x03\x04') mime='application/zip';
  else if (ascii(bytes,0,5)==='%PDF-') mime='application/pdf';
  else if (looksLikeSvg(bytes, claimedMime)) { try { sanitizeSvg(bytes); } catch (error) { throw new MediaValidationError(`Unsupported SVG: ${error instanceof Error ? error.message : 'Invalid drawing'}`); } return { mimeType: 'image/svg+xml', kind: 'document', extension: 'svg' }; }
  else if (claimedMime.split(';')[0]==='application/json') { try { JSON.parse(bytes.toString('utf8')); } catch { throw new MediaValidationError('Invalid JSON reference artifact'); } mime='application/json'; }
  else if (['text/plain','text/vtt'].includes(claimedMime.split(';')[0])) {
    const content=bytes.toString('utf8');
    if (content.includes('\0') || /<\s*(?:html|script|svg|iframe)\b/i.test(content)) throw new MediaValidationError('Active HTML/SVG content is not accepted');
    mime=claimedMime.split(';')[0]!;
    if (mime==='text/vtt' && !content.trimStart().startsWith('WEBVTT')) throw new MediaValidationError('A subtitle file must start with WEBVTT');
  }
  if (!mime) throw new MediaValidationError('Unsupported media format. Use PNG, JPEG, WebP, AVIF, GIF, MP4, WebM, WAV, MP3, OGG, FLAC, GLB, ZIP, JSON, PDF, TXT or VTT.');
  const kind: MediaKind = mime.startsWith('image/')?'image':mime.startsWith('video/')?'video':mime.startsWith('audio/')?'audio':mime==='model/gltf-binary'?'3d':'document';
  return {mimeType:mime,kind,extension:mimeExtensions[mime]!};
}
export interface PutMedia {projectId:string;name:string;mimeType:string;bytes:Buffer|Uint8Array;provenance:Asset['provenance'];metadata?:Json;kind?:MediaKind;id?:string;}
export interface MediaStorage { put(input:PutMedia):Promise<Asset>; read(asset:Asset):Promise<Buffer>; path(asset:Asset):string; toDataUri(asset:Asset):Promise<string>; }
export class LocalFileStorage implements MediaStorage {
  readonly root: string;
  constructor(dataDir: string) { this.root=path.resolve(dataDir,'media'); }
  path(asset: Pick<Asset,'fileName'>): string {
    if (!/^[a-zA-Z0-9_-]+\.[a-z0-9]+$/.test(asset.fileName)) throw new Error('Invalid managed media file name');
    const destination=path.resolve(this.root,asset.fileName);
    if (path.dirname(destination)!==this.root) throw new Error('Media path escapes managed storage');
    return destination;
  }
  async put(input:PutMedia):Promise<Asset> {
    let bytes:Buffer=Buffer.from(input.bytes);
    let mimeType=input.mimeType,metadata=input.metadata??{};
    if (looksLikeSvg(bytes,mimeType)) {
      const sourceSha256=createHash('sha256').update(bytes).digest('hex'),safe=sanitizeSvg(bytes);
      const importedHistory=input.provenance==='imported'&&metadata.svgSanitized===true&&typeof metadata.svgSourceSha256==='string'&&/^[a-f0-9]{64}$/.test(metadata.svgSourceSha256);
      metadata={...metadata,svgSanitized:true,svgSourceSha256:importedHistory?metadata.svgSourceSha256:sourceSha256,svgCollectionInputSha256:sourceSha256,svgSourceHashFromImportedHistory:importedHistory,svgSanitizedSha256:createHash('sha256').update(safe.bytes).digest('hex'),svgWidth:safe.width,svgHeight:safe.height,svgMetadataOmitted:safe.metadataOmitted||(importedHistory&&metadata.svgMetadataOmitted===true),svgProviderSignaturePreserved:false};
      if(input.kind==='image'){bytes=await rasterizeSvg(safe.bytes);mimeType='image/png';metadata.svgRasterPreview=true;}
      else {bytes=safe.bytes;mimeType='image/svg+xml';}
    }
    const format=identifyMedia(bytes,mimeType);
    if(input.kind&&input.kind!==format.kind&&!(input.kind==='3d'&&format.mimeType==='application/zip'))throw new MediaValidationError('Media kind does not match file contents');
    const id=input.id??randomUUID();
    if (!/^[a-zA-Z0-9_-]{1,128}$/.test(id)) throw new Error('Invalid asset ID');
    const fileName=`${id}.${format.extension}`;
    const sha256=createHash('sha256').update(bytes).digest('hex');
    await mkdir(this.root,{recursive:true});
    const destination=this.path({fileName});
    try {
      const existing=await readFile(destination);
      if (createHash('sha256').update(existing).digest('hex')!==sha256) throw new Error('An existing asset cannot be overwritten with different content');
    } catch(error) {
      if ((error as NodeJS.ErrnoException).code!=='ENOENT') throw error;
      const temp=`${destination}.${randomUUID()}.partial`;
      await writeFile(temp,bytes,{flag:'wx'});
      await rename(temp,destination);
    }
    return {id,projectId:input.projectId,name:input.name.replace(/[\u0000-\u001f]/g,'').slice(0,240)||`Asset.${format.extension}`,kind:input.kind??format.kind,mimeType:format.mimeType,fileName,size:bytes.length,sha256,provenance:input.provenance,createdAt:new Date().toISOString(),metadata,url:`/api/assets/${id}/file`};
  }
  read(asset:Asset):Promise<Buffer> { return readFile(this.path(asset)); }
  async toDataUri(asset:Asset):Promise<string> { return `data:${asset.mimeType};base64,${(await this.read(asset)).toString('base64')}`; }
}
