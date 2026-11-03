# First impression pass — implementation and validation

November 3, 2026 · Open Take Studio · http://127.0.0.1:4310

All three connected journeys have current production-browser proof: a new story continuation and portable film; a directed scene rendered into a new H3 video; and a saved mixed master connected to an edited, exported motion composition. Original projects, workflows, media and earlier versions remain intact.

Final optimized arrival measurements and the visual check of the display-only PMREM64 adjustment are complete. The prepared desktop sample met the poster/motion targets; the first post-restart assembly missed the one-second desktop poster target by about 80ms. The constrained phone sample's 648ms LCP passed the stated mobile target of 2.5 seconds. Exact conditions and all four observations are retained below.

## Delivered behavior

Explore uses a compact production-HTML bootstrap, progressive cards/recipes and prepared responsive posters, silent previews and simplified GLBs. It does not load every project. Workspaces poll small job summaries only while jobs are active; full historical inputs remain explicit and portable.

Every presentation retains original asset identity, hash/version and source interval. Editing, inference and downloads use original media. Preparation runs outside discovery GETs. Bootstrap caching invalidates for database/other-connection changes, curation and completed display work. Dynamic HTML uses Brotli quality 5; built assets remain immutable.

Visible discovery has decoded-frame poster continuity, desktop/phone budgets, offscreen/hidden suspension, reduced-motion support and deliberate playback ownership. Six creation outcomes and three curated journeys preserve their source context. Immutable film versions, actual scene-to-PNG handoff, manual cue/beat gestures and exact soundtrack exports provide real creative continuity. Catalogue previews do not promote planned model routes.

See [prepared delivery](first-impression-delivery.md), [playback lifecycle](first-impression-ui-lifecycle.md), [connected journeys](connected-journeys-2026-11-03.md) and [design brief](design-brief.md).

## Three completed browser journeys

### Change the ending — Prismatic garden

Explore opened the original film and its exact frame at 2 seconds. The new glass-koi direction opened H3 with that frame and parent. Explicit Generate submitted one request, `06fc5409-2198-4f4e-8694-11ad85797dee`, completing as take `2e080394-d35d-4c69-a0da-0c11b753d854` and output `962f7fe4-2bff-41f3-9cbd-421528807401`. The actual 5.167-second video played, downloaded and matched its stored hash.

The creator returned to the film, edited its title, verified Undo, added the completed branch, labelled it **Follow the glass koi**, trimmed it to 4.8 seconds and saved new version `aaf5c4a7-431a-4400-8188-d01e6b223fde`. All three choices played to their 4.0/3.5/4.8-second endpoints. The saved version reopened, and the selected cut rendered/downloaded.

The standalone player on port 4335 played all three paths while studio port 4310 was stopped. The first path was selected with Enter; audio on the third was deliberately enabled. Initial decision-label layering and null draft-restoration defects were fixed. Project detail is now masked until it belongs to the selected project, and draft writes are guarded by ownership.

Evidence: [generation/edit checkpoint](../artifacts/first-impression/resumed/prismatic-browser-journey.json), [studio-offline playback](../artifacts/first-impression/resumed/portable-offline-proof.json), [final package audit](../artifacts/first-impression/journey-package-verification/run-1793715737829/verification-receipt.json). Later completed checks supersede the unfinished checkpoints in the earlier journey JSON; prior failures remain recorded.

### Direct the object — Liquid daylight

The current UI applied Material detail and Afterlight, verified lighting Undo, saved the camera/scene and reopened it. An idle redraw defect was found and fixed: resize, static camera changes and completed scene updates now draw immediately while idle animation remains on demand. The rebuilt viewport visibly rendered the original GLB; diagnostics are opt-in only.

Object Room opened on **Your directed view** and saved room `2e194aeb-16fb-4c3f-90e7-6eaac381371e`. Its cloned scene retains the exact opening camera, objects, lights, environment and model hashes. Root also verified Object Room → instrument switcher → Spatial stage after its asynchronous transition. The immediate earlier snapshot was not a navigation defect.

The cinematic action saved scene `c1618e6b-a31f-4cf0-aa79-734efecdd686` and actual PNG `32f17d9e-909d-4ed5-b4a2-8c4348b204c5`. One H3 request, `51c4e6fe-1afc-4d9e-a871-8cf4e10ea8af`, produced `c3cb0964-31ff-42e7-a1aa-63f3e00ef796`. The 1344×768/5.167-second result played unmuted, downloaded and reopened with its parent guide/prompt intact. The audit matched exact submitted inline bytes to the saved PNG. Its amber-glass material is a generative interpretation of the orange source, not deterministic geometry reproduction.

### Move the sound — Voices of Elsewhere

The creator explicitly selected the existing 11-second **voice, tide & glass** master, fitted the duration and applied Electric night. Pointer dragging moved a text cue from 3 seconds to approximately 4.94. Undo restored 3 seconds, then the intentional drag was repeated. A separate drag moved beat seven from 3 to approximately 3.30 seconds. A final phrase occupies 8.1–10.8 seconds. These are manual authoring choices, not automatic alignment.

Composition `fbed8f38-17df-4d94-9ffe-5ee69e867766` retains mix `8a138b4c-b4a4-406f-bad8-97dd3fd59337`, zero offset and gain 0.9. Source audio played unmuted. Render film captured 132 actual WebGL frames and saved MP4 `b3ec9884-8402-4e0d-80ab-d53aaef9658b`. The 960×540/11-second result played and downloaded. Reload restored soundtrack, edited timing, selected cue, playhead approximately 4.94 seconds and matching export link. Capture was slow in this browser session; completion is not a real-time export performance claim.

Decoded exported audio correlated **0.9994293577** with the selected mix after saved offset/gain, at 16kHz with zero-sample alignment adjustment. This confirms soundtrack source, not perceptual quality.

Liquid/Voices evidence: [browser receipt](../artifacts/first-impression/connected-journeys/browser-receipt.json), [saved outcomes](../artifacts/first-impression/connected-journeys/after-inspection.json), [detailed checks](connected-journeys-2026-11-03.md).

## Phone, comparison and persistence

Root verified a 390×844 browser viewport: first-entry choices were visible, a film choice played, Reduce motion stopped discovery, manual play still worked and offscreen media paused. The temporary reduced-motion setting was restored to false. This is Windows browser viewport testing, not a physical-phone claim.

The final **Orbit this object** entry and right-arrow orbit worked with reduced motion enabled in the phone viewport; the setting was then restored to false. The PMREM64 discovery renderer visibly displayed the real object in the final desktop capture. The temporary viewport override was reset after verification.

The final **Hear source voice** action played the actual selected mixed master unmuted and immediately paused both discovery videos. After the 11-second sound ended, muted previews resumed. Offscreen pause and explicit-owner interruption were observed in the browser. An attempted hidden-tab check left the original document reporting `visibilityState: visible`, so actual hidden-tab suspension is **not browser-verified**; that behavior is covered by source/unit checks only.

Comparison used actual 4.458333/5.167-second clips. Both stopped at the shorter clip; seeking to 0.01 seconds restored synchronized comparison without time stretching. This is narrower than exhaustive accessibility/cross-browser testing.

Evidence: [phone film](../artifacts/first-impression/resumed/phone-film.jpg), [phone object/keyboard](../artifacts/first-impression/resumed/phone-object-keyboard.jpg), [comparison](../artifacts/first-impression/resumed/comparison.jpg).

The checkpoint preserves 443 media assets, SQLite and source/build snapshots. Four display posters appeared during old-app baseline inspection; initial cache preparation verified 447 originals unchanged. Its 19 projects / 447 assets / 279 takes / 204 jobs are historical preparation counts, not current post-generation totals.

The final three-project isolated export/import audit verified **200 assets, 110 takes, 50 archived jobs and 170,660,913 media bytes**, all hashes/relationships, then reopened the database. It includes the selected cut, native workflow records and exact Router input PNG bytes, directed Object Room camera/models and motion soundtrack. All 443 checkpoint media assets remain preserved. Imports are archived and cannot resume remote jobs. [Receipt](../artifacts/first-impression/journey-package-verification/run-1793715737829/verification-receipt.json).

## Tests and build

- **154/154 tests passed**, zero failures/skips/cancellations, 39.27 seconds, after final backend freshness-cache/Brotli changes. [Host log](../artifacts/first-impression/resumed/final-tests-after-cache.log). No repeat followed this pass.
- Coverage includes real media encoding, package remapping, Router/native recovery, idempotency, derivatives/Range/compression, cache freshness, parent-film relationships, ownership budgets, supported inputs and mixed-audio muxing.
- Targeted audio tests decode the mixed master's deliberate gap and restore soundtrack/cue/beat references. Their PNG fixtures prove muxing/persistence; the live 132-frame capture separately proves browser rendering.
- TypeScript and production builds passed. The display-only PMREM environment-size 64 and explicit manual-orbit entry adjustments followed the full suite; their build/typecheck passed, and actual desktop/phone visual interaction was verified afterward. The full suite was not rerun for those final display changes.
- An earlier sandbox-only loopback test attempt stopped; the completed suite used host-local networking.

## Arrival measurements

Chrome 156 on Windows, localhost production. Desktop baseline 1120×602 CSS pixels / DPR 1.5; phone-size baseline 390×844/DPR approximately 1. Baseline cache-disabled runs used Chrome DevTools Disable cache; CPU/network were not throttled. Single observations are not percentiles or physical-phone benchmarks.

| Historical run | Poster decoded + next frame | First moving frame | LCP |
|---|---:|---:|---:|
| Original desktop repeat/revalidation | 7.387s | None by 16.763s | 7.360s |
| Original desktop cache disabled | 12.879s | None by 14.762s | 12.840s |
| Original phone-size cache disabled | 13.531s | None by 16.593s | 13.492s |
| First new desktop, mixed cache/no throttling | 0.892s | 1.638s | 0.896s |

The first new sample made zero full-project requests on Explore. Original cold desktop recorded 52,965,592 transferred bytes and a 26,733,492-byte editing GLB. Prepared discovery separately verified a 72,818-byte poster, 469,391-byte silent hero preview and 210,852-byte featured GLB. File sizes and the earlier 11,269-byte compressed HTML observation are not current paint-time claims.

Raw baseline JSON: `artifacts/first-impression/baseline/`; first new sample: `after/desktop-initial.json`. The opt-in local DOM probe records decode, requestVideoFrameCallback, navigation/resource timing and LCP without telemetry. A trace of about:blank was excluded and retained as `invalid-*`.

### Final optimized observations

All final observations used the existing Chrome process, prepared display files and warm font/OS caches. The no-store profiles remove local HTTP caching/revalidation but do **not** create a fresh browser or clear OS/server caches. Desktop is 1120×602 and phone 390×844; actual DPR is approximately 1 for both. The baseline desktop DPR was 1.5, and its DevTools cache-disable mechanism differs from the new proxy, so this is not a rigorously matched cold-to-cold comparison or a claimed improvement ratio.

| Final observation | Poster | First moving frame | LCP | Navigation response start |
|---|---:|---:|---:|---:|
| First post-restart assembly, desktop no-store | 1.0795s | 1.4080s | 0.848s | 155.9ms |
| Prepared desktop no-store | 0.6449s | 0.8252s | 0.484s | 14.2ms |
| Desktop repeat with normal HTTP cache | 0.2151s | 0.4379s | 0.252s | 24.0ms |
| Phone-size no-store, 10Mbps aggregate body shaping, +40ms response latency | 0.7030s | 2.0788s | 0.648s | 85.2ms |

The first assembly is retained as observed variance, not discarded in favor of the faster prepared sample. The desktop prepared and repeat samples met both desktop targets; first assembly exceeded the desktop poster target by 79.5ms. The brief's two-second motion target applies to that desktop profile. Its mobile target is LCP at or below 2.5 seconds, which the constrained phone's 0.648-second LCP passes; its 2.0788-second first-motion time is reported without inventing a separate mobile threshold. Poster decode/next-frame and LCP are separate browser measurements and need not occur in the same order. These are individual runs, not a percentile guarantee.

Raw evidence: [first assembly](../artifacts/first-impression/resumed/optimized-desktop-no-store.json), [prepared desktop](../artifacts/first-impression/resumed/verified-desktop-no-store.json), [repeat desktop](../artifacts/first-impression/resumed/verified-desktop-repeat.json), [phone profile](../artifacts/first-impression/resumed/verified-phone-10mbps-40ms.json). The phone file retains its original internal `optimized-phone-10mbps-40ms` label; its filename is the final verified artifact. The [no-store](../artifacts/first-impression/arrival-proxies/profile-4330.json), [normal-cache](../artifacts/first-impression/arrival-proxies/profile-4331.json) and [limited](../artifacts/first-impression/arrival-proxies/profile-4332.json) profiles specify unchanged response forwarding, CPU unthrottled, cache policy and network shaping. This is neither a physical phone nor a full cellular/upload simulation.

Prepared desktop resource entries totalled **2,078,766 bytes** over the 6.58-second observation; phone entries totalled **1,577,416 bytes** over 5.75 seconds. These include later cards and 3D resources and are not first-screen-only totals; navigation timing is separate. Each final sample made zero full-project-detail/history requests on Explore and fetched no editing GLB; the largest discovery GLB was 210,852 bytes. Final visual proof: [desktop arrival](../artifacts/first-impression/resumed/optimized-arrival-desktop.jpg) and [phone arrival](../artifacts/first-impression/resumed/optimized-phone.jpg). Earlier `resumed/final-*` files remain historical intermediate samples.

## Walkthrough, history and remaining scope

The [82.022-second 1080p walkthrough](../artifacts/first-impression/walkthrough/render-UaNFMH/Open-Take-Studio-First-Impression-Walkthrough.mp4) combines real current UI captures and saved clips. It is a curated sequence of sampled interface frames and media, not a fabricated continuous recording. [Shot manifest](../artifacts/first-impression/walkthrough/render-UaNFMH/shot-manifest.json) and [full-decode verification](../artifacts/first-impression/walkthrough/render-UaNFMH/video-verification.json) are retained. The 8,295,910-byte artifact has not been published.

The earlier native Chrome URL-confidence safety stop is historical. Browser work stopped there; after explicit user resume, the authorized direct tab interface was re-established and the above journeys completed. It is no longer the acceptance blocker.

Complete studio scope remains in the [ledger](implementation-ledger.md), [feature matrix](feature-coverage.md), [12-family/253-model inventory](capability-inventory-2026-11-03.md) and [route/license audit](model-route-audit.md). **11 outcomes remain planned/unavailable:** translation/dubbing, standalone AI music, document-to-finished-story orchestration, client/social review delivery, image-to-3D, general node canvas, hosted team review, studio MCP, scheduled publishing, VEED cleanup serving and compatible Kling extension. Router H3 base-video regeneration stays disabled; narrow native partner regeneration is separately proven. Catalog presence, illustrations or public family weights do not establish a working route, identity guarantee or all-open-weights execution.

The current browser journeys, portable playback, package preservation, final arrival observations and display-renderer visual checks are complete. The first-assembly desktop poster overrun, single-machine measurement limits, unverified physical-phone/actual-hidden-tab behavior and broader model/product gaps remain explicit. There is no active generation blocker; this is not a claim that every catalogue outcome or device is complete.



