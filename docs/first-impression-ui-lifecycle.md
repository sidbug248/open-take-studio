# Arrival and playback lifecycle

This pass keeps discovery separate from editing and generation. The creator-facing arrival is composed from the stable Prismatic branching film, Liquid daylight object/scene, and Voices of Elsewhere motion production. The source summaries and action identities come from `shared/explore-types.ts`; incidental project updates and favorites no longer recurate the hero.

## Data and source identity

- Explore reads the injected `ots-explore-bootstrap` JSON when available. Its fallback is the compact `/api/explore/bootstrap` route. It appends `/api/explore/cards` pages independently and reads `/api/explore/recipes` for the recipe gallery.
- No complete project detail or historical job body is fetched to render discovery. Explicit **Make it yours** or recipe remix resolves the original project and take only after the creator chooses that action.
- `PresentationImage` and `MediaTile` use prepared canonical poster/video URLs, responsive source sets and recorded dimensions. The hero poster is eager with high fetch priority. Missing renditions have an honest preview state; a full original is not silently substituted.
- Legacy asset-only presentation components share a descriptor cache. Their descriptor reads and bounded unprepared-state retries are visibility-gated. The read route does not encode media. Original audio is fetched/decoded only for deliberate audition when a saved waveform is unavailable.
- Every action retains `media.original` asset ID, version and hash. The compact video and simplified GLB are display-only resources, never generation inputs or exported originals.

## Playback ownership

`client/playback.ts` provides `acquirePlayback(ownerId, onInterrupted)`, returning a token-aware release function. A new explicit creative session interrupts the previous session without changing its playhead. Stale cleanup cannot release the new owner.

Discovery has a shared budget of four simultaneous previews on ordinary desktop configurations and two on smaller/constrained configurations. Data-saving mode requires deliberate preview activation. Visibility, reduced motion, manual pause and explicit creative ownership gate eligibility. Hero priority is above secondary previews; hover/focus promotes a secondary item without becoming the only way to discover motion.

Film, synchronized comparison, selected-video playback, frame branching, saved mesh animation, audio audition, audio mixing, motion composition, spatial animation and Object Room cues use this owner contract. Comparison owns both clips as one session. Film decision previews use the film's scope so they can move while unrelated discovery remains paused. Hidden-page interruption pauses the explicit session; the caller retains or releases its lease according to its UI lifecycle. No tool resumes audible playback automatically.

Video tiles retain the real poster until `requestVideoFrameCallback` observes a decoded frame; older browsers use the loaded-data fallback. A rejected autoplay promise leaves a working poster and explicit Play action. Offscreen previews pause, retain their playhead and release their media element after a bounded idle interval. Returning restores the saved preview position.

## Lightweight spatial arrival

`DiscoveryModel.tsx` shows the actual prepared poster immediately. It defers `discovery-engine.ts` until the preview is visible and eligible, and the hero has a frame or the short delivery grace period has elapsed. The display engine imports Three.js, GLTFLoader, OrbitControls and the locally bundled Meshopt decoder. It does not import SpatialStage, the editing engine, export code, audio or scene documents. It consumes only the prepared discovery GLB. The actual object supports orbit/zoom; rendering and auto-orbit yield to the same playback budget and reduced-motion preference. Full geometry remains available through the explicit original-production action.

## Interaction and validation

- The opening prompt exposes Image, Film, Performance, 3D object, Sound + motion and Playable outcomes. The selected outcome, prompt and uploads cross the `onStart` boundary together. Draft creation does not itself submit inference.
- Prismatic continuation buttons show saved alternatives instantly, label that fact and retain the source. **Change this ending** opens the exact film/frame action. FilmPlayer's optional **Make another ending** callback receives its recorded source moment.
- Liquid and Voices actions use exact model/scene/room and composition/soundtrack identities. The mix is not claimed as a composition source unless the actual saved relationship says so.
- Six focused playback tests cover budget allocation, offscreen/hidden lifecycle, exclusive grouped ownership, reduced-motion/data-saving activation, scoped film previews and stale lease cleanup. TypeScript passed after the integrated client changes.
- Browser timing, screenshots, final responsiveness and journey save/reopen/export results are recorded by the root verification pass. HTTP delivery, decode-ready timing and LCP remain distinct measurements. A source-level test is not a browser playback or audible-quality claim.
- The root's first new-build run observed a decoded poster at 0.892 seconds and a video frame at 1.638 seconds. This is a particular recorded browser run, not a universal performance guarantee. That review identified hero stacking and sound-card contrast issues, which were fixed in source. The later compact Three.js viewer and final CSS were built, but their final interactive browser review was interrupted when Windows browser control could not identify the current URL confidently. Browser work stopped rather than switching control methods. Final-build phone, autoplay-fallback and three-journey checks must retain that boundary.

The visible-preview policy follows the documented combination of optimized silent video, posters and visibility-triggered loading in [web.dev's video performance guidance](https://web.dev/learn/performance/video-performance). Frame handoff uses the compositor callback described by [MDN](https://developer.mozilla.org/en-US/docs/Web/API/HTMLVideoElement/requestVideoFrameCallback). Timing reports distinguish resource discovery, loading and rendering as recommended by [web.dev's LCP guidance](https://web.dev/articles/optimize-lcp).
