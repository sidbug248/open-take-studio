import { XMLParser, XMLValidator } from 'fast-xml-parser';
import sharp from 'sharp';

const SVG_NS = 'http://www.w3.org/2000/svg';
const tags = new Set(['svg', 'g', 'path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'defs', 'linearGradient', 'radialGradient', 'stop', 'clipPath', 'mask', 'title', 'desc', 'text', 'tspan']);
const attributes = new Set(['id', 'class', 'viewBox', 'width', 'height', 'x', 'y', 'x1', 'x2', 'y1', 'y2', 'cx', 'cy', 'r', 'rx', 'ry', 'dx', 'dy', 'd', 'points', 'transform', 'gradientTransform', 'gradientUnits', 'spreadMethod', 'offset', 'fill', 'fill-opacity', 'fill-rule', 'stroke', 'stroke-width', 'stroke-opacity', 'stroke-linecap', 'stroke-linejoin', 'stroke-miterlimit', 'stroke-dasharray', 'stroke-dashoffset', 'opacity', 'color', 'stop-color', 'stop-opacity', 'clip-path', 'clip-rule', 'clipPathUnits', 'mask', 'maskUnits', 'maskContentUnits', 'font-family', 'font-size', 'font-weight', 'font-style', 'text-anchor', 'dominant-baseline', 'letter-spacing', 'word-spacing', 'preserveAspectRatio', 'version']);
const numeric = new Set(['width', 'height', 'x', 'y', 'x1', 'x2', 'y1', 'y2', 'cx', 'cy', 'r', 'rx', 'ry', 'dx', 'dy', 'offset', 'fill-opacity', 'stroke-width', 'stroke-opacity', 'stroke-miterlimit', 'stroke-dasharray', 'stroke-dashoffset', 'opacity', 'stop-opacity', 'font-size', 'letter-spacing', 'word-spacing']);
const styles = new Set(['fill', 'fill-opacity', 'fill-rule', 'stroke', 'stroke-width', 'stroke-opacity', 'stroke-linecap', 'stroke-linejoin', 'stroke-miterlimit', 'stroke-dasharray', 'stroke-dashoffset', 'opacity', 'color', 'stop-color', 'stop-opacity', 'clip-path', 'clip-rule', 'mask', 'font-family', 'font-size', 'font-weight', 'font-style', 'text-anchor', 'dominant-baseline', 'letter-spacing', 'word-spacing']);
attributes.add('display'); styles.add('display');
const escape = (text: string) => text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;');
function fail(message: string): never { throw new Error(`SVG rejected: ${message}`); }
function decode(value: string): string {
  return value.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (whole, entity: string) => {
    if (entity.startsWith('#')) { const point = entity[1]?.toLowerCase() === 'x' ? parseInt(entity.slice(2), 16) : Number(entity.slice(1)); if (!Number.isInteger(point) || point <= 0 || point > 0x10ffff || point >= 0xd800 && point <= 0xdfff) fail('invalid character entity'); return String.fromCodePoint(point); }
    return ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" } as Record<string, string>)[entity.toLowerCase()] ?? whole;
  });
}
export function looksLikeSvg(bytes: Buffer, claimedMime = ''): boolean {
  if (claimedMime.split(';')[0] === 'image/svg+xml') return true;
  return /^\s*(?:<\?xml[^>]*\?>\s*)?<svg(?:\s|>)/i.test(bytes.subarray(0, 512).toString('utf8').replace(/^\uFEFF/, ''));
}

/** A deliberately restricted vector subset, rebuilt from parsed XML. No DTD,
 * entities, links, image/use/foreignObject/script, CSS rules, filters or events
 * can reach the renderer or downloadable document. Unsupported constructs fail
 * visibly rather than being silently treated as a faithful vector export. */
export function sanitizeSvg(input: Buffer): { bytes: Buffer; width: number; height: number; metadataOmitted: boolean } {
  if (!input.length || input.length > 4 * 1024 * 1024) fail('source exceeds the 4 MiB vector limit');
  let source: string;
  try { source = new TextDecoder('utf-8', { fatal: true }).decode(input).replace(/^\uFEFF/, ''); } catch { return fail('source must be UTF-8'); }
  if (/<!\s*(?:DOCTYPE|ENTITY)/i.test(source) || /<\?(?!xml(?:\s|\?>))/i.test(source)) fail('document declarations and processing instructions are not permitted');
  if ((source.match(/</g)?.length ?? 0) > 60000) fail('drawing complexity exceeds limits');
  if (XMLValidator.validate(source, { allowBooleanAttributes: false }) !== true) fail('malformed XML');
  const parser = new XMLParser({ preserveOrder: true, ignoreAttributes: false, ignoreDeclaration: true, processEntities: false, parseTagValue: false, parseAttributeValue: false, trimValues: false, allowBooleanAttributes: false });
  const parsed = parser.parse(source) as Record<string, any>[];
  const roots = parsed.filter(item => Object.keys(item).some(key => key !== '#text' && key !== ':@'));
  if (roots.length !== 1 || !Object.hasOwn(roots[0]!, 'svg')) fail('one SVG root is required');
  const ids = new Set<string>(), references: string[] = [];
  let nodes = 0, width = 1024, height = 1024, metadataOmitted = false;
  function valueFor(key: string, raw: unknown): string {
    const value = decode(String(raw)).trim();
    if (!value || value.length > 1_000_000 || /[\u0000-\u001f\\<>]/.test(value)) fail('invalid attribute value');
    if (/url\s*\(/i.test(value)) {
      const match = /^url\(\s*["']?#([A-Za-z0-9_.:-]{1,100})["']?\s*\)$/.exec(value);
      if (!match || !['fill', 'stroke', 'clip-path', 'mask'].includes(key)) fail('only local paint references are permitted');
      references.push(match[1]!); return `url(#${match[1]})`;
    }
    if (/javascript:|data:|https?:|file:|@import|expression\s*\(/i.test(value) || value.includes('&')) fail('external or encoded references are not permitted');
    if (key === 'display' && !['block', 'inline', 'none'].includes(value)) fail('unsupported display value');
    if (numeric.has(key) && !/^(?:none|[-+\d.eE%, px]+)$/.test(value)) fail('unsupported numeric attribute');
    if (['d', 'points', 'viewBox'].includes(key) && !/^[MmZzLlHhVvCcSsQqTtAa\d.eE+\-,\s]+$/.test(value)) fail('unsupported path or coordinate expression');
    if (['transform', 'gradientTransform'].includes(key) && !/^(?:(?:matrix|translate|scale|rotate|skewX|skewY)\([-+\d.eE,\s]+\)\s*)+$/.test(value)) fail('unsupported transform');
    if (['fill', 'stroke', 'color', 'stop-color'].includes(key) && !/^(?:#[0-9a-fA-F]{3,8}|[A-Za-z]+|(?:rgb|rgba|hsl|hsla)\([-+\d.,%\s]+\))$/.test(value)) fail('unsupported paint');
    if (['id', 'class'].includes(key) && !/^[A-Za-z0-9_.:\-\s]{1,200}$/.test(value)) fail('unsupported identifier');
    if (key === 'id') { if (ids.has(value)) fail('duplicate identifiers'); ids.add(value); }
    if (numeric.has(key) || ['d', 'points', 'viewBox', 'transform', 'gradientTransform'].includes(key)) {
      for (const token of value.match(/[-+]?(?:\d*\.)?\d+(?:[eE][-+]?\d+)?/g) ?? []) if (!Number.isFinite(Number(token)) || Math.abs(Number(token)) > 1_000_000) fail('coordinate exceeds the safe drawing range');
    }
    return value;
  }
  function render(item: Record<string, any>, depth: number): string {
    if (++nodes > 30000 || depth > 50) fail('drawing complexity exceeds limits');
    if (Object.hasOwn(item, '#text')) return escape(decode(String(item['#text'])));
    const name = Object.keys(item).find(key => key !== ':@');
    // Nonvisual provider metadata may sign the original bytes. Omit it rather
    // than implying the sanitized, changed vector retains that signature.
    if (name === 'metadata' && depth > 0) { metadataOmitted = true; return ''; }
    if (!name || !tags.has(name) || name === 'svg' && depth !== 0) fail('unsupported element');
    const result: Record<string, string> = {};
    for (const [rawKey, rawValue] of Object.entries(item[':@'] ?? {})) {
      const key = rawKey.startsWith('@_') ? rawKey.slice(2) : rawKey;
      if (key === 'xmlns' && name === 'svg' && rawValue === SVG_NS) continue;
      if (key === 'xmlns:xlink' && rawValue === 'http://www.w3.org/1999/xlink') continue;
      if (key === 'xmlns:c2pa') { metadataOmitted = true; continue; }
      if (key === 'style') {
        const style = decode(String(rawValue));
        if (style.length > 20000 || /[\\{}@]/.test(style)) fail('unsupported style');
        for (const declaration of style.split(';').filter(text => text.trim())) {
          const colon = declaration.indexOf(':');
          if (colon < 1) fail('malformed style');
          const property = declaration.slice(0, colon).trim();
          if (!styles.has(property)) fail('unsupported style property');
          result[property] = valueFor(property, declaration.slice(colon + 1));
        }
        continue;
      }
      if (!attributes.has(key)) fail('unsupported attribute');
      result[key] = valueFor(key, rawValue);
    }
    if (name === 'svg') {
      const box = result.viewBox?.split(/[\s,]+/).map(Number);
      const numericWidth = Number(result.width?.replace(/px$/, '')), numericHeight = Number(result.height?.replace(/px$/, ''));
      width = Number.isFinite(numericWidth) && numericWidth > 0 ? numericWidth : box?.[2] ?? 1024;
      height = Number.isFinite(numericHeight) && numericHeight > 0 ? numericHeight : box?.[3] ?? 1024;
      if (!(width > 0 && height > 0 && width <= 4096 && height <= 4096) || box && (box.length !== 4 || box[2]! <= 0 || box[3]! <= 0)) fail('invalid drawing dimensions');
      result.width = String(width); result.height = String(height); result.xmlns = SVG_NS;
    }
    const children = item[name];
    if (!Array.isArray(children)) fail('invalid parsed drawing');
    return `<${name}${Object.entries(result).map(([key, value]) => ` ${key}="${escape(value)}"`).join('')}>${children.map(child => render(child, depth + 1)).join('')}</${name}>`;
  }
  const output = render(roots[0]!, 0);
  for (const reference of references) if (!ids.has(reference)) fail('paint reference points outside the drawing');
  return { bytes: Buffer.from(output, 'utf8'), width, height, metadataOmitted };
}

export async function rasterizeSvg(bytes: Buffer): Promise<Buffer> {
  const safe = sanitizeSvg(bytes);
  return sharp(safe.bytes, { limitInputPixels: 16_777_216, density: 96 }).resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true }).png().timeout({ seconds: 15 }).toBuffer();
}
