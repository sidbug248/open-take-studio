# Open Take Studio

[🚀 Open the live app](https://open-take-studio.onrender.com)

**Post-submission deployment — November 3, 2026.** The full hosted authoring studio is available behind **owner-password sign-in**. This is a private, single-owner workspace: there is no public signup or self-service Comfy-key setup. The workspace owner configures the Comfy credential on the server; no password or API key is published here.

**The event credit allocation has ended, so new AI generation is currently blocked by `insufficient_credits`.** After sign-in, the restored project library, saved and imported media, local editing tools, downloads, and project exports remain available. Hosted sign-in, restored projects, saved-media playback and editing, upload/download, project export/import, and persistence through a server restart were verified on November 3. Imported examples are not presented as fresh hosted generations.

This deployment follows the submission. The original reviewer demo and immutable `v0.1.0-submission` release below remain unchanged; the local setup instructions still apply to that source snapshot.

**A local creative studio for branching films, directed 3D scenes, editable sound-driven motion, and source-preserving iteration.**

Open Take combines a React/TypeScript interface, Express, SQLite, managed local media, Comfy Router, and a separate native Comfy Cloud workflow client. AI inference uses hosted Comfy/provider routes. Scene rendering, media editing, sound mixing, and portable exports run locally.

## See it in action

- [Open the public reviewer demo](https://open-take-studio-review.vercel.app/).
- [Watch the 100-second competition video](https://x.com/ayosiddy/status/2117645518000279974).
- [Download the tagged source release](https://github.com/sidbug248/open-take-studio/releases/tag/v0.1.0-submission).

The reviewer demo shows playable outputs; run the source locally for the complete authoring studio.

## Try the three connected journeys

- **Change the ending:** select an actual video frame, generate a new continuation, preserve the earlier film version, and export either a selected cut or a portable branching player.
- **Direct the object:** edit a real GLB scene's camera and lighting, save its viewpoint, create a guided Object Room, and use an actual scene-rendered PNG as the next video generation's first frame.
- **Move the sound:** select a real mixed soundtrack, edit text/beat timing, and export a motion film using that exact audio and authored timing.

The submission's 100-second competition demonstration combines actual UI captures and actual output clips. It is an edited demonstration, not a continuous screen recording. The accompanying portable film works without the studio or a Comfy account.

## Requirements

- Node.js **22.13 or newer**; Node 24 LTS is recommended.
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

Physical-phone and actual hidden-tab browser behavior remain unverified. The application is not a hosted multi-user service. Public deployment would require authentication, workspace authorization and appropriate storage/job infrastructure; changing the listen address alone is not sufficient.

## Developer checks

```sh
npm run typecheck
npm test
npm run build
```

Tests use isolated fixtures rather than live paid generation. Engineering notes may contain historical local-artifact references; the curated submission evidence index identifies the release's included proof and current limitations.

## License

Original application code is MIT licensed; preserve the root `LICENSE`. Third-party packages, decoders, FFmpeg/ffprobe, external models/services and generated media retain their separate licenses and terms. See `docs/licensing.md` and `docs/licenses/`. No account credentials, local database, installed dependencies or model weights are included in the source release.
