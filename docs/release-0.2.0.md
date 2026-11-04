# Open Take Studio 0.2.0

**Version 0.2.0 — verification recorded November 4, 2026.** This record identifies the exercised production paths and the remaining verification boundaries.

Open Take Studio combines branching films, directed 3D scenes, sound-driven motion, native Comfy workflows and portable projects. This release collects the post-submission production tools and cloud/local access improvements into one versioned source package.

## Open or install

| Route | Entry point |
| --- | --- |
| Full cloud studio through the submitted address | https://open-take-studio-review.vercel.app/ |
| Full cloud studio directly | https://open-take-studio.onrender.com/ |
| Stable source release | https://github.com/sidbug248/open-take-studio/releases/tag/v0.2.0 |
| Continuing development | https://github.com/sidbug248/open-take-studio/tree/codex/authoring-live |
| Preserved competition snapshot | https://github.com/sidbug248/open-take-studio/releases/tag/v0.1.0-submission |

Vercel forwards the full application to Render, which supplies the persistent server and disk. Both addresses run the same application; their browser cookies and private workspaces are separate. Local installation needs neither hosting subscription. New hosted AI inference requires an authorized funded Comfy workspace key, service access and an internet connection. Saved media, local editing and portable playback do not use Comfy inference credits.

Follow the [README installation commands](../README.md#install-the-current-studio-locally). The stable commands select `v0.2.0`; developers can select `codex/authoring-live`. The default `main` branch retains the competition application with updated public documentation and proxy responsibilities.

A fresh local installation starts with an empty workspace. Import your own editable `.opentake.zip` project to move work from a cloud workspace or another installation. Cloud and local media do not synchronize automatically.

## Supported scope

| Tool | Implemented behavior | Verification boundary |
| --- | --- | --- |
| Production canvas | Saved typed graphs, image transforms, contact sheets, delivery ZIPs and resumable local runs; explicit optional generation handoff | A real hosted FLUX image completed its local downstream graph, save/reopen, export and byte-identical local restore. Fault injection uses test providers. |
| Shared review | Version-specific invitations, viewer/commenter/approver roles, timecodes, decisions and revocation | Invitation labels are not verified user identities. Review discussion remains in the workspace database and is not in portable project ZIPs. |
| Client delivery | Original, square, portrait and landscape media packages with captions and hashes | Source preservation, actual encodings and ZIP contents are covered by automated tests. |
| Studio MCP | Expiring project-scoped Streamable HTTP read and local-write tools | No token grants AI generation, social publishing or arbitrary host access. |
| Scheduled publishing | Prepared and explicitly approved Mastodon posts | Real external posting remains unverified; other platforms use manual delivery packages. |
| Standalone music | Native Sonilo workflow, saved FLAC and use in sound/motion compositions | Real local and hosted reviewer API runs, output integrity and restore checks passed. Listening quality remains unreviewed. |
| Image to 3D | Native Meshy geometry and textured 2K GLB, editable in spatial tools | Real outputs and a basic four-view visual review passed. Advanced PBR, transparent glass fidelity and hosted model-specific execution are unverified. |
| Translation and dubbing | Native VEED Standard speech-video translation | Initial local execution and a corrected complete-input hosted reviewer API run passed. Offline transcription retained all three clauses in Spanish. Audible naturalness and visible lip-sync remain separate checks. |
| Speech cleanup | Native VEED Clean Audio, preserved source and saved FLAC | A real run, complete decoding and matching full source/output transcripts passed. Audible denoising improvement is unverified. |
| Document story | Local text/Markdown scene planning, saved-media assembly, MP4, captions and portable player | Actual output, project export/import and re-render were tested. PDF/Word parsing and autonomous AI production are not implemented. |
| Video continuation | Saved-frame-conditioned H3 shot and local clip assembly | These produce a separate shot/cut. Legacy native Kling extension remains unavailable because its supported predecessor family was retired. |

Read the [five-tool guide](five-production-upgrades.md), [generation/story guide](inference-upgrades-2026-11-04.md), [funded execution record](funded-generation-check-2026-11-04.md) and [Kling route explanation](kling-continuation-status-2026-11-04.md) for detailed use and evidence.

## Speech-duration protection

Sync 3 now measures the selected performance video and speech track before a request can be admitted. When `cut_off` would discard more than a small timing tolerance from the speech, the UI displays both durations and the amount that would be omitted. The user must deliberately confirm that cut or choose another duration mode. Inputs and drafts stay intact.

The server rechecks the immutable media and selected settings before admission. Confirmation expires after 15 minutes, is invalidated by a project/input/settings change, and is not saved into recipes or exported drafts. This check does not contact Comfy or spend credits. Non-truncating inputs and other explicitly selected modes do not require cutoff acknowledgement.

## Closeout verification

| Check | Current evidence |
| --- | --- |
| Speech-duration protection | Implemented in commit `844dbb5`: measures saved streams, blocks speech truncation without explicit confirmation, invalidates confirmation when inputs/settings change, and rechecks before admission. Nineteen focused tests passed. |
| Corrected short Spanish dub | One hosted native VEED workflow completed for $1.0868. Full decoding and offline source/output transcription preserve all three clauses. The output and four-asset project package passed hash checks. |
| Browser flow | A targeted live Vercel pass on 0.2.0 imported video and narration, verified cutoff acknowledgement, invalidation after a settings change and Loop mode, then dismissed the no-key Connect dialog. Reload preserved the model, inputs and settings. Browser export preserved all three asset hashes and submitted zero jobs. Earlier desktop/responsive checks also cover browsing and remix. |
| Paid browser submission | Not verified. Paid hosted tests used the reviewer HTTP/API path. The browser's no-key dialog, draft retention and export were verified separately. |
| Fresh local first use | Passed against the 0.2.0 runtime: a clean Windows installation started without a key, imported a project, resized an image, built a delivery package, restarted/reopened, and exported/reimported with matching media hashes and zero new provider jobs. |
| Current recovery copy | Passed: refreshed Render-owner off-host copy, all manifest hashes, isolated restore/start and preserved record digests. A separate consistent local-owner snapshot includes the corrected dub, passes every file hash and SQLite integrity, and records zero active jobs. Reviewer databases and credentials are outside this owner backup scope. |
| Automated suite and build | Runtime `ddac90c8` passed all **274 tests**, with zero failures, skips or cancellations. TypeScript/Vite and compressed delivery build passed; the release boundary verified the immutable competition tag and excluded private workspace files. [Runtime CI also passed](https://github.com/sidbug248/open-take-studio/actions/runs/41909513085). |
| Cloud parity | Both Vercel and Render returned HTTP 200 for the homepage, reported 0.2.0 through the health API and served the exact same application bundle, `/assets/index-Ra5BLGUY.js`. The targeted browser journey above ran through Vercel's forwarded full studio. Direct Render visual inspection after reload preserved the cinematic hero, motion, object/sound cards and varied original collections. |
| Source package | Packaging specification: archive the exact `v0.2.0` Git tree as `Open-Take-Studio-0.2.0-source.zip` and publish `SHA256SUMS.txt` alongside it. Include committed source, documentation and safe configuration templates; exclude private workspaces, generated media, installed dependencies and credentials. |

### Audio evidence

Full-file decode, signal checks and offline speech recognition were completed locally. All six original review files decoded and showed no sample clipping. The narration and cleaned output retained the full 6.9-second script. Both music outputs were approximately 10.054 seconds.

The earlier dubbing input was shortened before translation by a Sync 3 `cut_off` request. A corrected input holds the final picture to retain all narration; that hold is not new lip animation. One subsequent hosted VEED request produced a 6.920-second video with 6.911995 seconds of audio. Offline transcription preserved the complete English content in Spanish, including the previously missing ending. It also resolved the earlier transcript-based closing-phrase concern. See the [source finding](funded-generation-check-2026-11-04.md#audio-follow-up-and-source-duration-finding) and [corrected hosted execution](funded-generation-check-2026-11-04.md#corrected-full-narration-hosted-dubbing).

The owner authorized audio review, but the reviewing assistant session lacks audio-input support. No listening-based assertion about music, naturalness or cleanup quality is made.

### Persistence and recovery

Owner and reviewer workspaces use persistent Render storage. Owner backups and portable project exports solve different recovery needs. A new owner snapshot was copied from Render to a separate computer on November 4: all 2,474 file hashes, totaling 1,270,380,893 bytes, were verified. Empty-destination restore preserved all 11 table digests, 22 projects, 465 assets and every referenced media file. The restored 0.2.0 server started without a key and reopened an original project; stopping it retained the same record digests and zero active jobs.

A separate local-owner snapshot was created after importing the corrected Spanish dub: 2,539 files / 1,283,492,943 bytes, with every file hash verified and SQLite integrity reported as OK. It preserves 22 local projects, 488 assets and the corrected dub's four hash-identical assets and archived provider history, with zero active jobs. The existing local service was then restarted on 0.2.0 with the same configuration and data. Its 22 projects, 488 assets, 311 takes and 215 job records were unchanged, with zero active jobs and all four corrected-dub hashes preserved through the local API. This local snapshot and the Render-owner off-host copy cover their respective workspaces; cloud and local libraries do not synchronize automatically.

Automatic owner snapshots remain on the host until copied elsewhere. The verified independent copy above is a completed recovery checkpoint, not a claim of automatic continuous off-host replication.

Reviewer databases and encrypted credentials are not included in the owner's off-host backup pipeline. Reviewer access uses a seven-day anonymous browser session with no cross-device account recovery. Export a portable project before signing out, clearing cookies or moving browsers. Review comments and access secrets do not travel in that project package. See [reviewer access and persistence](reviewer-access-2026-11-03.md).

### Known boundaries

- A successful model request does not guarantee artistic quality, speaker naturalness or exact visual likeness.
- Hosted execution of every model and every parameter combination has not been tested. Availability depends on the user's workspace and provider.
- Physical-phone and actual hidden-tab playback were not established by the submission checks. Responsive desktop-browser checks have a narrower scope.
- No real social post was sent during validation.
- The source license covers the original application code. Third-party components, model services and generated media retain separate terms.

## Release identity and future work

The release receives its own `v0.2.0` tag. The original `v0.1.0-submission` remains at `b62f5e523877a8fa06d01b3a5d95e97de29a20cb`, with its original assets.

Additional 3D options, social destinations, model variants, cross-device accounts and catalogue expansion remain [future development opportunities](future-roadmap.md). They are not permanently rejected or scheduled by this closeout.

Copyright (c) 2026 Mohsin Siddiqi, trading as Eternity Flux Technologies. Original application code is MIT licensed.
