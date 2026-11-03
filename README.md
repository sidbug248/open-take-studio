# Open Take Studio

**The full creative studio is available in the cloud and on your own computer.**

| Choose how to use it | Open or install |
| --- | --- |
| Full studio through Vercel — original submitted URL | [open-take-studio-review.vercel.app](https://open-take-studio-review.vercel.app/) |
| Full studio directly on Render | [open-take-studio.onrender.com](https://open-take-studio.onrender.com/) |
| Install the current studio on your computer | [Local installation instructions](#install-the-current-studio-locally) |

Both cloud links serve the same current application. Vercel keeps its address while forwarding the application to Render, which runs the server and persistent storage. Neither link requires an intermediate demo page or an extra click to enter the studio.

**Local installation requires no Render or Vercel account or subscription.** New AI generation uses hosted Comfy/provider services and requires your own authorized API key, model access, internet connection and credits. Opening the app and editing, rendering or exporting existing media do not require inference credits.

**Post-submission arrival and routing update — November 3, 2026.** Explore the cinematic homepage, moving previews, interactive 3D, recipes, and curated work without a login, API key, or reserved workspace. An isolated workspace starts only when you create, import, edit/remix, or submit a key connection. If creation is temporarily at capacity, the showcase stays visible and your current prompt and selected files remain with a retry action. **Generate** opens a dismissible connection dialog when needed. Connect your own [Comfy workspace API key](https://platform.comfy.org/profile/api-keys) with credits and model access, then choose Generate again. Connecting never starts a generation automatically. [Private owner sign-in](https://open-take-studio.onrender.com/login) remains separate.

Reviewer keys are encrypted on the server, expire after **12 hours**, and are removed on disconnect. Once created, the private browser session lasts **7 days**. The Vercel and Render hostnames have separate browser cookies and workspaces: return through the same URL and browser, or use an exported project package to transfer work. Export projects before signing out, clearing cookies, or changing browsers. Reconnect the same key to resume that workspace's pending jobs; a different key requires a new reviewer workspace. Never put an API key in a prompt, project package, or chat.

**The owner's original event credit allocation has ended.** Reviewer requests use only the reviewer's connected key. Live HTTP checks verified isolated media access, saving, downloads, exports, invalid-key rejection, and connect/disconnect/reconnect with the known unfunded key. Concurrent execution and recovery were tested with mocked providers. A fresh live generation with a funded reviewer key has **not** been verified.

This update follows the submission. [Current post-submission authoring source](https://github.com/sidbug248/open-take-studio/tree/codex/authoring-live) includes the hosted access and routing corrections. The original reviewer demonstrations and immutable `v0.1.0-submission` release below remain unchanged. The local instructions below explicitly install the current authoring branch; the tagged source ZIP remains the original competition snapshot.

**A local creative studio for branching films, directed 3D scenes, editable sound-driven motion, and source-preserving iteration.**

Open Take combines a React/TypeScript interface, Express, SQLite, managed local media, Comfy Router, and a separate native Comfy Cloud workflow client. AI inference uses hosted Comfy/provider routes. Scene rendering, media editing, sound mixing, and portable exports run locally.

## See it in action

- [Open the full studio at the submitted URL](https://open-take-studio-review.vercel.app/).
- [Preserved competition demo and downloads](https://open-take-studio-review.vercel.app/competition/).
- [Watch the 100-second competition video](https://x.com/ayosiddy/status/2117645518000279974).
- [Download the tagged source release](https://github.com/sidbug248/open-take-studio/releases/tag/v0.1.0-submission).

The competition page preserves the submission's playable outputs and all original video, film, and download URLs. The [live authoring studio](https://open-take-studio.onrender.com) offers isolated reviewer workspaces and separate private owner sign-in. You can also run the source locally with your own authorized Comfy credentials.

## Five new production tools

The current authoring branch adds five upgrades that work without Comfy inference credits. Open a project and use the instrument selector (Ctrl/Cmd+K):

- **Production canvas:** typed visual graphs, local image transforms, storyboards, delivery packages and resumable runs.
- **Shared review and team comments:** version-pinned invitations, viewer/commenter/approver roles, timecoded discussion and decisions.
- **Client review and social delivery:** original, square, portrait and landscape packages with actual media, captions and integrity manifests.
- **Studio MCP:** real Streamable HTTP tools with expiring project-scoped read or local-write tokens.
- **Scheduled publishing:** explicitly approved posts to connected Mastodon accounts; other services use manual delivery packages.

No paid generation or real social posting was performed to validate these upgrades. New generation still needs an authorized funded Comfy key. Review invitations and MCP tokens are bounded by workspace expiry. Local scheduling requires the app to remain running.

Read the [usage guide and tested scope](docs/five-production-upgrades.md) and [Comfy test budget](docs/comfy-testing-budget-2026-11-03.md). These are post-submission additions; the original competition tag and release are unchanged.

## Try the three connected journeys

- **Change the ending:** select an actual video frame, generate a new continuation, preserve the earlier film version, and export either a selected cut or a portable branching player.
- **Direct the object:** edit a real GLB scene's camera and lighting, save its viewpoint, create a guided Object Room, and use an actual scene-rendered PNG as the next video generation's first frame.
- **Move the sound:** select a real mixed soundtrack, edit text/beat timing, and export a motion film using that exact audio and authored timing.

The submission's 100-second competition demonstration combines actual UI captures and actual output clips. It is an edited demonstration, not a continuous screen recording. The accompanying portable film works without the studio or a Comfy account.

## Requirements

- Node.js **22.16 or newer** for the current authoring branch; Node 24 is recommended.
- Git for the clone commands below, plus npm and internet access for the initial dependency install.
- A modern browser with WebGL for interactive 3D and motion rendering.
- Your own **Comfy API key, service access and credits** for new hosted generations. Viewing portable exports needs no API key.
- FFmpeg/ffprobe are installed through the locked dependencies. If your package manager blocks installation scripts, permit the documented FFmpeg dependency or set compatible `FFMPEG_PATH` and `FFPROBE_PATH`.

No local model installation is required. Provider credentials and model weights are not distributed.

## Install the current studio locally

The current application source is on [`codex/authoring-live`](https://github.com/sidbug248/open-take-studio/tree/codex/authoring-live). The default `main` branch retains the competition application snapshot with updated public documentation. Use the commands below for a fresh installation of the current studio:

```sh
git clone --branch codex/authoring-live --single-branch https://github.com/sidbug248/open-take-studio.git
cd open-take-studio
npm ci
```

Create a local `.env` from the supplied template. This command works in PowerShell and macOS/Linux shells and leaves an existing `.env` untouched:

```sh
node -e "const fs = require('node:fs'); if (!fs.existsSync('.env')) fs.copyFileSync('.env.example', '.env', fs.constants.COPYFILE_EXCL);"
```

You can leave `COMFY_API_KEY` empty to open the studio and work with existing media. When you want new hosted generations, add your own authorized Comfy API key to this local `.env` file; generation also requires credits and model access. Keep the hosted-only `OTS_CREDENTIAL_ENCRYPTION_KEY`, `OTS_VERCEL_PROXY_ORIGIN` and `OTS_VERCEL_PROXY_SECRET` settings unset for local use. Local mode is the default. Never put a service key in client code or commit `.env`.

```sh
npm run build
npm start
```

Open **http://127.0.0.1:4310**. The app runs on your computer, binds to loopback as a single-user local application, and stores its database and media in the local `data` directory. Stop it with Ctrl+C.

A fresh installation starts with an empty workspace and does not contain the author's private projects or the cloud showcase library. Cloud and local workspaces do not synchronize automatically. To transfer your own work, export an editable `.opentake.zip` project package from its cloud workspace, then use **Projects → Import production package** in your local studio. Keep the `data` directory when upgrading, and back it up with the app stopped.

For development, use `npm run dev` instead of the production start. Run only one server against a given port/database. Windows also has the supplied `Start-OpenTakeStudio.ps1` launcher after dependencies have been installed.

For the original competition version, use the [`v0.1.0-submission` release and source ZIP](https://github.com/sidbug248/open-take-studio/releases/tag/v0.1.0-submission). That archived snapshot is separate from the current authoring branch installed above.

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

The current authoring catalogue describes 66 creative outcomes: 60 implemented (some require source inputs or an external account), and six explicitly planned/unavailable. The immutable competition snapshot originally contained 55 implemented and 11 planned/unavailable outcomes. The 253-entry model directory is broader than the 21 implemented adapters and must not be interpreted as 253 runnable integrations.

The current three-journey validation includes two fresh H3 videos, actual scene-render input-byte matching, a mixed-soundtrack motion export, saved/reopened edits, project package restoration and standalone branching-film playback. A 154-test host run passed before final display-only changes; the final build/typecheck and visual checks followed those display changes. See `submission-evidence/verification-summary.json` and `docs/first-impression-validation.md` for scope.

Physical-phone and actual hidden-tab browser behavior remain unverified in the submission evidence. The immutable submission source is a local studio. The post-submission hosted app adds separate reviewer SQLite/media storage, credential-bound jobs, scoped recovery and bounded admission; the owner's workspace stays private. Reviewer workspace access is an anonymous browser session without cross-device account recovery. The current authoring branch adds scoped review invitations, comments and approvals without granting access to the private workspace.

## Developer checks

```sh
npm run typecheck
npm test
npm run build
```

Tests use isolated fixtures rather than live paid generation. Engineering notes may contain historical local-artifact references; the curated submission evidence index identifies the release's included proof and current limitations.

## License

Original application code is MIT licensed; preserve the root `LICENSE`. Third-party packages, decoders, FFmpeg/ffprobe, external models/services and generated media retain their separate licenses and terms. See `docs/licensing.md` and `docs/licenses/`. No account credentials, local database, installed dependencies or model weights are included in the source release.
