# Object Room

Object Room is a local, authored 3D tour alongside the branching film and Signal Run game. It presents real saved geometry through at least three named camera views. A viewer chooses a view or world-space hotspot, orbits and zooms the object, reads an annotation, and optionally opens an image or audio cue. These interactions do not generate media.

The editor uses the existing `SpatialEngine` (Three.js), `SpatialSceneDocument`, project assets and takes. Each room points at a saved spatial scene and its camera-view IDs. A camera adjustment saves a new spatial version; a room save creates a new `local/object-room` take and managed JSON document. Source models, cue files and parent versions remain connected through `inputAssetIds`, `sourceAssetId`, and `parentTakeId`. The authoritative editable document is `asset.metadata.objectRoom`; project import remaps those local asset references while preserving original document bytes as an artifact.

The interface supports existing scene/GLB selection, exact orbit/zoom camera capture, named views, annotations, editable hotspot coordinates, saved image/audio cues, opening-view selection, saved version reopening, standalone export, and full production export. Camera transitions respect reduced-motion preferences. The real renderer pauses when hidden or offscreen and disposes WebGL resources when closed. Audio begins only through an explicit Listen action and stops when the viewpoint changes. Keyboard controls are 1–9 for views, Page Up/Down for adjacent stops, Home for the opening, and the renderer's arrow/+/- controls for orbit and zoom. Touch uses the renderer's drag/pinch controls and visible viewpoint buttons.

## Routes and storage

- `POST /api/projects/:id/object-rooms` accepts `{document,parentTakeId?}` and saves a new version.
- `GET /api/assets/:id/object-room` resolves the saved document and its actual scene.
- `GET /api/assets/:id/object-room/export` downloads a standalone ZIP.

Room JSON uses `version:1`, `name`, `description`, `sceneAssetId`, `startViewId`, `accent`, and 3–12 `views`. Each view has an ID, name, annotation and `cameraViewId`, plus optional `hotspot:[x,y,z]`, `imageAssetId`, and `audioAssetId`. The server rejects missing or foreign scene/media references, incorrect cue media types, missing cameras, duplicate views and fewer than three perspectives. Every model is validated as a self-contained GLB through the existing scene resolver.

## Independent player

The ZIP contains actual GLB/image/audio bytes, their hashes and source credits, an editable spatial-scene package, the room/scene manifest, bundled Three.js code, local Draco/WASM resources, CSS, license texts, and a small Node static server. There is no CDN or original application dependency. Extract it and run `node serve.mjs`, then open `http://127.0.0.1:4320`; `PORT` can select another port. Ordinary static HTTPS hosting is also suitable. Direct `file://` opening is not supported because browser ES modules and local media fetches require an origin. No hosted URL is claimed.

The player checks model hashes before loading. Its content security policy permits only its own origin and local blob/data resources. Annotation text is inserted as text, not HTML. A model cannot fetch external textures or buffers. Optional image cue posters are explicitly described as references; they are not presented as captured interactive tour output.

The curated **Afterlight · Object Room** in Liquid daylight uses the actual completed amber-lacquer Meshy refinement, a saved rendered model portrait, and four seconds extracted from a completed native H3 soundtrack. It preserves the prior spatial scenes and adds no inference jobs. Production identifiers, media hashes, 17 exported files and independent HTTP checks are recorded under `artifacts/inspection-build/object-room/`. Its `browser-receipt.json` and five actual screenshots record all three named views, keyboard selection, drag orbit, and a fresh model reload on port 4322 while the original studio server was stopped. An explicit Listen action played the saved four-second cue in that independent state; browser media readiness, playback and time were observed. Physical speaker sound quality and physical-phone interaction remain unverified.

`tests/object-room.test.ts` exercises real GLB persistence, camera/cue validation, annotation version branching, immutable earlier versions, standalone runtime/media packaging, separate HTTP serving, editable project remapping, database reopen and zero generation jobs. The original code is MIT; bundled Three.js, Draco and Meshoptimizer retain their included licenses. Model and media service obligations remain separate.
