# Deadline deployment status — 2026-11-03

The eleven-feature expansion is paused. Its unmounted drafts are preserved under `development/paused-production/` and `development/paused-outcomes/`, outside the TypeScript build.

## Exact deployment dependency

Render hosting was authorized by the user at approximately 11:43 a.m. Eastern: one `1c-2g` Docker web service ($25/month), 10 GB persistent disk ($2.50/month), base $27.50/month before tax and usage. No additional spending-cap question is needed. Render sign-in/account activation is still required; the private sign-in page is open. No full authoring URL or hosted generation verification exists yet.

## Prepared files

- `Dockerfile`: Node 24, FFmpeg/ffprobe, production build and health check.
- `render.yaml`: single-instance paid service, persistent `/var/data`, HTTPS-origin/auth/Comfy secret configuration, generation admission limits.
- `.dockerignore`: excludes environment files, private workspace media/database and generated artifacts.
- `deploy/container-entrypoint.sh`: persistent-directory initialization and unprivileged runtime.
- `server/auth-session.ts`, `server/auth-access.ts`, `server/runtime-config.ts`, `server/runtime-security.ts`: hosted authentication and security boundary. Local loopback behavior is preserved.
- `.github/workflows/validate.yml`: tests/build and immutable submission-tag check.

The candidate is on `codex/authoring-live`, not the competition tag. A hosted migration, authenticated browser journey, restart persistence, backup restore and deployment rollback must still be verified before claiming production delivery.

## Preserved verified delivery

- Public reviewer: https://open-take-studio-review.vercel.app/
- Source release: https://github.com/sidbug248/open-take-studio/releases/tag/v0.1.0-submission
- Immutable tag commit: `b62f5e523877a8fa06d01b3a5d95e97de29a20cb`
- Competition video remains linked from the existing reviewer and release.
- Local studio: http://127.0.0.1:4310
- Checkpoint: 19 projects, 462 assets, 292 takes, 206 jobs, 2 shots and 9 recipes. Every managed original asset was SHA-256 verified and copied.

At 11:43 a.m., all 154 existing tests and the production build/typecheck passed with the candidate source. This does not establish hosted authentication, container execution or a hosted end-to-end journey. Initial source validation also passed on GitHub Linux: https://github.com/sidbug248/open-take-studio/actions/runs/41676366334

No competition form was submitted and no competition agreements were accepted. The public reviewer deployment was not modified.
