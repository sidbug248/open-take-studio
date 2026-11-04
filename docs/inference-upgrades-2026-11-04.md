# Inference upgrades and document stories — November 4, 2026

## Current status

The five earlier production upgrades are implemented in the current studio. Of the next six outcomes, **five are implemented**: standalone music, image-to-3D, translation/dubbing, speech cleanup and document-to-story. **Legacy Kling extension remains unavailable** because the native node accepted only retired Kling 1.x predecessors; separately labeled saved-frame H3 continuation and local clip assembly remain available. Implementation and successful execution do not by themselves establish output quality.

Application commit [9e98c8f](https://github.com/sidbug248/open-take-studio/commit/9e98c8fa14d720ee9f0ada89c7b5f43b766b862a) was verified locally and through both cloud URLs. All three served the same application bundle, and the catalogue exposed the native Sonilo music route. [GitHub CI passed](https://github.com/sidbug248/open-take-studio/actions/runs/41787424288). The original competition tag is a separate, unchanged snapshot.

| Outcome | Current route | Verified | Still needed |
| --- | --- | --- | --- |
| Standalone music | Native **Sonilo Text to Music** → FLAC | Separate local and hosted reviewer API executions completed, each saving a 10.054-second stereo FLAC. The starter is available in Native Workflows and from Compose standalone music in the Catalogue. | Listening and musical-quality review; paid browser-click admission is not claimed. Pika Music returned `403 not_enabled` through Router and stays unavailable. |
| Image to 3D | Native **Meshy 7.1**, saved image → geometry → GLB | Geometry-only and separate textured 2K runs completed. The textured GLB contains UVs and a 2048×2048 embedded image; four rendered views showed recognizable bottle, cap and pedestal with amber color and approximate shape. | Advanced PBR, physically transparent glass fidelity and hosted execution of this native workflow remain unverified. The pedestal color differs from the source. |
| Translation and dubbing | Native **VEED Standard**, speech video → translated video | A funded English-to-Spanish run saved a playable MP4 with an audio track. | Listening, translation and voice-quality review; a suitable front-facing speech sample for lip-sync review; hosted execution of this native workflow. |
| Speech cleanup | Native **VEED Clean Audio**, saved speech → FLAC | A funded run saved a valid, non-silent 48 kHz mono FLAC. | Listening comparison against the source; hosted execution of this native workflow. |
| Document to finished story | Local text ingestion, editable scene plan, saved-media assembly, captions and portable player | Real MP4/ZIP creation, source preservation, project export/import and re-render were tested. The hosted document-story journey was checked at the earlier release. | Optional further creative examples. PDF/Word extraction and autonomous AI story production are outside this implementation. |
| Kling extension | Legacy `kling/videos-video-extend` adapter, unavailable | The real Kling 2.6 predecessor failed. Official Comfy source removed the native node because it accepted only retired Kling 1.x predecessors. | Do not repeat the incompatible request. Use a saved frame to generate a separate H3 shot, or assemble saved clips. These alternatives are not native Kling extension. |

The [funded verification record](funded-generation-check-2026-11-04.md) separates the initial four local native runs from the later textured Meshy, hosted FLUX 3 canvas and hosted native Sonilo checks. The canvas produced one image, completed local resize/delivery steps and verified save/reopen plus a hash-identical local restore. Hosted Sonilo saved a new stereo FLAC and its executed graph; fresh reopen/export and local restore retained identical audio with no active imported jobs. The browser connection dialog and draft preservation were checked separately; a paid browser-click submission and hosted execution of every native workflow are not implied.

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

The starter defaults to textured Meshy 7.1 geometry at 2K, a 30,000-polygon target, triangle topology and the normal geometry pass. PBR and ultra mode are off. The first funded check deliberately disabled textures. A later, separate textured 2K run completed with UVs, an embedded 2048×2048 JPEG and an opaque material, costing $1.716. Basic visual review found a recognizable bottle, cap and pedestal with amber color and an approximate silhouette; pedestal color differs. PBR was off, so advanced PBR and physically transparent glass fidelity are not claimed.

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

The initial implementation stage used no paid inference. The first funded pass completed four local native runs for **$1.762475**, approximately **372 credits** at 211 credits per dollar. The later hosted FLUX 3, textured Meshy and hosted native Sonilo checks cost **$1.806804994**, approximately **381.24 credits**. The balance after those checks was **$16.340720006**, approximately **3,447.89 credits**; this is a recorded checkpoint, not a live balance or a guarantee for future work. Prices depend on provider, duration, geometry/textures, resolution, runtime and retries.

The useful remaining work is:

1. Listen to the saved music, cleaned speech and dubbing; compare cleanup and dubbing with the originals.
2. The textured Meshy GLB has received a basic four-view visual review. Advanced PBR, physical glass materials and exact source fidelity remain separate from that check.
3. The hosted reviewer API canvas path completed one paid image, downstream local processing, save/reopen, export and local restore. A separate hosted Sonilo workflow also completed. A paid browser-click admission and hosted checks of other native models remain distinct.
4. A suitable front-facing dubbing sample remains necessary to assess visible lip synchronization; the saved source faces away. No automatic repeat of the completed texture request is needed.
5. Keep the retired Kling extension disabled. Use the existing [saved-frame continuation and film tools](kling-continuation-status-2026-11-04.md); do not spend credits repeating a rejected Kling 2.6 predecessor.

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
- The initial funded native pass saved four outputs; their metadata, hashes, costs and limitations are in the separate funded report. A later textured 2K Meshy output was collected and received a basic four-view review.
- The Sonilo starter change passed **34 focused tests**, the production build and full GitHub CI. Local, Render and Vercel returned the same new application bundle and native music catalogue route.
- A later hosted reviewer API check produced one FLUX 3 image, resumed its graph through local resize and packaging, reopened the hosted project and restored the export locally with matching output hashes and no new inference.
- A separate hosted native Sonilo workflow completed, saving a 10.054-second stereo FLAC, executed graph and project export. Fresh reopen/export and local restore passed with byte-identical audio, remapped workflow references and no active imported jobs. The test credential was disconnected afterward; listening quality remains unreviewed.
- Browser checks separately confirmed that Generate opens the key dialog, dismissal retains the draft, and a full reload retains the draft. They did not perform paid browser-click admission.
- The archived competition tag remains unchanged. Deployment of subsequent source changes must be verified separately; these receipts do not attest an unpushed commit as live.
