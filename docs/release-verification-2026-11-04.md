# Release verification — November 4, 2026

## Source and automated checks

- Authoring source commit: [c94f4a5b896ac636d299927fe4dbffc76705dec5](https://github.com/sidbug248/open-take-studio/commit/c94f4a5b896ac636d299927fe4dbffc76705dec5), on `codex/authoring-live`.
- [GitHub Actions run 41778234753](https://github.com/sidbug248/open-take-studio/actions/runs/41778234753) completed successfully for that commit.
- The integrated local validation passed the production build, TypeScript checks and all **267 tests**.
- The existing local project/library inventory remained unchanged across the rebuild.

## Deployment checks completed

The release check observed HTTP 200 and the same application bundle, `/assets/index-DkOBhdby.js`, at all three entry points:

| Entry point | HTTP and application delivery |
| --- | --- |
| Local studio, `http://127.0.0.1:4310` | Rebuilt, running, and serving the new bundle. |
| [Direct Render studio](https://open-take-studio.onrender.com/) | Serving the new bundle. |
| [Submitted Vercel studio URL](https://open-take-studio-review.vercel.app/) | Serving the same bundle through the Render-backed application route. |

The catalogue responses agreed across local, Render and Vercel: **66 outcomes**, comprising **40 ready**, **21 needing inputs**, **4 experimental**, and **1 planned/unavailable**. These are the catalogue’s current classifications, not a claim that every paid model was executed in this release.

The Pika Music route, three new native workflow starters and the document-story route were present in each catalogue. Kling extension remains unavailable.

Matching delivery and catalogue responses establish that both cloud URLs expose the updated application. Render still supplies the application server and durable data storage; the Vercel URL forwards that application. The hostnames retain separate browser sessions.

## Browser verification completed

### Direct Render: a real document story and portable export

In an isolated QA workspace, the browser checks:

1. Saved a two-scene document story plan using a saved image and a saved video, with each scene set to two seconds.
2. Assembled an actual MP4 from those selected sources.
3. Edited the captions, saved a new immutable version and assembled the revised story.
4. Loaded the resulting video in the browser. Its reported duration was **4.021333 seconds**, dimensions **1280×720**, readiness **4**, and media error **null**.
5. Downloaded a **4,555,281-byte** portable ZIP. Archive CRC verification passed, and the package contained `index.html`, `story.mp4`, `captions.vtt`, `source.txt`, `plan.json` and the two original selected sources.

These checks used existing media and local assembly. No Comfy model generation was submitted.

### Vercel: the studio arrival and native workflow preparation

The submitted Vercel URL visually loaded the cinematic homepage and diverse saved-media gallery. All three new native workflow starters were visible.

Choosing the image-to-3D starter successfully saved the editable **LoadImage → MeshyImageToModelNode → SaveGLB** graph and its controls. This preparation worked without connecting an API key or submitting generation. It verifies workflow creation and editing, not a completed Meshy provider run.

### Public showcase preservation

Both public APIs retained **19 approved showcase projects**, **55 demonstrated capabilities** and **167 demonstrations**. These counts were unchanged by this release. The saved showcase remains accessible without inference credits.

## What has and has not been proven

Local tests produced actual image/video/audio-derived MP4 output, checked scene imagery and audible audio, verified timed captions and portable ZIP contents, and restored an exported project before rendering again. They also covered project isolation, immutable versions, invalid timing and idempotent retries. The Render browser check additionally confirmed hosted editing, assembly and a downloaded portable archive.

**No funded execution of the four new provider paths was performed in this release.** Pika Music, native Meshy image-to-3D, native VEED Standard dubbing and native VEED cleanup retain their experimental verification boundary. Local contract/fixture tests and a successful deployment do not establish provider access, consumed credits or production output quality.

Physical mobile-device behavior and paid provider quality were not verified by these checks. The video readiness and ZIP integrity observations do not claim an independently tested `file://` playback session on every browser or operating system.

This engineering pass submitted no paid Comfy generations. Saved-media document planning and assembly make no model requests.

See the [upgrade guide](inference-upgrades-2026-11-04.md) for use, setup and remaining provider checks.
