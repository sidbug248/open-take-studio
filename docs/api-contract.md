# Local API contract

All routes are relative to the single local origin (default http://127.0.0.1:4310). JSON unless upload indicated. Errors {error:string, code?:string}. Shared domain types in shared/types.ts. No browser credentials.

- GET /api/health -> {ok,keyConfigured,version,storagePath}
- GET /api/models -> {models: ModelDescriptor[], coverage?:...} (shared/model-types.ts owned by registry researcher)
- GET /api/projects -> Project[]
- POST /api/projects {name,description?} -> Project
- GET /api/projects/:id -> ProjectDetail
- PATCH /api/projects/:id {name?,description?,selectedTakeId?,coverAssetId?} -> Project
- POST /api/projects/:id/assets multipart file + optional name -> Asset (imported)
- GET /api/assets/:id/file -> media, supports video ranges; ?download=1 attachment
- POST /api/projects/:id/takes/import {assetId,name?,shotId?} -> Take IMPORTED
- PATCH /api/takes/:id {favorite?,name?,shotId?} -> Take
- POST /api/generate GenerationRequest -> {take:Take,job:Job}; stable clientRequestId for same intended click
- POST /api/jobs/:id/retry -> Job (same idempotency; never automatic retry of insufficient credits)
- POST /api/jobs/:id/cancel -> Job (request only, eventual status authoritative)
- POST /api/projects/:id/shots {name,description?,position?} -> Shot
- PATCH /api/shots/:id {name?,description?,position?,selectedTakeId?} -> Shot
- POST /api/projects/:id/recipes {name,modelId,prompt,settings,inputAssetIds} -> Recipe
- GET /api/projects/:id/export -> zip manifest and binary media
- POST /api/projects/import multipart file -> Project (new IDs; does not resume imported jobs)

UI polls project detail every ~3s; server polls Router with Retry-After independently. Branch form preloads parent settings/assets and passes parentTakeId; animate uses chosen image as input and new video model. Registry model metadata determines actual controls.
