# Final-build walkthrough capture plan

This is a plan, not completed browser evidence. Capture only after the final production build and restart. Use the documented browser DOM/AX interactions and ordinary screenshot API. Do not use alternate browser automation or the previously blocked native DevTools capture path.

## Capture record

For each checkpoint, record the timestamp before the action, action label, timestamp after the screenshot, exact local URL, actual viewport dimensions and device pixel ratio, and the output PNG path. Keep a short observation beside it: what visibly changed, whether a control was activated, and which saved asset/version was shown. Keep failures in the manifest rather than replacing them with a clean result from another build.

Read-only media observations can record `currentSrc`, `currentTime`, `paused`, `muted`, and `readyState` when the browser API permits it. These establish player state, not audible quality. Do not call application functions from browser evaluation or bypass the visible controls.

## Concise montage, approximately 75–100 seconds

| Segment | Actual capture and action | What it demonstrates |
| --- | --- | --- |
| Arrival · 8–12s | Final desktop arrival, then a second capture after a real hero frame. Show the optimized real object beside the source-matched Prismatic result. | First poster and moving result; attach measured profile/timings separately. |
| Change the ending · 18–24s | Open the Prismatic journey, play to the decision, activate one saved choice, return, then show the exact saved source frame and new completed ending. Add/rename the new ending, save a new version, reopen it. | Cached choice playback distinguished from the separately recorded Router execution; unchanged original survives. |
| Direct the object · 16–22s | Open Liquid daylight, change a camera or light preset, save a view/version, show the actual rendered guide in the cinematic form. Finish with the saved object or resulting real clip. | Real geometry and scene state; the rendered original frame, not a small discovery derivative, becomes the generation input. |
| Move the sound · 16–22s | Start source audio deliberately, adjust one cue or beat, undo once, apply the intended edit, save/reopen, then show a short excerpt from that version’s actual exported MP4. | Visible timing edit and its real output. Do not label manual cues as automatic alignment. |
| Take it with you · 8–12s | Show the final selected-path export and newly regenerated standalone film. Use its decision and sound controls. End with an actual phone screenshot showing usable choices or creation controls. | Exported saved media and touch layout. State whether app independence was freshly tested. |

Use screenshots as short readable holds and actual saved output clips as motion. Label the result **“Actual UI walkthrough montage”**; a sequence of screenshots is not continuous screen recording. Do not interpolate screenshots into invented interaction. Include visible failure/limitation captions where a required check remains incomplete.

## Focused acceptance checks outside the montage

- Keyboard: play the film, reach a decision, confirm visible focus on the choice, activate it with Enter, and return to the decision. Focus must not move away from a direction field being edited outside the player.
- Phone: inspect the actual viewport width, tap each choice, pause it, and reach the source-frame action. Short screens may scroll within the decision overlay; labels and 44px controls remain reachable.
- Lifecycle: deliberately play a discovery preview, scroll it out of view, and check that other visible previews resume. Return to it and verify a useful playhead. Hidden-tab sound pauses and does not restart by itself.
- Reduced motion: record the prior application preference, enable it after orbit interaction, verify automatic orbit and discovery motion stop, then restore only that temporary test override. Always respect the system preference.
- Continuity: leave/reopen a comparison, saved film version, directed scene, and motion document. Check original asset IDs, source time, selected version, and relevant playhead in their visible details.
- Exports: regenerate the portable film ZIP after the player-template change. An earlier ZIP does not contain the latest player fixes.

For fresh-origin performance measurements, disclose that the browser HTTP cache is fresh while prepared server derivatives and OS caches already exist. Record the local proxy hop and separate new-origin storage/preferences from the returning-user profile. Do not claim mobile-network results from an unthrottled desktop-sized screenshot.
