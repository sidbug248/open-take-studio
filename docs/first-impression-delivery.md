# Prepared discovery and lightweight project status

Explore reads one compact bootstrap, then progressive sections. It does not fetch every project or parse historical generation inputs. The production HTML embeds `ots-explore-bootstrap` and preloads the exact hero poster selected by that bootstrap. Stable curation is stored in `data/presentation/curation.json`; creating a take or changing a favorite does not silently replace the curated hero or its action.

## Endpoints

- `GET /api/explore/bootstrap`: hero, three curated journeys, the first 12 cards, section counts, and small project summaries.
- `GET /api/explore/cards?section=all&cursor=12`: progressive cards. Supported sections are all, image, video, audio, 3d, performance, stories, marketing.
- `GET /api/explore/recipes`: recipe summaries; a project is opened only when the user chooses an editing action.
- `GET /api/assets/:id/display`: prepared display descriptor. Missing preparation returns `unprepared`; this GET never starts FFmpeg, mesh reduction, or image encoding.
- `POST /api/assets/:id/display/prepare`: explicitly queue a local display preparation. It does not generate new AI media or create a production asset.
- `GET /api/projects/:id/status`: SQL-projected job state, progress, timestamps, asset/take counts, and polling guidance. `inputs` is empty and `bodiesOmitted` is true. Full inputs remain private and unchanged.
- `GET /api/projects/:id`: workspace data with the same small job summaries. Explicit `?history=full` supplies sanitized historical inputs when opening history. Project exports still contain full portable production records.

The `job_status` table is a reversible read projection updated atomically with each full job. On first startup existing jobs are backfilled using one materialized binary JSON conversion per missing row. Normal status polling never reads full job JSON. Model predecessor selection projects only supported completed provider results and never loads unrelated request bodies.

## Original identity and prepared media

Every `AssetPresentation` includes original asset ID, project ID, SHA-256, MIME type, byte count and original file URL. Editing, references, workflow execution, downloads and project packages retain these originals. Display derivatives live separately under `data/presentation/display-v1/<asset-id>/<source-sha256>/` and do not create replacement takes or modify source assets.

Responsive posters use WebP at 320, 640, 960 and 1440 pixel widths, never enlarging a smaller source. Existing actual model/video posters retain their declared provenance (rendered geometry, waveform, reference or explicitly labelled illustration). Short video previews are at most four seconds, H.264, 24 fps, bounded to 640 pixels (960 for the hero), with no audio stream. Audio peaks come from actual stored audio.

Discovery GLBs retain source identity while reducing mesh density where safe, compressing embedded textures to at most 512 pixels, and applying Meshopt compression. Skinned assets preserve their rig and are not simplified. This is a lossy discovery representation, not a replacement editing mesh. Actual size varies with animation/geometry complexity; original GLBs remain available to the full stage and export. The viewer uses a bundled decoder rather than an external inference or media service.

One worker thread prepares new assets in the background, coalescing repeated requests and checking for new or changed source/poster identities every ten seconds. Expensive mesh processing does not run on the HTTP event loop. Prepared files use content-hash filenames, ETags, Range requests and `private, max-age=31536000, immutable`. Rebuilding preparation can leave old immutable copies available to already-open tabs. Documents without a verified poster remain explicitly partial.

## Production delivery and verification

`npm run build` generates Brotli and gzip copies of built web assets. Production negotiates compression for HTML and hashed JS/CSS, marks hashed assets immutable, and keeps API records private. Injected JSON escapes `<` and Unicode line separators, and preload attributes are escaped separately.

The prepared bootstrap is cached in memory and concurrent rebuilds share one result. SQLite `data_version` and `total_changes()` invalidate it for writes through either the server or another connection, even when an edit preserves timestamps. Curation contents and an atomic display-worker revision marker also invalidate it. Bootstrap assembly reuses one gallery projection across its sections; historical job bodies are never scanned. The cache is intentionally rebuilt after a server restart, so no persisted bootstrap can outlive its database identity. Dynamic HTML uses Brotli quality 5; immutable built assets keep their build-time compression.

The 2026-11-03 bounded service check measured one new bootstrap instance at 122.9 ms and subsequent cached reads at 0.44–1.10 ms against the existing read-only database. A separate single HTML compression check measured quality 11 at 90.6 ms / 11,649 bytes and quality 5 at 2.6 ms / 13,370 bytes. These are component observations, not browser loading claims; receipts are in `artifacts/first-impression/arrival-proxies/`. Freshness tests cover changed curation, new source assets, renamed/favorited takes, cross-connection edits, and a newly completed worker preview.

`npx tsx scripts/prepare-display-media.ts` performs explicit bulk preparation using a read-only database connection. `npx tsx scripts/verify-display-delivery.ts` checks the running local server, original identities/hashes, derivative file hashes, headers, compressed code/HTML, and all project status responses.

The initial 2026-11-03 cache pass verified **447 original assets unchanged**, with identical before/after counts: 19 projects, 447 assets, 279 takes, 204 jobs. The checkpoint had 443 assets; four saved posters already existed before the preparation snapshot. It prepared 400 posters, 84 silent previews, and 24 GLB derivatives. The 24 original GLBs totalled 326,111,308 bytes; their discovery copies totalled 26,547,848 bytes. The featured Liquid object is 210,852 bytes. Hero HTML plus bootstrap transferred as 11,269 Brotli bytes in the bounded HTTP observation; the hero poster is 72,818 bytes and its silent preview 469,391 bytes. These are local API observations, not browser paint timings or a load benchmark.

Evidence: `artifacts/first-impression/derivatives/preparation-receipt.json` and `delivery-verification.json`. Focused tests in `tests/presentation.test.ts` exercise real FFmpeg media, decodable Meshopt GLB, immutable range delivery, JSON-safe bootstrap, atomic/backfilled summaries, archived history and parent-film project-package remapping. Browser cold/warm/phone observations are recorded separately by the interactive QA pass.

Implementation dependencies: glTF Transform 4.5.1 (MIT), meshoptimizer 1.3.0 (MIT), draco3dgltf 1.5.9 (Apache-2.0), existing Sharp and FFmpeg tooling. Their licenses and binary obligations remain separate from original application code; see the lockfile and existing media tooling licensing notes. Primary implementation references: [glTF Transform simplify](https://gltf-transform.dev/modules/functions/functions/simplify), [texture compression](https://gltf-transform.dev/modules/functions/functions/textureCompress), [NodeIO](https://gltf-transform.dev/modules/core/classes/NodeIO).
