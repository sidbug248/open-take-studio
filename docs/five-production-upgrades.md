# Five production upgrades without Comfy inference credits

These are post-submission additions to the current authoring branch. The competition tag and its original release assets are unchanged.

## Open the tools

Open or create a project, then use the instrument selector in the project header (or Ctrl/Cmd+K). The tools also appear in the Catalogue.

| Upgrade | Instrument | What you can do without Comfy credits |
| --- | --- | --- |
| Visual production graph | Production canvas | Wire saved assets, resize/crop images, build contact sheets, package outputs, save versions and resume local runs |
| Shared review and team comments | Review & delivery | Create a selected-media review version, invite viewers/commenters/approvers, discuss timecodes, resolve threads and record decisions |
| Client review and social delivery | Review & delivery | Export original/square/portrait/landscape media, captions, source copies and an integrity manifest |
| Studio MCP tools | Studio MCP | Grant a compatible assistant project-scoped reads or bounded local operations |
| Scheduled publishing | Scheduled publishing, also inside Review & delivery | Prepare and approve a scheduled post to a connected Mastodon account |

Both cloud addresses serve the same application code:

- https://open-take-studio-review.vercel.app/
- https://open-take-studio.onrender.com/

Vercel forwards to the Render server and persistent storage. The two addresses have separate browser cookies and private workspaces. Use one address consistently to return to your work. Local installation uses the same authoring branch and requires neither hosting account.

The existing cinematic homepage, original collections and saved demonstrations remain available without a key. Creating a workspace does not initiate inference.

## Production canvas

1. Add a source node and select an asset from the current project.
2. Add an image transform, storyboard/contact sheet or delivery node.
3. Connect compatible output/input ports by clicking them, or use the keyboard connection controls. Move nodes with a pointer or the arrow keys.
4. Save an immutable graph version, then choose **Run local nodes**.
5. Open the generated assets or run history. Reopening and retrying the same run reuses completed output receipts.

Recipe nodes prepare a generation request and wait. Only the explicit **Generate with Comfy credits** action uses the existing generation gate; connecting a key never starts it automatically. Running a local graph through MCP rejects every graph containing a recipe node.

This is a typed graph of the built-in operations, not a sandbox for arbitrary executable nodes. Cycles, incompatible connections and cross-project source references are rejected. Versions and produced assets travel in project ZIP exports; durable run records remain in the workspace database.

Bounds: 48 nodes, 128 wires, 12 contact-sheet inputs, 32 MiB / 32-million-pixel image sources, and 20 delivery inputs totaling at most 96 MiB. Local graph rendering is bounded across workspaces.

## Review and team comments

Create a board with selected saved media, then create an invitation for a named participant and role:

- **Viewer:** inspect and download only the selected version.
- **Commenter:** add feedback and replies, including audio/video timecodes.
- **Approver:** comment and record approval or requested changes for that exact version.

The participant label identifies the invitation. It does not verify an email address or legal identity. Treat each invitation as a bearer permission and share it only with the intended reviewer. The application does not send invitations automatically.

The link carries its secret in a URL fragment. The review page exchanges it for a path-scoped HttpOnly cookie and removes the fragment; media URLs do not include the secret. Only hashes are stored for invitations. Expiry, revocation, board closure and selected-media membership are checked on every request.

New versions do not silently expand existing invitations. Decisions reference the selected asset IDs and hashes. Stale revisions return a conflict instead of overwriting newer discussion; the client retains its draft.

A review version is limited to 24 assets / 256 MiB. Image, video and audio previews render in the review page; 3D and documents are downloadable. Hosted reviewer invitations expire no later than the private workspace, which lasts seven days. Local invitation links use the local server address and are reachable only where that address is reachable.

Review history is durable in the workspace database. It is not included in the existing portable project ZIP format; that format carries project media and creative records. Invitation secrets are never exported.

## Client delivery

Select saved media, a format, caption and package name. Original delivery preserves exact bytes. Square (1080×1080), portrait (1080×1920) and landscape (1920×1080) renditions preserve framing with padding; the ZIP includes the original files as well.

Each package contains actual media, caption.txt, a manifest with source/output hashes, and handoff instructions. Formatted image/video files are also saved as assets so they can be selected for publishing. Audio and documents keep their original bytes. Use Original for animated images to preserve animation.

Delivery limits: 24 assets, 128 MiB of sources, 192 MiB of packaged output, and up to three formatted videos / 180 seconds total. Processing rechecks source integrity, deduplicates retried requests and cleans unpublished derivatives after failure.

## Studio MCP

Create a named token for the current project and choose read or local-write access. The panel returns the secret once, along with a Streamable HTTP endpoint and client configuration. Copy it into a compatible MCP client privately. Do not put it in a public repository or project prompt.

Tokens are stored only as hashes, can be revoked, and expire after at most 24 hours or the hosted workspace expiry, whichever comes first. Configurations retain the address through which you opened the studio, including Vercel.

Read tools: get_project, list_assets, get_asset, read_asset, list_recipes, inspect_graph.

Additional local-write tools: resize_image, build_delivery_package, run_local_graph.

No MCP tool grants generation, social publishing, arbitrary network fetching, arbitrary filesystem access or access to a different project. Large binary assets remain usable by local tools; inline read_asset is limited to 512 KiB. Local write receipts survive retry/restart and preserve original assets.

The endpoint is /api/mcp/:workspaceId/:tokenId and requires the issued bearer token. Ordinary studio cookies do not authorize it. An expired or unknown workspace cannot fall back to the owner's workspace.

## Scheduled publishing

**Mastodon is the first automated destination.** Instagram, TikTok, X and other platforms can use the exported delivery packages for manual upload; automatic posting to them is not implemented in this release.

1. Create a user access token in your Mastodon account's application settings with profile (or read:accounts), write:media and write:statuses permissions.
2. Connect the public HTTPS server address and that token in Publishing accounts. This only checks your account; it does not post.
3. Select up to four images, or one video/audio file, with a total under 40 MiB. Set caption, alt text, visibility, destination and time.
4. Prepare the draft, inspect the exact media and details, then choose **Approve and schedule**.
5. The durable queue uploads the approved bytes at the due time, waits for media readiness and records the returned post receipt. You can cancel before a send starts.

Account tokens are encrypted in private workspace storage and excluded from UI responses, media metadata and project exports. Disconnecting cancels queued posts. Each server has its own attachment and account limits; an instance may reject a file even if it fits the studio's bounds.

Local scheduling requires the studio to be running at send time. Hosted scheduling requires an unexpired workspace. Times missed by more than 15 minutes fail for rescheduling rather than sending unexpectedly. A send with an uncertain response is never retried automatically; inspect the destination before creating another post. Provider idempotency keys are also used, but are not treated as permanent deduplication.

Only public IPv4-resolvable HTTPS instances on the default port are supported by this initial connector. Redirects are not followed, network time is bounded and destinations cannot resolve to private network addresses.

No real social account was connected or post published during engineering validation. Provider contracts were exercised against a local HTTP test server. A real account send still requires the user's authorized destination and post approval.

## Verification and remaining inference

The automated suite covers real image pixels/dimensions, MP4 encoding, ZIP contents, project import/export, workspace restart, invitations and role isolation, direct Render/trusted Vercel routing, real MCP SDK transport and calls, and approved publishing lifecycle without external posts.

All five production tools above are implemented and tested within their documented scope. No Comfy inference call is required for their local operations. On November 4, a separate hosted reviewer API check exercised one paid FLUX 3 recipe node through Vercel, collected its 768×768 image, resumed the graph through a 384×384 local resize and delivery ZIP, then verified hosted save/reopen and a hash-identical local project restore. The single generation's observed cost was $0.05862999, about 12.37 credits; graph resume and import submitted no further inference. Browser connection-dialog/draft preservation was checked separately, without a paid browser-click submission. Actual posting to a real Mastodon account remains unverified; automatic posting to Instagram, TikTok and X is not implemented.

The next six outcomes are no longer an untouched backlog: native music, image-to-3D, dubbing, speech cleanup and document-to-story are implemented. The initial four local native funded runs saved real outputs; a later textured 2K Meshy run also completed with embedded texture and basic visual review. Document-story was tested with saved media. A separate native Sonilo run also completed through the hosted reviewer API. These checks do not establish hosted execution of every native workflow or their output quality. Legacy Kling extension stays unavailable because its native node accepted only retired Kling 1.x predecessors; saved-frame H3 continuation and local clip assembly are explicitly separate alternatives. See the [current six-outcome status and usage guide](inference-upgrades-2026-11-04.md) and [funded execution record](funded-generation-check-2026-11-04.md).

See [the testing budget](comfy-testing-budget-2026-11-03.md) for current credit conversion, Router top-ups versus Cloud plans, conditional test costs and unresolved route availability. Buying credits does not by itself repair incompatible inputs or an unavailable provider entitlement.
