# Image-to-3D and Kling extension contracts

Checked on **2026-11-04**. This engineering pass made read-only schema requests and ran local tests. It did not upload media or start paid generation.

## Image-to-3D: native Comfy workflow

`server/spatial-generation-adapters.ts` exports:

- `buildImageTo3dWorkflow(options?)`: a body accepted by `workflowCreateSchema`.
- `IMAGE_TO_3D_PRESET_INFO`: the `mesh-image` preset's title, source and verification state.
- `imageTo3dOptionsSchema`: strict bounds and supported settings for the preset.

The workflow is **LoadImage → MeshyImageToModelNode → SaveGLB**. The input image is linked to Meshy's geometry input. The GLB socket (index 2) feeds SaveGLB, and output node `3` is collected. It does not call the Router text-to-3D route and does not relabel texture guidance as image reconstruction.

Both editor JSON and API JSON are retained. The editor graph uses the current dynamic-combo widget order from Comfy's official Meshy 7.1 template. The studio bindings select a saved image in the current private project and expose seed, symmetry, pose, topology, polygon count, texture direction and PBR maps as applicable. The existing native workflow worker supplies credentials, validates the graph, uploads the chosen source, keeps the original image, saves execution provenance and downloads the GLB. No API key is embedded in a workflow or export.

Defaults are Meshy 7.1, remeshed triangle geometry targeting 30,000 polygons, automatic symmetry, 2K textures and no extra ultra pass. Geometry-only, alternate topology, higher texture resolution and ultra geometry are separate explicit options when creating a version. Meshy states that the seed controls re-execution and does **not** make results deterministic.

### What was checked

Read-only `GET https://cloud.comfy.org/api/object_info` returned HTTP 200 and included:

| Node | Current contract |
|---|---|
| LoadImage | Saved image loader; IMAGE output index 0 |
| MeshyImageToModelNode | Partner API node; models include meshy-7.1; dynamic remesh/texture controls; GLB output index 2 |
| SaveGLB | Output node accepting FILE_3D_GLB and saving the model |

The compact snapshot is [native-meshy-nodes.json](schemas/native-meshy-nodes.json). The loader's account-specific filename choices were replaced with a harmless `source-image.png` placeholder. No credentials or private filenames are included.

Seven targeted tests passed. They check native geometry wiring against the recorded Cloud node contract, version/export round trips, geometry-only settings, provider bounds, independent drafts and Kling result handling.

**Funded image-to-3D execution remains unverified.** Schema availability is not evidence that a paid provider call completed. A successful test must save the returned GLB, reopen it in the studio's 3D viewer, retain its source image and execution record, and export/reopen the project.

### Observed node price, not a fixed quote

The current Cloud node's own price badge reports these native Meshy charges:

| Configuration | Badge USD | Approximate Comfy credits at 211/$1 |
|---|---:|---:|
| Geometry only, no ultra pass | $1.144 | 241.38 |
| Textured 2K or 4K, no ultra pass | $1.716 | 362.08 |
| Textured 8K, no ultra pass | $2.002 | 422.42 |
| Textured 2K/4K plus ultra pass | $2.002 | 422.42 |

These are the node badge's observed estimates on the date above. Native Cloud compute, other nodes and any applicable taxes are separate. Actual usage must be read from the completed run. This is not a Router rate.

## Kling extension: still blocked

Read-only `GET https://api.comfy.org/v2/models/kling/videos-video-extend/openapi.json` returned HTTP 200, schema version `3f28bd18909a`. It still requires `video_id`, supports predecessors described as text-to-video, image-to-video or prior extension, and limits the final video to three minutes. It does not establish which predecessor model/version and shared-provider dispatch combination will resolve the earlier real Kling 2.6 rejection.

The earlier same-project request `becd74ed-a6a6-4d2b-bb8d-0d70f6259b4a` returned `invalid_input`. The route therefore remains **unavailable**. Credits alone do not resolve that failure. Native Cloud's current node inventory contains no Kling video-extension node, so there is no verified native fallback in this pass. A guessed task ID, Router request ID or uploaded video URL must not replace the provider's native video ID.

### Completed-output parser correction

The official Kling result schema allows either `data.task_result.videos[].url` or `watermark_url`. The app previously rejected successful responses that supplied only the hotlink-protected watermark URL.

`extractKlingMedia` now prefers a valid HTTPS `url`, then accepts a valid HTTPS `watermark_url`. It still requires the native terminal status `succeed`, a nonempty media result and no provider error. Invalid URLs, URL credentials, unfinished tasks and missing output remain rejected. This fixes collection of documented completed outputs; it does **not** enable the blocked extension route.

## Primary references

- [Official Meshy node implementation](https://github.com/Comfy-Org/ComfyUI/blob/master/comfy_api_nodes/nodes_meshy.py)
- [Official Meshy 7.1 image-to-model editor template](https://github.com/Comfy-Org/workflow_templates/blob/main/templates/api_meshy7_image_to_model.json)
- [Comfy Meshy 7.1 image-to-3D workflow](https://comfy.org/hub/workflows/meshy-7-1-image-to-3d-da6947213b75/)
- [Meshy 7.1 Router documentation: text input](https://docs.comfy.org/development/comfy-router/models/meshy/meshy-7-1/code)
- [Kling Router extension contract](https://docs.comfy.org/development/comfy-router/models/kling/videos-video-extend/code)
- [Comfy credit conversion](https://support.comfy.org/articles/5846341390-how-credits-work-in-comfy)
