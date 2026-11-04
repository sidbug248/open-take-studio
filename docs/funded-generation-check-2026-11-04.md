# Funded generation check — November 4, 2026

## What was exercised

A funded personal Comfy workspace key was loaded by the local production studio. Requests were submitted through the studio's existing generation and native-workflow routes, and returned media was collected into its managed library. This verifies real provider execution from the local app; it does not establish a funded end-to-end run from a hosted reviewer browser session.

Four native Comfy Cloud runs completed. The original Pika Router request was rejected as unavailable, so it was not retried. Sonilo provides the working native music alternative.

| Route | Result | Collected output | Observed balance change |
| --- | --- | --- | --- |
| Pika Music through Comfy Router | HTTP 403, `not_enabled`; no output | Provider explicitly reported that this model is not served by Router yet | No observed debit |
| VEED Clean Audio, native workflow | Completed | 6.9-second, 48 kHz mono FLAC; 244,864 bytes | $0.014300 |
| VEED Dubbing Standard, native workflow; English to Spanish | Completed | 5.24-second 1056×608 H.264 video with 44.1 kHz mono AAC; 1,952,886 bytes | $0.572000 |
| Meshy image-to-3D, native workflow; 7.1, geometry only | Completed | Valid GLB 2.0; one mesh, 24,484 vertices and 26,357 triangles; 942,684 bytes | $1.144000 |
| Sonilo Text to Music, native workflow; requested 10 seconds | Completed | 10.054-second, 44.1 kHz stereo FLAC; 681,652 bytes | $0.032175 |

The Meshy run deliberately omitted texturing and ultra mode. A missing texture is therefore not an output failure.

## Measured cost

The account's reported balance fell from **1,991.0000 cents** to **1,814.7525 cents** during these sequential checks: an observed difference of **$1.762475**, approximately **372 Comfy credits** at 211 credits per dollar. The final check was at **2026-11-04 06:36:17 UTC**. Approximately **3,829 credits** remained.

These are observed balance differences, not fixed quotations for every future request. Model settings, duration, provider prices and billing timing can affect cost. In particular, the live Sonilo node badge displayed $0.0025 per second, while the observed ten-second debit was $0.032175; the lower badge should not be treated as a guaranteed price.

No further paid runs were queued after this check.

## Verification and limits

- All successful jobs reached completed status, recorded their native Cloud execution, and saved their outputs in the local managed library.
- FFmpeg decoded the cleanup, dubbing and music outputs successfully. Duration, streams and non-silent audio signal were checked.
- The GLB header, declared length, JSON/binary chunks, nonempty mesh and finite coordinate bounds were checked.
- The original input files were preserved. The local database retained 19 projects and contained 474 assets after the workflow definitions, execution records and outputs were saved. No jobs remained active.
- **Listening quality was not reviewed.** Automatic approval review blocked transferring complete generated audio from the laptop for listening; local signal/format checks do not prove translation accuracy, voice naturalness, music quality or cleanup effectiveness.
- The dubbing source depicts a character facing away, so this sample does not establish visible lip-sync quality.
- The Meshy output's visual resemblance to its source has not been assessed.
- Funded generation through the hosted reviewer connection flow remains unverified. A key saved in the local `.env` does not automatically connect a reviewer session on Render or Vercel.

## Output integrity

| Output | SHA-256 |
| --- | --- |
| VEED cleanup FLAC | `c4614897944c1f8c38cc799613ccffd2060551129bc7ec868128101d21aeb3c1` |
| VEED dubbed MP4 | `b897ca56aabc6640589a1bcae55435c6af96175b1890ad91ad61e3fc201ddc66` |
| Meshy GLB | `d7fd757118a49c43840a2c06828162d47f753d1607f787836c8f0de08d70fb63` |
| Sonilo music FLAC | `2fc9515d95789366539570a8f557a33593d352ab3196717c99d4c70e30c46fb8` |

The private execution records remain with the local workspace. This public report contains no API keys or credential material.

## Remaining provider constraints

Pika Music is unavailable through the tested Router route even with a funded key. The application should direct new music work to the Sonilo native starter and retain the precise Pika reason instead of treating it as an insufficient-credit error. Kling extension still requires a compatible provider predecessor contract; purchasing credits alone does not resolve that constraint.

The original `v0.1.0-submission` tag remains unchanged.
