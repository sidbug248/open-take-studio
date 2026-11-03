# Validation receipt

## Current inspection-build checkpoint — 3 November 2026

The current build passes **126/126 tests** and the TypeScript/Vite production build. `artifacts/inspection-build/validation/` contains the final logs. The first restricted-environment attempt could not complete the local HTTP/media integration cases; the final run used the required local access and passed with no skipped tests. Three.js retains a lazy-chunk size advisory, not a build failure.

The live application is running at **http://127.0.0.1:4310** in production mode. The final worker-backed export of the largest project produced a **96,279,059-byte ZIP in 4.582 seconds** while **35 concurrent health responses** completed, with a maximum observed latency of **74ms**. Its hydrated manifest and every media hash match the preservation audit. This is a bounded local check, not a load-test guarantee.

The isolated nineteen-project export/import/reopen audit verified **425 assets, 279 takes, 204 jobs and 818,420,722 media bytes**, including nine native execution/version records, fourteen spatial scenes, two films, two playables, eight editable motion compositions, one Object Room and one editable audio mix/master. All original nine projects, 131 assets, 119 takes, seventy jobs, two shots and nine recipes remain, with unchanged original media hashes and historical relationships. Imported jobs are archived and cannot dispatch.

The fresh **Velvet Observatory** browser journey generated an image, animated that image, played the actual 5.167-second 1344×768 clip, downloaded it and exported its production package. The browser download's SHA-256 matches the managed output. Reopening preserved its selected video, source image, parent and motion prompt. Both generation jobs had already completed when the server was restarted; request IDs, idempotency keys and single-attempt counts stayed unchanged. Separate integration tests cover in-flight recovery.

Actual desktop and 390×844 Chrome checks cover arrival, catalogue, real GLB orbit, contextual tools and reduced motion. Settings Escape closes the panel and returns focus. Viewport and motion preferences were restored. This is phone-size browser evidence, not physical-phone touch or comprehensive assistive-technology certification. The final phone draft attempt encountered debugger detachment and is not counted as completed. Screenshots and observed-state manifests distinguish sampled frames from continuous recordings.

With the studio stopped, the independently hosted Object Room reloaded its actual geometry, changed views, orbited and played its four-second saved audio cue. Both portable film choices played their included clips. The six newly rendered motion films were downloaded and probed as six-second H.264/AAC outputs; the editable source compositions remain saved. Native Cloud graph execution, edit/save/reopen and the specific unresolved Sea Gate source-preview defect are recorded in [native workflow evidence](native-comfy-workflows.md).

Final credential-boundary checks scanned **79 browser source/build files**, found no configured key, observed **403** for environment/database/private-recovery paths, and rejected a foreign-origin mutation. See [current delivery](inspection-build-delivery.md), [package audit](../artifacts/inspection-build/package-verification/verification-receipt.json), [export responsiveness](../artifacts/inspection-build/package-verification/responsiveness/receipt.json) and [fresh creator receipt](../artifacts/inspection-build/creator-review/receipt.json).

## Historical receipts below

Verified November 2, 2026, America/New_York. This separates actual live results from schema tests and untested provider capabilities.

## Completed live Router journey

Project **Coastal Light · Router validation**, `97d0268d-35f7-43f2-8ebc-539fef34485c`.

| Stage | Evidence |
|---|---|
| Create project and image prompt | Created through the real browser UI |
| Image generation | `bfl/flux-3-image`, request `88afd75f-e473-46ea-b829-0f960b95659f`, completed |
| Display/select image | Actual local PNG rendered in the studio |
| Animate selected take | UI linked the saved PNG as a data-URI first frame; parent/source IDs persisted |
| Video generation | `minimax/minimax-h3`, request `5a75ca7c-ba3a-43a5-8722-9973fad0a2c7`, completed |
| Restart recovery | Server stopped/restarted while H3 was IN_PROGRESS; same request ID collected, no new generation |
| Video playback | Real browser player loaded and played; 1344 × 768, 5.167 seconds, readyState 4, no media error |
| Audio track | Actual MP4 contains `vide` and `soun` media handlers; subjective audio quality not certified |
| Download | Browser download succeeded; local file SHA-256 equals managed media SHA-256 |
| Reopen | Browser reload and library reopen retained project, selected take, source, prompt, and history |
| Further live module | `byteplus/seed-audio-1.0-multilingual`, request `e2a651ae-f881-452f-8a43-3b5aea2b34a5`, completed; actual WAV + provider-timed VTT stored |

Image: 1,739,030 bytes; SHA-256 `c83f474f93072aad00cb6a74e09ad18d4d5afa08460bdc72ac65fe35d3e53c1b`.

Video: 2,162,282 bytes; SHA-256 `b9085c8563c9d3c995a7e78749a66594d4bfd91fd66aa6ef7c5fad1e9ad2152f`.

Machine-readable evidence and actual output copies are in ignored `artifacts/validation/router-live-receipt.json` and the same directory. `coastal-light.opentake.zip` is a portable package.

## Existing Cloud work recovered and imported

Project **Mara · Imported from Comfy Cloud**, `8836985f-6d32-4686-bf0b-d5d7bcfe4118`.

- Recovered `mara_take_00001_.png` through `mara_take_00004_.png` (1280 × 720) and `mara_i2v_00001_.mp4` (1056 × 608, 5.167 seconds, H.264 + stereo AAC).
- Recovered **Open Take Studio — 01 Image Draft** and **Open Take Studio — 02 Image to Video**, each in editable and API JSON formats.
- Original image-batch Cloud job: `c75edbf7-1466-46c2-b7ca-70a601618ecc`; original video job: `28ecb547-ad9e-49ff-8495-5c647d631a8c`. Both read as completed.
- Actual video-embedded execution graph verifies `mara_take_00001_.png` as the first-frame source. The application preserves that take parent and source-asset relationship.
- Imported five media takes and six reference documents (four workflows, recovery receipt, job receipt). All 11 asset downloads match source hashes. No application generation jobs were created for imports.
- UI displayed the original video and all four images, labeled **Imported from Comfy Cloud**. Historical prompts/settings/execution IDs are separate from Router controls.
- Workflow exports reflect the UI snapshot, which included an existing unsaved-change indicator on the video workflow. They are not falsely identified as the exact executed graph; media-embedded execution data is preserved separately.

Evidence: ignored `imports/comfy-cloud/recovery-receipt.json`, `application-import-receipt.json`, original media, exported graphs, embedded metadata, and retrieval README. No Cloud workflows were rerun. No key or signed URL credentials were stored in the recovered JSON artifacts.

## Application and portability checks

- `npm run build`: passed TypeScript and production Vite build. Optional 3D viewer is a separate ~1 MB lazy-loaded chunk; bundler emits a size warning.
- `npm test`: **44/44 passed**, covering model/schema contracts, media constraints, HTTP project operations, package integrity, credit handling, failed completions, same-identity admission retry, polling/restart, SDK HTTP 410, cached-result recovery after expiry, source relationships, and audio/VTT collection.
- Actual projects exported and imported into isolated validation storage, then database reopened. Six assets/five takes/three archived jobs for Coastal Light; 11 assets/five takes for Mara. Media hashes, parent links, canonical input references, story-panel metadata references, and no-resume archive behavior all verified.
- Browser-native square crop/caption saved as a new local take, preserving original source. Two-panel story page rendered and saved with both panel-image relationships. Side-by-side comparison displayed original versus edited image with recorded differences.
- Synchronized video comparison started both real players together (observed times 0.199244 and 0.199398 seconds, no errors). Both slots used the same clip for this controller check. Unequal-duration behavior is implemented as stopping both at the shorter duration, but was not separately exercised with unequal real clips.
- Real browser layout checked at 1440 × 1000 and 390 × 844; no horizontal document overflow at the phone width. Screenshots retained under `artifacts/validation/`.
- Credential boundary check found no configured key in the 15 inspected browser source/build files. Development requests for `.env`, the SQLite file, and Cloud staging receipt were denied; foreign-origin API mutation was rejected with 403.
- Final built application started as a hidden background Node process with `Start-OpenTakeStudio.ps1 -NoBrowser`. Health passed and the real browser reopened the Mara project after this second restart. Runtime files are `data/server.pid`, `data/server.out.log`, and `data/server.err.log`.
- Prompt drafts and pending submission identities persist locally. Batch requests use immutable saved payloads; paid batch execution was not exercised.

## Explicit limits

The first image/video path and queued speech/captions were live validated. FLUX Fill, Bria processing, BFL video editing/upscale, ElevenLabs synchronous audio, Meshy generation, and advanced H3 reference/bridging modes have request/schema and result-handling tests but no live generation proof in this build. The local 3D viewer is implemented and built; it was not validated with a live Meshy result. Generated subtitle timings are preserved; transcription of arbitrary media is not implemented. See feature-coverage.md for unavailable transport/model dependencies and remaining platform scope.

This is a single-user local application, not a deployed multi-user service. No production deployment or public inference endpoint was created.

## Creative experience and branching-film pass — November 2–3, 2026

The preceding sections retain the initial build evidence. Current creator-facing project titles are **Coastal Light** and **Mara · The last light**. Their original source metadata, media bytes, execution references and reference workflows remain intact.

### Live generation and demonstration

Six additional paid Router submissions completed and were collected into managed local storage. No exploration, scrubbing, choice playback, export or comparison operation submits inference.

| Output | Route | Router request ID |
|---|---|---|
| Liquid daylight, original product still | `bfl/flux-3-image` | `3eb7d7eb-813d-42a3-b7cf-1726fa74c0a3` |
| Midnight on wheels, original illustration | `bfl/flux-3-image` | `c3142523-d776-454f-ae72-7f537add9dde` |
| Follow the signal, alternative motion | `minimax/minimax-h3` | `b5aae6e0-bda5-4464-b4b3-975a5a306b6a` |
| Face the storm, alternative motion | `minimax/minimax-h3` | `3283aa16-12d6-44db-b966-2d1d793daac1` |
| Mara · Signal study, reference-conditioned edit | `bfl/flux-3-image` | `a7c1f5cf-3aae-41df-8190-e2ea8b481876` |
| Mara · A voice in the storm, supplied-audio lip sync | `synclabs/sync-3` | `17841525-4326-47b4-98bc-968d9c7505bb` |

Both H3 branches use a real PNG decoded from the original imported Mara video at **2.500 seconds, frame index 60**. Independent re-extraction matched its pixels. The source hash, requested/actual timestamps, parent frame take, parent video take and first-frame references are saved. Four-second requests returned 4.458333-second clips; the film uses explicit 4.0- and 3.5-second continuation boundaries. Generated motion is the actual provider result, not a guarantee of exact camera motion or continuity.

The lip-sync run used the existing Mara MP4 and a copy of the previously completed Seed Audio narration. Temporary HTTPS media hosting was verified by unauthenticated retrieval; the exact audio/video bytes matched their sources. No new supporting speech call or hidden translation call was made. The resulting MP4 is stored and downloadable; completion does not certify subjective lip alignment. Genjutsu's URL transport is implemented and checked, but its inference remains untested.

### Actual browser journeys

- Desktop arrival uses real completed/imported media, a playable branching film, direct prompt/upload entry and compact recent projects. The old postcard/serif/olive identity is replaced. Original new showcase subjects add visual range without invented community data.
- A prompt on Explore created **Prismatic garden · next idea** automatically. Renaming, draft editing, reload and Continue creating restored the draft without generation. This intentionally unsent project remains available.
- From the original stored video, the UI extracted an additional frame at **1.25 seconds**, opened H3 with that frame and motion controls, and restored the prior draft via Undo. The saved frame remains in production history. No paid job was created by extraction or Undo.
- Selecting two takes opened Compare directly. Real unequal clips (5.167 versus 4.458333 seconds) played together and stopped at the shared shorter duration; observed end positions differed by less than 0.0001 seconds. Both were muted. Comparison choices/view restored on reload; the playhead resets rather than claiming cross-session seek restoration.
- The in-app film opened, played the imported opening, stopped at exactly **2.5 seconds**, and played both stored continuations. Mobile choice controls were exercised at 390 × 844. Escape closed the dialog and restored focus to its opener.
- A shared-subject change displayed three paid generation candidates and one local story-page update. The three paid candidates were deselected. Applying only the story page produced one new PNG/take and a second scene revision, preserved the previous page, and left the project's job count at four. The plan includes actual output/reused-asset thumbnails. Receipt: `artifacts/redesign/scene-browser-receipt.json`.
- Recipe replacement/preflight selected **Mara · Signal study** and opened the correct H3 first-frame flow with the saved direction. Review alone created no job. Specific recipe reproduction warnings survive later name/slot edits.
- Reduced-motion mode suppressed focus-triggered playback. With it disabled, keyboard focus played exactly one muted preview; other previews stayed paused. Offscreen previews are paused/unmounted. The in-app preference and CSS system preference are implemented; an operating-system setting toggle was not separately exercised.
- Mobile testing found and fixed a 900-pixel decorative pseudo-element causing document overflow, responsive headline spacing and an unnamed icon-only creation button. The corrected 390-pixel viewport has a 375-pixel document width (remaining width is the scrollbar). Scrollable discipline/take strips remain independently scrollable.
- A further phone interaction pass corrected retained scroll positions on navigation and long comparison prompts separating the previews. View changes now begin at the heading; both video previews, selection controls and synchronized transport fit together. Prompts/settings remain available through keyboard-accessible disclosures. Keyboard playback of the two real branch clips was verified again after this change, and reload restored the same comparison pair.
- The selected-path MP4 was downloaded through the real browser UI to `Downloads/Mara · Signal cut.mp4`; its SHA-256 equals the managed/exported copy: `de248e0fe43f717fdaf2636980e733820236444bb2876a20a43303821cd01fe1`.

### Portable deliverables and independence

Final editable production: `artifacts/Mara-The-last-light.opentake.zip`, **23,514,774 bytes**, SHA-256 `827280ce1e34790c09779fb3ccb93f8952ebc743d68cea75fd42431806488ff8`. It contains **22 assets, 15 takes, 4 archived jobs, 2 shots, 1 recipe, 1 film and 2 scene revisions**. Isolated import and a new database connection verified every media hash and remapped film/scene/recipe/take relationship. Imported jobs remain archived and cannot resume inference. Source records and originals remain untouched by the verification script.

Final standalone player: `artifacts/redesign/Mara-The-last-light.playable.zip`, **7,256,887 bytes**, SHA-256 `08a0f722e628fab45c3ec161809bd1d903d1d0118038366dae3bc9134e4b97e8`. Its 11 entries include the HTML player, manifest, all three actual clips, posters, source frame, README and application license. Both normal MP4 paths were decoded/probed: **6.5 seconds** for Signal and **6.0 seconds** for Storm, each H.264 with AAC audio.

The exported folder was served by an independent read-only HTTP process on **127.0.0.1:4311**, with no studio modules, credentials, database or API and a `connect-src 'none'` policy. The actual studio process on port 4310 was stopped and confirmed offline. A fresh browser load then played the opening and both choices using only relative exported media. The opening stopped at 2.5 seconds; Signal at 4.0 and Storm at 3.5. Keyboard activation, replay, alternate-choice selection and mobile layout were exercised. No browser console errors were observed. The studio was restarted afterward. The browser tool disallows `file://` navigation, so direct file-protocol playback was not tested; independent HTTP playback is the verified portable deployment form. No public hosting or sharing URL was created.

Detailed machine receipts: `artifacts/redesign/package-verification-receipt.json`, `film-export-receipt.json`, `demo-receipt.json`, `showcase-submissions.json`, `branch-submissions.json` and `scene-browser-receipt.json`. Screenshots are under the same directory.

Final screenshots: `explore-desktop.jpg`, `explore-mobile.jpg`, `comparison-mobile.jpg`, `film-mobile.jpg`, `player-desktop.jpg`, `player-mobile.jpg`. Earlier workspace/desktop-comparison captures remain available as well. `browser-validation-receipt.json` records the separate player and final mobile observations.

### Checks and limits

- **75/75 automated tests passed**; production TypeScript/Vite build passed. Coverage includes actual FFmpeg extraction/trim/concat, both film paths, offline-player logic, media transport, Unicode filenames, graph portability, scene dependency propagation, explicit reuse/fresh requests, same-identity replay after restart, concurrent admission, stale-scene rejection and atomic failure behavior. Fixtures do not call paid models.
- Credential-boundary check passed across 26 browser source/build files; no configured key was found. Requests for `.env`, SQLite and recovered source receipts returned 403, and foreign-origin mutation was rejected. No secret values were printed.
- Every registered generative route has an evidence entry in `model-route-audit.md` and `shared/model-audit.ts`. Six new responses supplied no observed serving provider; requested namespaces are recorded separately. Earlier inferred serving-provider metadata was corrected with a database backup. No all-stage open-weight execution claim is made.
- Full platform scope remains in `feature-coverage.md`. Dedicated motion-transfer inference, advanced H3 modes and several other adapters remain experimental. Automated dubbing translation, arbitrary transcription, standalone music, a general game runtime, multi-user collaboration and hosted public sharing retain explicit dependencies. These are not represented as completed by the branching-film demonstration.
- This pass checked an actual desktop browser and 390-pixel responsive layout, keyboard actions and reduced-motion behavior. It does not certify physical iOS/Android devices, other browser engines, screen-reader coverage, hardware audio quality or model visual quality. The optional lazily loaded 3D viewer still produces a build chunk-size warning.

## Next Build Brief — November 3, 2026

This section supersedes readiness and current-layout claims from the earlier passes, while retaining their historical evidence. The user authorized the available shared event pool without a separate spending cap. This build made no account upgrade, credit purchase, public deployment or competition submission.

### Creative experience and collection

The arrival now combines actual completed film, a designed comic page, playable artwork, directly orbitable generated geometry, audio and a prompt/upload entry. The creation canvas has contextual tools, take/shot handling, keyboard instrument search, native image-divider comparison, saved visual recipes and named text/media ingredients. Favorites take precedence in discovery curation. Reference-specific adaptations and observation limits are in `reference-application-2026-11-03.md`.

The dated directory contains 253 catalog records and 253 inspected schemas. Twenty installed adapters are distinguished from discovered models; one adapter is disabled after a real `not_enabled` response. Sixty-three outcomes retain all twelve studio families. Readiness is derived from saved route/mode evidence, not inferred from a neighboring model mode. Final counts are in `artifacts/next-build/final-production-summary.json` and the capability inventory.

Eight collection worlds plus the preserved Coastal Light project contain original generated variants, short films, performance transformations, speech/VTT, ambience, vector SVG with PNG preview, real GLBs, rigged/animated characters and local compositions. The exact requests and provider failures remain in the database and production receipts. No inferred hosted serving provider or all-stage open-weight eligibility is claimed.

### Demonstrated connected behavior

- The Prismatic visual recipe was edited in the browser, preflighted, generated, displayed and downloaded. Reopening restored the project, selected take, draft prompt and input. The browser extracted a frame at **2.000 seconds, frame 48**, and opened it as an H3 input. Two completed alternative clips preserve that frame and parentage. Independent FFmpeg decoding of the original source matched the saved frame's pixels exactly (`prismatic-film/frame-verification.json`).
- The resulting film plays a two-second opening with two saved continuations. Both actual choices reached their defined ends while port 4310 was stopped. The two normal video cuts are 6.0 and 5.5 seconds, with playable-package media included. The standalone export uses no app API or credentials. After visual review, its header, media, choices and controls were compacted to fit the laptop viewport, and returning to the choice now restores the opening decision frame and neutral path/timing.
- Three spatial sequences each contain **72 actually rendered frames at 24fps**, 960×540, three seconds. Saved scenes retain geometry, lights and cameras. A same-camera light edit changed 719,479 RGB channels in the rendered guide. Real textured Meshy models, compatible rigging and a walking animation are downloaded. The latest geometry export excludes the large ground plane so the reopened object frames correctly. An image generation uses the original product reference plus its actual rendered camera/light guide.
- A six-second original local pulse drives the motion compositor. Moving a text cue from 2.0 to 2.7 seconds and a beat from 2.0 to 2.1 produces a different actual exported image at 2.25 seconds. Both MP4 versions contain video and AAC audio, remain separate parent/child takes, and reopen with their own cue settings.
- Shared scene facts bind outputs explicitly. One event/intent change reused the unchanged image, generated a new H3 clip and recomposed a story page. A second browser pass previewed another event, deselected both paid video updates, applied only the latest local page and restored the earlier inputs as a new scene revision. All prior outputs remain saved; the browser-only local update did not add a generation job.
- Electric bodies compares a real generated source performance against its completed Genjutsu clay recast at five matched timestamps. The visible material/face/background changes and sampled choreography are evidence of this output, not a guarantee of identity or exact motion. BFL restyling and the earlier Mara transfer remain separately inspectable.
- Neon courier is a real browser game with keyboard/touch controls, stars, collision/energy, countdown, portal, pause and replay. Its generated background and victory art are actual project assets. An independent run with the studio stopped accepted input, advanced the countdown and paused. Rule tests verify collection/collision/completion; the manual browser run is not claimed as a complete perfect-score playthrough.

### Evidence and checks

Actual browser capture recordings are stored in `creator-journey`, `spatial-evidence`, `music-evidence`, `shared-state-evidence`, `catalogue-walkthrough`, `playable-evidence` and `prismatic-film`. Their timestamp manifests disclose variable screenshot cadence and shortened processing gaps. These are not 60fps recordings. The three spatial MP4s and two motion-composition MP4s are separately encoded actual renders.

The catalogue browser walk exercised all twelve families, search, discovery-only model restrictions, actual comic-page inspection and H3 setup without generation. Laptop canvas and controls fit together. Image comparison responded to keyboard and pointer input; reload restored the project, comparison view and selected pair. Reduced-motion mode prevented focus-triggered video playback and removed travel transitions; explicit muted preview still worked.

All 30 media files from the pre-build checkpoint were downloaded and verified byte-for-byte. Original project, take and execution identities are audited separately during package restoration. Final source/build, credential boundary, full regression results and all-nine export/reopen receipts are retained under `artifacts/next-build/`. The restricted test invocation could not complete loopback HTTP fixtures; the authorized local-network invocation is the authoritative full-suite result. Tests use isolated stores and synthetic media rather than paid generation.

### Remaining verification and implementation boundaries

The new phone viewport could not be exercised: the available browser override returned successfully but left the rendered width unchanged, and native Chrome control timed out before input permission was granted. Responsive styles and touch controls exist; prior-pass mobile screenshots do not verify this new layout. Physical phone, screen-reader, other browser-engine, hardware-audio and high-frame-rate graphics performance are not certified.

VEED audio cleanup is unavailable on the observed Router route. Full translation/dubbing, arbitrary imported-audio transcription, standalone generative music, general game synthesis, automatic document-to-story production, authenticated collaboration and permanent public sharing retain exact dependencies in the coverage matrix. Recipes and prompt presets do not guarantee character identity, exact camera paths, identical pixels or seamless generated continuity. The portable player's independent HTTP deployment is verified; the browser tool disallows direct file-protocol navigation, so `file://` playback is not claimed as separately tested.

### Final delivery checkpoint

At the final November3 checkpoint, **107/107 tests passed** and the production TypeScript/Vite build passed. The lazily loaded Three.js module retains a bundle-size advisory; this is not a build failure. Credential-boundary verification checked56 browser source/build files, found no configured key, confirmed403 responses for environment/database/private-recovery paths, and rejected a foreign-origin mutation.

**59 new intended Router jobs** are recorded: **56 completed, two failed and one blocked**. Every job is terminal. Failed attempts and the disabled VEED admission remain visible. There are **99 newly saved assets**, including derived frame/guide/render/document files; this is not a claim of99 distinct generative concepts. Explore offers48 curated saved starting points. Full collection totals are9 projects,129 assets,117 takes and68 jobs.

The final all-nine package audit verified **284,122,627 bytes of actual media** and every asset hash after fresh-ID import. It preserved9 recipes,2 films,2 shared scenes with6 revisions,13 spatial scene versions,2 playable versions and2 motion compositions. All68 imported jobs were archived; all9 restored projects reopened after closing and reconnecting the isolated database. The original checkpoint's5 projects,30 assets,22 takes,9 jobs,2 shots and1 recipe remain, with unchanged original media, take prompts/model/output/parent references and execution IDs.

The larger productions exposed a repeated-inline-input manifest overflow during this audit. The corrected version2 package stores input blobs once and restores exact original strings. It retains version1 compatibility and validates missing/corrupt/unused blobs, paths, hashes, Unicode and symmetric expanded-size limits. Independent review and meaningful regression tests passed before the final audit. See `project-package-format.md`.

Final portable-film ZIP: **12,179,035 bytes**,11 entries. The independent server's final HTML and all video/image bytes match this exported ZIP. The game host is independent as well. Both enforce `connect-src 'none'`. The original stopped-studio browser run and final compact-viewer/return-to-choice browser evidence are retained separately. Receipt: `artifacts/next-build/final-player-verification.json`.

Delivery guide: `docs/next-build-delivery.md`. Final arrival screenshot: `artifacts/next-build/final-arrival.jpg`. Source archive and its no-secret manifest: `artifacts/next-build/delivery/`. No publication, public sharing or competition submission was performed.
