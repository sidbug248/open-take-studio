# Hosted authoring release — 3 November 2026

**Later post-submission update:** Reviewer BYOK access is now deployed. See [reviewer access and verification](reviewer-access-2026-11-03.md) for the current access model. The owner-only descriptions below record the earlier deployment milestone and have been superseded. Original owner projects and backups remain preserved.

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

## Completed hosted validation

- Migration completed at 12:07:58 p.m. Eastern. All 19 original projects, 462 assets, 292 takes, and 206 jobs retained their original identities and per-project counts. All 2,455 files were verified before committing the destination records.
- Authenticated browser sign-in, restored Explore media, muted video playback, desktop layout and a 390 × 844 responsive view passed. Phone-width layout had no horizontal overflow. This was browser emulation, not a physical phone.
- A single real FLUX 3 Image submission reached Router and was blocked by `insufficient_credits`. Job `4df3b3e4-7258-47f8-8dd7-c622cc7901ea` remains blocked with one attempt and no provider request ID. No image was generated. The NYC Build Night billing UI reported an exhausted allocation; the user confirmed the event cutoff. No retry or credit purchase was performed.
- Existing Liquid daylight media was copied with `imported` provenance, edited, downloaded with matching SHA-256, reopened in a fresh owner session, and exported. A QA-only external metadata field initially failed the package relationship validator; its raw package is retained and the fixture correction is documented. A subsequent unmodified app-exported ZIP successfully imported and reopened. Canonical project: `10634555-565d-4676-8c05-85f04f36fba3`.
- A real Render **Restart service** action was performed. Post-restart authentication, original-project preservation, selected take, media hashes, and export checks passed at 12:24:07–12:24:41 p.m. Eastern. The single-instance persistent-disk service has brief restart/deployment downtime.
- A consistent hosted snapshot was downloaded to the owner's computer: 2,474 files, 1,270,380,893 bytes, every file hash verified. It contains 22 projects (19 originals plus 3 explicitly labeled QA projects), 465 assets, 298 takes, and 209 job records. Backup ID: `1e06d4ac-197b-41c9-b196-963cd4a0948e`. Automatic on-disk snapshots target three retained complete backups; the off-host copy is verified but scheduled off-host delivery is not configured.
- Deployed application commit `181f24d` passed 160 tests and the production build on GitHub Linux: https://github.com/sidbug248/open-take-studio/actions/runs/41682785147.

## Public entry points and preservation

The existing Vercel reviewer now includes **Open the full studio**, with owner-access and expired-event-credit notices. Deployment: `dpl_4WaZaEvCHFuSe4PVfZNAM5JoEvBc`. All eight prior media/download links and all 18 support/media file hashes were preserved; the downloadable archive remains SHA-256 `95f13e58d66e165712b6b440961897f8c4bda5f5fbadd0f83061c0534044b76e`. Previous reviewer deployment `dpl_EiLqHa9C8qDtkLPJzvhV4t6f33bf` remains the rollback target.

The default-branch README adds the prominent live-app link as a dated post-submission update in commit `05d56aea730fa15f14177c9be2d1a06076c16c3b`. No owner credentials or API keys are published. Hosted access is private owner-password access: there is no public signup, per-user Comfy login, or self-service API-key configuration UI. Independent local installations use their own `.env` and Comfy account/credits.

The `v0.1.0-submission` tag remains at `b62f5e523877a8fa06d01b3a5d95e97de29a20cb`; its release, demo video, and public downloads are unchanged. No competition form or agreement was submitted.

## Remaining limits

New AI generation cannot be validated further without renewed Comfy credits. Saved-media authoring and exports are verified separately from inference. This is a private single-owner deployment, not a public multi-tenant SaaS. Automatic off-host backup scheduling and an exercised deployment rollback remain future operational work; on-disk retention and a real off-host recovery copy are implemented. The eleven-feature expansion remains paused.
