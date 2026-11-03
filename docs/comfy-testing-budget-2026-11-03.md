# Comfy testing budget for the remaining six upgrades

Researched 2026-11-03. No paid inference, purchase, account change, or deployment was performed for this research.

## Purchase recommendation

**The five non-inference upgrades require zero additional Comfy credits to implement or test without running generation.** Existing saved images, video, audio and 3D assets can be reused. Building the other six adapters and testing their local validation, state, persistence, cancellation and error handling also does not itself require paid inference.

For live **Router** tests, Comfy explicitly says a subscription is unnecessary: add workspace credits. Its published conversion is **$1 = 211 credits**. A $20 credit budget therefore represents 4,220 credits; $50 represents 10,550. These are conversions, not verified checkout package sizes. Check the selected workspace before funding it. [1][2]

My recommendation is to finish the free engineering first, validate the exact routes and their availability, then provision **about $20 for an initial short-test pass**. Treat **$50 as a larger iteration allowance**, not a promise that it will finish all six features. Do not buy an annual or higher-tier plan solely to run Router calls. There is no evidence that replenishing a balance fixes the recorded `not_enabled` or incompatible-input failures.

**Native Comfy Cloud workflows are a different execution route.** Current monthly plans are Standard $20, Creator $35 and Pro $100. Standard is the lowest paid option if native Cloud workflow access is required; Creator adds custom model/LoRA import. Confirm the monthly toggle at checkout: the pricing page also displays annual equivalents. Credits included in a selected plan may cover testing, so do not automatically buy a plan *and* a separate top-up. [3]

## What is known about each unfinished route

| Upgrade | Current evidence | Consequence before spending |
|---|---|---|
| Kling video extension | Router still documents `kling/videos-video-extend`, which requires a provider `video_id`. The native Partner Node documentation separately says Kling Video Extend was retired. | Do not claim the entire Router route is retired, but do not assume it works. The previous `invalid_input` remains unresolved. Confirm compatible parent generation and exact pricing first. A supported continuation model would be an explicitly different implementation. [4][5] |
| Translation and dubbing | Router exposes text-generation, speech and lip-sync components; these need a coordinated pipeline. VEED Dubbing is listed as a native Partner Node. | No verified all-in Router quote. Translation, speech generation and optional lip-sync can each bill separately. The priced native dubbing alternative must first be confirmed available. [5][6] |
| Standalone music | Router now documents `pika/pika-music`, including text-to-music, lyrics and 10–360-second duration. Sonilo is separately priced as a native Partner Node. | Pika is a plausible new adapter; its actual Router price was not recoverable from the public pricing page. Do not apply Sonilo's rate to Pika. [5][7] |
| Speech cleanup | Router documents `veed/clean-audio`; the existing project recorded `not_enabled`. | Documentation does not establish this workspace's entitlement. Credit purchase alone is not a demonstrated fix. Native VEED pricing is available, but successful access is still unverified. [5][8] |
| Document to finished story | This is an orchestration feature, not one model call. Document parsing, editable scene plans and assembly can be built using saved media. | A fresh generated story needs a chosen planner, shot count, image/video quality and optional new narration/music. Quote that exact recipe; do not present a single universal story price. [6] |
| Image to 3D | The Meshy 7.1 Router schema exposes text preview/refine. `texture_image_url` guides texturing and does not establish image-to-geometry support. Native Meshy Image to Model is separately documented/priced. | Implement and verify a genuine image-to-3D route rather than relabeling text generation or texture guidance. [5][9] |

## Conditional, reproducible test basket

This is a **native Partner Node alternative**, not an exact quote for the currently implemented Router adapters. It assumes the named nodes are enabled and usable in the chosen execution environment. It excludes GPU runtime, subscription access, storage, tax, failed/charged attempts, and new narration. Reuse saved source video, audio and references.

| Test | Small-pass assumption and published rate | Credits | USD equivalent |
|---|---|---:|---:|
| Continuation alternative | H3 Max Turbo, 768p: 2 × 5 billed seconds × 12.07 | 120.70 | $0.57 |
| Dubbing | VEED standard: 2 × 10 billed seconds × 33.19 | 663.80 | $3.15 |
| Music | Sonilo: 2 × 30 seconds × 0.5275 | 31.65 | $0.15 |
| Cleanup | VEED: 2 × 1 minute × 3.77 | 7.54 | $0.04 |
| Story | Gemini 3.8 Flash: 2K input/1K output; three FLUX 3 1K images; three H3 Max 768p five-second shots | 408.71 | $1.94 |
| Image to 3D | Meshy: 2 textured 2K/4K models × 362.1 | 724.20 | $3.43 |
| **Small model-charge subtotal** | Calculated from the assumptions above | **1,956.60** | **$9.27** |
| **Three repetitions** | More samples/iteration, same settings | **5,869.79** | **$27.82** |

Published source: Partner Node pricing. Story calculation is `2 × 0.4526 + 2.263 + 3 × 14.48 + 15 × 24.14` credits. The story reuses narration and can reuse the music test output; generating replacement speech adds an unpriced amount. Every additional model attempt can increase the bill. [5]

Cloud GPU runtime is currently documented at 0.266 credits/second. As a scenario, 30 minutes adds 478.8 credits, about $2.27; this is not a prediction of how long those jobs take. Dedicated Comfy API deployment workers have separate runtime rates and can incur charges while warm. Creating a custom deployment is not necessary just to add app features or call Router. [2][10]

## How to turn the allowance into an actual quote

1. Finish schemas, fixtures and saved-media tests without inference.
2. Select one supported model and serving provider per live test. Record resolution, duration, token budget and model mode.
3. Confirm access and price in the selected Comfy workspace. A catalog entry's `billing.charges_on_policy_rejection` describes refusal billing; it is **not a numerical price**. [11]
4. Run one short, authorized successful call per route. Capture request ID and `X-Comfy-Credits-Used` when provided, then reconcile workspace usage. An absent cost header does not mean free, and provider payload cost fields are not necessarily the final Comfy charge. [12]
5. Reuse idempotency keys for transport retries; do not repeatedly resubmit an unavailable route. Revise the remaining test estimate using observed consumption.

The exact Router cost of all six upgrades remains **unknown** because some adapters, access checks and route prices are unresolved. The $20/$50 recommendations are practical initial allowances based on short test units, not fixed-price completion estimates.

## Sources

1. Comfy Router product FAQ — subscription not required; workspace credits: https://comfy.org/platform/router
2. How credits work — conversion and Cloud runtime: https://support.comfy.org/articles/5846341390-how-credits-work-in-comfy
3. Official plans and pricing: https://comfy.org/pricing/
4. Kling extension Router schema: https://docs.comfy.org/development/comfy-router/models/kling/videos-video-extend/code
5. Native Partner Node pricing and Kling node retirement notice: https://docs.comfy.org/tutorials/partner-nodes/pricing
6. Router model catalog: https://docs.comfy.org/development/comfy-router/models
7. Pika music Router schema: https://docs.comfy.org/development/comfy-router/models/pika/pika-music/code
8. VEED cleanup Router schema: https://docs.comfy.org/development/comfy-router/models/veed/clean-audio/code
9. Meshy 7.1 Router schema: https://docs.comfy.org/development/comfy-router/models/meshy/meshy-7-1/code
10. Custom deployment billing: https://support.comfy.org/articles/2703236295-comfy-api-deploy-your-comfyui-workflow-as-an-api
11. Model discovery and billing metadata: https://docs.comfy.org/development/comfy-router/discover-models
12. Router billing: https://docs.comfy.org/development/comfy-router/billing
