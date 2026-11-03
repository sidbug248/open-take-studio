# Authoring release: hosting decision and access evidence

Inspection date: 2026-11-03. The competition form and its agreements remain untouched.

The existing public reviewer is https://open-take-studio-review.vercel.app/ (Vercel project `prj_1d9l4KWS3SaYMarl9aLpR2VqQFbI`). Its production deployment `dpl_EiLqHa9C8qDtkLPJzvhV4t6f33bf` remains unchanged. This is the saved-output reviewer, not the complete authoring app.

The published repository is https://github.com/sidbug248/open-take-studio. The immutable `v0.1.0-submission` tag points to `b62f5e523877a8fa06d01b3a5d95e97de29a20cb`. This workspace was unlinked; its working files were retained while the remote history and tag were fetched and `codex/authoring-live` was based on current main. Published release evidence was restored; the older local README was saved in ignored release artifacts.

## Runtime decision

Use one long-running Node 24 instance with one mounted persistent disk, SQLite WAL and managed media, FFmpeg/ffprobe, the existing durable generation workers, owner authentication and scoped review access. This preserves the current production model and avoids a risky database rewrite during deployment. Do not horizontally scale the SQLite process. Provider inference remains remote and route-specific.

Connected Vercel is suitable for the existing reviewer. [Express on Vercel](https://vercel.com/docs/frameworks/backend/express) executes as a function; [its filesystem is not persistent](https://vercel.com/docs/functions/runtimes). Deploying the current SQLite/media directory there would lose saved work. A function/Blob/database/queue rewrite is a different migration.

The connected Cloudflare account was inspected through its API. `GET containers/applications` returned HTTP 401 with the explicit provider message that Containers requires the Workers Paid plan. Billing inspection separately returned a scope limitation. [Cloudflare container disks are ephemeral](https://developers.cloudflare.com/containers/faq/); a paid upgrade alone would still require a durable storage adaptation. No upgrade was made.

## Prepared destination

Render's Docker web service with a [persistent disk](https://render.com/docs/disks) supports this architecture and supplies an HTTPS `onrender.com` address. Current official [pricing](https://render.com/pricing), inspected in the rendered browser, lists `1c-2g` at $25/month and disks at $0.25/GB/month. A 10 GB disk gives a base $27.50/month before tax and usage overages, on the $0 Hobby workspace plan. Hobby includes 5 GB bandwidth/month, then $0.15/GB. Do not confuse the $25 Pro workspace add-on with the $25 compute instance; it is not required for this single-owner service.

No authenticated Render account/API connection has been established. Account/hosting authorization is the deployment dependency. Nothing is described as hosted until its actual service URL, persistence and generation journey have been tested. A local tunnel or temporary sandbox is not this production deployment.

Render disks permit only one attached service instance and interrupt service during deployments. Use [checksPass deployments](https://render.com/docs/deploys) after GitHub validation. A rollback changes application code; it must not replace the current production database with the competition snapshot. Keep schema additions compatible and create a verified backup before migration.

The ignored `artifacts/authoring-release/checkpoint/receipt.json` records the protected starting state: 19 projects, 462 assets, 292 takes, 206 jobs, 2 shots and 9 recipes; all 848,922,299 managed-media bytes were copied and SHA-256 verified.
