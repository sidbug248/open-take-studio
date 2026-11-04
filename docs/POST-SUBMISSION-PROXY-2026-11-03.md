# Post-submission studio routing — November 3, 2026

> **Historical rollout record.** Deployment IDs, counts and unfunded-generation statements below describe this November 3 release. A later November 4 hosted reviewer API check verified paid Router generation through the Vercel URL, local graph completion, save/reopen, export and local restore. See the [current execution record and separate browser scope](funded-generation-check-2026-11-04.md).

**Status: live and verified.** The full source suite passed **192 tests**, and the production build passed. Separate live HTTP and rendered-browser checks verified the submitted URL, session boundaries, existing-media authoring, downloads, and competition preservation. A fresh funded reviewer generation remains unverified.

- Application and Vercel routing source: `9af30dc9e25a03ec972a710042d2a92a20b17d8f`.
- Render deployment: `dep-dbl3ji56e07s73dimisg`.
- Vercel deployment: `dpl_FQYKN9Gr1L4ggy9WPwXj6PG98yJk`, READY, with both existing aliases retained.

## Entry points

- **Original submitted URL:** https://open-take-studio-review.vercel.app/ — serves the full studio through Vercel's native external rewrite to Render.
- **Direct application:** https://open-take-studio.onrender.com — the existing full application entry remains available.
- **Preserved competition demo:** https://open-take-studio-review.vercel.app/competition/ — the historical static review page and playable outputs are retained by the routing update.

Vercel and Render are different browser origins. Their private session cookies are scoped to their respective hostnames, so a reviewer workspace created on one URL does not automatically appear on the other. Return through the same URL and browser, or export/import a production package to transfer work. Owner sign-in remains separate at `/login`; public visitors do not need the owner's password.

## Anonymous browsing and explicit creation

Explore, catalogue, recipes, and approved example media are available without creating a reviewer session. A first visit does not reserve a private workspace or set its session cookie.

The client requests a workspace only for an explicit create, import, edit/remix, or key-connect action. Concurrent actions share the same pending session request. A successful visitor-to-reviewer transition keeps the existing interface mounted; the current prompt, selected files, and controls are not reset. If admission returns a capacity error, the draft stays in the current page with a clear retry action. It does not retry or submit generation automatically.

Opening the Connect dialog alone does not allocate a workspace. Submitting a key connection may do so. Keys use a masked field, never enter browser storage or URLs, and are cleared from the form. A missing or unusable key opens this dialog when Generate is chosen. Dismissing or completing the dialog preserves the draft; generation requires a separate explicit action.

Created reviewer sessions last up to seven days. Encrypted key connections expire after twelve hours and can be disconnected without discarding the workspace. Reconnect the same key for eligible pending-job recovery. A different key requires a separate workspace. Export before signing out or clearing cookies. There is no cross-device account recovery claim.

## Competition preservation

This is a post-submission hosting/access update. The immutable `v0.1.0-submission` tag, release archives, submitted demonstration, original media, and portable film are not replaced. The static review page moves to `/competition/`; existing root media, film, and download URLs remain routed to the same archived files. The pinned review ZIP SHA-256 remains:

`95f13e58d66e165712b6b440961897f8c4bda5f5fbadd0f83061c0534044b76e`

The original event credits have ended. New reviewer generation uses only that reviewer's connected Comfy key, credits, and model access. A fresh generation using a funded reviewer key remains **unverified**; provider isolation/recovery tests use mocks.

## Proxy finding and correction

The initial deployed forwarding-header probe found a real client-attribution weakness: visitor-supplied forwarding values could influence the identity observed behind the rewrite. This was a failed acceptance check, not a successful boundary verification.

The native Vercel rewrite now deletes incoming `X-Forwarded-For`, `X-Vercel-Forwarded-For`, and `X-Real-IP`. Render verifies the private proxy identity and uses the verified two-hop trust configuration. The corrected production probe passed seven cases across both hostnames: forged headers did not change the same caller's client hash. Foreign-origin writes were rejected with 403. No native-proxy blocker remains in the tested flows; this does not establish arbitrary proxy-chain behavior.

## Verified live behavior

The final HTTP run completed at **2026-11-03T19:47:27.670Z**. Its receipt is `artifacts/hosted-proxy-verification/4034c511675d3fad/receipt.json`.

- Anonymous discovery returned no session cookie. Owner sign-in, private CDN behavior, rejected foreign origins, and separate private sessions passed.
- Two isolated reviewer workspaces each uploaded a **5,318,153-byte PNG**, saved and edited a project, reopened it, downloaded media, and exported a production package. Range requests passed, including video responses with status 206. Both workspaces retained **zero jobs**; no Comfy key or paid generation was submitted.
- At the exact submitted URL, rendered browser checks showed playing muted video with decoded media, interactive 3D, and normal Explore navigation. Opening/dismissing Connect preserved the draft. Creating a draft and choosing Generate opened only the key dialog; dismissal and reload preserved the prompt. Jobs remained zero, and an actual browser download completed.
- Direct Render retained its distinct prior remix workspace, confirming the visible separation between the two entry origins.
- A **390 × 844 browser viewport** passed header navigation and connection-dialog open/close checks. Visible video played muted, offscreen motion paused, and page content did not overflow horizontally. This was a responsive browser check, not a physical-phone test.
- An isolated read-only fixture on localhost returned realistic workspace-capacity errors. Film selection, the current prompt, and the selected PNG survived rejection, explicit retry, and dismissal. No extra automatic attempts occurred; no production session was allocated by that fixture.
- **41 legacy checks** passed: `/competition/`, existing media/download links, all **18 original media/support hashes**, and the pinned ZIP remained unchanged.

Rendered evidence is saved locally under `artifacts/deployment-reviewers/proxy/`:

- `submitted-homepage.png`
- `submitted-phone.png`
- `generate-connection-dialog.png`
- `local-capacity-draft.png`

Legacy verification is recorded in `artifacts/deployment-reviewers/proxy/legacy-1793734413165/legacy-verification.json`. These ignored local artifacts are evidence references, not promised public release downloads.

## Remaining limits

The owner's event credit pool has ended. No paid generation was requested in this rollout; a fresh funded reviewer generation remains **unverified**. The upload test proves the measured size, not an unlimited native-rewrite upload ceiling. HTTP cookie assertions and rendered browser checks are recorded separately rather than treating either as a substitute for the other. No cross-device recovery, physical-phone validation, or new competition submission is claimed.

Deployment mechanics and historical rollout receipts remain in [reviewer/README.md](../reviewer/README.md). The original failed spoof probe is retained above alongside the verified correction.
