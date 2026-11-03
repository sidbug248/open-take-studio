# Public reviewer

This directory prepares the existing public reviewer domain to serve the full Render application through Vercel's native external rewrite. The historical review page moves to `/competition/`. Existing root video files, `film/**`, source/X links and portable downloads retain their URLs and bytes. **This routing update is prepared, not deployed or verified through the live proxy.**

The build fetches the immutable `v0.1.0-submission` review archive from the existing GitHub release and verifies SHA-256 `95f13e58d66e165712b6b440961897f8c4bda5f5fbadd0f83061c0534044b76e` before extracting it. The review HTML is written to `competition/index.html`; no generated root `index.html` shadows the live application. Competition-prefixed media requests map to the same static files, preserving relative URLs without modifying their bytes. The original archive is also served as `Open-Take-Studio-Review-Demo.zip`. No application environment, database, or private workspace media is packaged.

## Native proxy boundary — research verified November 3, 2026

The final route sends unmatched paths to the fixed Render origin. A documented request transform sets `x-ots-proxy-secret` from the private Vercel environment variable `OTS_VERCEL_PROXY_SECRET`, replacing any visitor-supplied value. The matching Render value must be configured separately; neither value belongs in source, output files, response headers, build logs or browser JavaScript. The build fails on Vercel if this variable is missing or is not a 32-byte base64url value. A response transform also deletes that header defensively. [Vercel external rewrite documentation](https://vercel.com/docs/routing/rewrites).

Render must compare the secret in constant time before trusting the configured proxy origin or forwarded client identity. Vercel documents forwarding the visitor's IP, host and protocol; its request-header documentation says it overwrites `x-forwarded-for` against spoofing and describes `x-vercel-forwarded-for` as identical. The actual Vercel → Render chain still requires a deployed, owner-authenticated probe with forged forwarding headers. Do not accept arbitrary comma-separated IP lists or trust a proxy header on direct Render traffic. Preserve the browser's `Origin` for CSRF validation. The upstream `Host` and forwarded-header behavior must be recorded from that probe rather than assumed. [Request headers](https://vercel.com/docs/headers/request-headers).

Rewritten responses opt out of Vercel caching; original application browser cache headers remain authoritative. Vercel's CDN additionally excludes responses containing `Set-Cookie`, private/no-store directives, or `Vary: Cookie`, and requests using Range or Authorization. Secure `__Host-` cookies use `Path=/` with no Domain, so the intended browser scope is the public proxy hostname; this cookie behavior, multiple Set-Cookie forwarding, private-session separation, byte ranges and multipart uploads remain deployment acceptance checks. [CDN cache criteria](https://vercel.com/docs/caching/cdn-cache).

The external origin has 120 seconds to start a response; an active stream can continue longer if it sends data within each 120-second interval. There is no Function or Routing Middleware in this configuration, so their documented 4.5 MB/4 MB payload limits must not be misreported as a verified native-rewrite limit. No definitive native-rewrite upload-size ceiling was found in the consulted official sources. Test a multipart upload larger than 4.5 MB, a representative package export, and Range playback before claiming these work through the proxy. Long jobs continue using the application's durable queue. [Origin timeout](https://vercel.com/changelog/cdn-origin-timeout-increased-to-two-minutes).

## Validate locally

From the project root:

```powershell
node reviewer/build-review.mjs --archive=artifacts/submission-2026-11-03/Open-Take-Studio-review-demo-2026-11-03.zip
```

Without `--archive`, the script downloads the same public release archive. Generated files are in `reviewer/public/` and are ignored by Git.

## Release gate and exact target

Do not deploy until the full Render studio passes its hosted end-to-end journey and the release owner explicitly gives GO. This source preparation is not release authorization.

- Vercel project: `prj_1d9l4KWS3SaYMarl9aLpR2VqQFbI` (`open-take-studio-review`).
- Team: `team_GkDA3N4RHKQQtTMpKkR8eYcH` (`eternity-flux-solutions`).
- Last verified reviewer production deployment / rollback target: `dpl_7YjctN8UAsLdUb6UrqLTXZyHbS6K` (reconfirm live before release).
- Preserve aliases `open-take-studio-review.vercel.app` and `open-take-studio-review-eternity-flux-solutions.vercel.app`.
- Keep the competition tag unchanged. The user authorized a default-branch README-only update after live reviewer verification; other main-branch changes remain outside this release.

Preferred deployment uses the authenticated Vercel connector's `create_deployment` with the exact team/project above, `target: "production"`, and only these source files: `build-review.mjs`, `index.html`, `vercel.json`. Provision the private proxy environment value on this project and Render before deployment. Set project settings to framework `null`, build command `node build-review.mjs`, install command empty, output directory `public`, root directory `null`; do not use the studio's root build or upload its workspace.

If using an already authenticated CLI instead, explicitly bind the same project and team rather than allowing project discovery:

```powershell
$env:VERCEL_PROJECT_ID = 'prj_1d9l4KWS3SaYMarl9aLpR2VqQFbI'
$env:VERCEL_ORG_ID = 'team_GkDA3N4RHKQQtTMpKkR8eYcH'
vercel deploy ./reviewer --prod --scope eternity-flux-solutions --yes
```

After GO and deployment, verify direct visual application arrival, anonymous discovery without a cookie or reserved workspace, explicit isolated session creation, same-origin editing and key dialog, owner sign-in, and the authenticated proxy diagnostic. Verify `/competition/`, every prior media URL, Range playback, `film/index.html`, the portable ZIP, and source/X links. Check two sessions cannot see each other's media or cached responses. Preserve the former production deployment as the rollback target.

Local preparation evidence: `artifacts/deployment-reviewers/proxy-research/` records the pinned archive build, all 18 original media/support hashes unchanged, unchanged competition HTML, absence of a shadowing root index, and config validation against the downloaded public Vercel schema. Three routing tests pass. These are source/build checks; they do not establish deployed proxy behavior.

## Authorized release verification — 2026-11-03

Following the release owner's explicit GO after hosted persistence and existing-media authoring checks, deployment `dpl_4WaZaEvCHFuSe4PVfZNAM5JoEvBc` reached READY and retained both existing aliases. The public CTA includes the confirmed notice that new AI generation is paused because event credits have ended.

The actual public HTML matches this source. All eight prior link/media references remain present, all 18 archived media/support files are SHA-256 identical, and the portable download matches the pinned archive hash. The local receipt is `artifacts/reviewer-link-update/deployment-verification.json`. The release owner performs the final rendered browser CTA/sign-in check.

## Reviewer-key update — source and verification

The current source changes the studio-entry copy for anonymous isolated reviewer sessions. Sessions use a private browser cookie for seven days; connected keys are encrypted server-side and expire after twelve hours. Reviewers should export before logout or clearing cookies. A disconnected workspace accepts only its original key for pending-job recovery; a different key starts a different workspace. No OAuth or account signup is claimed.

The owner's event credits have ended. This does not supply or borrow credits for reviewer requests. A funded reviewer generation remains unverified; mocked concurrent-provider and recovery tests cover isolation. The prior release verification above is historical.

After explicit release GO, production deployment `dpl_7YjctN8UAsLdUb6UrqLTXZyHbS6K` reached READY on November 3 and retained both existing aliases. The published HTML equals the approved source. All 18 original media/support files and the portable ZIP remain hash-identical to the immutable archive. Evidence: `artifacts/deployment-reviewers/public-entry-update/verification.json`. The default-branch README-only commit is `54de30f80eff9359e4e9a12d19c9277b51192f4b`; the competition tag was not changed.
