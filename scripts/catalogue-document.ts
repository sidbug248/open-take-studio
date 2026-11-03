// Render the dated implementation inventory without opening or changing a DB.
import { writeFile } from 'node:fs/promises';
import { CAPABILITY_FAMILIES } from '../shared/capability-inventory.ts';
import { CAPABILITY_INVENTORY } from '../server/catalogue-routes.ts';
import { MODEL_REGISTRY } from '../server/model-registry.ts';
import type { CatalogueResponse } from '../shared/capability-inventory.ts';
const escape = (value: string) => value.replaceAll('|', '\\|').replaceAll('\n', ' ');
let live: CatalogueResponse | undefined;
if (process.argv.includes('--live')) {
  const response = await fetch('http://127.0.0.1:4310/api/catalogue');
  if (!response.ok) throw new Error(`Live catalogue returned HTTP ${response.status}`);
  live = await response.json() as CatalogueResponse;
}
const inventory = live?.capabilities ?? CAPABILITY_INVENTORY;
const introduction = `# Capability inventory · 2026-11-03

Open Take Studio keeps three distinct layers: creator outcomes, reusable project recipes, and an advanced model directory. This inventory records the complete twelve-family scope; it does not describe every discovered model as executable. The runtime source is [server/catalogue-routes.ts](../server/catalogue-routes.ts), with public contracts in [shared/capability-inventory.ts](../shared/capability-inventory.ts).

## Discovery and readiness

On 2026-11-03 at 05:20:28 UTC, authenticated read-only discovery returned **253 Router catalog entries and 253 successful native-schema reads**. The dated [catalogue snapshot](schemas/catalogue-snapshot.json) records model IDs, provider, input/output modalities, schema version/read time and policy-refusal billing facts. [Refresh script](../scripts/catalogue-refresh.ts) reads only model metadata and schemas; it cannot generate, buy credits, alter an account or activate another service. Z-Image Turbo was absent from this catalog. FLUX 3 Image remains the initial image route.

There are ${MODEL_REGISTRY.length} Router model adapters in source, of which ${MODEL_REGISTRY.filter(model => model.status !== 'unavailable').length} currently permit admission. VEED cleanup is disabled after actual Router admission returned not_enabled. Kling extension is disabled after a real Kling 2.6 predecessor returned invalid_input; the documented legacy predecessor versions are absent from this Router catalog. H3 Router base_video regeneration is separately disabled; the intended 768P-to-2K outcome is proven through an explicitly labelled native Comfy Cloud partner workflow. A schema HTTP 200 proves discovery, not generation success or account entitlement. The directory exposes all 253 entries for inspection; planned items name exact dependencies.

- **Ready:** implemented local operation, or a matching model/mode has a saved successful generated output.
- **Needs input:** a matching live generation is proven, but the operation requires selected references or predecessor media.
- **Experimental:** implemented adapter with schema review but no saved matching live generation, or a new local module awaiting full validation.
- **Planned:** no executable studio route. A discovered candidate may be named without claiming an integration.

The catalogue stores explicit demonstrations inside each durable project: capability and operation, preview kind, input/output assets, take/job/request IDs, workflow version, verification time and attribution. Canonical image/video/audio/text/vector/mesh/scene/playable modalities drive filters independently of display text. Generation proof requires completed non-archived jobs and an exact matching operation. Generic reference editing does not certify a reference sheet or product scene; supplied-audio lip sync does not certify dubbing. Imported examples and labelled family artwork cannot promote readiness. The table below ${live ? `includes live evidence read at ${new Date().toISOString()}` : 'is the implementation baseline before live evidence is joined'}; \`GET /api/catalogue\` updates as saved proof arrives.

${live ? `This snapshot has **${live.counts.capabilities} creator outcomes**: ${live.counts.ready} ready, ${live.counts.needsInput} needing selected inputs, ${live.counts.experimental} experimental and ${live.counts.planned} planned. **${live.capabilities.filter(item => item.demonstrations.some(demo => demo.verificationKind !== 'concept')).length} outcomes have explicit saved demonstrations**. The rest use labelled illustrations. All ${live.models.length} model-directory entries have documentation links; catalogue presence alone is not a working adapter. The [complete visual-coverage CSVs](../artifacts/inspection-build/visual-coverage/summary.json) distinguish real evidence and family artwork.` : ''}

## New verified contracts

| Route | Implemented request and result | Boundary |
|---|---|---|
| meshy/meshy-7.1 | Preview: prompt, geometry resolution, remesh/topology/polycount, symmetry and pose. Refine: native preview task ID, optional texture prompt/image, texture resolution and PBR. GLB preferred; native task and response retained. | Text-to-3D only. Image-to-3D and retexture proxy operations are not silently translated. Preview and refine are separate requests. |
| meshy/rigging | Completed textured humanoid predecessor, positive height; rigged character plus returned walking/running GLBs. | A biped humanoid with distinct limbs is required. Props, untextured meshes and unclear anatomy are not assumed compatible. |
| meshy/animations | Completed rig task ID plus one documented library action ID; animated GLB. | Router currently exposes one action, not the direct provider's newer multi-action or text-motion API. Optional FBX/USDZ post-processing is not exposed. |
| ltx/ltx-2-5-fast | Text prompt, native duration/resolution/fps and audio flag; result.video_url. | Text-to-video only on this route; maximum duration varies by resolution/fps. Native failure is terminal, not a completed take. |
| bfl/flux-pro-1.0-expand | Raw base64 image and per-side expansion margins; result.sample. | At least one positive margin; max 2048 pixels per side. Native outpainting, not an invented workflow graph. |
| veed/clean-audio | Temporarily hosted selected speech recording, noise strength, normalization/LUFS, WAV or FLAC; data.result.audio.url. | Disabled: actual HTTP 403 not_enabled reports this catalogued model is not served. One attempt retained, no automatic retry. |
| recraft/recraftv4_1_vector | Prompt, n, size, response_format=url; actual SVG documents plus safe PNG previews. | Exact V4.1 documentation excludes legacy no_text/artistic_level despite the shared Router schema. Active SVG content, external references and unsupported constructs are rejected before rendering. |
| kling/kling-v2-6 | Text prompt, pro/std mode, duration, sound flag and optional native camera_control. | Actual pro five-second sound-off origin saved. Native camera controls and sound-on are separately untested. The generic extension route rejected this predecessor. |
| vertexai/gemini-3.1-flash-lite | Native contents parts with inline audio and transcription instruction; TEXT response, complete STOP candidate becomes transcript.txt. | Plain-text speech transcription only. No word alignment, automatic timed captions, inferred speaker identity or direct Google backend. |

[Meshy contracts](https://docs.comfy.org/development/comfy-router/models/meshy/meshy-7-1/code), [rigging requirements](https://docs.meshy.ai/en/api/rigging), [animation library](https://docs.meshy.ai/en/api/animation-library), [LTX Router contract](https://docs.comfy.org/development/comfy-router/models/ltx/ltx-2-5-fast/code), [FLUX Expand](https://docs.comfy.org/development/comfy-router/models/black-forest-labs/flux-pro-1-0-expand/code), [VEED native schema](https://api.comfy.org/v2/models/veed/clean-audio/openapi.json).

Meshy predecessor selection is enforced server-side by [model-dependencies.ts](../server/model-dependencies.ts): completed same-project non-archived locally generated task, matching native ID and stage, unexpired when expiry is supplied, correct parent/source relationship. A Router request ID is not a Meshy task ID. Imported execution records do not grant provider-account access. The local GLB remains durable when the provider task expires, but the expired native ID cannot be used for a later operation. Sculpture previews reject PBR refinement. Each stage has its own saved identity and lineage.

## Full outcome inventory
`;
let body = introduction;
for (const family of CAPABILITY_FAMILIES) {
  body += `\n### ${family.name}\n\n| Outcome | Baseline | Executable route / candidate | Requirements and limits |\n|---|---|---|---|\n`;
  for (const item of inventory.filter(item => item.family === family.id)) body += `| ${escape(item.name)} | ${item.readiness} | ${escape(item.route.kind === 'router' ? item.route.modelId! : item.route.kind === 'local' ? 'Local ' + item.route.toolView : item.route.kind === 'comfy-workflow' ? 'Native Comfy Cloud workflow' : item.modelIds.length ? 'Candidate: ' + item.modelIds.join(', ') : 'No implemented route')} | ${escape((item.route.kind === 'planned' ? item.requirements : item.limitations.length ? item.limitations.filter(limit => !limit.startsWith('Schema-reviewed') && !limit.startsWith('External service')).slice(0, 2) : item.requirements).join(' '))} |\n`;
}
if (live) {
  body += '\n## Saved execution evidence\n\nThese are example references, not an exhaustive bill or a visual quality certification. Identical request IDs can support more than one user outcome and must not be counted as separate charges.\n\n| Outcome | Router request | Saved take | Saved asset |\n|---|---|---|---|\n';
  for (const capability of inventory.filter(item => item.lastVerified?.kind === 'live-generation')) {
    const example = capability.examples[0];
    if (example) body += `| ${escape(capability.name)} | ${example.requestId} | ${example.takeId} | ${example.assetId} |\n`;
  }
}
body += `
## Established product baseline

The [Higgsfield homepage](https://higgsfield.ai/) and [official tools guide](https://higgsfield.ai/enterprise-help-center/platform/tools-creative-workflow) were rechecked on November 3. They describe image/video/audio tools, cinema and marketing workflows, performance recasting, comics, playables, production automation, and shared projects. These are existing product categories, not claimed inventions of Open Take Studio.

The [Canvas introduction](https://higgsfield.ai/canvas-intro) and [Canvas help](https://higgsfield.ai/creator-hub/help-center/tools/how-do-i-use-canvas) establish node-based chaining, reference inputs, parallel comparison, reusable templates and collaboration as a baseline. This application currently has narrower scene dependency plans, recipes, shot batches and branching films. A general freeform node canvas and hosted collaborative editing remain explicit gaps. Prompt camera suggestions are not model-enforced camera controls; reference conditioning is not proven identity consistency.

## Billing evidence and execution attribution

The catalog's \`billing.charges_on_policy_rejection\` field is a refusal-policy fact, not a price quote. The [Router billing contract](https://docs.comfy.org/development/comfy-router/billing) says \`X-Comfy-Credits-Used\` is available only on some successful responses. Absent means unknown, never zero or free. Replayed headers refer to the original charge. Provider response fields such as Meshy consumed credits, BFL cost or VEED credits charged are **not** the Comfy charge. Actual available SDK credits metadata is preserved per job.

The [committed-spend headers](https://docs.comfy.org/development/comfy-router/headers) describe outstanding in-flight commitments, not an account balance or cumulative budget. No documented Router balance endpoint or complete numeric price response was found in the inspected catalog/schema/SDK contract. Reconcile usage in the [Comfy workspace](https://platform.comfy.org/) rather than inventing a cost. No account top-up, paid upgrade or external hosting activation was performed by catalog discovery.

Router adapters execute only through lowercase \`comfy.models\`. The later inspection brief additionally authorizes native Comfy Cloud workflow execution through a separate, explicitly labelled client/port. Native graphs are never submitted to Router. Real Z-Image Turbo generation, local-node image finishing, checkpoint-based H3 I2V and the MiniMax H3 regeneration partner node have separate graph/version/request evidence. Temporary asset uploads remain a storage transport. Public family weights and their licenses do not attest exact hosted bytes or every auxiliary stage; the [model audit](../shared/model-audit.ts) never awards an unenforceable all-open-weights badge.

## Validation and production receipts

[Catalogue tests](../tests/catalogue.test.ts) cover all twelve families, truthful unadapted-model inspection, mode-specific proof, imported/archived exclusions, Meshy dependency ownership/stage/expiry, accurate mode snapshots, native failure handling, GLB outputs, LTX exact envelopes, outpainting margins and cleanup responses. [Model tests](../tests/model-registry.test.ts) validate adapter defaults against fetched Router schemas, including required-only union branches.

Authorized production uses [produce-catalogue.ts](../scripts/produce-catalogue.ts) through the local application API only. Exact request bodies and stable client identities are stored before admission in \`artifacts/next-build/catalogue-production/submissions.json\`. A single Meshy preview is validated before broadening to the other original subjects; later stages use actual eligible native predecessor IDs. Status reads report real request IDs, saved output asset IDs and reported credits or unknown. No new submission identity is generated to retry an insufficient-credit failure.

The inspection expansion uses [inspection-production.ts](../scripts/inspection-production.ts). Its exact pre-admission bodies and stable identities are in \`artifacts/inspection-build/production/requests.json\`; [summary](../artifacts/inspection-build/production/summary.json) counts actual stored outputs without posters. The still contact sheets and curated selects support visual review. Native executions have separate receipts in \`artifacts/native-workflows/\`. Failed Seed requests, incompatible owl/robot rigs, Router regeneration and Kling extension remain failed history, without blind resubmission.
`;
await writeFile('docs/capability-inventory-2026-11-03.md', body);
console.log(JSON.stringify({ families: CAPABILITY_FAMILIES.length, capabilities: CAPABILITY_INVENTORY.length, adapters: MODEL_REGISTRY.length }));
