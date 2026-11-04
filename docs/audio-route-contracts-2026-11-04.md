# Audio upgrade contracts and verification

Checked on 2026-11-04. This record distinguishes implemented request handling from a successful paid provider execution.

## Current state

| Upgrade | Implemented path | Verification | Remaining gate |
| --- | --- | --- | --- |
| Original music | Comfy Router `pika/pika-music` | Current official input/output schema, request validation and result fixtures | A funded short generation, saved audio and actual charge receipt |
| Translation and dubbing | Native Comfy Cloud `LoadVideo → VeedDubbingNode → SaveVideo` | Current Cloud node availability and parameters, editable graph, typed bindings and schema fixtures | A funded source-video execution with speech and a visible speaker |
| Speech cleanup | Native Comfy Cloud `LoadAudio → VeedCleanAudioNode → SaveAudioAdvanced` | Current Cloud node availability and parameters, editable graph, typed bindings and schema fixtures | A funded speech recording execution and audible comparison |
| Older cleanup adapter | Router `veed/clean-audio` | The schema is still published; the previous actual request returned `403 not_enabled` | Provider access must be established before re-enabling it |

All three new paths remain experimental until their actual paid executions are verified. The existence of a schema or Cloud node is not proof that its provider will serve a request for every workspace. The native cleanup graph does not automatically retry the older disabled Router route.

No generation is started by importing a preset, opening the studio or connecting an API key. Native runs use the existing scoped Comfy workflow execution service, managed uploads, persistent job identities and output collection. Music uses the existing scoped Router generation worker. Original media remains unchanged.

## Original music

The exact authenticated schema retrieved from Comfy is saved in [pika--pika-music.json](schemas/pika--pika-music.json), version `e9a5317c2f66`.

The studio exposes text-to-music with optional lyrics. It sends:

- `mode: "text_to_music"`.
- A written music direction and, if provided, lyrics.
- Duration from 10 to 360 seconds, with a short 10-second default.
- A seed from -1 to 2147483647, with -1 selecting a new seed.
- `rewrite_prompt: false`.

The studio limits direction to 4,000 characters and lyrics to 2,000 characters. These are application bounds. Reference voices, music covers and hidden prompt rewriting are not enabled by this adapter. The existing sound-effect model is not relabeled as standalone music.

Only a terminal `status: "completed"` response with an audio result at `output.audio.url` is collected. Failed, queued, incomplete, non-audio, insecure-URL and credential-bearing URL results are rejected. Missing MIME information is left for media inspection rather than assuming a file format.

Comfy Router's exact Pika Music charge has not yet been measured. A rate offered by Pika's separate direct API is not a quote for Comfy Router. Preserve the eventual Router credit receipt alongside the saved generation.

## Translation and dubbing

The native `VeedDubbingNode` performs translation, voice preservation/cloning and lip synchronization. This is a full translation route, rather than requiring the user to supply already-translated speech to a lip-sync-only model.

The first preset uses **Standard** mode. Its target-language options are copied from the current Cloud node schema, including Urdu. Source language can be detected automatically or selected explicitly. Pro-only regional accents are not sent to Standard mode.

Inputs and outputs:

- Select a project-owned video with speech and a visible speaker.
- The provider's documented maximum duration is 599 seconds.
- The video is bound through the `LoadVideo.file` widget, then the `model.video` media socket.
- The native node receives `model.target_language`, `model.source_language` and `model.seed`.
- `SaveVideo` writes a new MP4/H.264 output.
- The source stays available as its original take.

The seed is an execution/cache control; the provider documents that it does not guarantee deterministic output. Translations and lip synchronization still require human quality review after generation.

The official node price badge at this check is **$0.1573 per second for Standard**. Ten seconds gives a partner-node estimate of **$1.573**, before any additional Cloud execution charge and subject to actual billing. Pro is separately priced at $0.2574 per second and is not enabled in this initial preset.

## Speech cleanup

The native preset accepts speech audio up to 1799 seconds. It exposes noise-removal strength and, when normalization is enabled, target loudness. The graph saves the cleaned result as FLAC.

The provider describes a 48 kHz mono speech output. Music and sound effects are removed along with background noise. This is speech cleanup, not music mastering or source-separated stem preservation.

The preset can also be constructed with `normalizeLoudness: false`; in that case, inactive LUFS fields and bindings are omitted. The standard studio preset normalizes to -19 LUFS and uses strength 0.874.

The official node price badge at this check is **$0.017875 per minute**, before additional Cloud execution costs and subject to actual billing.

## Verification performed

`tests/audio-generation-adapters.test.ts` contains 12 passing targeted checks covering:

- Music duration, seed, prompt and lyric bounds.
- Refusal of unsupported cover/reference/rewrite operations.
- The exact current music request schema and terminal result envelope.
- Failure states, incomplete outputs, URL and MIME validation.
- Editable native graph round-trips, typed media edges and bound project inputs.
- Standard language options against the official Cloud schema.
- Cleanup normalization settings and range validation.
- Removal of workspace-specific loader filenames from the committed fixture.

The sanitized Cloud schema snapshot is [native-audio-nodes.json](schemas/native-audio-nodes.json). It includes only the six required node types; upload-picker filename lists are empty. No API credentials or account data is included.

These are local contract and integration checks. They do not establish successful provider execution, generated-media quality, actual cost, or provider availability.

## Sources

- [Comfy Router music contract](https://api.comfy.org/v2/models/pika/pika-music/openapi.json) — authenticated, read-only schema lookup.
- [Comfy Router cleanup contract](https://api.comfy.org/v2/models/veed/clean-audio/openapi.json) — authenticated, read-only schema lookup.
- [Comfy Cloud node definitions](https://cloud.comfy.org/api/object_info) — authenticated, read-only lookup; no workflow was submitted.
- [Official VEED partner-node implementation](https://github.com/Comfy-Org/ComfyUI/blob/master/comfy_api_nodes/nodes_veed.py) — native operation, language, duration, output and price contracts.
