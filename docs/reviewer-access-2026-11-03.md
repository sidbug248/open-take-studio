# Reviewer access — post-submission update, November 3, 2026

The authoring app is hosted at https://open-take-studio.onrender.com. The immutable `v0.1.0-submission` release remains the competition checkpoint. This implementation continues on `codex/authoring-live`.

## Access and credits

Open the full studio at https://open-take-studio-review.vercel.app/ or https://open-take-studio.onrender.com/. The cinematic homepage, original showcase collection and saved catalogue demonstrations can be browsed without a password or Comfy key. Browsing does not allocate a reviewer workspace. Editing or remixing explicitly creates an isolated workspace identified by a Secure, HttpOnly, SameSite cookie, valid for seven days. Return using the same hostname and browser to reopen it. Export your projects before signing out, clearing cookies, or starting a separate workspace: anonymous access has no email/password recovery.

Use **Connect Comfy**, paste a key into the masked field, then Connect. Obtain a workspace API key at https://platform.comfy.org/profile/api-keys. Connection checks authorization without generating media. AI generation uses that key's Comfy workspace credits and model permissions. There is no Comfy OAuth integration. The original event workspace has no remaining credits; reviewers need their own funded workspace for new inference.

The 19 original showcase projects are read-only source material. Their saved images, videos, audio, 3D assets and catalogue demonstrations remain available when generation credits run out. Public access uses an explicit collection allowlist; unrelated owner and reviewer projects remain private. Remix makes a private copy with saved media, recipes, scene/film relationships and local editing state. Original execution payloads, signed URLs and private jobs are omitted from reviewer copies; owner originals retain their full history. New reviewer executions record their own provenance.

## Credential boundaries and recovery

- Each reviewer has a separate SQLite database and media directory. All authoring, media and export routers bind to that repository. Owner routes and peer files cannot be reached through guessed IDs.
- Keys never enter browser storage, project records, exports or logs. The server vault encrypts them with AES-256-GCM under the server-only `OTS_CREDENTIAL_ENCRYPTION_KEY`. Keep that 32-byte secret stable across deployments. Losing it requires reconnecting keys, not resubmitting jobs.
- Key connections expire after 12 hours. Disconnect erases active ciphertext and aborts active leases. It cannot undo a generation already accepted by Comfy or refund its credits. Saved work remains available in the session.
- A workspace remains bound to its original credential fingerprint. Reconnect the same key to recover accepted requests with their original model/request/idempotency identity. A different key requires a separate workspace. No reviewer operation falls back to the owner's server key.
- SDK 0.5.0 exposes global Router configuration, so each Router operation runs in a fresh worker isolate with one immutable key and no inherited secrets. Native workflow clients are per credential. Upload/cache identities include storage root, credential scope and asset hash.
- Disconnected/expired jobs are blocked before further admission. Reconnect resumes credential-blocked jobs. Credit-blocked jobs are not automatically resubmitted. Accepted Router results remain subject to the provider's 24-hour retention; reconnect promptly.
- Reviewer access is limited to 64 active sessions, 20 projects per workspace, 64 MiB uploads, a 512 MiB soft media quota, three active jobs and 20 generation identities/hour. Global operation queues and local write limits bound concurrent work. These are operational controls, not a substitute for hosted billing controls.

## Persistence and backups

Owner and reviewer data persist on the Render disk. Owner snapshots and verified off-host backups remain intact. Reviewer packages provide portable recovery; reviewer databases and the encrypted vault are not included in the owner's current off-host backup pipeline. A separate automated, consistent reviewer backup policy remains an operational follow-up. Session expiry never deletes existing project/media files automatically.

## Validation boundary

Automated integration tests cover two simultaneous credential scopes, owner/peer project and file denial, missing/invalid/permission/credit states, encrypted vault restart/expiry, upload-cache isolation, Router and native workflow disconnect/reconnect, and accepted-request recovery without duplicate submission. Remote operations in those generation tests are fixtures, not funded production runs.

A read-only live catalogue/billing probe accepts the configured event key and reports insufficient credits. No funded reviewer key is available, so a new live reviewer generation → provider completion → result collection remains unverified. Saved-media remix, edit, save, reopen, download and export are verified separately and must not be described as a new AI generation.

Live Render verification passed for two independent reviewer sessions: owner/peer file denial, invalid-key rejection, private uploads, saved edits, reopen, download and export. Connecting the known unfunded key reported insufficient credits; disconnect and same-key reconnect passed with zero generation jobs. Browser verification entered without an owner password, remixed Prismatic, played and downloaded its real clip, persisted a favorite edit across reload, and exported a 73-asset, 29-take, two-film package with all media hashes verified. Desktop and a 390 × 844 browser viewport were checked, including keyboard dismissal of Connect Comfy.

The public README-only update is commit `54de30f80eff9359e4e9a12d19c9277b51192f4b`. The reviewer site update is Vercel deployment `dpl_7YjctN8UAsLdUb6UrqLTXZyHbS6K`; all 18 original media/support files and the downloadable demo archive retain their original hashes.
