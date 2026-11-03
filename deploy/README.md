# Hosted authoring runtime — deployment preparation

This bundle is not a live deployment. The local studio remains unchanged until a coordinated restart. Render account access and approval for paid hosting are required before provisioning.

The proposed service runs the complete Node/React app as one process with SQLite and all managed media under `/var/data/studio` on a persistent 10 GB disk. It is not a static showcase or ephemeral serverless function. The current Render `1c-2g` plan is $25/month, and a 10 GB disk is $2.50/month; taxes and excess bandwidth are additional. These figures were checked on 3 November 2026: [pricing](https://render.com/pricing), [persistent disk behavior](https://render.com/docs/disks).

Set `OTS_PUBLIC_ORIGIN` to the exact HTTPS service origin, `OTS_OWNER_PASSWORD_HASH` to a scrypt password hash, and `COMFY_API_KEY` as server secrets. Never commit the key, password, data directory, or `.env` files. The Docker context excludes these. Hosted configuration fails closed without its origin, password hash, absolute persistent data path, and explicit persistence confirmation. Use `hashOwnerPassword` from `server/auth-session.ts` with a private password of at least 14 characters; do not place a password in chat, command-line arguments, or shell history.

Owner login protects the application HTML, embedded Explore bootstrap, APIs, downloads, and media. Sessions use random opaque tokens, stored only as SHA-256 hashes in SQLite; cookies are Secure, HttpOnly, and SameSite=Lax. Writes require the exact same HTTPS Origin. Owner access is scoped to this one private workspace; no public signup or public generation is enabled. Review-token routing is not mounted by this minimal bundle. Login attempts, concurrent writes, uploads, active generations, hourly generation admission, request sizes, and low disk space are bounded. Existing per-model validation and idempotency still apply.

The runtime uses system FFmpeg/FFprobe and Node 24. All dev dependencies are retained because editable Object Room export compiles its own local player runtime with Vite. The container starts its application as the unprivileged `node` user after initializing only the mounted data directory. Uploaded data is never included in the image.

## Required deployment verification

1. Build and smoke-test the Docker image in a real Docker environment. The image has not yet been built in this Windows session.
2. Provision the approved paid service and disk; configure private credentials in the host's secret manager.
3. Migrate a verified, consistent copy of SQLite and managed media, keeping the original local data untouched. Preserve file ownership for uid 1000. Do not copy a live SQLite file without its WAL or a consistent SQLite backup.
4. Verify HTTPS login, private media denial while signed out, generation, persisted results, restart recovery, downloads, and project reopening on the actual host.
5. Configure and verify automatic consistent SQLite/media backups and an off-host copy before calling the service production ready. This minimal time-bounded bundle does not yet implement that backup service. Render daily disk snapshots alone are not a validated SQLite recovery plan.
6. Complete bounded worker drain and graceful shutdown verification before hosting long-running collection. Existing job identities and persisted queue state recover after restart, but the original short shutdown handler remains a limitation in this minimal bundle.

Render persistent disks are restricted to one instance and prevent zero-downtime deploys. Keep `numInstances: 1`; do not horizontally scale this SQLite runtime. A successful build is not hosted persistence or browser validation. [Node's supported SQLite backup API](https://nodejs.org/download/release/latest-v24.x/docs/api/sqlite.html) is the intended consistent database snapshot mechanism for the next deployment step.
