import sharp from 'sharp';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
const folder = path.resolve('artifacts/inspection-build/production'), media = path.resolve('data/media');
await mkdir(folder, { recursive: true });
const requests = JSON.parse(await readFile(path.join(folder, 'requests.json'), 'utf8'));
const details = new Map<string, any>(), cards: any[] = [];
for (const request of requests.filter((item: any) => item.body.modelId === 'bfl/flux-3-image')) {
  if (!details.has(request.body.projectId)) details.set(request.body.projectId, await fetch('http://127.0.0.1:4310/api/projects/' + request.body.projectId).then(response => response.json()));
  const detail = details.get(request.body.projectId), take = detail.takes.find((item: any) => item.id === request.takeId);
  if (take?.status !== 'COMPLETED') continue;
  const asset = take.assetIds.map((id: string) => detail.assets.find((item: any) => item.id === id)).find((item: any) => item.kind === 'image' && item.metadata.operation !== 'asset-poster'); if (!asset) continue;
  const file = path.resolve(media, asset.fileName); if (path.dirname(file) !== media) throw new Error('Invalid managed filename');
  cards.push({ key: request.key, title: take.name, projectId: take.projectId, takeId: take.id, assetId: asset.id, file });
}
const esc = (value: string) => value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[character]!));
for (let start = 0; start < cards.length; start += 28) {
  const batch = cards.slice(start, start + 28), width = 1400, cellWidth = 350, cellHeight = 340, height = Math.ceil(batch.length / 4) * cellHeight;
  const layers = [];
  for (const [index, card] of batch.entries()) {
    const left = index % 4 * cellWidth, top = Math.floor(index / 4) * cellHeight;
    layers.push({ input: await sharp(card.file).resize(330, 280, { fit: 'contain', background: '#15171d' }).png().toBuffer(), left: left + 10, top: top + 8 });
    layers.push({ input: Buffer.from(`<svg width="350" height="48"><rect width="350" height="48" fill="#15171d"/><text x="10" y="18" fill="#ffffff" font-size="13" font-family="Arial">${esc(card.title.slice(0, 45))}</text><text x="10" y="37" fill="#aeb7c9" font-size="11" font-family="Arial">${esc(card.assetId.slice(0, 8))} · ${esc(card.key)}</text></svg>`), left, top: top + 290 });
  }
  const target = path.join(folder, `contact-sheet-${Math.floor(start / 28) + 1}.jpg`); await sharp({ create: { width, height, channels: 3, background: '#15171d' } }).composite(layers).jpeg({ quality: 92 }).toFile(target); console.log(JSON.stringify({ file: target, items: batch.length }));
}
await writeFile(path.join(folder, 'contact-sheet-index.json'), JSON.stringify(cards, null, 2));
