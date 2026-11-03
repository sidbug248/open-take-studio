# Model, license and execution-route audit

Reviewed November 3, 2026. This is a technical evidence register, not a grant of model rights. The application's MIT license covers original application code. It does not license provider models, hosted services, imported assets or outputs. The dated discovery snapshot contains 253 models and 253 successful native-schema reads; 23 Router adapters are present, 21 admitting requests. VEED cleanup and Kling extension are disabled. H3 Router base-video regeneration is a separately disabled mode. Later user authorization adds explicit native Comfy Cloud workflow execution.

## Result

Router adapters use **Comfy Router hosted model APIs**. The later inspection brief separately authorizes **native Comfy Cloud workflows**, which keep their exact graphs, checkpoint filenames, bindings and execution evidence outside Router. No implemented route has enough evidence to certify every generative stage as identified, appropriately licensed open weights. Public family releases do not attest hosted checkpoint hashes or auxiliary processing. The public [Router audit](../shared/model-audit.ts) sets `openWeightExecutionVerified: false`; native graph evidence below is more specific but does not award an all-stage badge.

Live proof additionally covers FLUX Fill source/mask edits; H3 text-only, first/last-frame bridging and reference-video modes; directed Eleven V3 speech; Kling 2.6 text-to-video; and six new Meshy geometry/texturing families. Native Z-Image Turbo, image resizing/sharpening, checkpoint H3 I2V and partner-node H3 regeneration have separate receipts. Integration success does not certify identity, motion fidelity, lip alignment or artistic quality. Other modes remain experimental even when their parent model has proven modes. See [validation](validation.md), the [dated inventory](capability-inventory-2026-11-03.md) and the inspection production receipts.

## Existing and newly integrated model stages

Every row is reached through `comfy.models`; no direct provider inference endpoint is configured. “Not verified” means no exact released weight artifact and applicable license were established during this audit, rather than an assertion about all research from that vendor.

| Router route / requested provider namespace | Exact implemented variant and stage | Weight/license evidence | Live boundary |
|---|---|---|---|
| `bfl/flux-3-image` / BFL | Full FLUX 3 Image; text generation and reference editing. `version` is a service release tag, not a checkpoint hash | Full model offers commercial weights by agreement. Separate Klein weights do not establish this route's openness | Text-to-image and single-reference editing tested; no multi-reference identity guarantee |
| `minimax/minimax-h3` / MiniMax | Hosted MiniMax-H3 video plus native audio | Public variants have the restricted H3 Community License; hosted Context-IR excluded from that release; exact serving checkpoint unknown | I2V, text-only, keyframe bridging and reference-video tested separately; Router regeneration disabled after invalid_input |
| `bfl/flux-pro-1.0-fill` / BFL | FLUX.1 Fill **Pro** source/mask inpainting | Not the separate Fill Dev checkpoint; exact public Pro weights not verified | Actual foreground replacement saved; first requested color change was not followed |
| `bria/image-edit-remove-background` / Bria | Remove-background API operation; checkpoint unnamed | A public RMBG model family is insufficient to identify this API's version/license | Actual PNG with alpha saved and reopened |
| `bria/image-edit-increase-resolution` / Bria | Increase-resolution API operation; checkpoint unnamed | Exact weights and auxiliary enhancement stages not verified | Actual 2× result dimensions verified; 4× remains untested |
| `bfl/flux-pro-1.0-expand` / BFL | Native FLUX.1 Pro pixel-margin expansion | Exact hosted weights not attested by a family release | Actual left/right outpainting at expected dimensions |
| `bfl/video-edit-v1` / BFL | Hosted video editing v1 | Exact public serving weights not verified | Actual saved MP4 edit; fidelity needs visual judgement |
| `bfl/video-upscale-v1` / BFL | Hosted video enhancement v1 | Exact public serving weights not verified | Actual scale-2, creativity-0 request saved H.264/AAC output |
| `elevenlabs/eleven_sfx_v2` / ElevenLabs | SFX v2; synchronous binary audio | Exact public SFX weights and license not verified | Actual eight-second stereo ambience; loop quality not certified |
| `elevenlabs/eleven_v3` / ElevenLabs | Eleven v3; synchronous dialogue/voice synthesis | Exact public speech weights not verified; arbitrary voice entitlement not assumed | Actual directed English speech with documented example voice saved |
| `byteplus/seed-audio-1.0-multilingual` / BytePlus | Seed Audio 1.0 multilingual speech; provider timing converted locally to VTT | Seed-family research does not establish this API variant's released weights/license | Actual WAV and timed VTT tested |
| `meshy/meshy-6` / Meshy | Meshy 6 text-to-mesh **preview** geometry | Exact public Meshy 6 weights not verified | Schema-backed generation; local GLB viewer is a separate implemented tool |
| `meshy/meshy-7.1` / Meshy | Separate text-to-3D preview and refine requests | Exact public Meshy 7.1 weights not verified | Six new families each have preview and textured refine, beyond three earlier originals |
| `meshy/rigging` / Meshy | Skeleton fitting and returned basic clips for textured bipeds | Exact rigging checkpoint and auxiliary stages unknown | Real humanoid rig, walk and run GLBs have skins, animations and embedded textures |
| `meshy/animations` / Meshy | One documented library action on a completed rig | Library animation is not unrestricted text-to-motion; exact processing weights unknown | Action 30 Casual_Walk saved and reopened |
| `ltx/ltx-2-5-fast` / LTX | Fast hosted text-to-video with optional native audio | Published LTX 2.5 weights use LTX-2.x Community License; actual hosted checkpoint/auxiliary stages unknown | Four-second 720p/25fps request returned H.264 and stereo AAC; other settings remain untested |
| `recraft/recraftv4_1_vector` / Recraft | V4.1 Vector SVG generation | Exact public weights not verified; hosted service terms apply | Actual sanitized SVG and PNG preview saved/reopened after corrected controls and cached-result collection recovery |
| `veed/clean-audio` / VEED | Native speech noise reduction and loudness normalization | Exact processing weights unknown | **Unavailable:** actual 403 not_enabled; schema exists but Router does not serve the route |
| `synclabs/sync-3` / Sync Labs | Audio-driven Sync 3 lip sync using a supplied video and speech asset | Exact public Sync 3 weights not verified; no hidden TTS/dubbing stage enabled | Actual Router request completed and MP4 stored; visual alignment quality not certified |
| `higgsfield/higgsfield-genjutsu-motion-transfer-v1.0` / Higgsfield | Genjutsu motion transfer v1.0 from video and reference images | Exact public serving weights not verified | Actual 5.042-second H.264/AAC returned and reopened; exact identity/performance preservation unproven |
| `kling/kling-v2-6` / Kling | Hosted2.6 text-to-video with optional native camera fields | Exact public hosted weights not verified | Actual pro five-second sound-off video; camera controls and sound-on remain untested |
| `kling/videos-video-extend` / Kling | Native predecessor-video extension operation | No checkpoint or public weight artifact attested | Actual 2.6 predecessor failed; extension disabled. Official legacy 1.0/1.5/1.6 predecessor routes absent from current catalog |
| `vertexai/gemini-3.1-flash-lite` / VertexAI | Exact Gemini 3.1 Flash Lite multimodal text route used for audio transcription | Public weights and serving revision not attested; VertexAI is the requested route, not independent executor proof | Complete final text only; no word timing, forced alignment, speaker identity or dubbing claim. Live state in catalogue |

Each row's exact input/output source is linked in [model research](model-research.md) and the [static route audit](../shared/model-audit.ts). Official hosted speech and 3D documentation identify services, not public checkpoint licenses: [ElevenLabs models](https://elevenlabs.io/docs/overview/models), [Meshy API](https://docs.meshy.ai/en).

## FLUX 3 is not FLUX 3 Image Klein

The [full FLUX 3 Image page](https://bfl.ai/models/flux-3-image) offers commercial weight access by agreement. The [Klein announcement](https://bfl.ai/blog/flux-3-image-klein) identifies a separate 5.6B base and distilled release under the FLUX Kommunity License. Its [model card](https://huggingface.co/black-forest-labs/flux-3-image-klein-base) distinguishes base versus distilled weights, a separate Qwen3-VL-4B-Instruct encoder and prompt upsampling. Those components each matter to an all-stage audit.

Authenticated discovery contained `bfl/flux-3-image` but no Klein route. Read-only checks of `bfl/flux-3-image-klein` and `bfl/flux-3-image-klein-base` returned HTTP 404. This application must not relabel the working full-model route as Klein, substitute a guessed ID, or silently call the separate BFL API.

## MiniMax H3 scope

The [H3 release](https://www.minimax.io/news/minimax-h3-open-source) separates base first/last-frame, reference and regeneration weights from hosted H3-Context-IR processing. The [community license](https://huggingface.co/MiniMaxAI/MiniMax-H3/blob/main/LICENSE) is restricted and explicitly excludes the EU, UK, Republic of Korea and US from its defined territory; it is not MIT or Apache. The publisher's [license FAQ](https://huggingface.co/MiniMaxAI/MiniMax-H3/blob/main/docs/QA-about-License.md) distinguishes those weight terms from globally available hosted API service. We do not infer that hosted API usage is prohibited merely because weight distribution is restricted.

The [Router contract](https://docs.comfy.org/development/comfy-router/models/minimax/minimax-h3/code) selects the hosted model name and has no checkpoint hash or documented Context-IR bypass. An actual successful H3 video proves the hosted route worked; it does not certify the open-weight pipeline.

## Requested route versus observed serving provider

`modelId` and the registry's `provider` identify the requested route. A result's `servingProvider` identifies the actual provider only when Router supplies it. A missing value means **not reported**, never inferred from a model prefix or native response shape. Older asset metadata that copied a provider label is not independent execution evidence; returned job metadata is authoritative. Queue IDs, synchronous diagnostic execution IDs, submitted bodies and returned metadata are retained separately. The worker also preserves a reported `creditsUsed` value; absent is unknown, not free. Native vendor credit fields are not Comfy billing evidence.

Read-only saved-record inspection confirmed these six additional completed requests, each with a managed output asset:

| Mode / take | Router request ID |
|---|---|
| FLUX 3 text-to-image · Liquid daylight | `3eb7d7eb-813d-42a3-b7cf-1726fa74c0a3` |
| FLUX 3 text-to-image · Midnight on wheels | `c3142523-d776-454f-ae72-7f537add9dde` |
| H3 four-second first-frame branch · Follow the signal | `b5aae6e0-bda5-4464-b4b3-975a5a306b6a` |
| H3 four-second first-frame branch · Face the storm | `3283aa16-12d6-44db-b966-2d1d793daac1` |
| FLUX 3 edit using an actual extracted frame · Mara Signal study | `a7c1f5cf-3aae-41df-8190-e2ea8b481876` |
| Sync 3 supplied video/audio lip sync · Mara A voice in the storm | `17841525-4326-47b4-98bc-968d9c7505bb` |

Router supports provider selection and fallback, and can translate/drop parameters on alternate routes. A reproducibility or open-weight policy must constrain actual dispatch and record the outcome; a display badge cannot enforce it. See [provider routing](https://docs.comfy.org/development/comfy-router/providers) and [response headers](https://docs.comfy.org/development/comfy-router/headers). `strict_mode` concerns alternate-provider request validation; it is not an open-weight guarantee.

## Can Router currently satisfy an all-stage open-weight requirement?

No complete, verified route was found for this application's image → video → speech chain. Additional catalog candidates were checked rather than assuming family names imply compliance:

- [LTX 2.5 weights](https://huggingface.co/Lightricks/LTX-2.5) exist under the LTX-2.x Community License. The [Router Fast contract](https://docs.comfy.org/development/comfy-router/models/ltx/ltx-2-5-fast/code) addresses hosted `fast`/`pro` variants without checkpoint attestation and exposes text-to-video here, not first-frame image input. A real Fast request now succeeded, but that only verifies this hosted route and media output. It does not establish license eligibility for a separate weight deployment, exact serving weights, auxiliary audio/encoder stages, or an all-stage open-weight replacement journey.
- [Qwen Image 3.0 through Router](https://docs.comfy.org/development/comfy-router/models/qwen/qwen-image-3-0/code) is a different version from the [Apache-licensed original Qwen-Image](https://huggingface.co/Qwen/Qwen-Image). Its hosted prompt rewriting is enabled by default; exact 3.0 weights and the rewriting stage were not verified.
- Z-Image and FLUX Klein were absent from the authenticated catalog snapshot. A historical ComfyUI workflow does not add a Router route.

To resolve this within the current architecture requires Router model IDs for exact released variants, suitable licenses for the intended use, an explicit account-accessible execution provider, auditable checkpoint/encoder/audio/prompt-processing identities, control over fallback and rewriting, and live validation. None should be represented as already provided.

A separately operated and fully attested open-weight backend would require licensed model artifacts and all auxiliary weights, checkpoint hashes, GPU capacity, authenticated jobs, media access, durable recovery and billing arrangements. The later authorized native Comfy Cloud route gives actual graph/component evidence but is not that all-stage attestation. No local model installation or GPU setup was added; no model-family badge is used as a substitute for execution evidence.

## Native workflow stages added by the inspection brief

These are separate Comfy Cloud executions, not Router model IDs. The version assets and executed graphs identify graph structure and selected filenames; neither graph filenames nor available-node responses attest hosted weight hashes or every auxiliary implementation. All native requests retained model/node validation and durable media.

| Actual graph stage | Selected components | License and execution boundary | Execution reference |
|---|---|---|---|
| Native Z-Image Turbo image | `z_image_turbo_bf16.safetensors`, `qwen_3_4b.safetensors`, `ae.safetensors`; Comfy sampler and decoder | Official [Z-Image Turbo](https://huggingface.co/Tongyi-MAI/Z-Image-Turbo) and [Qwen3-4B](https://huggingface.co/Qwen/Qwen3-4B) publish Apache2.0 evidence. Exact hosted conversions and the provenance/license of this `ae.safetensors` file were not hash-attested | `796eb4cb-4776-4a25-9b5b-e2894e3ac02a` |
| Native image finish | LoadImage, resize/sharpen/save processing nodes | Image processing, not generative editing; no additional generative model claimed | `f77943c8-86e1-4bd7-937b-0e9f39b479a3` |
| Native H3 first-frame video/audio | `minimax_h3_fl2va_pruned_int8_convrot.safetensors`; `qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors`; H3 video/audio VAEs; `minimax_h3_fl2v_turbo_8step_v1.0_comfyui_bf16.safetensors` LoRA | Public H3 release has a restricted community license. Exact quantization, converted encoder/LoRA and host weight hashes not attested. Selecting actual checkpoint filenames is stronger provenance than a Router alias, but not an all-stage license certification | `fd2fb9d2-a5be-4ace-b5be-4857ddd90f73` |
| Native H3 regeneration partner node | `MinimaxHailuo03RegenerateNode`, original 768P source/prompt, target 2K | Provider-backed partner API stage, not an identified open-weight checkpoint. Actual 2560×1440/24fps/124frame video plus stereoAAC saved. Router base_video remains disabled | `83013072-156f-4a0d-92fd-29c3971de776` |

Full receipts are `artifacts/native-workflows/app-execution-receipt.json`, `h3-execution-receipt.json` and `regenerate-execution-receipt.json`. The official [Comfy MiniMax partner-node implementation](https://github.com/Comfy-Org/ComfyUI/blob/master/comfy_api_nodes/nodes_minimax.py) distinguishes the provider regeneration operation. Native graph exports are editable and their versions survive project packaging. Cloud-editor imports retain imported execution provenance and do not certify studio admission.

## Media transport is not inference

The [Router limitations](https://docs.comfy.org/development/comfy-router/limitations) place uploads outside Router's model surface. URL-only Router inputs use the same workspace key with the documented [Comfy Cloud multipart asset endpoint](https://docs.comfy.org/api-reference/v2/assets/upload-an-asset-single-call-multipart), via raw HTTP solely for storage. This transport creates no inference job. The separate authorized native-workflow port is described above. Temporary signed URLs from [asset metadata](https://docs.comfy.org/api-reference/v2/assets/asset-metadata) are verified with an unauthenticated download before Router generation.

Live transport verification uploaded the existing fictional Coastal Light video and speech track. Their public GETs returned exactly the original SHA-256 bytes (2,162,282 and 662,444 bytes). The redacted receipt is `artifacts/validation/media-transport-receipt.json`. Signed URLs are temporary credentials and are excluded from that receipt. The transport requests a 24-hour asset lifetime, checks actual URL expiry (about six hours in this run), and leaves the managed local originals intact. No paid inference was involved in that check.

Connected Cloudflare read-only discovery reported R2 was not enabled. It was not activated. Higgsfield's separate upload API requires its own credentials and was not configured; neither is necessary for the verified Comfy asset transport. Sync 3 completed using an imported Mara video and generated speech WAV. Genjutsu also completed using the same project's source video and saved appearance reference through this transport. No generic “public hosting unavailable” blocker remains. Dubbing still needs a verified language/provider recipe, not merely the existence of a `dubParams` object.

## Historical next-build execution references and preserved failures

Exact intended bodies, idempotency identities, take/asset IDs and observed Comfy credits are retained in `artifacts/next-build/catalogue-production/submissions.json`. These are representative integration proofs, not a full account bill:

| Mode | Execution reference |
|---|---|
| Genjutsu video plus reference | `421f1914-2a9f-4d6a-9480-b20c37cfd054` |
| Genjutsu dancer-to-clay performance | `b30a1bf9-f4ff-480b-a90d-35916dafe618` |
| Meshy textured prismatic seed | `cd225f42-17c8-493c-8b75-5c1bb3d6fed7` |
| Meshy textured fox courier | `1564f44a-f383-4ab2-bc53-fdcd75cdd64b` |
| Meshy opaque amber alternate | `21dd8d46-0277-4fc3-a9c2-48dfc4563232` |
| Fox rigging / library animation | `bda54937-fb96-469d-a93d-7b29818977d8` / `9412139d-5492-4e3c-ac12-17559705dbe1` |
| FLUX outpainting | `6f8b4e57-4a47-43ef-8406-93b4d695e7df` |
| Bria cutout / 2× enhancement | `7914f998-1505-4354-8b04-c7c89a436bc5` / `00866751-a1f6-4153-b71a-a8b8109d070a` |
| Seed speech and captions | `e541194b-ddc7-4545-8c50-a5e4123f483d` |
| Eleven ambience, synchronous HTTP execution | `f0ebab87-f28c-454f-8da8-0d88658e2988` |
| LTX Fast text-to-video/native audio | `0a606baf-b64d-4b80-84a4-3f189c14cb51` |
| BFL video enhancement | `76a1d6f3-f825-4036-b8e8-2d6b76298727` |
| Recraft vector and local PNG preview | `e9bfbf06-8e4e-4d6f-874e-1329373cc5a2` |

The original amber PBR refinement `9cc2a19c-a3db-40a1-990b-acece4aece11` failed with provider_error. It was preserved, then a deliberately changed opaque non-PBR finish was submitted with a new identity and succeeded. No reason for the original provider failure was inferred. VEED cleanup returned 403/not_enabled before a queue ID was issued and is disabled. Initial Recraft request `d151efba-987e-49d6-99b7-d0830b1ba586` failed invalid_input. The [exact V4.1 provider documentation](https://www.recraft.ai/docs/api-reference/models/recraft-v4-1) excludes `no_text` and `artistic_level`, which the shared Router schema admits; the adapter now omits them. The corrected request succeeded. Local collection initially rejected ordinary display styling, then recovered from the cached result under the same request with no inference resubmission. The safe SVG preserves source hashes but omits nonvisual C2PA metadata; a provider signature over the original bytes is not claimed for sanitized bytes. Failed jobs are not successful examples, and no missing usage value is converted to zero.

The completed catalogue-production batch contains 21 intended requests: 18 completed, two failed and one blocked, with 22 managed assets. All 22 saved files reopened with their expected size and SHA-256. The available Comfy-credit subtotal is 3458.61 from 15 reported responses; six requests have unknown usage, so this is not an account bill or full spend total. Actual serving-provider metadata remains unreported in these records. Full receipts are in `artifacts/next-build/catalogue-production/production-summary.json` and `media-verification.json`.

The dancer-to-clay output is a 5.042-second, 726×1270 H.264/AAC clip. `electric-source-clay-comparison.mp4` aligns the actual source/result at time zero and stops at the shorter clip, using source audio only. `electric-source-clay-contact.png` compares five actual decoded timestamps. Visual inspection of those samples shows retained broad poses and a clay character/floor change; it does not prove frame-exact motion, identity consistency or full-clip quality. The receipt records both original media hashes and actual frame times. No inference was used to make the comparison.

## Inspection expansion and distinct mode proofs

The current inspection batch contains 123 intended Router requests: 117 completed and six failed. Actual stored creative outputs are 58 stills, 32 videos, 14 audio pieces and 12 GLBs across six new subject families; five additional text documents are four caption sidecars and one transcript. Derived posters, native workflow outputs and local finishing outputs are counted separately. All 121 Router output files reopened through nine project records and matched their recorded byte size/SHA256, totaling 446,870,412 bytes. Receipts: [requests](../artifacts/inspection-build/production/requests.json), [summary](../artifacts/inspection-build/production/summary.json), [media verification](../artifacts/inspection-build/production/media-verification.json). The two labelled still contact sheets and eight curated selects support visual review, without claiming every generated frame is flawless.

| Distinct operation | Actual execution reference | Result and limit |
|---|---|---|
| Fill source/mask foreground replacement | `7c4e60fa-f759-42bf-81cb-6fb59db77106` | Glass strawberry basket replaced the kettle foreground. Earlier `68cfe7e9-9334-4f6d-8744-3009ed4e13ef` altered form but did not follow requested glaze color; both retained |
| H3 text-only native audio/video | `a177125b-fd1e-4278-8917-c209c1b7212d` | Saved sea-gate video, no image inputs |
| H3 first/last-frame bridging | `f3aebb0c-8600-4bd2-9bed-a0f589c60641` | Saved dawn/sunset two-frame request; separate mode proof |
| H3 reference-video conditioning | `065354b9-b4b9-4184-a98e-9027075bb674` | Saved conditioned video; no exact motion/identity claim |
| Eleven V3 directed speech | `0a73b46f-03e0-46b6-a1c0-1cbfa142d981` | Saved audio from the documented example voice; sync diagnostic reference |
| Gemini audio-to-text transcription | `e73af36d-e38d-421d-813e-141b72f18ab8` | Complete transcript matches source speech without supplying the script; source WAV/MP3 remains linked. No timing or alignment data claimed |
| Kling 2.6 origin | `c3e2b792-bfed-41e7-8c0d-9149bc909189` | Five-second pro-mode sound-off video and real native video ID |

The reported Comfy-credit subtotal is 6912.84 across 110 responses; 13 requests have unknown usage, so total spend is unknown. This is an observed subtotal, not a cost estimate or account bill. No top-up or paid upgrade was performed. The Gemini response reports 0.03 credits and no serving provider; all requested namespaces remain separate from unreported executors.

Failures remain visible: Seed requests `1c7a35a8-80b6-49a9-89ad-c603bab77cd6` and `a9d60248-72bb-41ec-8a78-3bd398518479` returned provider_error; stylized owl/robot rigs `d507bf5b-e20a-49c2-a1a7-1c4c85b47fdd` and `e1220ebe-5abe-42e3-afbf-a458ad5d8e99` returned invalid_input. The earlier successful fox rig remains valid proof, not a guarantee for other anatomies. Router H3 regeneration `8c5e8128-050f-42a9-a48e-699bae382aa5` and Kling extension `becd74ed-a6a6-4d2b-bb8d-0d70f6259b4a` returned invalid_input and are disabled. They were not repeatedly resubmitted.

The [official Kling update log](https://kling.ai/document-api/apiReference/updateNotice?date=2026-02-11) documents extension for 1.0 and then 1.5/1.6. These legacy generation routes are absent from the 253-model Router snapshot. The 2.6 native ID was real and same-project; compatibility/dispatch remains unresolved rather than being misreported as a missing ID. Native H3 regeneration succeeds through its different partner operation, as recorded above.
