# Original showcase restoration — November 3, 2026

This is a post-submission repair on `codex/authoring-live`. The immutable `v0.1.0-submission` checkpoint is unchanged.

## Cause

Hosted public discovery allowed only Prismatic bloom, Liquid daylight and Voices of Elsewhere. The other 16 original collection projects were preserved in storage but omitted from Explore, public media access, Recipes and the catalogue's restricted source view. This made the gallery repetitive and replaced existing demonstrations with process illustrations.

The catalogue also used compact job summaries that omitted two scalar proof fields: `resultMetadata.requestId` for synchronous generation and `workflow.executedGraphAssetId` for native workflows. Exact validation therefore rejected saved demonstrations whose original proof remained present.

Neither problem is caused by the Comfy credit balance. Reading saved media does not require another generation.

## Repair

- Explicitly approve the original 19 collection project IDs, keeping unrelated and future owner projects private.
- Preserve the three cinematic hero journeys, existing media routes, source relationships, sanitization and private remix behavior.
- Recover only the two missing proof scalars for allowed completed jobs. Full private inputs and result bodies are not loaded for public catalogue responses.
- Retain exact demonstration validation and redact execution references from public responses.
- Update the offline reviewer verifier to cover all original collections without assuming each collection is a hero journey.

## Verification before deployment

- Fresh comparison of the immutable owner checkpoint against the current local workspace: all 19 original projects and all 462 assets retained.
- Read and SHA-256 verified all 462 original managed asset files, totaling 848,922,299 bytes: zero missing files, altered hashes or changed project relationships.
- These managed assets include supporting files and are not a claim of 462 independent AI generations.
- Repaired public catalogue exactly matches the original owner catalogue by demonstration ID: 167 demonstrations across all 55 executable capabilities. The 11 planned capabilities remain planned.
- Public-response scan found no private job/request/credential fields and no invalid or cross-collection asset media URLs.
- 193 automated tests passed; production build passed.
- The new public-discovery regression exercises collection breadth, original media bytes, synchronous and native proof retention, private-history denial, no provider calls and unchanged owner records.
- Release-boundary validation preserved the competition tag and excluded private workspace directories.

No new generation or Comfy credits were used for this repair. Live deployment and browser verification are checked separately after this commit.
