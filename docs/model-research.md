# Router model research

Research and execution evidence refreshed November 3, 2026. This file records integration evidence, not a claim that every model or mode has successfully run. Weight licenses and actual-versus-requested provider evidence are covered separately in the [route audit](model-route-audit.md).

## Architecture sources read

- [Router quickstart](https://docs.comfy.org/development/comfy-router/quickstart)
- [Queued requests](https://docs.comfy.org/development/comfy-router/queue)
- [SDK surface distinction](https://docs.comfy.org/development/api-development/sdks)
- [Model catalog](https://docs.comfy.org/development/comfy-router/models)
- [Model schemas and native results](https://docs.comfy.org/development/comfy-router/schemas)
- [Errors, retries, and keyed recovery](https://docs.comfy.org/development/comfy-router/errors)
- [Capabilities, binary exceptions, and body limits](https://docs.comfy.org/development/comfy-router/limitations)

Router adapters import lowercase `comfy` from `@comfyorg/sdk` and use `comfy.models`. The later inspection brief separately authorizes native Comfy Cloud workflows; those run through an isolated native port and retain versioned graphs and executed graph evidence. Graphs are never submitted to Router. No local GPU or model installation is required.

## Authenticated discovery evidence

The full paginated authenticated catalog contained 253 models. The November 3 refresh successfully read all 253 native schemas (HTTP200); selected adapter schemas are cached in full and the complete directory records their fields, modality and verification time. A case-insensitive search for Z-Image variants found none. The initial image route is therefore **`bfl/flux-3-image`**, not an assumed translation of the earlier Z-Image Turbo workflow. There are 23 Router adapters, 21 admitting requests. VEED cleanup and Kling extension are disabled after actual failures. H3 base-video regeneration is a separately disabled mode; a native partner workflow now implements that outcome outside Router.

These GETs establish that the key can access the catalog and schemas. They do **not** establish balance, paid generation admission, provider health, or successful output. The end-to-end validation receipt records those separately.

Evidence files:

- [Catalog snapshot](schemas/catalog.json)
- [Dated full directory and schema inspection](schemas/catalogue-snapshot.json)
- [Discovery statuses and ETags](schemas/discovery-report.json)
- [FLUX 3 schema](schemas/bfl--flux-3-image.json)
- [MiniMax H3 schema](schemas/minimax--minimax-h3.json)
- [Read-only refresh script](../scripts/research-models.mjs)
- [Full read-only catalogue refresh](../scripts/catalogue-refresh.ts)

Refresh from the project root with `node scripts/research-models.mjs`. The script loads `.env` using `override: true`, never prints the key, and only makes catalog/schema GETs. Schema caches are private development evidence. They contain provider contracts, not credentials or generated assets.

## Implemented adapters

The [typed registry](../server/model-registry.ts) supplies model-specific controls, request builders, input roles, delivery modes, and output extraction. The [contract tests](../tests/model-registry.test.ts) check generated default requests against the fetched schemas, including references and unions. Controls are narrower than the entire vendor surface where necessary for a safe, understandable studio workflow.

| Model | Input mapping | Saved result | Delivery | Validation boundary |
|---|---|---|---|---|
| [FLUX 3 Image](https://docs.comfy.org/development/comfy-router/models/black-forest-labs/flux-3-image/code) `bfl/flux-3-image` | Prompt, aspect ratio, resolution, grounding, moderation tolerance, release tag; optional `images` as base64 | `result.sample` | Queue | Actual text-to-image and single-reference editing tested; no seed or workflow sampler fields |
| [MiniMax H3](https://docs.comfy.org/development/comfy-router/models/minimax/minimax-h3/code) `minimax/minimax-h3` | One text item; media in `content` with documented roles; duration, resolution, ratio, seed, watermark | `task.content.url` MP4 | Queue | Text-only, first-frame, first/last-frame bridging and reference-video modes have separate saved successes; Router base_video regeneration failed and is disabled |
| [FLUX Fill](https://docs.comfy.org/development/comfy-router/models/black-forest-labs/flux-pro-1-0-fill/code) `bfl/flux-pro-1.0-fill` | Base64 source and explicit matching mask; prompt, guidance, steps, output format, seed | `result.sample` | Queue | Actual two source/mask edits saved; visual review shows foreground replacement, but the first glaze-color instruction was not followed |
| [Bria background](https://docs.comfy.org/development/comfy-router/models/bria/image-edit-remove-background/code) `bria/image-edit-remove-background` | Base64 image, alpha preservation | `result.image_url` | Queue | Actual saved alpha PNG; no unsupported prompt |
| [Bria enhancement](https://docs.comfy.org/development/comfy-router/models/bria/image-edit-increase-resolution/code) `bria/image-edit-increase-resolution` | Base64 image, 2×/4× scale, alpha preservation | `result.image_url` | Queue | Actual 2× dimensions verified; 4× untested; output limit checked |
| [FLUX Expand](https://docs.comfy.org/development/comfy-router/models/black-forest-labs/flux-pro-1-0-expand/code) `bfl/flux-pro-1.0-expand` | Base64 source; per-side margins 0–2048, one positive; optional prompt and supported controls | `result.sample` | Queue | Actual 256-pixel left/right expansion saved at expected dimensions |
| [FLUX Video Edit](https://docs.comfy.org/development/comfy-router/models/black-forest-labs/video-edit-v1/code) `bfl/video-edit-v1` | Base64 MP4 and edit prompt | `result.sample` | Queue | Actual saved edit; source duration/size/dimensions checked |
| [FLUX Video Upscale](https://docs.comfy.org/development/comfy-router/models/black-forest-labs/flux-video-upscale/code) `bfl/video-upscale-v1` | Base64 MP4, scale, creativity, optional prompt | `result.sample` | Queue | Actual scale2/creativity0 saved H.264/AAC; no invented resolution control |
| [Eleven SFX](https://docs.comfy.org/development/comfy-router/models/elevenlabs/eleven-sfx-v2/code) `elevenlabs/eleven_sfx_v2` | Text, explicit duration, loop, prompt influence | Binary audio body | Synchronous Router call in internal job | Actual eight-second stereo MP3 saved; Router queue explicitly unavailable |
| [Eleven V3](https://docs.comfy.org/development/comfy-router/models/elevenlabs/eleven-v3/code) `elevenlabs/eleven_v3` | Script and voice ID in `inputs`; normalization, language, seed, stability | Binary audio body | Synchronous Router call in internal job | Actual directed English speech saved; no voice cloning or automatic voice discovery |
| [Seed Audio](https://docs.comfy.org/development/comfy-router/models/byteplus/seed-audio-1-0-multilingual/code) `byteplus/seed-audio-1.0-multilingual` | Script, optional base64 reference image, audio format, sample rate, speech rate, pitch, loudness, subtitles | Base64 `audio` or `url`; timed subtitle sentences/words become a VTT sidecar | Queue | Actual speech and provider-timed captions validated; image-conditioned mode remains experimental |
| [Meshy 6](https://docs.comfy.org/development/comfy-router/models/meshy/meshy-6/code) `meshy/meshy-6` | `mode: preview`, prompt, art style, topology and remesh controls | GLB preferred; OBJ/MTL document fallback | Queue | Experimental geometry draft; other format URLs retained in execution record; not a playable experience |
| [Meshy 7.1](https://docs.comfy.org/development/comfy-router/models/meshy/meshy-7-1/code) `meshy/meshy-7.1` | Distinct preview geometry controls and refine native predecessor/texture controls | GLB with embedded textures after refinement | Queue | Three earlier families plus six new preview/refine pairs; native IDs validated against completed same-project stages |
| [Meshy rigging](https://docs.comfy.org/development/comfy-router/models/meshy/rigging/code) `meshy/rigging` | Completed textured humanoid task ID and positive height | Rigged/walking/running GLBs | Queue | Actual biped skin and clips verified; arbitrary props/quadrupeds unsupported |
| [Meshy animations](https://docs.comfy.org/development/comfy-router/models/meshy/animations/code) `meshy/animations` | Completed rig task ID and one library action ID | Animated GLB | Queue | Action30 Casual_Walk tested; action IDs are not a prompt-to-motion model |
| [LTX Fast](https://docs.comfy.org/development/comfy-router/models/ltx/ltx-2-5-fast/code) `ltx/ltx-2-5-fast` | Text prompt, duration, fps, resolution, generate_audio | `video_url` with native completed status | Queue | Actual four-second 720p/25fps video/audio tested; no image input on this route |
| [Recraft V4.1 Vector](https://www.recraft.ai/docs/api-reference/models/recraft-v4-1) `recraft/recraftv4_1_vector` | Prompt, n, size and URL response; omit unsupported no_text/artistic_level despite shared schema | `data[].url` SVG; restricted sanitized document plus PNG | Queue | Actual vector and preview reopened with verified hashes and attachment-only SVG delivery; collection recovery made no new inference request |
| [VEED native schema](https://api.comfy.org/v2/models/veed/clean-audio/openapi.json) `veed/clean-audio` | Temporary speech URL, strength, normalization/LUFS and format; real ffprobe duration check | Native `data.result.audio.url` | Queue adapter disabled | Actual HTTP403/not_enabled; catalogued model is not served, one attempt preserved |
| [Sync 3](https://docs.comfy.org/development/comfy-router/models/synclabs/sync-3/code) `synclabs/sync-3` | `input` contains one video URL and one audio URL; options preserve supported duration handling, temperature and occlusion detection | `outputUrl`, only with native `COMPLETED` and no error | Queue | Actual lip-sync request completed through temporary media hosting and MP4 saved; visual alignment quality not certified; no hidden TTS or translation |
| [Genjutsu](https://docs.comfy.org/development/comfy-router/models/higgsfield/higgsfield-genjutsu-motion-transfer-v1-0/code) `higgsfield/higgsfield-genjutsu-motion-transfer-v1.0` | Accessible `video_url`, one to eight `image_urls`, resolution and optional prompt | `video.url`, only with native `completed` and no error | Queue | Actual 5.042-second video/audio saved; optional route, exact identity/performance fidelity unproven; source at least four seconds, over thirty seconds trimmed |
| [Kling 2.6](https://docs.comfy.org/development/comfy-router/models/kling/kling-v2-6/code) `kling/kling-v2-6` | Prompt, mode, duration, sound and optional native camera_control | Successful `data.task_result.videos` URLs and native video IDs | Queue | Actual five-second pro sound-off origin saved; sound-on and native camera controls remain untested |
| [Kling extension](https://docs.comfy.org/development/comfy-router/models/kling/videos-video-extend/code) `kling/videos-video-extend` | Verified same-project native video ID and continuation prompt | Native video result | Disabled | Actual 2.6 predecessor rejected; legacy extension-compatible 1.0/1.5/1.6 generation routes absent from current Router catalog |
| [Gemini exact Router schema](https://api.comfy.org/v2/models/vertexai/gemini-3.1-flash-lite/openapi.json) `vertexai/gemini-3.1-flash-lite` | `contents[].parts.inlineData` audio plus instruction; TEXT response, temperature and token limit | Complete final candidate text as UTF-8 transcript.txt | Queue | Narrow audio-to-plain-text transcription adapter; no direct Google backend, word alignment or timed-caption claim; live status is in the catalogue |

### H3 audio and reference details

Audio direction is text within the same prompt as motion direction. H3 returns an MP4 with native audio; the schema has no silent-render or separate audio-prompt field. First/last-frame generation follows the input aspect ratio, so the adapter omits text-to-video `ratio` for that mode. Keyframe and reference roles are mutually exclusive. The builder rejects combinations before dispatch.

Reference-video/audio and regeneration roles appear in the Router schema, while catalog modality metadata lists text and image. A reference-video request and a first/last-frame request each completed; audio-only references are rejected because a visual reference is required. A real 768P H3 output submitted as base_video with a 2K target returned invalid_input. That Router mode is disabled without blind retries. Native `MinimaxHailuo03RegenerateNode` subsequently returned a 2560×1440 video under its separate workflow execution route. ComfyUI node settings, frame counts, and prompt embeddings are never translated into assumed Router fields.

### Binary audio exception

Router explicitly rejects queued SFX and V3 audio because its queue cannot retain their binary responses. The studio still creates a durable local job and returns immediately to the browser; the server worker makes a synchronous **Router** call and saves the bytes. There is no Router queue request ID for these models. Recovery uses the same saved body and idempotency identity within a bounded window and can become admission-unknown. Cancellation after dispatch and long-form queue recovery are not claimed.

Seed Audio offers a queued speech path because its response schema contains JSON with inline base64 audio or a media URL. It returns optional millisecond timings for the generated script. The adapter uses those timings to create WebVTT; it does not invent timing data or claim transcription of unrelated audio. The UI exposes WAV, MP3 and Ogg Opus, omitting raw PCM because a self-describing managed audio file is required. The HeyGen speech schema was also inspected, but a duplicate adapter is not enabled without a distinct product need.

### Inputs and media

Uploaded and generated media are read by the server from managed storage. The adapter sends base64 for BFL/Bria fields that document base64, and data URIs for H3 fields that document them. Local paths, browser blob URLs, and private preview links are rejected. [Input validation](../server/input-validation.ts) inspects file headers for the constraints it can verify and caps the encoded Router body at 100 MiB. Header inspection is not full codec decoding; provider validation remains authoritative.

For the URL-only Sync 3 and Genjutsu inputs, [media transport](../server/media-transport.ts) uploads the selected owned file through the documented [Comfy Cloud v2 asset endpoint](https://docs.comfy.org/api-reference/v2/assets/upload-an-asset-single-call-multipart). This is file transport using the existing workspace credential, not Cloud inference. Metadata parts precede the file in the streaming multipart request. Returned URLs are checked for HTTPS and sufficient lifetime, then fetched with **no Authorization** header and verified against the selected media. Audio/video bytes must match their original hash; image normalization can produce a separate hosted hash. A real existing demo MP4 and WAV passed this public-fetch check. No localhost or private preview URL is sent to a remote model.

The local original remains the durable source. Signed media URLs expire and are server-only transport credentials. An already admitted job retains its original body and idempotency identity; refreshing transport must not silently turn a retry into different generation inputs. New intended requests can obtain fresh transport. Actual upload timing/hash evidence is recorded without signed URLs in the ignored validation receipt.

### Studied routes with unresolved dependencies

| Outcome | Inspected Router route | Exact dependency before enabling |
|---|---|---|
| Dubbing and translated lip sync | [Sync 3](https://docs.comfy.org/development/comfy-router/models/synclabs/sync-3/code) `synclabs/sync-3` | Media transport is now verified. `dubParams` exposes a provider and target language, but a mode-specific translation/input recipe and live language/provider validation are still required. The enabled adapter only uses supplied audio for lip sync. |
| Provider-native video extension | [Kling extension](https://docs.comfy.org/development/comfy-router/models/kling/videos-video-extend/code) `kling/videos-video-extend` | Actual Kling 2.6 native video ID continuity was verified, but extension returned invalid_input. The [official update log](https://kling.ai/document-api/apiReference/updateNotice?date=2026-02-11) documents extension for 1.0, then 1.5/1.6; these predecessor routes are absent from the dated253-model Router catalog. Compatible current dispatch remains unresolved. |
| Standalone music | No verified dedicated music route in this catalog review | H3 can generate score inside a video. A documented Router music-only request/output contract is still needed; SFX is not advertised as a full song generator. |
| Timed subtitles for arbitrary uploaded audio/video | Gemini plain-text transcription adapter does not provide alignment | A verified word/segment alignment stage is still required. Seed Audio supplies timings only for speech it generates. Manual caption authoring/import remains independent. |
| General playable/game generation | No playable-project Router route verified | The local branching-film player uses already saved video assets and a portable HTML/media export. General game authoring, simulation, generated game code, and a secure game build/runtime pipeline are not supplied by Meshy geometry or by that local player. |

The Signal Run module now adds one concrete local playable game with movement, pickups, patrol lights, energy, timer and a win portal. The spatial module stages real meshes/primitives and renders local WebGL frames to PNG/MP4. These functional local tools do not imply a generic game-generation Router route. Standalone local synthesized music is likewise labelled separately from AI song generation.

### Vector collection and provenance

Recraft V4.1's exact provider documentation is narrower than its shared Router schema. An initial `no_text` request failed invalid_input; the corrected intended request omits that legacy field and completed. The returned SVG includes `display:block` and nonvisual C2PA metadata. The restricted parser accepts only block/inline/none display, removes nonvisual metadata and its namespace, retains an original source hash, and records that a provider signature is **not preserved** in the changed sanitized document. Script, event, external-resource, image/use/foreignObject and unsupported CSS constructs never reach Sharp or the downloaded document. The vector is attachment-only; the gallery receives a real PNG preview. Collection recovery uses the same cached Router result and identity without another inference request.

Repeated request settings are evidence of the request, not a guarantee of identical pixels or persistent identity. Provider task cost is not the Comfy invoice. Catalog access is not a free-generation promise.
