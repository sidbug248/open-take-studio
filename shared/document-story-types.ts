import type { Asset, Take } from './types';

export interface DocumentStoryBeat {
  id: string;
  title: string;
  sourceText: string;
  prompt: string;
  caption: string;
  duration: number;
  assetId?: string;
  offset: number;
  audioAssetId?: string;
  audioOffset: number;
}
export interface DocumentStoryDocument {
  version: 1;
  name: string;
  sourceName: string;
  sourceText: string;
  planningMethod: 'local-paragraph-plan';
  beats: DocumentStoryBeat[];
}
export interface DocumentStorySaved {
  asset: Asset;
  take: Take;
  document: DocumentStoryDocument;
}
export interface DocumentStoryRendered extends DocumentStorySaved {
  captions: Asset;
  planAssetId: string;
  duration: number;
}

/** A transparent, deterministic first draft. This does not summarize or call a model. */
export function createDocumentStoryPlan(source: string, sourceName = 'Pasted text'): DocumentStoryDocument {
  const text = source.replace(/\r\n?/g, '\n').trim();
  if (!text || text.length > 60_000 || text.includes('\0')) {
    throw new Error('Use between 1 and 60,000 characters of plain text or Markdown.');
  }
  const paragraphs = text.split(/\n\s*\n/).filter(Boolean);
  const sections = paragraphs.flatMap(paragraph => {
    const parts: string[] = [];
    let remainder = paragraph;
    while (remainder.length > 6_000) {
      const boundary = Math.max(remainder.lastIndexOf(' ', 6_000), remainder.lastIndexOf('\n', 6_000));
      const cut = boundary >= 3_000 ? boundary : 6_000;
      parts.push(remainder.slice(0, cut).trim());
      remainder = remainder.slice(cut).trim();
    }
    if (remainder) parts.push(remainder);
    return parts;
  });
  const count = Math.min(8, sections.length);
  const groups = Array.from({ length: count }, (_, index) =>
    sections.slice(Math.floor(index * sections.length / count), Math.floor((index + 1) * sections.length / count)).join('\n\n'));
  const heading = text.match(/^#{1,6}\s+(.+)$/m)?.[1];
  return {
    version: 1, name: (heading || sourceName.replace(/\.(txt|md|markdown)$/i, '') || 'My story').slice(0, 150),
    sourceName: sourceName.slice(0, 180), sourceText: text, planningMethod: 'local-paragraph-plan',
    beats: groups.map((excerpt, index) => {
      const clean = excerpt.replace(/^#{1,6}\s+/gm, '').trim();
      return {
        id: crypto.randomUUID(), title: clean.split('\n')[0].slice(0, 90) || `Scene ${index + 1}`,
        sourceText: excerpt, prompt: clean.slice(0, 6_000),
        caption: clean.replace(/\s+/g, ' ').slice(0, 240), duration: 5, offset: 0, audioOffset: 0,
      };
    }),
  };
}
