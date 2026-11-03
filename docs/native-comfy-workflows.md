# Native Comfy workflows

Open Take Studio now has two explicit Comfy execution routes. Model tools continue to use lowercase `comfy.models` through Router. The native workflow workspace uses the official uppercase `Comfy` client from the same locked `@comfyorg/sdk` 0.5.0 release. It runs real ComfyUI graphs in Comfy Cloud; it does not translate a graph into a Router model request or install local model weights.

The project `.env` is loaded on the server with `override: true` before either SDK route initializes. Browser code, workflow files, exports, and execution receipts contain no API key. Partner nodes receive their required authentication only at SDK submission. Existing team deployments are not modified. The verified standard Cloud environment is sufficient for the included image, finishing, and H3 workflows.

## Saved definitions and execution

A workflow version is a managed JSON asset with `metadata.operation = comfy-workflow-version`. Its `workflowVersion` metadata includes separate editable ComfyUI canvas JSON and executable API JSON, SHA-256 of the API graph, typed exposed inputs, selected output nodes, dependency identifiers, target, and optional parent version. The editable canvases contain named nodes and groups. New saved versions preserve previous artifacts. Actual runs create ordinary project takes and jobs with `executionRoute = comfy-workflow` and `workflowVersionAssetId`; input media and parent takes use the same production relationships as Router takes.

Uploads use `Comfy.assets.fromFile(...).commit()`. The submitted graph uses documented `core/ASSET` references at loader file widgets. Managed source SHA-256, uploaded Cloud asset IDs, the submitted graph, Cloud request ID, real progress, and executed graph artifacts are retained. Input media is never sent as a localhost URL. Downloaded outputs become application-owned files with hashes, original output names, remote output IDs, and node IDs.

The worker restores known execution IDs after restart and polls them without resubmission. Queue position and node progress come from Cloud. A completed job is not relabeled 100% merely because the last progress event was lower. Downloads retry collection of the same completed execution. Imported Cloud editor history is explicitly `origin = cloud-editor`, with imported output provenance, zero application submission attempts, and archival after collection.

Cloud's SDK idempotency contract is different from Router replay: a repeated accepted identity can return `idempotency_key_reuse`. If a submission reply is lost before its Cloud ID is durable, the job becomes blocked with an unknown outcome. It does not silently create another paid generation. Attaching a known execution requires a matching graph; otherwise locate the exact executed graph and import that execution as history. Explicitly branching a finished take creates a new intended execution.

Runnable job queries use a SQLite expression index and filter state, route, due time, archived IDs, and active worker IDs before parsing JSON. Historical inline media is not read by the recurring worker timers.

## Endpoints

All paths below are under `/api`.

| Endpoint | Behavior |
| --- | --- |
| `GET/POST /projects/:id/workflows` | List or save immutable workflow versions. |
| `GET /assets/:id/workflow` | Read a saved definition and optional exact Cloud editor reference. |
| `GET /assets/:id/workflow/export?format=editor\|api\|bundle` | Download editable JSON, API JSON, or a ZIP with both and dependencies. |
| `POST /workflows/:id/validate` | Check nodes, dependency filenames, and supported input constraints against current Cloud node information. Does not execute. |
| `POST /workflows/:id/run` | Submit exposed scalar values and managed media references with a durable client request identity. |
| `GET /workflow-jobs/:id` | Read public, redacted execution status and real progress. |
| `POST /workflow-jobs/:id/retry` | Resume eligible collection/polling or a definitively rejected admission using the same identity. |
| `POST /workflow-jobs/:id/attach` | Resolve an ambiguous submission using its verified existing Cloud execution ID. |
| `POST /workflow-jobs/:id/cancel` | Cancel before admission, or request cancellation of the known Cloud execution. |
| `POST /workflows/:id/import-execution` | Collect an already successful external Cloud execution after matching its exact API graph. Never submits a workflow. |
| `PATCH /workflows/:id/cloud-reference` | Record an explicit saved editor URL and workspace association without changing graph bytes. Only `https://cloud.comfy.org/#UUID` URLs are accepted. |

For an imported editor run, source lineage can be supplied only when the saved source bytes match the Cloud content-addressed loader filename using the SDK's local hash operation. A saved Cloud editor link is shown only for the corresponding recorded editor variant. Other definitions offer the editable download and Cloud root; they do not claim an exact saved-editor association.

## Included workflows and evidence

`workflows/native/` contains editable, API, studio-binding, and dependency JSON for every included definition.

| Definition | Meaning | Execution evidence |
| --- | --- | --- |
| `01-prism-atelier` | Native Z-Image Turbo still, explicit loaders/conditioning/sampling/decode/save. | `artifacts/native-workflows/app-execution-receipt.json` |
| `02-image-finish` | Real Lanczos resize/crop and restrained sharpen of the uploaded still. Deterministic image processing, not generative detail reconstruction. | Same receipt, with SDK upload and source lineage. |
| `03-prism-in-motion` | Native H3 image-to-video, including model, text encoder, video/audio VAEs, sampling, and decoded audio. | `artifacts/native-workflows/h3-execution-receipt.json` |
| `04-sea-gate-2k` | Native H3 partner-node regeneration of an original 768P text-to-video result to 2K, using its unchanged prompt. | `artifacts/native-workflows/regenerate-execution-receipt.json`: completed, actual 2560×1440, 124 frames at 24 fps, 5.167 seconds, stereo AAC. |

The new H3 native graph uses the currently available `minimax_h3_video_vae_fp16.safetensors`. The earlier reference graph containing an older int8 VAE remains unchanged under `imports/comfy-cloud/`.

Actual Cloud editor runs are separately recovered under `artifacts/native-workflows/cloud-editor/`, `cloud-editor-finish/`, `cloud-editor-finish-reopen/`, `cloud-editor-motion/`, and `cloud-editor-regenerate/`. Each recovery receipt identifies the job, workspace, original filename, SHA-256, and actual editor/API graphs embedded in the returned PNG or MP4. The separately reopened image-finishing execution, the 800×800 H3 clip, and the 2560×1440 regeneration preserve their own execution references and media. Both editor video outputs contain 124 frames at 24 fps, a 5.167-second container duration, and stereo AAC audio. Their application import receipts distinguish external editor execution from application admission. Browser evidence records load/edit/run/save/reopen; API execution alone is not described as visual-editor proof.

The H3 editor inherited an upstream template note naming a gaming-mouse example, although its actual uploaded input and executed graph use the generated violet-glass bottle. Current source fixtures correct that note. Archived executed graphs and embedded media metadata remain byte-for-byte historical evidence; they are not silently rewritten to match a later description.

One external Cloud editor preview defect remains in the Sea Gate regeneration demonstration: the saved graph and edited output prefix reopen correctly, and the recorded execution successfully produced its 2K video, but the `LoadVideo` source preview displays **Invalid URL** after reload. Reselecting the uploaded source and uploading the same hash-verified bytes through Cloud's UI did not repair that preview. Those diagnostic actions did not submit another run or overwrite the archived executed graphs. The studio's managed source/result media and execution recovery remain available; this is not reported as a fully successful Cloud source-preview reopen.

Project production packages retain native workflow definitions, graph artifacts, actual media, references, and job history. Import assigns new local IDs and remaps relationships while preserving remote execution IDs and graph node IDs. Every restored job is archived and cannot resume or retry. Editable metadata is authoritative for local relationships after import; unchanged original document bytes remain available as source artifacts.

## Validation and service boundaries

Focused tests cover upload binding, idempotent application admission, Router/native separation, restart recovery, failed download recovery, unknown admission, insufficient credit blocking, exact external graph import, source-byte verification, URL restrictions, package remapping, archival, and indexed scheduling. Live receipts are separate from these isolated fixtures.

Application code is MIT. Comfy Cloud, partner models, hosted model usage, and optional custom nodes remain subject to their own service terms and model licenses. A saved seed/settings snapshot supports repeating a request; it does not guarantee identical pixels or permanent identity consistency. No paid plan upgrade or custom deployment is required or silently performed by this module.

Official references: [SDK documentation](https://docs.comfy.org/development/api-development/sdks), [H3 native partner workflows](https://docs.comfy.org/tutorials/partner-nodes/minimax/minimax-h3), and [official H3 node implementation](https://github.com/Comfy-Org/ComfyUI/blob/master/comfy_api_nodes/nodes_minimax.py). Node availability is checked against the authenticated current Cloud environment, not inferred from a checkpoint filename.
