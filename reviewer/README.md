# Public reviewer

This directory builds the existing public reviewer at https://open-take-studio-review.vercel.app/. It preserves the public film, video files, source/X links, and portable demo download, and links prominently to https://open-take-studio.onrender.com/. The prepared update describes isolated reviewer entry without an owner password and optional connection of the reviewer's own funded Comfy key.

The build fetches the immutable `v0.1.0-submission` review archive from the existing GitHub release and verifies SHA-256 `95f13e58d66e165712b6b440961897f8c4bda5f5fbadd0f83061c0534044b76e` before extracting it. Only `index.html` is replaced. The original archive is also served as `Open-Take-Studio-Review-Demo.zip`. No application environment, database, or private workspace media is packaged.

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
- Current link-only production deployment / rollback target: `dpl_4WaZaEvCHFuSe4PVfZNAM5JoEvBc`.
- Preserve aliases `open-take-studio-review.vercel.app` and `open-take-studio-review-eternity-flux-solutions.vercel.app`.
- Keep the competition tag unchanged. The user authorized a default-branch README-only update after live reviewer verification; other main-branch changes remain outside this release.

Preferred deployment uses the authenticated Vercel connector's `create_deployment` with the exact team/project above, `target: "production"`, and only these source files: `build-review.mjs`, `index.html`, `vercel.json`. Set project settings to framework `null`, build command `node build-review.mjs`, install command empty, output directory `public`, root directory `null`; do not use the studio's root build or upload its workspace.

If using an already authenticated CLI instead, explicitly bind the same project and team rather than allowing project discovery:

```powershell
$env:VERCEL_PROJECT_ID = 'prj_1d9l4KWS3SaYMarl9aLpR2VqQFbI'
$env:VERCEL_ORG_ID = 'team_GkDA3N4RHKQQtTMpKkR8eYcH'
vercel deploy ./reviewer --prod --scope eternity-flux-solutions --yes
```

After GO and deployment, verify the existing alias, CTA destination and reviewer/BYOK note; all three video URLs; `film/index.html`; the portable ZIP; and source/X links. The former production deployment remains the rollback target.

## Authorized release verification — 2026-11-03

Following the release owner's explicit GO after hosted persistence and existing-media authoring checks, deployment `dpl_4WaZaEvCHFuSe4PVfZNAM5JoEvBc` reached READY and retained both existing aliases. The public CTA includes the confirmed notice that new AI generation is paused because event credits have ended.

The actual public HTML matches this source. All eight prior link/media references remain present, all 18 archived media/support files are SHA-256 identical, and the portable download matches the pinned archive hash. The local receipt is `artifacts/reviewer-link-update/deployment-verification.json`. The release owner performs the final rendered browser CTA/sign-in check.

## Reviewer-key update — source and verification

The current source changes the studio-entry copy for anonymous isolated reviewer sessions. Sessions use a private browser cookie for seven days; connected keys are encrypted server-side and expire after twelve hours. Reviewers should export before logout or clearing cookies. A disconnected workspace accepts only its original key for pending-job recovery; a different key starts a different workspace. No OAuth or account signup is claimed.

The owner's event credits have ended. This does not supply or borrow credits for reviewer requests. A funded reviewer generation remains unverified; mocked concurrent-provider and recovery tests cover isolation. The prior release verification above is historical.

After explicit release GO, production deployment `dpl_7YjctN8UAsLdUb6UrqLTXZyHbS6K` reached READY on November 3 and retained both existing aliases. The published HTML equals the approved source. All 18 original media/support files and the portable ZIP remain hash-identical to the immutable archive. Evidence: `artifacts/deployment-reviewers/public-entry-update/verification.json`. The default-branch README-only commit is `54de30f80eff9359e4e9a12d19c9277b51192f4b`; the competition tag was not changed.
