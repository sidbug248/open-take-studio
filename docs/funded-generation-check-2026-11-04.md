# Funded generation check — November 4, 2026

## What was exercised

The initial pass loaded a funded personal Comfy workspace key in the local production studio and collected real native-workflow outputs into its managed library. Later, separate hosted reviewer API checks through the Vercel URL exercised a paid Router recipe node with its downstream local graph, and a native Sonilo workflow. A further hosted VEED Standard check used complete narration and passed offline transcript comparison. These checks are recorded separately below; a paid browser-click submission is not claimed.

Four native Comfy Cloud runs completed in the initial pass. The original Pika Router request was rejected as unavailable, so it was not retried. Sonilo provides the working native music alternative.

| Route | Result | Collected output | Observed balance change |
| --- | --- | --- | --- |
| Pika Music through Comfy Router | HTTP 403, `not_enabled`; no output | Provider explicitly reported that this model is not served by Router yet | No observed debit |
| VEED Clean Audio, native workflow | Completed | 6.9-second, 48 kHz mono FLAC; 244,864 bytes | $0.014300 |
| VEED Dubbing Standard, native workflow; English to Spanish | Completed | 5.24-second 1056×608 H.264 video with 44.1 kHz mono AAC; 1,952,886 bytes | $0.572000 |
| Meshy image-to-3D, native workflow; 7.1, geometry only | Completed | Valid GLB 2.0; one mesh, 24,484 vertices and 26,357 triangles; 942,684 bytes | $1.144000 |
| Sonilo Text to Music, native workflow; requested 10 seconds | Completed | 10.054-second, 44.1 kHz stereo FLAC; 681,652 bytes | $0.032175 |

The Meshy run deliberately omitted texturing and ultra mode. A missing texture is therefore not an output failure.

## Measured cost

These sequential checks incurred an observed total of **$1.762475**, approximately **372 Comfy credits** at 211 credits per dollar. The final cost check was at **2026-11-04 06:36:17 UTC**. Account balances are retained only in private verification receipts.

These are observed balance differences, not fixed quotations for every future request. Model settings, duration, provider prices and billing timing can affect cost. In particular, the live Sonilo node badge displayed $0.0025 per second, while the observed ten-second debit was $0.032175; the lower badge should not be treated as a guaranteed price.

No further paid runs were queued at that initial checkpoint. Later checks and their own costs are recorded separately below.

## Initial native-workflow verification and limits

- All successful jobs reached completed status, recorded their native Cloud execution, and saved their outputs in the local managed library.
- FFmpeg decoded the cleanup, dubbing and music outputs successfully. Duration, streams and non-silent audio signal were checked.
- The GLB header, declared length, JSON/binary chunks, nonempty mesh and finite coordinate bounds were checked.
- The original input files were preserved. At that initial checkpoint, the local database retained 19 projects and contained 474 assets after the workflow definitions, execution records and outputs were saved. No jobs remained active at that checkpoint.
- **Listening quality was not reviewed.** The owner later authorized transfer for review, but the reviewing assistant session does not support audio input. The later local decode and offline transcription checks below are objective evidence; they do not establish voice naturalness, music quality or audible cleanup improvement.
- The dubbing source depicts a character facing away, so this sample does not establish visible lip-sync quality.
- The Meshy output's visual resemblance to its source has not been assessed.
- Those initial native runs were local, not hosted reviewer executions. A key saved in the local `.env` does not automatically connect a reviewer session on Render or Vercel. The later hosted Router check below verifies its own credential-bound session and does not certify each native workflow.

## Output integrity

| Output | SHA-256 |
| --- | --- |
| VEED cleanup FLAC | `c4614897944c1f8c38cc799613ccffd2060551129bc7ec868128101d21aeb3c1` |
| VEED dubbed MP4 | `b897ca56aabc6640589a1bcae55435c6af96175b1890ad91ad61e3fc201ddc66` |
| Meshy GLB | `d7fd757118a49c43840a2c06828162d47f753d1607f787836c8f0de08d70fb63` |
| Sonilo music FLAC | `2fc9515d95789366539570a8f557a33593d352ab3196717c99d4c70e30c46fb8` |

The private execution records remain with the local workspace. This public report contains no API keys or credential material.


## Hosted reviewer Production canvas and local restore

A separate funded **reviewer API session through https://open-take-studio-review.vercel.app/** completed exactly one `bfl/flux-3-image` request for a 768×768 image. The canvas recipe handoff retained the generation identity, collected the result, then resumed local nodes to produce a 384×384 image and delivery ZIP. Hosted save/reopen and project export were checked. This exercised the Vercel proxy, Render reviewer isolation, Router execution and media collection without falling back to the owner's generation key.

The observed balance change between **17:24:36 and 17:34:10 UTC on November 4** was **$0.05862999**, approximately **12.37 credits**. Only that one explicit FLUX 3 request was submitted between those snapshots. Graph resume, resize, delivery packaging and project import submitted no additional inference.

| Output | Bytes | SHA-256 |
| --- | ---: | --- |
| FLUX 3 image, 768×768 | 1,175,568 | `fe4ea6fc22e1d9dbe9ef8971a2a99365b3527060621db5a2e677ef917ca0a1f4` |
| Local resize, 384×384 | 415,320 | `41b6672524354478842a4628d424eacf046c3b55309fb147dd846e17343bf865` |
| Delivery ZIP | 416,364 | `6c9855413f94fc2e61f4cfe35b0bbe3d65685164926bd61cf2ff74ac1777ed42` |
| Editable project ZIP | 2,005,435 | `e4a22358933968b4b9ecb50618ac82fdcf6ebdf10f7979b8a0d3f1f01fd16a53` |

The project archive was imported into the local studio at **17:35:06 UTC**. Its four assets, one recipe and one archived provider job restored successfully; the graph's recipe references were remapped to the imported project. All three output files retained their original content hashes. The imported workspace had **zero active jobs**, and import did not resubmit generation.

The retained generation job is `420fe0d0-499d-435a-a20f-92a16a8735ac`; its graph run is `graph-run-182fc477f4a21ae0b00572829b8dbb47c02e41c270710ef9`. Credential material and reviewer session identifiers are excluded from this public report.

**Browser verification has a separate scope:** browsing did not force a key dialog; choosing Generate without a connection opened the dismissible dialog. Closing it retained the draft, and the draft survived a full reload. No paid browser-click submission was performed. The funded request above used the hosted reviewer API and does not substitute for that remaining browser-admission check or hosted execution of every native workflow.

## Additional textured 2K Meshy verification

A separate native Meshy 7.1 image-to-3D request completed with **2K textures, PBR off**. It saved a **4,295,260-byte GLB**, containing **29,189 vertices, 25,269 triangles**, UV coordinates, one embedded **2048×2048 JPEG** and an opaque material. The native Cloud execution is `24a92a58-3570-45ca-8d91-d302785aa518`; studio job `ddb807cb-b426-46e8-98cc-4125ebe51941` completed and retained the output.

A basic visual review inspected four actual rendered views using the embedded UV texture. The bottle, cap and pedestal are recognizable; amber color and the approximate silhouette are present, while the pedestal color differs from the source. This is not evidence of physically transparent glass or advanced PBR behavior; those modes were not enabled. Hosted reviewer execution of Meshy remains a separate, unverified route.

The GLB's SHA-256 is `db26a7607f42cd45f16f1ddd098114fe25edebe6410b52c3bb134034263c0d9f`.

The observed debit was **$1.716**, approximately **362.08 credits**. This was an additional variant check after the initial geometry-only run; it does not replace or relabel the first output.


## Hosted native Sonilo workflow

A separate **hosted reviewer API → native Comfy Cloud** execution requested one 10-second Sonilo music take and completed. It saved a **743,876-byte FLAC**, **10.05424 seconds**, **44.1 kHz stereo**, with SHA-256 `e01f45440cf54fc749dbd617fab3a1c75eb49ea7c01d562e397d9d64165017ed`. This is a real native workflow result, separate from the Router FLUX 3 canvas test and the earlier local Sonilo result.

Studio job `0da9ffba-38e3-431f-9446-27d4e121c865` records native Cloud execution `d2c2225e-bf00-4f7d-b23d-8ea6ed3c3ff4`. The **734,823-byte project export** retained three assets, including the workflow execution graph and output, with exactly one native generation job. A fresh hosted reopen, export and hash check passed, and FFmpeg decoded the entire FLAC without errors.

Local import restored three assets with remapped workflow references, one archived provider job and zero active jobs. The restored FLAC was byte-identical; import submitted no inference. After the checks, the hosted reviewer test credential was disconnected at **17:42:33 UTC** with HTTP 200 and connection state `missing`.

The observed debit was **$0.032175**, approximately **6.79 credits**. Successful execution, collection and audio metadata do not establish listening quality. Direct listening remains unverified because the reviewing assistant session does not support audio input. Transfer permission was granted; permission is no longer the limitation.

## Cost of this later verification pass

| Check | Observed USD | Approximate credits at 211/$1 |
| --- | ---: | ---: |
| Hosted FLUX 3 canvas handoff | $0.058629994 | 12.37 |
| Local textured 2K Meshy | $1.716000000 | 362.08 |
| Hosted native Sonilo | $0.032175000 | 6.79 |
| **Later pass total** | **$1.806804994** | **381.24** |

These costs are observed checkpoints, not fixed quotations or a plan allowance. The earlier four-run native check cost $1.762475 separately. Account balances and credential material remain in private verification receipts.

## Audio follow-up and source-duration finding

A later review used full-file decoding, local signal measurements and unprompted offline speech recognition. The owner authorized transferring clips for review, but the assistant session could not accept audio input. No auditory verdict is claimed. Offline transcription ran on the owner's computer without sending audio to an external transcription service, and this review submitted no additional Comfy request.

- All six original files decoded fully and had no non-finite samples or sample clipping.
- The 6.9-second narration and cleaned output produced the same complete transcript. The cleaned version was about 3.35 dB louder; that alone does not demonstrate a noise-removal benefit.
- Both Sonilo outputs were 10.054-second stereo files. Musical quality was not assessed by listening.
- The earlier English video had only 5.205 seconds of audio, matching the beginning of the 6.9-second narration. Its final phrase was absent before it reached VEED. Stored generation settings show that an earlier Sync 3 demonstration used `sync_mode: cut_off`.
- The Spanish transcript raised a possible meaning change in the closing phrase. This is an ASR-based concern, not a listening-confirmed pronunciation or translation verdict.

A local corrected input, `dubbing-source-full-narration-held-frame.mp4`, preserves all 6.9 seconds of the narration by holding the final video frame. Its video stream is 6.916992 seconds and its SHA-256 is `053ec8baf4cd7d41fd206425b18e778a6578488ae2fd04b5aef8d5d9beb1250c`. The held frame supplies no new mouth animation. This input preparation is separate from generating a corrected Spanish output.

The private reports retain the original hashes, objective measurements, offline transcriptions and source comparison. [Release 0.2.0 verification](release-0.2.0.md) records the subsequent duration protection and corrected-input execution separately. No private audio or credential files are included in the source release.

## Corrected full-narration hosted dubbing

One subsequent **hosted reviewer HTTP/API → native Comfy Cloud** VEED Standard workflow translated the complete-narration input from English to Spanish. Exactly one native generation job was submitted. The input preserves 6.9 seconds of narration in a 6.916992-second video by holding the final picture; it adds no new mouth animation.

| Result | Verified value |
| --- | --- |
| Dubbed MP4 | 2,064,554 bytes |
| Video duration | 6.920 seconds |
| Audio duration | 6.911995 seconds |
| Output SHA-256 | `be3112dff97d24fcc3d99d6fa537545483863b0384a1e914d598c00e25481cb7` |
| Initial editable project ZIP used for local restore | 3,813,645 bytes |
| Package integrity | All four asset hashes matched; exactly one generation job retained |
| Decode | Entire output decoded through FFmpeg successfully |
| Observed debit | $1.0868, approximately 229.31 credits at 211/$1 |

Unprompted offline transcription of the complete English source and Spanish output retained all three clauses: an idea begins with one frame, keep the take, and follow the light. This resolves the earlier test fixture's missing ending and the earlier transcript-based closing-phrase concern. The check evaluates recognized words and meaning; it is not direct listening, pronunciation, voice-naturalness or visible lip-sync approval.

The initial corrected project package was also imported into the local studio: all four asset hashes matched, exactly one completed generation was retained as archived history, and zero jobs became active. Import submitted no inference.

After the deployment restart, the hosted output still had the same media SHA-256. A later export refreshed its export timestamp and produced a 3,813,643-byte ZIP with SHA-256 `2cba414f7bcb831ba1efd168380991f85f1576de48c14ad1e12984f2139c4e31`; the earlier local-restore receipt refers to the initial ZIP above. This re-export submitted no inference and incurred no additional charge. The test reviewer's key connection was then removed.

The request used the hosted reviewer HTTP/API path. It verifies that workflow's funded execution, collection and export through the hosted service; a paid submission through browser controls remains unverified. No music or 3D generation was repeated for this correction.

This debit is separate from the earlier $1.762475 initial pass and $1.806804994 later pass. Observed costs are historical measurements, not fixed quotes or account-balance statements.

## Remaining provider constraints

Pika Music is unavailable through the tested Router route even with a funded key. The application should direct new music work to the Sonilo native starter and retain the precise Pika reason instead of treating it as an insufficient-credit error. Kling extension stays unavailable: Comfy removed its native extension node because it only accepted retired Kling 1.x predecessors. The Router schema remains published, but repeating the rejected Kling 2.6 predecessor is not justified. See the [official evidence and separately labeled continuation alternatives](kling-continuation-status-2026-11-04.md).

The original `v0.1.0-submission` tag remains unchanged.
