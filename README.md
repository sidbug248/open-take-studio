# Open Take Studio

**A local creative studio for branching films, directed 3D scenes, editable sound-driven motion, and source-preserving iteration.**

Open Take combines a React/TypeScript interface, Express, SQLite, managed local media, Comfy Router, and a separate native Comfy Cloud workflow client. AI inference uses hosted Comfy/provider routes. Scene rendering, media editing, sound mixing, and portable exports run locally.

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

The separate submission release assets contain:

- `Open-Take-Studio-Competition-Demo.mp4`: the 100.063-second competition demonstration, including the product, implementation and workflow innovation. The earlier 82.022-second before/after montage is also retained separately.
- `Prismatic-Three-possible-skies.playable.zip`: extract the entire archive, then open `index.html` for the self-contained three-choice film.
- `Liquid-Directed-Object.opentake.zip`, `Prismatic-Three-possible-skies.opentake.zip`, and `Voices-Mixed-Soundtrack.opentake.zip`: use **Projects → Import production package** in the running studio to inspect/edit these examples. Imported historical jobs are archived and do not automatically generate or charge.
- `Afterlight-directed-scene.spatial.zip`: the directed scene export.
- Selected finished MP4s for the story, scene-to-video, and sound/motion results.

Examples are separate from application source so the code repository contains no private database or historical credential-bearing request store. The examples preserve prompts, creative inputs and production relationships intentionally included in their portable format. Generated media is not automatically licensed under the application's MIT license; see `docs/licensing.md`.

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
