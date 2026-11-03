import { readFile, writeFile } from 'node:fs/promises';
const cards = JSON.parse(await readFile('artifacts/inspection-build/production/contact-sheet-index.json', 'utf8'));
const selected = [
  ['saffron-study-3', 'Clean floating product hero; recognizable kettle geometry, generous negative space and a strong coral/cobalt palette.'],
  ['couture-study-4', 'Clear full-body fashion silhouette and contrasting wet-rooftop light; useful base for a deliberate walking performance.'],
  ['botanical-study-1', 'Readable mechanical creature and seed capsule against a restrained warm ground; strong materials and separation.'],
  ['monument-study-1', 'A genuinely distinct interior composition extends the shell architecture and opens a coherent story location.'],
  ['paper-study-1', 'The pilot is clearly staged on the glider with a readable city, suitable for directional flight animation.'],
  ['reef-study-3', 'The reef cathedral changes scale and depth while preserving the chrome subject; strong cinematic framing.'],
  ['tidal-study-6', 'The moonlit gate supplies a clear later story beat and tonal alternative to the dawn source.'],
  ['pocket-study-3', 'A tangible original robot performing a garden task; readable limbs, wheelbarrow and environmental depth.'],
];
const records = [];
for (const [key, review] of selected) {
  const card = cards.find((item: any) => item.key === key); if (!card) throw new Error('Missing selected card ' + key);
  for (const [route, body] of [[`/takes/${card.takeId}`, { favorite: true }], [`/projects/${card.projectId}`, { coverAssetId: card.assetId }]] as const) {
    const result = await fetch('http://127.0.0.1:4310/api' + route, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); if (!result.ok) throw new Error('Curation update failed: ' + result.status);
  }
  records.push({ ...card, review, visuallyReviewedAt: new Date().toISOString() });
}
await writeFile('artifacts/inspection-build/production/curated-selects.json', JSON.stringify(records, null, 2)); console.log(JSON.stringify({ curatedProjects: records.length }));
