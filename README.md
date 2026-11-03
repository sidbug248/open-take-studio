# Open Take Studio

[🚀 Open the live app](https://open-take-studio.onrender.com)

**Post-submission reviewer access — November 3, 2026.** Choose **Try the studio with your own Comfy key** to create an isolated workspace without an account, OAuth, or the owner's password. Explore curated saved examples, remix them into your workspace, and use local editing/export tools. To request new AI generations, connect your own [Comfy workspace API key](https://platform.comfy.org/profile/api-keys) with credits and the required model access.

Reviewer keys are encrypted on the server, expire after **12 hours**, and are removed on disconnect. The anonymous browser session lasts **7 days**; export your projects before signing out, clearing cookies, or changing browsers. Reconnect the same key to resume that workspace's pending jobs; a different key requires a new reviewer workspace. Keys never belong in prompts, project packages, or chat.

**The original event credit allocation has ended.** The owner's key cannot fund new work; reviewer generation uses only that reviewer's connected key. Isolation and recovery are tested with mocked providers. A fresh live generation with a funded reviewer key has **not** been verified. The immutable competition tag and its original media remain unchanged.

**A creative studio for branching films, directed 3D scenes, editable sound-driven motion, and source-preserving iteration — available locally and in isolated hosted workspaces.**

Open Take combines a React/TypeScript interface, Express, SQLite, managed local media, Comfy Router, and a separate native Comfy Cloud workflow client. AI inference uses hosted Comfy/provider routes. Scene rendering, media editing, sound mixing, and portable exports run locally.

## See it in action

- [Open the public reviewer demo](https://open-take-studio-review.vercel.app/).
- [Watch the 100-second competition video](https://x.com/ayosiddy/status/2117645518000279974).
- [Download the tagged source release](https://github.com/sidbug248/open-take-studio/releases/tag/v0.1.0-submission).

The public reviewer demo preserves the submission's playable outputs. The [full authoring application on Render](https://open-take-studio.onrender.com) offers isolated reviewer workspaces and separate private owner sign-in. Saved media, local processing, and exports need no inference credits. You can also run the source locally with your own authorized Comfy credentials and credits.

## Try the three connected journeys

- **Change the ending:** select an actual video frame, generate a new continuation, preserve the earlier film version, and export either a selected cut or a portable branching player.
- **Direct the object:** edit a real GLB scene's camera and lighting, save its viewpoint, create a guided Object Room, and use an actual scene-rendered PNG as the next video generation's first frame.
- **Move the sound:** select a real mixed soundtrack, edit text/beat timing, and export a motion film using that exact audio and authored timing.

The submission's 100-second competition demonstration combines actual UI captures and actual output clips. It is an edited demonstration, not a continuous screen recording. The accompanying portable film works without the studio or a Comfy account.

## Requirements

- Node.js **22.16 or newer**; Node 24 LTS is recommended and used by the hosted runtime.
- npm and internet access for the initial dependency install.
- A modern browser with WebGL for interactive 3D and motion rendering.
- Your own **Comfy API key, service access and credits** for new hosted generations. Viewing portable exports needs no API key.
- FFmpeg/ffprobe are installed through the locked dependencies. If your package manager blocks installation scripts, permit the documented FFmpeg dependency or set compatible `FFMPEG_PATH` and `FFPROBE_PATH`.

No local model installation is required. Provider credentials and model weights are not distributed.

## Install and run

```sh
npm ci
```

For a **fresh checkout**, copy `.env.example` to `.env` and set `COMFY_API_KEY` locally. Do not overwrite an existing credential file. Never put a service key in client code.

```sh
npm run build
npm start
```

Open **http://127.0.0.1:4310**. The app binds to loopback as a single-user local application. Stop it with Ctrl+C. A fresh checkout starts with a new local database; it does not contain the author's private workspace.

For development, use `npm run dev` instead of the production start. Run only one server against a given port/database. Windows also has the supplied `Start-OpenTakeStudio.ps1` launcher.

## Open the examples

The public release includes these four downloads:

- [Competition demo MP4](https://github.com/sidbug248/open-take-studio/releases/download/v0.1.0-submission/Open-Take-Studio-Competition-Demo.mp4): the 100.063-second demonstration of the product, implementation and workflow innovation.
- [Self-contained reviewer demo ZIP](https://github.com/sidbug248/open-take-studio/releases/download/v0.1.0-submission/Open-Take-Studio-review-demo-2026-11-03.zip): extract the entire archive and open `index.html` to view the demonstration and portable outputs.
- [Three-choice branching film ZIP](https://github.com/sidbug248/open-take-studio/releases/download/v0.1.0-submission/Prismatic-Three-possible-skies.playable.zip): extract the entire archive and open `index.html`. The film works without the studio or a Comfy account.
- [Clean application source ZIP](https://github.com/sidbug248/open-take-studio/releases/download/v0.1.0-submission/Open-Take-Studio-source-2026-11-03.zip): the verified competition source snapshot with setup instructions, native workflows and licenses.

Editable sample project bundles remain local and are **not included in the public release downloads**. A fresh checkout starts with an empty workspace. The studio can import your own editable `.opentake.zip` packages through **Projects → Import production package**.

The tagged source snapshot remains pinned to the verified application commit; this main-branch README contains the current public download links. Generated media is not automatically licensed under the application's MIT license; see `docs/licensing.md`.

## Comfy workflows

`workflows/native/` includes four workflow families with editor-format JSON, API-format JSON, dependency descriptions and studio definitions. Open the relevant editor JSON in Comfy Cloud or use the studio's **Native workflows** instrument. Availability of nodes/models and required hosted entitlements must be satisfied in your own workspace. Workflow presence is not a claim of local inference or open-weight execution.

Comfy Router and native Comfy Cloud execution remain explicit separate routes in production history. Provider APIs include proprietary models. An entirely open-weights-only execution route is **not verified** in this submission.

## What is implemented and what remains

The catalogue describes 66 creative outcomes: 55 marked executable (some require source inputs), and 11 explicitly planned/unavailable. The 253-entry model directory is broader than the 21 implemented adapters and must not be interpreted as 253 runnable integrations.

The current three-journey validation includes two fresh H3 videos, actual scene-render input-byte matching, a mixed-soundtrack motion export, saved/reopened edits, project package restoration and standalone branching-film playback. A 154-test host run passed before final display-only changes; the final build/typecheck and visual checks followed those display changes. See `submission-evidence/verification-summary.json` and `docs/first-impression-validation.md` for scope.

Physical-phone behavior remains unverified. Hosted reviewer workspaces use separate SQLite/media storage, credential-bound jobs and recovery, bounded admission, and explicit curated example copies. The owner's workspace remains private. Reviewer access is an anonymous browser session, not an account system with cross-device recovery or team collaboration. See `deploy/README.md` and `docs/hosted-release-2026-11-03.md` for deployment evidence and current limits.

## Developer checks

```sh
npm run typecheck
npm test
npm run build
```

Tests use isolated fixtures rather than live paid generation. Engineering notes may contain historical local-artifact references; the curated submission evidence index identifies the release's included proof and current limitations.

## License

Original application code is MIT licensed; preserve the root `LICENSE`. Third-party packages, decoders, FFmpeg/ffprobe, external models/services and generated media retain their separate licenses and terms. See `docs/licensing.md` and `docs/licenses/`. No account credentials, local database, installed dependencies or model weights are included in the source release.
