# Open Take Studio — November 3 creative build

Open Take Studio is a local, open-source production studio with a media-first creative stage. Its new instruments keep a saved source, camera guide, beat, frame branch or story decision connected to the resulting work. New inference uses Comfy Router; imported Comfy Cloud productions retain their original provenance.

## Run and explore

Open `http://127.0.0.1:4310`. Explore offers actual artwork, playable previews and a direct prompt/upload entry. Create opens the current material in a contextual workspace. Projects retains the full organizer. Recipes exposes media slots and editable creative ingredients. Catalogue separates usable tools, saved examples and documented model discovery.

For a fresh checkout, use Node 22.13 or newer, `npm ci`, copy `.env.example` to `.env`, enter the workspace key after `COMFY_API_KEY=`, then `npm run build` and `npm start`. On this Windows installation, `Start-OpenTakeStudio.ps1` launches the application. The key belongs only in the local file. No local inference/GPU installation is required. Three.js rendering uses the browser's available graphics capability.

## Demonstrations

| Creative experience | Actual deliverable and proof |
| --- | --- |
| Recipe → image/video creation → real frame branch | `artifacts/next-build/creator-journey/Creator-journey.mp4` records actual browser interactions. The Prismatic project retains the recipe, selected frame at 2.000 seconds/frame 48 and two completed H3 continuations. |
| A film with two possible worlds | `artifacts/next-build/prismatic-film/Prismatic-bloom.playable.zip`; normal paths `follow-light.mp4` and `enter-seed.mp4`. Both choices were played through with the studio process stopped. Independent preview: `http://127.0.0.1:4315`. |
| Direct the light and camera | `artifacts/next-build/spatial-evidence/Spatial-stage-actual-browser-recording.mp4`. Real generated geometry, camera and light manipulation, saved PNG guides, three actual rendered loops and scene/model exports. A FLUX result uses both the source image and saved scene guide. |
| Move the beat and typography | `artifacts/next-build/music-evidence/music-interaction-recording.mp4`, `01-neon-pulse.mp4` and `02-delayed-impact.mp4`. The same 2.25-second frame differs after moving the text cue from 2.0 to 2.7 seconds. Both exports contain their actual soundtrack. |
| Shared story decision across formats | `artifacts/next-build/shared-story-receipt.json`: unchanged image reused, selected new video and story page created, original outputs retained. Dependencies use explicit inputs and fact bindings. |
| Performance before/after | `artifacts/next-build/performance-evidence/source-and-transformations.mp4` compares the recovered source with actual BFL restyling and Genjutsu output. Exact route/request provenance is retained. Artistic correspondence is not a guaranteed identity or motion match. |
| Actual playable mechanics | `artifacts/next-build/playable-evidence/Neon-courier.playable.zip`: original generated artwork, movement, stars, patrol collisions, energy, timer, portal and replay. Independent preview: `http://127.0.0.1:4314`. The studio was stopped during an independent run. |
| Continue editing elsewhere | All nine project packages under `artifacts/next-build/exports/` are imported into an isolated store and reopened, checking actual media hashes and remapped relationships. Imported execution records are archived, never silently resubmitted. |

Interaction videos are assembled from actual timestamped browser captures at variable cadence. Long generation/processing gaps are shortened. They are not fabricated UI, full-frame-rate screen recordings or evidence of hardware performance. Finished media files are the actual encoded outputs.

## Inventory and acceptance evidence

See [capability inventory](capability-inventory-2026-11-03.md), [full coverage matrix](feature-coverage.md), [implementation ledger](implementation-ledger.md), [validation](validation.md), [design application notes](reference-application-2026-11-03.md) and [model route audit](model-route-audit.md). Machine receipts under `artifacts/next-build/` provide the current production counts, successful requests, failed attempts, asset hashes, independent-player check and package restoration.

The full studio scope remains visible. A discovered schema does not make a model ready. Unknown hosted serving providers remain unknown, and partner Router calls are not labelled native open-weight execution. No Open Weights Only mode is offered.

The new desktop/laptop, keyboard and reduced-motion flows were exercised. The available browser's phone viewport override did not actually change its rendered width, and the native-window fallback timed out before control was granted. New physical-phone/mobile rendering remains unverified. Local software graphics made WebGL frame capture slow; render progress reports real frames. VEED audio cleanup returned `not_enabled`. Translation/dubbing, arbitrary transcription, standalone generative music, general game synthesis, authenticated collaboration and permanent public hosting retain their explicit dependencies.

## Source and licensing

Original application code is MIT licensed. See [licensing](licensing.md) for third-party obligations and external model/service terms. Application licensing does not license model weights, external services or imported media. The source archive excludes credentials, databases, user media, recovered Cloud artifacts, dependencies and build output; editable production/player packages are separate local deliverables.

This is a reviewable source/demo package. No repository was published and no competition entry was submitted. The independent preview URLs above are local processes, not public sharing links.
