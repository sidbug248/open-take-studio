# Connected creative journeys · November 3, 2026

This note covers the first-impression pass's spatial, sound/motion and catalogue changes. Current browser evidence is recorded separately from source tests and historical examples.

## Implemented source behavior

- **Direct the object:** camera and lighting presets modify the real scene while retaining original model IDs and hashes. Undo, return to the opening setup, immutable scene saves, and existing package/GLB exports remain available. The new cinematic action saves the scene and captures a real PNG, then hands its original asset/take to the H3 composer. It validates the frame's scene reference, parent take, dimensions and project. The original FLUX camera-guide action remains separate.
- **Object Room:** a handed scene takes precedence over an older room. A newly created room begins with the directed camera; previously saved rooms are unchanged. Room edits support undo. Explicit view/audio playback yields to other creative tools, and cue position is retained when paused or interrupted.
- **Move the sound:** pointer dragging and keyboard edits work on manual beat markers and text cues. A drag contributes one undo entry; cancellation restores the prior composition. Timing changes affect the same renderer used for export. The selected version, draft, playhead, cue selection and matching last export are retained across re-entry. Three visual treatments preserve source audio and artwork.
- A rendered audio mix is an explicit soundtrack selection. A separate action can fit the composition to the whole mix when its duration is within the renderer's limits. Saving records the mix asset/hash, and rendering uses that exact original audio. Rendering waits for the source waveform and artwork to load.
- **Catalogue:** transformations pair only recorded inputs and actual outputs. Image edits, still-to-motion, video changes, mesh refinement and audio-to-motion have appropriate paired presentations. Expanded video comparisons use synchronized playback. A saved prompt can be inspected without loading historical job input/result bodies. Concept and interaction recordings do not masquerade as generated transformations.

## Verified in this pass

`npx tsc --noEmit` passed. All four tests in `tests/creative-journeys.test.ts` passed:

1. Presets preserve original mesh identity; handoff rejects a poster or unrelated scene. A new room retains the directed opening camera.
2. Cue/beat changes affect cue selection and beat pulse while retaining original audio/artwork and the undo snapshot.
3. Catalogue pairing uses declared inputs/outputs, excluding concept/interaction captures and poster derivatives.
4. A temporary-store HTTP test creates a real sound arrangement, renders its WAV master, connects it to an edited motion composition, renders an MP4, and decodes its audio. The MP4 contains the mix's deliberate silent gap, proving that the continuous original tone was not substituted. Project export/import restores the remapped mix reference, edited cue and beat timings.

The fourth test uses authored PNG fixtures to verify media muxing and persistence. It is not a browser WebGL frame-capture test.

After the final bootstrap freshness cache and Brotli quality changes, the complete host suite passed **154/154 tests**, with zero failures, skipped tests or cancellations, in 39.27 seconds. Log: `artifacts/first-impression/resumed/final-tests-after-cache.log`. The suite was not repeated after that pass.

## Live source inspection and resumed browser proof

`artifacts/first-impression/connected-journeys/source-inspection.json` records the exact existing sources. Liquid daylight's source scene is `568ca4b5-5328-456a-8120-cb0325efb4bf`, retaining textured GLB `1519ad03-9178-4983-90fc-ddee63d8d355`. Voices of Elsewhere's curated composition is `683ffb05-6cb9-44e3-877f-6f3af580516f`; its separate rendered 11-second mix is `8a138b4c-b4a4-406f-bad8-97dd3fd59337`.

At the initial inspection, that mix had **zero connected live motion versions or exports**. That baseline remains in `source-inspection.json`; `after-inspection.json` records the subsequent live records.

The first browser session stopped when native Chrome could not confidently determine the current URL. After the user resumed the task, the direct tab interface was re-established. The resumed work uses the app's normal controls; no native Chrome window switching is used.

### Direct the object

The current UI applied Material detail and Afterlight, verified Undo restored the earlier light values, saved the edited scene, and reopened it. An idle canvas redraw defect was found: capture produced valid geometry while the preview was blank after static changes. The spatial engine now renders immediately after resize, static camera application, and completed scene updates. Reopening the scene on the rebuilt application visibly rendered the bottle and pedestal (`browser/04-reopened-directed-scene.jpg`). Idle animation remains on demand; diagnostic canvas attributes are opt-in under `?renderDebug=1`.

The scene was continued into Object Room, which opened on **Your directed view** and saved as `2e194aeb-16fb-4c3f-90e7-6eaac381371e`. Its browser screenshot is `05-directed-object-room.jpg`.

Root subsequently verified Object Room → instrument switcher → Spatial stage. The first immediate snapshot still showed Object Room while the asynchronous view transition ran; the next snapshot showed the same Afterlight scene with no errors. This route passed and is not a confirmed navigation defect.

The cinematic action then saved immutable scene `c1618e6b-a31f-4cf0-aa79-734efecdd686` and rendered actual PNG `32f17d9e-909d-4ed5-b4a2-8c4348b204c5`. The H3 composer displayed this source, parent guide, supported five-second/768P settings and an editable prompt. One request was submitted: job `2763c96c-c9bd-44e6-9365-deac46c8eac5`, take `970e7e28-32c3-4c97-8ab0-96ce8148d0d2`, Router request `51c4e6fe-1afc-4d9e-a871-8cf4e10ea8af`. It completed and was collected as `c3cb0964-31ff-42e7-a1aa-63f3e00ef796`.

The actual 1344×768 video played unmuted in the app, was downloaded through its download control, and reopened after a browser reload with the parent guide and prompt intact. Its duration is 5.167 seconds. The generated result interprets the opaque orange form as an amber glass vessel; this is a visible creative interpretation, not deterministic geometry animation. `10-scene-h3-actual-result.jpg` and `12-reopened-scene-video-ready.jpg` show the result and reopened workspace. The 199,111-byte native first-frame input was independently hashed against the saved PNG by the storage audit.

### Move the sound

The current UI explicitly selected the rendered mix `8a138b4c-b4a4-406f-bad8-97dd3fd59337`, fitted the composition to its full 11 seconds and applied Electric night. Pointer dragging moved the second text cue from 3 seconds to approximately 4.94 seconds; Undo visibly restored 3 seconds, then the intentional drag was repeated. A separate pointer drag moved beat seven from 3 to approximately 3.30 seconds. The final phrase spans 8.1–10.8 seconds. These are manual authoring decisions, not automatic speech or beat alignment.

Saved composition `fbed8f38-17df-4d94-9ffe-5ee69e867766` retains the mix, zero offset, gain 0.9 and all edited timings. Actual audio playback was observed unmuted at 8.51 seconds from that saved mix's media URL. `07-mixed-soundtrack-timing-preview.jpg` shows the real rendered preview and edited timeline.

**Render film** captured all 132 real WebGL frames and persisted MP4 `b3ec9884-8402-4e0d-80ab-d53aaef9658b`. The 960×540, 11-second result played unmuted in the app at 4.82 seconds and was downloaded through **Download finished MP4**. Reload restored the selected mix, edited cue/beat timing, selected second cue, playhead at approximately 4.94 seconds and matching MP4 link. Screenshots `08-exported-mix-film.jpg` and `09-reopened-mix-composition.jpg` record these views. Rendering was slow in this browser session; the tab was explicitly observed visible while capture progressed. Completion is verified, not a real-time export performance claim.

Independent verification and scope:

- The final three-project storage audit exported Liquid daylight, Prismatic garden and Voices of Elsewhere, restored them into an isolated store, verified 170,660,913 media bytes across 200 assets, 110 takes and all relationships, then reopened the database. All 50 imported jobs were archived. This final snapshot includes the selected film cut. Exact inline H3 first-frame bytes matched the saved PNG. The Object Room clone retained the source scene's opening camera, objects, lights, environment and model hashes.
- The exported Voices film's decoded audio matched the selected saved mix after its offset/gain, with correlation **0.9994293577** at 16kHz and zero-sample alignment adjustment. This verifies the exported soundtrack source; it is not a perceptual quality rating. Receipt: `artifacts/first-impression/journey-package-verification/run-1793715737829/verification-receipt.json`. The same audit retained all 443 original checkpoint media assets.
- Root's final browser pass verified that playing the selected mixed master pauses both discovery videos, which resume muted after its 11-second end. Offscreen pause and explicit ownership interruption were observed. The attempted hidden-tab check left the original document reporting visible, so actual hidden-tab suspension remains source/unit-tested only rather than browser-certified.

Existing clips, older recordings and temporary-store tests are not substitutes for those current-build browser checks.

Screenshot files 01–03 have historical `.png` names but contain JPEG bytes returned by the tab screenshot API; new captures use `.jpg`. The generated scene guide itself is an actual PNG.

`artifacts/first-impression/connected-journeys/browser-receipt.json` lists exact source/output IDs, observed playback values, cue edits, screenshot hashes and downloaded media hashes. Its `downloads/` folder preserves copies of the files obtained through the UI. Screenshot 11 is an intermediate loading screen; screenshot 12 is the completed reopen proof. The earlier `source-validation.json` is retained as a historical pre-resume checkpoint, not the current browser outcome.
