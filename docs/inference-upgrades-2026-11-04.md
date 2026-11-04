# Inference upgrades and document stories — November 4, 2026

## Current status

The five earlier production upgrades are implemented in the current studio. Of the next six outcomes, **five are implemented**: standalone music, image-to-3D, translation/dubbing, speech cleanup and document-to-story. **Kling extension remains blocked** by provider compatibility. Implementation and successful execution do not by themselves establish output quality.

Application commit [9e98c8f](https://github.com/sidbug248/open-take-studio/commit/9e98c8fa14d720ee9f0ada89c7b5f43b766b862a) was verified locally and through both cloud URLs. All three served the same application bundle, and the catalogue exposed the native Sonilo music route. [GitHub CI passed](https://github.com/sidbug248/open-take-studio/actions/runs/41787424288). The original competition tag is a separate, unchanged snapshot.

| Outcome | Current route | Verified | Still needed |
| --- | --- | --- | --- |
| Standalone music | Native **Sonilo Text to Music** → FLAC | A funded 10-second request completed and saved stereo audio. The starter is available in Native Workflows and from Compose standalone music in the Catalogue. | Listening and musical-quality review; funded hosted reviewer run. Pika Music returned `403 not_enabled` through Router and stays unavailable. |
| Image to 3D | Native **Meshy 7.1**, saved image → geometry → GLB | A funded geometry-only run saved a structurally valid GLB with a nonempty mesh. | Visual resemblance/usability review; funded textured variant and hosted reviewer run. |
| Translation and dubbing | Native **VEED Standard**, speech video → translated video | A funded English-to-Spanish run saved a playable MP4 with an audio track. | Listening, translation and voice-quality review; a suitable front-facing speech sample for lip-sync review; funded hosted reviewer run. |
| Speech cleanup | Native **VEED Clean Audio**, saved speech → FLAC | A funded run saved a valid, non-silent 48 kHz mono FLAC. | Listening comparison against the source; funded hosted reviewer run. |
| Document to finished story | Local text ingestion, editable scene plan, saved-media assembly, captions and portable player | Real MP4/ZIP creation, source preservation, project export/import and re-render were tested. The hosted document-story journey was checked at the earlier release. | Optional further creative examples. PDF/Word extraction and autonomous AI story production are outside this implementation. |
| Kling extension | Existing `kling/videos-video-extend` adapter | Compatible-provider-video checks are present; the tested source was rejected. | A supported predecessor/dispatch contract and a successful saved continuation. Purchasing credits alone does not fix this. |

The [funded verification record](funded-generation-check-2026-11-04.md) contains actual output properties, hashes, observed costs and quality limitations. The successful paid runs went from the **local studio to Comfy Cloud**. A paid generation through a hosted reviewer browser session remains unverified.

## Connect your Comfy workspace

Use a key from the workspace whose credits and service access you intend to use. Funding one workspace does not fund an existing key from another workspace.

1. Select the intended workspace in [Comfy API key settings](https://platform.comfy.org/profile/api-keys).
2. **Local studio:** update `COMFY_API_KEY` in the private project `.env`, then restart the studio.
3. **Cloud studio:** choose **Connect Comfy** and enter the key in the connection dialog. This connects that private reviewer session; it does not update a local installation.
4. A reviewer workspace remains bound to its original key. To use a different workspace key, export existing work and start a fresh reviewer workspace.
5. Review the model, duration and settings before explicitly choosing Generate or Run. Connecting a key never starts generation automatically.

Read-only access and balance checks used by [the credential probe](https://github.com/sidbug248/open-take-studio/blob/codex/authoring-live/server/reviewer-credentials.ts):

- `GET https://api.comfy.org/v2/models?limit=1`
- `GET https://cloud.comfy.org/api/billing/usage/timeseries?months=1&group_by=product&granularity=month`

An accepted key does not guarantee sufficient funds or model entitlement. A zero balance affects new hosted generation; saved media and local composition remain usable. Do not put API keys in chat, prompts, client code, project packages or Git.

## Use the tools

### Compose music

In a project, open **Native Workflows** and choose **Compose music**, or use **Compose standalone music** in the Catalogue. Save the Sonilo starter, edit the musical direction and duration, validate the workflow, then explicitly choose **Run**.

The starter uses `SoniloTextToMusic` followed by `SaveAudioAdvanced` with FLAC output. It defaults to **10 seconds**, accepts durations of 1–360 whole seconds and directions of 1–1,000 characters, and does not submit a reference voice or song cover. Sonilo currently ignores the seed; it does not guarantee a reproducible composition.

A completed track is saved as a new asset for the audio mixer, motion compositions or document-story scenes. Saving or editing a starter does not execute it.

**Do not choose Pika Music for the current working route.** The Router adapter has a validated request contract but the funded request returned `403 not_enabled`. Sonilo is a separate native workflow, not a successful Pika execution.

### Create geometry from an image

Choose **Image to 3D**, bind a saved image from the current project, review geometry/texture options, validate the workflow and explicitly choose **Run** when ready to spend credits.

The starter defaults to textured Meshy 7.1 geometry at 2K, a 30,000-polygon target, triangle topology and the normal geometry pass. PBR and ultra mode are off. The funded check deliberately disabled textures; it does not validate the textured default.

The image is connected to the geometry-generation node. This is separate from the existing Router text-to-3D preview/refine route. The resulting saved GLB can be downloaded and inspected with the spatial tools. Check shape, orientation and visual fidelity before treating it as a finished asset.

### Translate and dub a speech video

Choose **Translate and dub**, bind a saved video containing speech and set the source and target languages. The preset uses **VEED Standard**; the source can be detected automatically when desired.

The source must contain an audio track and be no longer than 599 seconds. Begin with a short clip. After execution, compare translated words, pronunciation, voice treatment and timing with the original. Use a front-facing speaker when assessing visible lip synchronization.

The funded check translated a short English clip into Spanish and saved an MP4. Its character faces away, so that sample cannot verify visible lip-sync quality. The original remains a separate asset.

### Clean a speech recording

Choose **Clean speech**, bind a saved audio file and review strength/loudness controls. Defaults are strength 0.874 and normalization at −19 LUFS, with FLAC output. Sources may be up to 1,799 seconds.

This native speech-isolation route can remove music and sound effects along with noise. Keep the source and listen to both before changing a soundtrack selection. The funded run saved 48 kHz mono speech; audio signal and decoding checks do not establish that it sounds better.

The previous Router cleanup route is still distinct from this working native VEED alternative.

### Make an editable story from text

Open **Document story** in a project containing source media.

1. Paste text or import `.txt`, `.md` or `.markdown`, up to 60,000 characters.
2. Choose **Plan scenes**. The app groups paragraphs locally into 1–8 editable scenes; this is not AI script inference or summarization.
3. Edit scene order, titles, visual directions, captions and durations.
4. Choose a saved image or video for every scene and set video in points when needed.
5. Optionally choose saved audio and its in point. Without it, a video keeps its audio and a still-image scene is silent.
6. Choose **Save plan**, then **Assemble film** for a real 1280×720 MP4 with timed VTT captions.
7. Download the **Portable player ZIP** for independent playback. Export the full project to restore editable history and sources in another studio installation.

Scenes may last 1–30 seconds, with a three-minute total. Media selections must fit their actual source durations. The renderer rejects missing or cross-project media and invalid timing.

The player ZIP includes `index.html`, the film, captions, source text, scene plan and selected media. Extract it fully before opening it; playback needs no Comfy account. The full project archive is the editable restore format.

**Prepare new media** opens the ordinary creation controls using the scene direction. It does not start generation. Select a model and settings, generate explicitly if needed, then use the saved result in the scene.

PDF/Word extraction, inferred narration, automatic translation and autonomous multi-stage generation are not implemented by this local planning tool.

## Credits and remaining checks

The initial implementation stage used no paid inference. The later funded check completed four native runs and observed a balance decrease of **$1.762475**, approximately **372 credits** at 211 credits per dollar. About **3,829 credits remained at the recorded check time**; this is historical evidence, not a live balance or a guarantee for future work. Prices depend on provider, duration, geometry/textures, resolution, runtime and retries.

The useful remaining work is:

1. Listen to the saved music, cleaned speech and dubbing; compare cleanup and dubbing with the originals.
2. Visually inspect the GLB. A nonempty valid file is not enough to judge asset quality.
3. Exercise one short funded creation through the hosted reviewer flow, then save, reopen and export it. This tests the actual cloud session path.
4. Test a textured Meshy output or an appropriate lip-sync sample only when that variant is needed and its cost is reviewed.
5. Resolve Kling's provider compatibility before attempting another billable extension.

Automatic approval review blocked transferring the complete private audio clips for assistant listening. Local metadata/decoding checks continued; listening quality remains unreviewed. Do not turn those file checks into a quality claim.

Read the [funded execution report](funded-generation-check-2026-11-04.md) for exact observations. The earlier [testing budget](comfy-testing-budget-2026-11-03.md) remains a dated, conditional planning document.

## Cloud and local installation

| Entry point | Role |
| --- | --- |
| [Submitted Vercel URL](https://open-take-studio-review.vercel.app/) | Opens the full studio and forwards requests to Render while retaining the Vercel address |
| [Direct Render URL](https://open-take-studio.onrender.com/) | Opens the same application server and persistent storage |

**Render is still required for the current cloud deployment.** Vercel forwarding does not move the persistent server, SQLite database or media storage away from Render.

The hostnames have separate browser cookies and reviewer workspaces. Return through the same URL/browser, or transfer your work through an editable project export.

Local installation requires neither a Render nor Vercel subscription. The app, database, media and local rendering run on your computer; new AI generation uses the configured hosted Comfy/provider service. Saved media does not disappear when inference credits run out.

Install the current application branch:

```sh
git clone --branch codex/authoring-live --single-branch https://github.com/sidbug248/open-take-studio.git
cd open-take-studio
npm ci
node -e "const fs = require('node:fs'); if (!fs.existsSync('.env')) fs.copyFileSync('.env.example', '.env', fs.constants.COPYFILE_EXCL);"
npm run build
npm start
```

Use Node.js 22.16 or newer; Node 24 is recommended. Windows PowerShell may require `npm.cmd` if the shell blocks its PowerShell wrapper. Open **http://127.0.0.1:4310**. For development use `npm run dev` instead, with only one server using a database and port.

A fresh clone does not include private projects or the cloud showcase. Import your own editable project archive to move work between installations. Keep and back up the local `data` directory when upgrading. See the [README](../README.md#install-the-current-studio-locally).

## Evidence chronology

- The initial implementation checkpoint passed **267 tests** and the production build. Its no-paid-generation statement described that earlier stage.
- Document-story tests used real image/video/audio fixtures and checked encoded scene content, audio signal, dimensions/timing, captions, ZIP contents, retries, project isolation and export → import → re-render.
- The subsequent funded native runs saved four outputs; their metadata, hashes, costs and limitations are in the separate funded report.
- The Sonilo starter change passed **34 focused tests**, the production build and full GitHub CI. Local, Render and Vercel returned the same new application bundle and native music catalogue route.
- None of these observations changes the archived competition tag or establishes a funded hosted reviewer run that has not occurred.
