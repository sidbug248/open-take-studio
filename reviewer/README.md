# Public reviewer

This directory builds the existing public reviewer domain to serve the full Render application through Vercel's native external rewrite. The historical review page is preserved at `/competition/`. Existing root video files, `film/**`, source/X links and portable downloads retain their URLs and bytes. **The authorized routing deployment is live and verified.** Current acceptance evidence and limits are recorded in [the post-submission routing note](../docs/POST-SUBMISSION-PROXY-2026-11-03.md).

The build fetches the immutable `v0.1.0-submission` review archive from the existing GitHub release and verifies SHA-256 `95f13e58d66e165712b6b440961897f8c4bda5f5fbadd0f83061c0534044b76e` before extracting it. The review HTML is written to `competition/index.html`; no generated root `index.html` shadows the live application. Competition-prefixed media requests map to the same static files, preserving relative URLs without modifying their bytes. The original archive is also served as `Open-Take-Studio-Review-Demo.zip`. No application environment, database, or private workspace media is packaged.

## Native proxy boundary — research verified November 3, 2026

The final route sends unmatched paths to the fixed Render origin. A documented request transform sets `x-ots-proxy-secret` from the private Vercel environment variable `OTS_VERCEL_PROXY_SECRET`, replacing any visitor-supplied value. The matching Render value must be configured separately; neither value belongs in source, output files, response headers, build logs or browser JavaScript. The build fails on Vercel if this variable is missing or is not a 32-byte base64url value. A response transform also deletes that header defensively. [Vercel external rewrite documentation](https://vercel.com/docs/routing/rewrites).

Render must compare the secret in constant time before trusting the configured proxy origin or forwarded client identity. Vercel documents forwarding the visitor's IP, host and protocol; its request-header documentation says it overwrites `x-forwarded-for` against spoofing and describes `x-vercel-forwarded-for` as identical. The first deployed probe found that visitor-supplied forwarding headers could affect client attribution. The native rewrite now deletes incoming `X-Forwarded-For`, `X-Vercel-Forwarded-For`, and `X-Real-IP` before forwarding; Render uses the verified two-hop trust configuration. The final seven-case production probe passed across both hostnames, with the same caller retaining the same client hash despite forged headers. This initial finding and its correction are retained in the post-submission record. Do not accept arbitrary comma-separated IP lists or trust a proxy header on direct Render traffic. Preserve the browser's `Origin` for CSRF validation. The upstream `Host` and forwarded-header behavior must be recorded from that probe rather than assumed. [Request headers](https://vercel.com/docs/headers/request-headers).

Rewritten responses opt out of Vercel caching; original application browser cache headers remain authoritative. Vercel's CDN additionally excludes responses containing `Set-Cookie`, private/no-store directives, or `Vary: Cookie`, and requests using Range or Authorization. Secure `__Host-` cookies use `Path=/` with no Domain, so the intended browser scope is the public proxy hostname; host-scoped cookies, private-session separation, byte ranges, and multipart uploads were verified through the deployed proxy. Do not infer untested cookie combinations from those checks. [CDN cache criteria](https://vercel.com/docs/caching/cdn-cache).

The external origin has 120 seconds to start a response; an active stream can continue longer if it sends data within each 120-second interval. There is no Function or Routing Middleware in this configuration, so their documented 4.5 MB/4 MB payload limits must not be misreported as a verified native-rewrite limit. No definitive native-rewrite upload-size ceiling was found in the consulted official sources. The deployed verification passed a 5,318,153-byte PNG multipart upload in each of two isolated workspaces, package export, and Range playback. That measured size is not a claim of an unlimited upload ceiling. Long jobs continue using the application's durable queue. [Origin timeout](https://vercel.com/changelog/cdn-origin-timeout-increased-to-two-minutes).

## Validate locally

From the project root:

```powershell
node reviewer/build-review.mjs --archive=artifacts/submission-2026-11-03/Open-Take-Studio-review-demo-2026-11-03.zip
```

Without `--archive`, the script downloads the same public release archive. Generated files are in `reviewer/public/` and are ignored by Git.

## Authorized deployment and exact target

The current user instruction authorizes deploying this full-studio routing update at the existing reviewer URL. No additional approval gate is imposed here. Deploy only to the existing project below, retain the competition files, and complete the live acceptance checks before reporting success.

- Vercel project: `prj_1d9l4KWS3SaYMarl9aLpR2VqQFbI` (`open-take-studio-review`).
- Team: `team_GkDA3N4RHKQQtTMpKkR8eYcH` (`eternity-flux-solutions`).
- Current verified reviewer production deployment: `dpl_FQYKN9Gr1L4ggy9WPwXj6PG98yJk` (READY).
- Historical static-review rollback target: `dpl_7YjctN8UAsLdUb6UrqLTXZyHbS6K`; confirm the intended rollback scope before use.
- Preserve aliases `open-take-studio-review.vercel.app` and `open-take-studio-review-eternity-flux-solutions.vercel.app`.
- Keep the competition tag unchanged. The original submission snapshot and downloads remain separate from this post-submission hosting update.

Preferred deployment uses the authenticated Vercel connector's `create_deployment` with the exact team/project above, `target: "production"`, and only these source files: `build-review.mjs`, `index.html`, `vercel.json`. Provision the private proxy environment value on this project and Render before deployment. Set project settings to framework `null`, build command `node build-review.mjs`, install command empty, output directory `public`, root directory `null`; do not use the studio's root build or upload its workspace.

If using an already authenticated CLI instead, explicitly bind the same project and team rather than allowing project discovery:

```powershell
$env:VERCEL_PROJECT_ID = 'prj_1d9l4KWS3SaYMarl9aLpR2VqQFbI'
$env:VERCEL_ORG_ID = 'team_GkDA3N4RHKQQtTMpKkR8eYcH'
vercel deploy ./reviewer --prod --scope eternity-flux-solutions --yes
```

After deployment, verify direct visual application arrival, anonymous discovery without a cookie or reserved workspace, explicit isolated session creation, same-origin editing and key dialog, owner sign-in, and the authenticated proxy diagnostic. Verify `/competition/`, every prior media URL, Range playback, `film/index.html`, the portable ZIP, and source/X links. Check two sessions cannot see each other's media or cached responses. Preserve the former production deployment as the rollback target.

Local preparation evidence: `artifacts/deployment-reviewers/proxy-research/` records the pinned archive build, all 18 original media/support hashes unchanged, unchanged competition HTML, absence of a shadowing root index, and config validation against the downloaded public Vercel schema. Three routing tests pass. These are source/build checks; they do not establish deployed proxy behavior.

## Historical CTA release verification — 2026-11-03

Following the release owner's explicit GO after hosted persistence and existing-media authoring checks, deployment `dpl_4WaZaEvCHFuSe4PVfZNAM5JoEvBc` reached READY and retained both existing aliases. The public CTA includes the confirmed notice that new AI generation is paused because event credits have ended.

At that historical deployment, public HTML matched the then-approved source. All eight prior link/media references remain present, all 18 archived media/support files are SHA-256 identical, and the portable download matches the pinned archive hash. The local receipt is `artifacts/reviewer-link-update/deployment-verification.json`. That receipt predates the full-app proxy deployment below.

## Reviewer-key update — source and verification

The current application allows anonymous discovery without a session cookie or allocated workspace. Explicit create, import, remix/edit, or key-connect actions allocate an isolated reviewer session. Created sessions use a private browser cookie for seven days; connected keys are encrypted server-side and expire after twelve hours. Reviewers should export before logout or clearing cookies. A disconnected workspace accepts only its original key for pending-job recovery; a different key starts a different workspace. No OAuth or account signup is claimed. Opening the connection dialog does not allocate a workspace, and connecting never generates automatically. Capacity errors retain the current prompt and selected files with an explicit retry action. The submitted Vercel hostname and direct Render hostname have separate cookies and reviewer workspaces.

The owner's event credits have ended. This does not supply or borrow credits for reviewer requests. A funded reviewer generation remains unverified; mocked concurrent-provider and recovery tests cover isolation. The prior release verification above is historical.

After explicit release GO, production deployment `dpl_7YjctN8UAsLdUb6UrqLTXZyHbS6K` reached READY on November 3 and retained both existing aliases. The published HTML equals the approved source. All 18 original media/support files and the portable ZIP remain hash-identical to the immutable archive. Evidence: `artifacts/deployment-reviewers/public-entry-update/verification.json`. The default-branch README-only commit is `54de30f80eff9359e4e9a12d19c9277b51192f4b`; the competition tag was not changed.

## Full-studio proxy deployment verified — 2026-11-03

Application and Vercel routing source: `9af30dc9e25a03ec972a710042d2a92a20b17d8f`. Render deployment `dep-dbl3ji56e07s73dimisg` and Vercel deployment `dpl_FQYKN9Gr1L4ggy9WPwXj6PG98yJk` are live; both existing Vercel aliases remain attached. The full test suite passed 192 tests and the production build passed.

The final HTTP run completed at `2026-11-03T19:47:27.670Z`. Anonymous browsing returned no session cookie; private caching, owner sign-in, rejected foreign origins, two isolated reviewer workspaces, 5,318,153-byte uploads, edit/save/reopen, downloads, Range playback, and package exports passed. Both workspaces retained zero jobs. Receipt: `artifacts/hosted-proxy-verification/4034c511675d3fad/receipt.json`. The final client-identity spoof probe passed seven cases after the forwarding-header correction described above.

Rendered browser checks at the exact submitted URL showed moving muted media, interactive 3D, preserved drafts after Connect dismissal and reload, Generate opening only the key dialog, zero jobs, and an actual download. Direct Render retained a distinct prior workspace. A separate read-only localhost fixture proved Film/prompt/PNG retention after capacity rejection, explicit retry, and dismissal, with no automatic extra attempts. Forty-one legacy checks confirmed `/competition/`, all 18 original media/support hashes, and the pinned ZIP unchanged.

See [the detailed post-submission record](../docs/POST-SUBMISSION-PROXY-2026-11-03.md) for screenshot paths and remaining limits. No native-proxy blocker remains in these tested flows. A fresh funded reviewer generation remains unverified; no paid generation was requested during this verification.
