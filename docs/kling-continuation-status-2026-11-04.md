# Kling continuation status — 2026-11-04

## Native extension remains unavailable

ComfyUI's official September 5, 2026 change removed `KlingVideoExtendNode` because the extension operation accepted only retired Kling 1.x predecessor videos. The removed implementation called `/proxy/kling/v1/videos/video-extend` using a native video ID. Current ComfyUI source has no Video Extend node. [1][2]

Router still publishes the `kling/videos-video-extend` input schema. Its generic predecessor description mentions text-to-video, image-to-video and prior extension, but specifies no modern compatible model version or dispatch/account contract. This is not evidence that the studio's Kling 2.6 output can be extended. The Router URL is not claimed to have been removed. [3]

The preserved local attempt confirms the limitation:

| Record | Result |
| --- | --- |
| Origin | Completed `kling/kling-v2-6` five-second pro-mode shot |
| Native predecessor | `946505824447384581` (a video ID, not a task or Router request ID) |
| Extension request | `becd74ed-a6a6-4d2b-bb8d-0d70f6259b4a` |
| Extension outcome | `FAILED / invalid_input`; no successful output |

The studio keeps this adapter unavailable. No retry, new predecessor generation or additional paid extension request is warranted by the available contract. Existing native video identities remain preserved as provenance, not proof of extension compatibility.

## Existing continuation alternative

The catalogue's unavailable extension now links to two existing instruments with explicit alternative labels:

1. **Continue from a saved frame:** open a saved video in its project, choose **Branch frame**, scrub to a moment, write a new direction and choose **Use this moment**. The studio saves the real frame and exact source time, then prepares an H3 first-frame draft. The user must explicitly choose Generate for a new shot. This is frame-conditioned generation of a separate clip; visual continuity is model-dependent and this is not native Kling extension.
2. **Assemble saved clips:** open **Films**, select an opening and a saved continuation, set trim points and export a selected path. The originals and saved parent/source relationships are retained.

Frame extraction, draft editing, existing clip assembly and export are local operations requiring no Comfy generation credits. A newly generated H3 continuation is a separately billed inference request. This repair submits none.

## Saved-frame browser verification — November 4

A browser check through the Vercel studio saved the actual frame at **2.00 seconds** from a video in a private remix. It retained the parent clip and source relationship, selected **MiniMax H3**, preselected the exact saved image as **First frame**, and preserved the user's continuation direction. **No generation was submitted.** This verifies the existing frame-to-draft interaction; it does not claim native Kling extension success or a newly generated continuation.

## Focused acceptance check with saved media — zero paid calls

- In Catalogue, inspect **Extend a Kling video**. It remains unavailable and has no extension launch control; the official retirement reference is present.
- Choose **Continue from a saved frame**. The existing image-to-video instrument opens, without generation or an API key prompt merely for inspection. Return and choose **Assemble saved clips** to inspect the local film tool.
- Open a saved video in its project and choose **Branch frame**. Select a visible frame and save it. Confirm the H3 draft retains that exact image, source time and source take. Do not press Generate for this check.
- Open Films and assemble two existing clips with explicit trims; export and reopen the resulting path. Compare the original assets and source relationships to confirm preservation.
- Repeat the navigation check through Render and the Vercel proxy; no new extension request or credit deduction should occur.

No live generation result is claimed by this repair. If a fresh continuation test is desired, use one explicit H3 first-frame request with a saved frame and current route settings, quote its exact current price before admission, and preserve the returned media and billed receipt. Do not treat the retired node's old price as a purchasable extension offer.

## Sources

1. Official ComfyUI retirement commit: https://github.com/Comfy-Org/ComfyUI/commit/f00bfd610cb001381603669e2cc01160ae37aaf3
2. Current native Kling source: https://github.com/Comfy-Org/ComfyUI/blob/master/comfy_api_nodes/nodes_kling.py
3. Current Router extension contract: https://docs.comfy.org/development/comfy-router/models/kling/videos-video-extend/code
