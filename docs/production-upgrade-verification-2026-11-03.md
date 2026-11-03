# Production upgrade verification — 2026-11-03

Application release: [`514d53bed0e6bf170620cec8a2aeeddfabc205e2`](https://github.com/sidbug248/open-take-studio/commit/514d53bed0e6bf170620cec8a2aeeddfabc205e2).

This report covers the five production upgrades added after the competition submission. The original submission tag and release assets are unchanged. **No Comfy inference credits were used and no real social posts were sent during this validation.**

## Release and automated checks

- The final local automated suite passed **231 tests**. Type checking, the production build, and the release-file boundary check passed.
- GitHub CI passed for the deployed application commit.
- Both [Render](https://open-take-studio.onrender.com/) and the [submitted Vercel URL](https://open-take-studio-review.vercel.app/) returned HTTP 200 with the new `index-CBc1Gs3n.js` application bundle. Vercel forwards to the same Render application and persistent storage.

## Original work preserved

The preservation receipt verified **462 of 462 original local assets**, totaling **848,922,299 bytes**, against their saved SHA-256 hashes. No original asset IDs, records or media files were missing or mismatched.

The live check independently confirmed the same **19 original approved projects, 55 demonstrated capabilities and 167 demonstration records** on both origins. Their 234 public asset ID/hash/size records match. These public records are a selected subset of the library; this check does not claim a fresh byte-by-byte enumeration of Render's entire persistent disk.

## Live checks

| Surface | Verified behavior |
| --- | --- |
| Render production canvas | Saved source → rendered contact sheet → completed delivery ZIP. The graph run was saved, the ZIP downloaded, and its CRC/content integrity checked. |
| Render invited review | The invitation exposed only selected PNG/video media. A 1.5-second timecoded comment and approval of the exact review version were saved. |
| Render and Vercel MCP | Actual MCP SDK clients initialized, discovered scoped tools, read exact source bytes, resized a local PNG to 96 × 72, and reused the same output on retry. Stored/downloaded hashes matched and no generation jobs were created. |
| MCP cleanup | Temporary tokens on both origins were revoked; subsequent requests returned 401. Both isolated QA sessions signed out. |
| Review invitation cleanup | The QA invitation was revoked, and the standalone review page subsequently denied access. |
| Square client delivery | The live UI produced and downloaded a 5,687,087-byte ZIP with valid CRCs. The formatted PNG and MP4 were both exactly 1080 × 1080; ffprobe measured the video at 5.166667 seconds. The package included original PNG/MP4 files, formatted media, a caption, delivery manifest and README. |
| Vercel visual check | Reload showed all 19 original approved collections and their varied gallery. The Studio MCP panel displayed connection name, expiry, local-editing permission and connection creation; no additional token was created. |
| Publishing controls | Render showed the Mastodon publishing adapter and kept approval disabled without configured credentials. No external post was made. |

The browser checks and MCP checks use isolated reviewer workspaces and existing or synthetic media. They do not grant access to the owner's private projects or credentials. Temporary QA projects remain private and expire with their workspaces.

See the [detailed live MCP report](live-mcp-verification-2026-11-03.md) and [sanitized machine-readable receipt](live-mcp-verification-2026-11-03.json) for host-specific results and hashes.

## Scope that remains unverified

Funded generation with a reviewer's Comfy key was not exercised. The scheduled publishing connector was verified through local HTTP contract tests, including explicit approval, persistence and uncertain receipts; no real social account was connected or used to publish. The six inference-dependent catalogue outcomes remain explicitly planned.

See [the five-tool usage guide](five-production-upgrades.md) for operation limits and [the Comfy testing budget](comfy-testing-budget-2026-11-03.md) for conditional live-inference costs.
