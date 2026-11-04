# Inference upgrades and document stories — November 4, 2026

> **Current execution status, November 4, 2026:** Funded native Sonilo music, Meshy image-to-3D, VEED dubbing and VEED cleanup runs completed and saved outputs. Pika Music returned `403 not_enabled` through Router and is unavailable; the native Sonilo starter is the working music route. See the [funded check and quality limits](funded-generation-check-2026-11-04.md). The preparation notes below describe the earlier contract-validation stage.

This guide describes the new implementation prepared for the current authoring branch. **It is not evidence that these changes have been deployed.** Check the release/deployment report for the actual deployed commit. The competition tag remains a separate, preserved snapshot.

The five earlier production upgrades remain part of the current studio. This pass addresses the six remaining outcomes below. Local development, validation, editing and media assembly do not require Comfy inference credits. New hosted model executions do.

## What this pass adds

| Outcome | Implemented route | Current evidence and remaining work |
| --- | --- | --- |
| Standalone music | **Pika Music** through Comfy Router, model `pika/pika-music`. Written direction, optional lyrics, duration and seed. The default is **10 seconds**. | Experimental. Current request/result contract and local fixtures are checked. A funded provider execution and audible result review remain unverified. |
| Image to 3D | Native **Comfy Cloud Meshy 7.1** workflow: saved image → `MeshyImageToModelNode` → `SaveGLB`. | The image is connected to geometry generation. The native graph and node contract are checked. A funded run, downloadable real GLB and visual geometry review remain unverified. |
| Translation and dubbing | Native **VEED Standard** workflow on Comfy Cloud: saved speech video → `VeedDubbingNode` → saved video. | Explicit source/target language controls and preserved source media. Funded execution, translation quality, speaker/voice quality and timing remain unverified. |
| Speech cleanup | Native **VEED Clean Audio** workflow on Comfy Cloud: saved speech → `VeedCleanAudioNode` → saved FLAC. | This uses a separate native workflow from the previously unavailable Router cleanup adapter. Funded native execution and listening comparison remain unverified. |
| Document to finished story | Local document ingestion, editable scene planning, selected saved media, real MP4 assembly, timed captions and portable player ZIP. | Implemented and tested with real saved-media fixtures, including project export/import and a second render from the restored plan. New generated story media is optional and uses explicit existing generation controls. |
| Kling extension | Existing `kling/videos-video-extend` integration and compatible-provider-video checks. | Still blocked by unresolved provider compatibility/access evidence. No successful extension is claimed. Adding credits does not prove that this route accepts the available source video. |

Schema verification, local fixtures and a successful hosted generation establish different things. Experimental model routes remain experimental until a funded request succeeds, outputs are saved, and their actual quality and project history are inspected. See the implementation in [audio generation adapters](../server/audio-generation-adapters.ts), [native audio workflows](../server/audio-native-workflows.ts), [image-to-3D workflows](../server/spatial-generation-adapters.ts), and [document stories](../server/document-story.ts).

## Connect your Comfy workspace

New hosted generation requires an API key from the workspace whose credits and service access you intend to use. A subscription or credit purchase does not replace a key already configured in an application. Select the intended workspace in [Comfy?s API key settings](https://platform.comfy.org/profile/api-keys), then configure its key privately:

1. For local development, update `COMFY_API_KEY` in the project?s private `.env` file using a local editor. Restart the studio process so it reads the new setting.
2. For an isolated cloud workspace, choose **Connect Comfy** and enter that workspace?s key in the connection dialog.
3. A reviewer workspace is bound to its original key. To use a different workspace?s key, export any existing work and start a fresh reviewer workspace.
4. Verify access and balance before an intentionally chosen model run. An accepted key alone is not proof of sufficient funds or model entitlement.

If generation reports insufficient credits, check that the configured key belongs to the workspace you funded and that its balance and model access are sufficient. Funding one workspace does not establish a usable balance for a key belonging to another workspace. A zero balance affects new hosted generation; saved media and local composition remain usable.

Do not put a key in chat, a prompt, client code, a project package or Git. Connecting a key does not start generation. The cloud connection dialog configures that private reviewer session; it does not update a local installation’s `.env`.

The exact read-only checks are already used by [the credential probe](../server/reviewer-credentials.ts):

- `GET https://api.comfy.org/v2/models?limit=1`
- `GET https://cloud.comfy.org/api/billing/usage/timeseries?months=1&group_by=product&granularity=month`

## Use the new tools

### Compose music

Choose **Pika Music · original soundtrack**, enter the musical direction and optional lyrics, and review duration before choosing **Generate**. Start with the default 10-second sample when validating access and output collection.

The studio exposes text-to-music with optional lyrics. It does not silently submit a reference voice, song cover or provider prompt-rewriting operation. After a successful run, the saved track can be used in the audio mixer, motion compositions or document story scenes.

Generation is billable. The adapter’s presence does not provide an exact price or prove a funded run has completed.

### Create geometry from an image

Choose the native **Image to 3D · Meshy 7.1** workflow and bind a saved image from the current project. Review geometry and texture settings, validate the workflow, and explicitly choose **Run** when ready to spend credits.

The prepared defaults use textures at 2K, a 30,000-polygon target, triangle topology and the normal geometry pass. PBR and the ultra geometry pass are off by default. Editing or preparing the graph does not execute it.

A successful execution should produce a saved GLB that can be downloaded and inspected in the spatial tools. This route sends the source image to the image-to-geometry node; it is separate from the existing Router text-to-3D preview/refine route. Availability and output quality still need a funded test.

### Translate and dub a speech video

Choose **Translate and dub a video** in native workflows. Bind a saved video containing speech, set the target language, and either specify the source language or use automatic detection. The preset uses **VEED Standard**.

The initial source must include an audio track, with the studio’s duration limit set to 599 seconds. Use a short speech clip for the first paid validation. Review the translated words, pronunciation, speaker treatment and lip timing against the original after a successful run. The original source is preserved as its own asset.

### Clean a speech recording

Choose **Clean a speech recording**, bind a saved audio file, and review strength and loudness settings. The native preset defaults to strength 0.874 and normalization at −19 LUFS, with a FLAC output.

This is a speech isolation/cleanup operation. The native node contract describes 48 kHz mono speech and can remove music and effects as well as noise. Keep valuable originals and compare the result before replacing a soundtrack selection. The studio accepts a source up to 1,799 seconds for this preset.

The old Router cleanup route’s availability problem is not declared fixed by introducing this native alternative. Native provider execution remains separately unverified.

### Make an editable story from text without new generation

Open **Document story** in a project containing your source media.

1. Paste text or import a `.txt`, `.md` or `.markdown` file, up to 60,000 characters.
2. Choose **Plan scenes**. The initial draft groups paragraphs locally into 1–8 scenes. Review and rewrite it as needed; no AI script inference or summarization is claimed.
3. Edit scene order, title, visual direction, on-screen caption and duration.
4. Choose a saved image or video for each scene. Set a video in point when needed.
5. Optionally select saved audio and its in point. Otherwise, a video keeps its existing audio and a still-image scene is silent.
6. Choose **Save plan** to preserve an immutable editable version, then **Assemble film** to render a real 1280×720 MP4 and timed VTT captions.
7. Download the **Portable player ZIP** for independent playback. Export the full project when you want native editable history and all sources restored into another installation.

Each scene can last 1–30 seconds; the full story is limited to three minutes. Video and audio selections must fit within their actual source durations. The renderer rejects missing media, cross-project references and invalid timing.

The player ZIP includes `index.html`, the MP4, captions, source text, scene plan and selected source media. Extract the complete ZIP before opening it. It needs no Comfy account for playback. The full project archive is the restore format for the studio’s editable project, while the player ZIP is a portable deliverable.

**Prepare new media** opens the normal creation controls with the scene direction. It does not start generation. Choose a model, review settings and explicitly generate when new visuals or sound are wanted, then select the completed saved result in the scene.

PDF/Word extraction, automatic translation, inferred narration and autonomous multi-stage model submission are not implemented by this local planning tool.

## Credits and the next paid checks

**This implementation pass submitted no paid Comfy model generations, consumed zero inference credits and made no additional purchases.**

For illustration, a 4,200-credit budget is not a promise that every one of the six outcomes can be completed within it. This example is not a verified account balance, checkout price or subscription entitlement. Cost depends on the chosen provider, duration, resolution, geometry/texture settings, workflow runtime, retries and quality iterations. Access problems can also remain after credits are added.

Use this sequence when your funded workspace key is configured:

1. Confirm the personal workspace’s access and balance with read-only checks.
2. Confirm the actual model/workflow and its price before submitting the first test.
3. Run one short music sample, one short dubbing sample, one short speech-cleanup sample and one normal-quality image-to-3D sample, inspecting each result before repeating it.
4. Record request IDs, settings, consumed credits, saved output files and observed quality.
5. Keep document assembly and other local feature testing on saved assets whenever that is sufficient.
6. Leave Kling extension visibly blocked until the provider accepts a compatible source and returns a valid saved continuation.

Do not treat a published price for another music model as Pika Music’s price. The earlier [testing budget](comfy-testing-budget-2026-11-03.md) is a dated, conditional set of assumptions, not a charge guarantee for these particular routes.

## Cloud links, Render and the local version

The existing studio has two cloud entry points:

| Entry point | Role |
| --- | --- |
| [open-take-studio-review.vercel.app](https://open-take-studio-review.vercel.app/) | The submitted Vercel URL forwards the full application to Render while retaining the Vercel address. |
| [open-take-studio.onrender.com](https://open-take-studio.onrender.com/) | Direct access to the same application server and persistent storage on Render. |

**Render is still required for the current cloud deployment.** Vercel forwarding does not move the persistent application server, SQLite database or managed media off Render. Cancelling Render without migrating that backend would break the current cloud route.

The hostnames use separate browser cookies and reviewer workspaces. Return through the same URL/browser, or transfer your work with an editable project export. The application code is shared; browser sessions are not automatically shared across these domains.

Local installation needs no Render or Vercel subscription. It runs the application, database, saved media and local rendering on your own computer. New AI generation still calls the configured Comfy/provider service. Previously downloaded media, local edits and portable exports do not disappear merely because inference credits run out.

### Quick local setup

Use the current authoring branch rather than the immutable competition source snapshot:

```sh
git clone --branch codex/authoring-live --single-branch https://github.com/sidbug248/open-take-studio.git
cd open-take-studio
npm ci
node -e "const fs = require('node:fs'); if (!fs.existsSync('.env')) fs.copyFileSync('.env.example', '.env', fs.constants.COPYFILE_EXCL);"
npm run build
npm start
```

Use Node.js 22.16 or newer; Node 24 is recommended. On Windows PowerShell, use `npm.cmd` if the shell blocks the `npm.ps1` wrapper. Open **http://127.0.0.1:4310**. For development, use `npm run dev` instead of the production start, with one server using a given database and port.

The new changes described above appear in a fresh clone only after they are pushed to that branch. This document itself does not establish a push or deployment.

Leave `COMFY_API_KEY` empty for saved-media work, or set it privately for hosted generation. A fresh clone begins with an empty local workspace; it does not download the author’s private project library. Import your own editable project export to move work from cloud to local, and preserve/back up the local `data` directory when upgrading. Full requirements and installation details are in the [README](../README.md#install-the-current-studio-locally).

## Validation record

The focused document-story tests used actual local image, video and audio fixtures. They verified both scene images in the encoded film, audible audio in each scene, video dimensions/duration, timed captions, portable ZIP contents, idempotent retries, invalid timing rejection, project isolation, immutable source plans, and full project export → import → re-render. No model jobs were created by those tests.

The document-story component does not read, log or persist Comfy credentials. Its source and captions are rendered through escaped React text, and its media assembly calls local application routes. The optional generation handoff prepares a draft; model execution remains an explicit action in the existing generator.

The integrated production build passed and all **267 tests passed** at the release checkpoint. Deployment is still pending: the final release report must identify the actual deployed commit and any subsequently funded generation evidence. This guide does not substitute local fixture results for funded provider evidence.
