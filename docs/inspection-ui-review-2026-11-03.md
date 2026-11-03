# Inspection build — UI implementation and evidence

Date: 2026-11-03. This record separates source implementation, browser observation, and unverified acceptance.

## Reference application

The inspection brief was read in full, including the inventory and acceptance appendix. The following official reference material informed original implementations; it is not evidence that the reference products were interactively tested in this pass.

- [Higgsfield 3D Jutsu](https://higgsfield.ai/blog/higgsfield-3d-jutsu): editable objects, lights, cameras and animation informed a clear distinction between a real geometric stage and a model's later interpretation. Open Take retains its own Spatial Stage and introduces an independently exportable Object Room. No claim of equivalent identity preservation is made.
- [FLORA 3D nodes](https://florafauna.io/updates/3d-nodes-land-on-the-canvas-2026-08-28): visible, inspectable 3D media informed typed GLB presentation, actual saved-asset posters, and first-class room/scene navigation. A family illustration is not substituted for a completed model result.
- [Krea workflow agent](https://www.krea.ai/blog/ai-workflow-agent): explicit inputs and downstream relationships informed the existing shared-scene impact plan and the new named reference-role controls. Role names remain organizational metadata; only supported model inputs are sent.
- [model-viewer staging and cameras](https://modelviewer.dev/examples/stagingandcameras/): documented object framing and camera controls inform the GLB inspector's bounding-box framing, orbit/zoom/reset, animation selection and user-selected poster capture.

The visual treatment uses original SVG family illustrations, compact media cards, iris accents and warm neutral typography. Illustration labels explicitly distinguish concepts and undemonstrated processes from actual generation evidence. No screenshots from reference products are presented as Open Take outputs.

## Implemented source behavior

- Catalogue uses canonical media modalities and explicit demonstration records. Each tool and model entry has either its exact associated saved media or a clearly labelled original family/process/concept illustration. Model mode evidence is filtered by the exact model ID.
- Result inspection supports actual image reveals, synchronized video comparison, original audio waveform audition, real GLB orbit and saved animation playback, and readable text documents. Interaction comparisons use their two source assets; a screen capture is not treated as a generated second take.
- Project covers use a typed server presentation route. Selecting a take no longer changes the cover. Generated native Comfy assets, Router assets, imported Cloud examples and local edits retain separate labels.
- Reference roles can be chosen from visual sources or filled by dropping a take/asset. Locks protect the associated input selector. The saved role record names the actual supported model input, or explicitly says it is direction-only and not sent as conditioning.
- Camera intention presets have original visual diagrams and explicit prompt-guided labels. They append editable direction and do not trigger generation.
- Video comparison preserves the common playhead across version changes and reload, clamps playback to the shorter clip, and gives sound to A only when explicitly enabled. Image reveal position is also saved. Choosing a preferred take or saving a recipe preserves source relationships.
- Native workflow stage exposes editable version selection, named controls, graph node/dependency inspection, actual dependency validation, explicit execution, collected output review, and editor/API/bundle downloads. Exact recorded Cloud editor URLs are used when supplied; otherwise the Cloud root is opened.
- Local sound mixer supports saved audio sources, track start/offset/duration/gain/fades/mute, waveform timelines, explicit Web Audio audition, saved editable arrangements and actual server-rendered WAV. Reopened imported projects prefer remapped metadata rather than historical IDs in raw JSON.
- Object Room is reachable through instruments, a selected 3D asset and saved room documents. Text/transcription routes have a document model selector, full readable transcript and original download.
- Non-image gallery items use managed posters. General showcase grids do not instantiate a WebGL renderer for every GLB. Audio never autoplays; previews pause offscreen or when the document is hidden.

## Verified in this pass

- Full TypeScript check and production build passed after the main integration. ObjectRoom, WorkflowStudio and AudioMixStudio are separate output chunks. Subsequent small evidence/lock fixes passed TypeScript; the root run performs the final build and broader tests.
- Dedicated browser tab 500704729 loaded the real app at `http://127.0.0.1:4310/` and displayed the visual catalogue, 18-project library and a persisted Prismatic project. Actual model media loaded in cards.
- A subject reference was selected through the visual picker, locked, and the locked state remained after reload. No AI generation was submitted during this verification.
- Evidence: `artifacts/inspection-build/ui-evidence/01-saved-workspace.png`, `02-reference-role-locked.png`, and `manifest.json` with timestamps and page URLs.
- Final UI integration build passed: TypeScript plus Vite production build, including separate ObjectRoom, WorkflowStudio, AudioMixStudio, SpatialStage and MotionComposer chunks. The Three.js chunk retains a size advisory; this is not a build failure.

## Six saved motion films

Each named composition was opened from Saved versions and rendered with the actual MotionComposer **Render film** control in the dedicated browser tab 500704752. All six returned a finished MP4 download, and all six were downloaded from the local application and independently inspected with FFprobe: H.264, 960 × 540, 12 frames per second, AAC audio, exactly 6.000 seconds. Frames extracted from each downloaded MP4 at 2 seconds were visually inspected; typography and real rendered geometry are present in every output. These are local motion renders using saved soundtracks, not additional model generations.

| Editable composition | Saved MP4 asset |
| --- | --- |
| Paper / the courage to leave | `dcaac99a-6acc-4261-81ad-8fb4858ad789` |
| Botanical / machines that grow | `4fa2fbe9-1b64-442b-8e14-cf7b58481d30` |
| Tidal / a door that listens | `7fa4127e-c88a-42f6-b84b-54a090d7144d` |
| Copper / small extraordinary futures | `34be7c91-3e53-4e20-8e6c-fc974c6b2cc1` |
| Glass / make room for wonder | `1b9ab2a7-0079-4352-9c36-6c8ed95cc24d` |
| Elsewhere / another door | `7821bd26-cd59-48bb-be22-50cd47c7afef` |

All are in Voices of Elsewhere (`1659408b-f807-418b-8a67-3c2404e0d12e`). The evidence folder `artifacts/inspection-build/motion-render-evidence/` contains timestamped browser screenshots, `manifest.json` with exact editable composition parents, six downloaded films, `download-and-probe.json` with byte sizes and SHA-256 hashes, and extracted review frames. This verifies actual local rendering and media download. Audio stream presence was probed; this pass does not claim a separate human listening review of all six mixes.

## Mobile verification boundary

The first viewport wrapper attempt returned a scaled desktop capture, which was not accepted as rendered phone proof. Native CUA subsequently enabled the real device toolbar at 390 × 844. Its Capture screenshot action stalled for approximately 2380 seconds and was user-aborted. The resulting download was later recovered and inspected: `artifacts/inspection-build/ui-evidence/03-phone-creation-390x844.png` is the actual 780 × 1688 device-pixel creation/reference-role screenshot. No browser security setting was changed.

A later direct browser viewport capability call succeeded without native DevTools: actual DOM `innerWidth=390`, `innerHeight=844`, document scroll width 375, device pixel ratio approximately 1. The normal screenshot API captures the actual phone interface. Fresh evidence is stored under `artifacts/inspection-build/phone-evidence/`, with timestamped screenshots and measured DOM dimensions. The motion stage places Save and Render above its preview. Enabling Reduce motion sets the rendered root preference to true; inspection found zero elements with nonzero CSS animation or transition duration. The operating-system preference remained false, so this validates the explicit application override.

The same actual phone viewport subsequently verified Explore with its real saved images and muted, paused video; the 3D catalogue family; a loaded textured GLB with a visibly working orbit control; and **Inspect saved production** opening the exact model asset in its project. Spatial stage, Object Room, Sound & timing and Export remained visible below the selected-media stage. Screenshots `03-explore-reduced-motion.png` through `06-selected-model-controls.png` record these states. Settings was also updated to dismiss with Escape and return focus to its opener; this final keyboard change passed TypeScript but its browser recheck was interrupted.

The final opening-prompt draft-start attempt was interrupted by browser debugger detachment during a concurrent large export audit. It was not repeated, and no successful new-draft submission is claimed. The temporary viewport override was cleared with the supported reset capability. The temporary reduced-motion setting remained enabled at handoff because the detached page could no longer be operated; the root agent was explicitly asked to restore the original false setting through Settings after reconnecting. The fresh recovery tab was closed without touching user tabs.

Source paths: `client/MediaPresentation.tsx`, `Comparison.tsx`, `Catalogue.tsx`, `ReferenceRoleDock.tsx`, `DirectionPresets.tsx`, `WorkflowStudio.tsx`, `AudioMixStudio.tsx`, `DocumentPreview.tsx`, `ModelPreview.tsx`, `App.tsx`, `Explore.tsx`, `inspection.css`. Existing editing, scene, film, playable, spatial, motion, history, jobs and export modules remain reachable.
