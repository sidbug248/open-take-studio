# Hosted authoring release — 3 November 2026

The full authoring application is deployed separately from the immutable competition reviewer. The eleven-feature expansion remains paused. No competition form or agreement was submitted.

## Actual services

- Authoring: https://open-take-studio.onrender.com — private owner access.
- Render service: `srv-dbl12c61egvs73994htg`, Mohsin's workspace, Ohio (US East), Docker `1c-2g`, one instance, 10 GB persistent disk at `/var/data`.
- Approved base hosting: $25/month compute plus $2.50/month disk, before tax or excess usage. This is separate from Comfy credits.
- Public reviewer: https://open-take-studio-review.vercel.app/ — saved demonstrations and downloads remain public.
- Source: `codex/authoring-live`; repository updates deploy after passing CI. The main branch and `v0.1.0-submission` tag are preserved.

## Validation in progress

The first container build and deploy succeeded at 11:53 a.m. Eastern. Hosted authentication and private-file checks passed over HTTP. Browser testing caught a form-Origin issue, corrected by a same-origin referrer policy without accepting null or foreign Origins. The actual browser subsequently signed in successfully.

The consistent migration snapshot contains 19 projects, 462 assets, 292 takes, 206 jobs, 2 shots, 9 recipes, and presentation derivatives: 2,455 files totaling 1,267,200,287 bytes. Local source files remain untouched. The destination restore verifies hashes and database integrity and refuses to overwrite an existing workspace.

At noon Eastern, migration and the hosted generation acceptance run were still incomplete. A streamed-upload admission bug was fixed with a real HTTP regression test and committed as `fa1e7bc`; the latest deployment and verification continue. This timestamped fact is preserved rather than claiming a completed hosted journey before the deadline.

Final migration, generation, restart, export, backup, and reviewer-link results will be recorded below as they complete.
