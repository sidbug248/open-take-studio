# Live MCP and preservation verification — 2026-11-03

Release: `514d53bed0e6bf170620cec8a2aeeddfabc205e2`
Checked: 2026-11-03 22:07:02–22:07:07 UTC
Result: **Passed on both public studio URLs.**

- [Direct Render studio](https://open-take-studio.onrender.com)
- [Submitted Vercel studio URL](https://open-take-studio-review.vercel.app)

## Scope

This verification used one fresh isolated private reviewer workspace per origin, a 226-byte PNG rendered locally for QA, and actual MCP SDK Streamable HTTP clients. It did not use owner authentication, owner credentials, Comfy generation, provider probes, or social posting. Tokens and session cookies were kept in process memory and excluded from logs and this report.

## Results

| Check | Render | Vercel |
| --- | --- | --- |
| Anonymous catalogue | 66 entries: 60 implemented, 6 planned | Same |
| Original approved project IDs | All 19 match | All 19 match |
| Original demonstrated capabilities | 55 | 55 |
| Demonstration records | 167 | 167 |
| Public asset records carrying hash metadata | 234 | 234; matches Render |
| Fresh reviewer workspace | Empty, no connected Comfy key | Empty, no connected Comfy key |
| Scoped MCP endpoint | Keeps Render origin | Keeps Vercel origin |
| SDK initialization and tool discovery | Passed | Passed |
| Project read and exact original media read | Passed | Passed |
| Local resize to 96 × 72 pixels | Passed | Passed |
| Idempotent resize replay | Reused the saved output | Reused the saved output |
| Stored/downloaded source and output hashes | Match | Match |
| Generation jobs created | 0 | 0 |
| Token revocation | Revoked; subsequent request returned 401 | Revoked; subsequent request returned 401 |
| QA reviewer sign-out | Passed | Passed |

The SDK discovered the implemented project tools: `get_project`, `list_assets`, `get_asset`, `read_asset`, `list_recipes`, `inspect_graph`, `resize_image`, `build_delivery_package`, and `run_local_graph`. All declare a closed-world boundary. No generation or publishing tool was exposed. This live run exercised project/media reads and resize; graph and delivery execution have separate automated tests.

The six remaining planned catalogue entries are Kling video extension, translation and dubbing, standalone music composition, speech cleanup, document-to-finished-story, and image-to-3D. “Implemented” in the inventory denotes an implemented route; this run does not claim newly funded inference verification for those routes.

## Hash evidence

Both origins returned the same values:

| Evidence | SHA-256 |
| --- | --- |
| Sorted public demonstration IDs | `9109d0ac4beaf92ecaa2eb89e86d83de158646679f0862639a38e8df3f67ea9f` |
| Sorted public asset ID/hash/size metadata | `371d3bddce5fd280802a62a073c93ef31563c350939c8c01271bb35b59509a19` |
| QA source PNG: 64 × 48, 226 bytes | `07f9ab3986f08d6efca967bdde391b30e2170ca8ed70c5f5e6bdd6281182a110` |
| QA resized PNG: 96 × 72, 346 bytes | `2b480e2101735d1b72fecc8251143a3f42c6efbcb47cd9c198e8ad8eccfe6e98` |

## Preservation boundary

The earlier `media-preservation-and-catalogue-proof.json` receipt records verification of all **462 original local assets**, totalling **848,922,299 bytes**, at 20:24:27 UTC. It reports no missing asset IDs, record mismatches, missing files, or bad hashes. Its catalogue verification records the 19 original projects, 55 demonstrated capabilities and 167 demonstrations at 20:31:15 UTC.

This live run independently confirms the original public project identities and demonstration counts, plus public hash-metadata parity between Render and Vercel. It does **not** re-download all 462 originals or claim a fresh byte-level enumeration of Render’s persistent disk. The 234 public metadata records are the assets exposed through catalogue demonstrations, not the entire original library.

## Cleanup

Both temporary MCP tokens were revoked and rejection was verified. Both QA sessions were signed out. Each isolated QA workspace retains one private QA project containing only its two tiny synthetic PNG files; the workspace expires automatically. No owner project or original media was changed.

Raw sanitized run evidence was saved separately by the QA runner. Browser interaction verification is recorded separately from this HTTP/MCP check.
