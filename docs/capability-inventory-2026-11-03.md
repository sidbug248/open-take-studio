# Capability inventory · 2026-11-03

Open Take Studio keeps three distinct layers: creator outcomes, reusable project recipes, and an advanced model directory. This inventory records the complete twelve-family scope; it does not describe every discovered model as executable. The runtime source is [server/catalogue-routes.ts](../server/catalogue-routes.ts), with public contracts in [shared/capability-inventory.ts](../shared/capability-inventory.ts).

## Discovery and readiness

On 2026-11-03 at 05:20:28 UTC, authenticated read-only discovery returned **253 Router catalog entries and 253 successful native-schema reads**. The dated [catalogue snapshot](schemas/catalogue-snapshot.json) records model IDs, provider, input/output modalities, schema version/read time and policy-refusal billing facts. [Refresh script](../scripts/catalogue-refresh.ts) reads only model metadata and schemas; it cannot generate, buy credits, alter an account or activate another service. Z-Image Turbo was absent from this catalog. FLUX 3 Image remains the initial image route.

There are 23 Router model adapters in source, of which 21 currently permit admission. VEED cleanup is disabled after actual Router admission returned not_enabled. Kling extension is disabled after a real Kling 2.6 predecessor returned invalid_input; the documented legacy predecessor versions are absent from this Router catalog. H3 Router base_video regeneration is separately disabled; the intended 768P-to-2K outcome is proven through an explicitly labelled native Comfy Cloud partner workflow. A schema HTTP 200 proves discovery, not generation success or account entitlement. The directory exposes all 253 entries for inspection; planned items name exact dependencies.

- **Ready:** implemented local operation, or a matching model/mode has a saved successful generated output.
- **Needs input:** a matching live generation is proven, but the operation requires selected references or predecessor media.
- **Experimental:** implemented adapter with schema review but no saved matching live generation, or a new local module awaiting full validation.
- **Planned:** no executable studio route. A discovered candidate may be named without claiming an integration.

The catalogue stores explicit demonstrations inside each durable project: capability and operation, preview kind, input/output assets, take/job/request IDs, workflow version, verification time and attribution. Canonical image/video/audio/text/vector/mesh/scene/playable modalities drive filters independently of display text. Generation proof requires completed non-archived jobs and an exact matching operation. Generic reference editing does not certify a reference sheet or product scene; supplied-audio lip sync does not certify dubbing. Imported examples and labelled family artwork cannot promote readiness. The table below includes live evidence read at 2026-11-03T09:48:37.374Z; `GET /api/catalogue` updates as saved proof arrives.

This snapshot has **66 creator outcomes**: 36 ready, 19 needing selected inputs, 0 experimental and 11 planned. **55 outcomes have explicit saved demonstrations**. The rest use labelled illustrations. All 253 model-directory entries have documentation links; catalogue presence alone is not a working adapter. The [complete visual-coverage CSVs](../artifacts/inspection-build/visual-coverage/summary.json) distinguish real evidence and family artwork.

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

### Images & design

| Outcome | Baseline | Executable route / candidate | Requirements and limits |
|---|---|---|---|
| Generate an image | ready | bfl/flux-3-image |  |
| Edit with references | needs-input | bfl/flux-3-image | Conditioning can change identity, product details or composition. |
| Masked image editing | needs-input | bfl/flux-pro-1.0-fill | An explicit same-size mask is required. No freehand mask editor is claimed. |
| Remove a background | needs-input | bria/image-edit-remove-background |  |
| Enhance image resolution | needs-input | bria/image-edit-increase-resolution | Maximum output dimension is 8192 × 8192. |
| Outpaint a canvas | needs-input | bfl/flux-pro-1.0-expand | Up to 2048 pixels per side. At least one positive margin is required. |
| Generate vector artwork | ready | recraft/recraftv4_1_vector | Active SVG elements, external links, CSS rules and unsupported drawing constructs are rejected. The vector source is downloaded as an attachment. |

### Cast & continuity

| Outcome | Baseline | Executable route / candidate | Requirements and limits |
|---|---|---|---|
| Reference and asset library | ready | Local assets | Reference conditioning does not prove permanent character identity. |
| Reference sheet variations | needs-input | bfl/flux-3-image | Prompt-guided study; no guaranteed identity lock or automatic character training. |
| Reuse unchanged stages | ready | Local scene | Only edited or downstream dependent stages are resubmitted; each new generation may vary. |

### Cinema & video

| Outcome | Baseline | Executable route / candidate | Requirements and limits |
|---|---|---|---|
| Animate a selected image | needs-input | minimax/minimax-h3 | Four to fifteen seconds; first-frame aspect ratio controls output. |
| Text to video | ready | minimax/minimax-h3 | Text-only mode is separate from the previously tested first-frame mode. |
| LTX fast video | ready | ltx/ltx-2-5-fast | No image input on this Router route. Duration, resolution and frame-rate combinations remain subject to provider validation. |
| Kling directed video | ready | kling/kling-v2-6 | Native camera_control fields are distinct from prompt-guided presets. Exact movement remains model-dependent. |
| Bridge first and last frames | needs-input | minimax/minimax-h3 | Keyframes cannot be combined with reference-media inputs. |
| Reference-led video | needs-input | minimax/minimax-h3 | Reference conditioning is not proven identity consistency. |
| Regenerate H3 video at 2K | ready | Native Comfy Cloud workflow | Proven through the separately labelled native Comfy Cloud partner-node route. The Router base_video attempt failed invalid_input and remains disabled. This resolution regeneration is not arbitrary restyling or clip extension. Provider service terms apply; no open-weight execution is attested. |
| Restyle and edit a clip | needs-input | bfl/video-edit-v1 | Motion and identities can change; prompt instructions are not a deterministic edit list. |
| Enhance a video | needs-input | bfl/video-upscale-v1 | Creative detail can alter faces and product markings. |
| Cinematic direction presets | ready | Local studio | These are prompt suggestions, not model-enforced camera or lens controls. |
| Trim and assemble clips | ready | Local films | Local media processing uses source assets; it is not AI extension. |
| Extend a Kling video | planned | Candidate: kling/videos-video-extend | Unavailable after actual request becd74ed-a6a6-4d2b-bb8d-0d70f6259b4a returned invalid_input using a completed same-project Kling 2.6 native video ID. Needs a documented compatible predecessor model/extension dispatch contract. Uploaded video URLs, task IDs and Router request IDs are not substitutes. No automatic resubmission. |

### Performance & dialogue

| Outcome | Baseline | Executable route / candidate | Requirements and limits |
|---|---|---|---|
| Speech with timed captions | ready | byteplus/seed-audio-1.0-multilingual | Captions time this generated speech. The separate transcription route produces plain text without automatic timing. |
| Directed provider voice | needs-input | elevenlabs/eleven_v3 | Synchronous binary Router response. No voice cloning or likeness guarantees. |
| Lip sync a performance | needs-input | synclabs/sync-3 | Uses temporary Comfy asset hosting. Completed integration does not certify face alignment quality. |
| Transfer a performance | needs-input | higgsfield/higgsfield-genjutsu-motion-transfer-v1.0 | Optional Higgsfield route through Router. At least four seconds; over thirty seconds is trimmed by the provider. |
| Translate and dub dialogue | planned | Candidate: synclabs/sync-3 | Needs a documented translation + voice + timing pipeline, explicit language controls and per-stage validation. The sync adapter intentionally sends supplied audio only. |
| Transcribe audio to text | needs-input | vertexai/gemini-3.1-flash-lite | This multimodal-model transcript requires review against the original. Automatic word alignment and timed captions are not implemented by this route. |

### Music & motion design

| Outcome | Baseline | Executable route / candidate | Requirements and limits |
|---|---|---|---|
| Sound effects and ambience | ready | elevenlabs/eleven_sfx_v2 | Synchronous binary Router response; up to thirty seconds. This is not a full music composition route. |
| Audio-reactive motion design | ready | Local motion | Rendered export and beat synchronization depend on the current local module; AI music generation is separate. |
| Compose standalone music | planned | No implemented route | Needs a documented standalone music Router route and output adapter; sound effects and native video audio are not represented as full music composition. |
| Clean speech audio | planned | Candidate: veed/clean-audio | Catalog and native schema exist, but actual Router admission returned HTTP 403 / not_enabled: this model is not served yet. It was blocked after one attempt; do not retry until Router enables serving. Speech cleanup is not a mixer. Any provider credits field would not be the Comfy charge. |
| Mix a sound track | ready | Local audio-mix | Local audio processing reuses actual saved sound. It does not synthesize new music or align arbitrary speech automatically. |

### Stories & comics

| Outcome | Baseline | Executable route / candidate | Requirements and limits |
|---|---|---|---|
| Shot planning and storyboards | ready | Local shots | Provide Project and shot directions |
| Comic and storyboard pages | ready | Local shots | Uses existing assets and editable local composition; no hidden image generation. |
| Scene revisions and dependency plans | ready | Local scene | A structured scene workflow, not a general-purpose node canvas. |
| Branching film structure | ready | Local films | Provide Saved video takes |
| Document to finished story | planned | No implemented route | Needs document ingestion, editable beat planning and an explicitly confirmed multi-stage generation recipe. No autonomous inferred script pipeline is active. |

### Products & campaigns

| Outcome | Baseline | Executable route / candidate | Requirements and limits |
|---|---|---|---|
| Product scene variations | needs-input | bfl/flux-3-image | Product labels and geometry may change and require visual review. |
| Campaign recipes and formats | ready | Local recipes | Recorded requests do not guarantee identical pixels or exact logos. |
| Client review and social delivery | planned | No implemented route | Needs authenticated review links, comment storage, delivery formats and explicit publishing authorization. No social account integration is active. |

### 3D & spatial

| Outcome | Baseline | Executable route / candidate | Requirements and limits |
|---|---|---|---|
| Generate a 3D draft | ready | meshy/meshy-7.1 | This text-to-3D route does not accept image-to-3D or image retexture modes. |
| Texture a 3D draft | needs-input | meshy/meshy-7.1 | Requires mode refine and the native preview task ID. Sculpture previews cannot enable PBR. |
| Rig a humanoid character | needs-input | meshy/rigging | Biped humanoids only; topology compatibility is evaluated by the provider. |
| Animate a rigged character | needs-input | meshy/animations | The action ID is a library choice, not natural-language motion. FBX/USDZ post-processing is not exposed. |
| Stage a real 3D scene | ready | Local spatial | A rendered guide conditions a later AI request; it does not force identical geometry or camera motion in generated video. |
| Image to 3D | planned | No implemented route | Meshy image-to-3D exists on provider/proxy surfaces but is not an exposed mode of the verified Router meshy/meshy-7.1 text-to-3D route. Needs a documented Router model adapter. |
| Render a 3D animation sequence | ready | Local spatial | Frames are rendered locally in the browser and encoded with FFmpeg. Local camera paths are controlled; generated AI motion is separate. |

### Playables & interactive

| Outcome | Baseline | Executable route / candidate | Requirements and limits |
|---|---|---|---|
| Interactive branching film | ready | Local films | Provide Film nodes and saved clips |
| Offline browser package | ready | Local films | Portable branching video is not a general-purpose game engine. |
| Signal Run · playable browser game | ready | Local playable | A concrete editable game template with local mechanics; it is not a general-purpose game engine or prompt-to-arbitrary-game generator. |
| Create a guided Object Room | ready | Local object-room | Uses authored scene geometry and local interaction; not inferred scene reconstruction or a general game generator. The independent player includes its geometry, media and runtime. Browser WebGL support is required. |

### Recipes & workflows

| Outcome | Baseline | Executable route / candidate | Requirements and limits |
|---|---|---|---|
| Named reusable recipe slots | ready | Local recipes | Provide Completed take or recipe |
| Resume a shot batch | ready | Local shots | Each new shot is billable. Exact same-intent requests reuse saved identities; changed inputs require a new identity. |
| Compare takes | ready | Local compare | Video comparison stops all clips when the shortest clip reaches its end. |
| Inspect imported workflow references | ready | Local assets | Graphs are not submitted to Router and imported examples are not integrated-generation evidence. |
| Run native Comfy workflows | ready | Native Comfy Cloud workflow | This is a separately labelled native Comfy Cloud execution route authorized for workflow work. It does not submit graphs to Router. A resize/sharpen workflow proves processing and transport, not generative editing. Each selected graph has its own model and node dependencies. |
| General production node canvas | planned | No implemented route | Needs typed graph execution, ports, validation and a real canvas editor. Scene dependency plans and branching films cover narrower workflows. |

### Projects & collaboration

| Outcome | Baseline | Executable route / candidate | Requirements and limits |
|---|---|---|---|
| Durable project library | ready | Local studio | Provide Project name |
| Take branches and favorites | ready | Local history | Provide Project takes |
| Production package export and import | ready | Local history | Imported executions remain archived reference history and cannot resume another workspace’s remote request. |
| Shared review and team comments | planned | No implemented route | Needs hosted authentication, durable comments, share permissions and conflict handling. Local project packages provide handoff only. |

### Automation & integrations

| Outcome | Baseline | Executable route / candidate | Requirements and limits |
|---|---|---|---|
| Recoverable Router jobs | ready | Local history | Provider records expire after 24 hours. Binary sync models have different crash/retry limits; no fabricated percentages. |
| Local studio API | ready | Local history | This is a local development service, not a hosted multi-tenant public API. |
| Studio MCP tools | planned | No implemented route | Needs a real MCP server, permissions and task contracts. No MCP integration is currently registered. |
| Scheduled publishing | planned | No implemented route | Needs authorized destination integration, scheduling, approval and delivery receipts. No publishing or scheduling service is active. |

## Saved execution evidence

These are example references, not an exhaustive bill or a visual quality certification. Identical request IDs can support more than one user outcome and must not be counted as separate charges.

| Outcome | Router request | Saved take | Saved asset |
|---|---|---|---|
| Generate an image | ccf154ff-7598-4455-90d7-2a005f55e2f9 | 40b5f67d-80b6-4367-a0b4-62aa8078e134 | 6045e3da-ad2e-4ded-8908-d55745ee8541 |
| Edit with references | 547ae3a0-6fbf-441f-8f40-813eaf08ec5a | e25c58e4-03b1-456c-886a-90ea8ffb0860 | a0ba5799-27eb-4ebe-9302-188d082599d6 |
| Masked image editing | 7c4e60fa-f759-42bf-81cb-6fb59db77106 | d0c977b6-0c4f-498f-8e6c-e5d519069ad0 | b0077612-e0c0-4dec-b59e-51acfffb3245 |
| Remove a background | 7914f998-1505-4354-8b04-c7c89a436bc5 | a221f840-f3f7-4f98-ae8f-12821512989e | d6dc906c-9a00-483b-9410-2033b0973df1 |
| Enhance image resolution | 00866751-a1f6-4153-b71a-a8b8109d070a | bac420d5-1bb6-4457-b050-e8457fdb47b3 | 460958e5-284c-483a-88bc-6bec7b423680 |
| Outpaint a canvas | 6f8b4e57-4a47-43ef-8406-93b4d695e7df | 63fab6e5-4c8b-4ee3-9760-fee92dfa35a7 | d5c518d6-3d80-41db-8255-2f7e71dc6d9e |
| Generate vector artwork | e9bfbf06-8e4e-4d6f-874e-1329373cc5a2 | c929d3dc-be5e-4354-a7c1-a008138d3008 | f20ea358-93fa-4a20-865b-42252017947d |
| Reference sheet variations | dac76e36-bd3d-46c2-8e07-eb9c88f73e7a | cd128880-8b92-43f4-a96d-207f4d3531a6 | 895d47cd-3b41-476b-aca0-94620c000d31 |
| Animate a selected image | 3404f6d1-17e6-4394-ab1b-0954024f08cb | e8b1a945-19a6-4644-a934-d290dd010e5d | 249b43c6-4656-4b50-b634-5a91ee56857b |
| Text to video | a177125b-fd1e-4278-8917-c209c1b7212d | d98ce8b5-3454-41be-b016-fb8b34ecac9f | d2d6c20c-3d96-4803-98ac-ee0bf517ecf6 |
| LTX fast video | 27c32934-1685-4884-b8b6-0996bb9678cc | 0f25d531-adf2-4926-80cc-d311cbf147a8 | f1811a8f-d314-4a00-8ad3-f3bbb509fe4b |
| Kling directed video | c3e2b792-bfed-41e7-8c0d-9149bc909189 | aaeddbd7-f70f-4be8-9fc3-2e94e06696be | 6176c379-84b3-4218-b397-0856cb952c41 |
| Bridge first and last frames | f3aebb0c-8600-4bd2-9bed-a0f589c60641 | ae9f10e6-a845-4c5a-8604-dba0d64c4ab8 | 3080e6fc-2d5e-4c0d-97a7-f4e26ebb6aaf |
| Reference-led video | 065354b9-b4b9-4184-a98e-9027075bb674 | d3471626-2868-41bb-a8f8-8930c8d04a31 | 96324145-faa3-46ce-b776-e5636d1f88ae |
| Regenerate H3 video at 2K | 83013072-156f-4a0d-92fd-29c3971de776 | 59324d6c-f0a4-414e-819b-f4205ac984e4 | wf-508b0c0972066bee077c78a3fb02cc16d6a2d198 |
| Restyle and edit a clip | 99ac7cef-8327-40af-b3b6-176f2c70117d | 262015ea-6db8-4bf2-9727-61600d32bb8e | 24eba537-ce62-45c3-95bc-5b199ab7614a |
| Enhance a video | 76a1d6f3-f825-4036-b8e8-2d6b76298727 | ae840347-1b20-4649-8c54-dde2e79222d8 | 2c69fc74-7c87-4cfc-8692-7c65b1c5ba2d |
| Speech with timed captions | 152329ad-799b-4635-ae5e-34d28009b412 | d1905d33-5baf-4277-8d84-8cb04848e473 | e551b941-fadd-41db-ae69-323c00b720c7 |
| Directed provider voice | b1ec9419-e7fa-4a4a-9b37-598b6434e10b | 8129bb68-33b3-477b-928b-6596fd24ac6c | 411de102-f19d-4f3a-a25b-bf08f2e3d65f |
| Lip sync a performance | 17841525-4326-47b4-98bc-968d9c7505bb | a442b280-42e8-4860-b061-38d37993198f | ba823d07-f35e-4d80-95e4-44b5131de8ea |
| Transfer a performance | b30a1bf9-f4ff-480b-a90d-35916dafe618 | 65fa73df-afd4-4458-a2cb-378882d26b89 | 954cbda3-e618-4346-b4c1-129454aff865 |
| Transcribe audio to text | e73af36d-e38d-421d-813e-141b72f18ab8 | 48aca954-8364-4ad9-afa1-b11fc37ecc25 | c41c60f1-d53c-422b-a76e-cadd7c6fac93 |
| Sound effects and ambience | d3bafb58-57e7-4d69-971c-f3a4771bf0d9 | 9c2cbe9c-93f7-4175-bb23-c5c4ffc61523 | 0d67cf5d-153a-49e4-906a-781a1549956b |
| Product scene variations | 3337b3cd-f9c7-4bbf-8cc7-fd88536e2886 | a9405913-5bb5-4396-9def-5610a4c39ce2 | 2241ed5b-abdd-4e00-ac10-22db96da2904 |
| Generate a 3D draft | 79735b3d-6410-4dbd-a39d-2f5151bb2d41 | d46520fe-a32f-4c8b-82a3-a552a5fe29f8 | 404c5fb1-f2c1-4918-83e3-d099ee9f2e19 |
| Texture a 3D draft | bccd92cf-fc52-4460-a127-3532f3319a63 | b1a2e623-a430-4797-ad68-fbd26824daea | 19c7daca-cd88-4844-9179-d3b3649883b2 |
| Rig a humanoid character | bda54937-fb96-469d-a93d-7b29818977d8 | e69bf825-bcdc-4815-8f38-8a3ace59a1b6 | 47976283-f033-46ae-af31-4e190c4c0955 |
| Animate a rigged character | 9412139d-5492-4e3c-ac12-17559705dbe1 | c8b85d11-beae-4fc6-8007-21318d9a41fd | c35c0835-f4ee-428c-acf1-da57fecaf76b |
| Run native Comfy workflows | fd2fb9d2-a5be-4ace-b5be-4857ddd90f73 | 7e63b53b-fcd2-4237-a141-501c80c8709f | wf-423690b3b4b06d39f52b331f7a8c3b0e1101e245 |

## Established product baseline

The [Higgsfield homepage](https://higgsfield.ai/) and [official tools guide](https://higgsfield.ai/enterprise-help-center/platform/tools-creative-workflow) were rechecked on November 3. They describe image/video/audio tools, cinema and marketing workflows, performance recasting, comics, playables, production automation, and shared projects. These are existing product categories, not claimed inventions of Open Take Studio.

The [Canvas introduction](https://higgsfield.ai/canvas-intro) and [Canvas help](https://higgsfield.ai/creator-hub/help-center/tools/how-do-i-use-canvas) establish node-based chaining, reference inputs, parallel comparison, reusable templates and collaboration as a baseline. This application currently has narrower scene dependency plans, recipes, shot batches and branching films. A general freeform node canvas and hosted collaborative editing remain explicit gaps. Prompt camera suggestions are not model-enforced camera controls; reference conditioning is not proven identity consistency.

## Billing evidence and execution attribution

The catalog's `billing.charges_on_policy_rejection` field is a refusal-policy fact, not a price quote. The [Router billing contract](https://docs.comfy.org/development/comfy-router/billing) says `X-Comfy-Credits-Used` is available only on some successful responses. Absent means unknown, never zero or free. Replayed headers refer to the original charge. Provider response fields such as Meshy consumed credits, BFL cost or VEED credits charged are **not** the Comfy charge. Actual available SDK credits metadata is preserved per job.

The [committed-spend headers](https://docs.comfy.org/development/comfy-router/headers) describe outstanding in-flight commitments, not an account balance or cumulative budget. No documented Router balance endpoint or complete numeric price response was found in the inspected catalog/schema/SDK contract. Reconcile usage in the [Comfy workspace](https://platform.comfy.org/) rather than inventing a cost. No account top-up, paid upgrade or external hosting activation was performed by catalog discovery.

Router adapters execute only through lowercase `comfy.models`. The later inspection brief additionally authorizes native Comfy Cloud workflow execution through a separate, explicitly labelled client/port. Native graphs are never submitted to Router. Real Z-Image Turbo generation, local-node image finishing, checkpoint-based H3 I2V and the MiniMax H3 regeneration partner node have separate graph/version/request evidence. Temporary asset uploads remain a storage transport. Public family weights and their licenses do not attest exact hosted bytes or every auxiliary stage; the [model audit](../shared/model-audit.ts) never awards an unenforceable all-open-weights badge.

## Validation and production receipts

[Catalogue tests](../tests/catalogue.test.ts) cover all twelve families, truthful unadapted-model inspection, mode-specific proof, imported/archived exclusions, Meshy dependency ownership/stage/expiry, accurate mode snapshots, native failure handling, GLB outputs, LTX exact envelopes, outpainting margins and cleanup responses. [Model tests](../tests/model-registry.test.ts) validate adapter defaults against fetched Router schemas, including required-only union branches.

Authorized production uses [produce-catalogue.ts](../scripts/produce-catalogue.ts) through the local application API only. Exact request bodies and stable client identities are stored before admission in `artifacts/next-build/catalogue-production/submissions.json`. A single Meshy preview is validated before broadening to the other original subjects; later stages use actual eligible native predecessor IDs. Status reads report real request IDs, saved output asset IDs and reported credits or unknown. No new submission identity is generated to retry an insufficient-credit failure.

The inspection expansion uses [inspection-production.ts](../scripts/inspection-production.ts). Its exact pre-admission bodies and stable identities are in `artifacts/inspection-build/production/requests.json`; [summary](../artifacts/inspection-build/production/summary.json) counts actual stored outputs without posters. The still contact sheets and curated selects support visual review. Native executions have separate receipts in `artifacts/native-workflows/`. Failed Seed requests, incompatible owl/robot rigs, Router regeneration and Kling extension remain failed history, without blind resubmission.
