# Public reviewer

This directory builds the existing public reviewer at https://open-take-studio-review.vercel.app/. It preserves the public film, video files, source/X links, and portable demo download, and adds a prominent link to https://open-take-studio.onrender.com/ with an owner sign-in note.

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
- Existing production deployment, inspected 2026-11-03: `dpl_EiLqHa9C8qDtkLPJzvhV4t6f33bf`.
- Preserve aliases `open-take-studio-review.vercel.app` and `open-take-studio-review-eternity-flux-solutions.vercel.app`.
- Keep the competition tag and main branch unchanged.

Preferred deployment uses the authenticated Vercel connector's `create_deployment` with the exact team/project above, `target: "production"`, and only these source files: `build-review.mjs`, `index.html`, `vercel.json`. Set project settings to framework `null`, build command `node build-review.mjs`, install command empty, output directory `public`, root directory `null`; do not use the studio's root build or upload its workspace.

If using an already authenticated CLI instead, explicitly bind the same project and team rather than allowing project discovery:

```powershell
$env:VERCEL_PROJECT_ID = 'prj_1d9l4KWS3SaYMarl9aLpR2VqQFbI'
$env:VERCEL_ORG_ID = 'team_GkDA3N4RHKQQtTMpKkR8eYcH'
vercel deploy ./reviewer --prod --scope eternity-flux-solutions --yes
```

After GO and deployment, verify the existing alias, CTA destination and owner sign-in note; all three video URLs; `film/index.html`; the portable ZIP; and source/X links. The former production deployment remains the rollback target. No deployment command was run while preparing this directory.
