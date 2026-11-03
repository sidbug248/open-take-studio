# Application and external dependencies

Original Open Take Studio code is distributed under the MIT license in the root LICENSE. The project is independent of other brands and does not use their assets or identities.

Installed packages retain their own license files and notices in `node_modules`; the lockfile records exact resolved versions. Core dependencies including React, Express, Vite, TypeScript, dotenv, multer, adm-zip, and the Comfy SDK use permissive licenses. Lucide icon artwork is ISC licensed. Do not remove dependency license notices when redistributing bundled code. The SDK's own MIT license is separate from the Comfy service terms.

The optional, locally bundled 3D viewer uses Google's `@google/model-viewer`, licensed under Apache-2.0. Its license is retained at [licenses/model-viewer-APACHE-2.0.txt](licenses/model-viewer-APACHE-2.0.txt); its Three.js dependency retains its MIT notice in the installed package. No model-viewer source files were modified. Preserve these notices if distributing a compiled client bundle.

## Local video tools

Frame extraction, thumbnails, and selected-path MP4 exports invoke FFmpeg and ffprobe as separate local executables. They do not perform AI inference. These dependencies are **not MIT licensed application code**:

| Dependency | Installed package | Verified Windows executable | License evidence |
| --- | --- | --- | --- |
| `ffmpeg-static` | 5.3.0; wrapper GPL-3.0-or-later | FFmpeg 6.1.1 essentials build, gyan.dev; `--enable-gpl --enable-version3` | Executable `-L` reports GPL version 3 or later; [retained GPL text](licenses/ffmpeg-GPL-3.0.txt), [wrapper license](licenses/ffmpeg-static-LICENSE.txt) |
| `ffprobe-static` | 3.1.0; wrapper MIT | ffprobe 4.0.2; `--enable-gpl --enable-version3` | Executable `-L` reports GPL version 3 or later, despite the wrapper's MIT license; [wrapper notice](licenses/ffprobe-static-MIT.txt), [verified executable notice](licenses/ffprobe-binary-notice.txt) |

The lockfile fixes the package versions; binary provenance is described by the [ffmpeg-static release](https://github.com/eugeneware/ffmpeg-static/releases/tag/b6.1.1), its [upstream Windows build provider](https://www.gyan.dev/ffmpeg/builds/), and the [ffprobe-static repository](https://github.com/derhuerst/ffprobe-static). Exact executable versions and build configuration should be checked again on each target platform. `FFMPEG_PATH` and `FFPROBE_PATH` may select independently installed compatible executables.

The source repository does not vendor these executables. `npm ci` installs platform-specific dependencies. If distributing an installer, container, or archive containing them, retain the applicable notices and satisfy their corresponding source and redistribution requirements for the exact builds and included libraries; an application MIT notice or a link to a generic FFmpeg source tree alone does not establish compliance. See the [FFmpeg licensing documentation](https://ffmpeg.org/legal.html) and the retained upstream license texts. The studio's player/project exports contain media and original viewing code, not FFmpeg binaries.

Router is a hosted dependency, not open-source inference included in this repository. External models and services (BFL, MiniMax, Bria, ElevenLabs, Meshy, and other optional Router providers) have their own access, billing, content, usage, and output terms. An MIT application license grants no model weights, API access, credits, trademarks, or guaranteed output usage rights. Users are responsible for rights to uploaded references, audio/voices, and outputs under the relevant provider terms.

Reference workflows and earlier example media remain the user's original artifacts. A project package's provenance describes how media entered the studio; it does not establish copyright ownership or a commercial license. Generated media is not automatically placed under MIT. No third-party source workflow, checkpoint, model weight, or copyrighted reference asset is bundled by this build.

Official service documentation: [Comfy Router](https://docs.comfy.org/development/comfy-router/quickstart), [Comfy terms](https://www.comfy.org/terms-of-service), and each model's provider documentation linked in the model registry. Terms and catalog availability can change independently of the application.

## Spatial and vector dependencies — November 3 update

The real shot stage and audio-reactive visualizer use Three.js 0.183.2 (MIT; [retained notice](licenses/three-MIT.txt)). The GLB loader bundles Google's Draco decoder ([Apache-2.0 notice](licenses/draco-APACHE-2.0.txt), [upstream](https://github.com/google/draco)) and meshoptimizer decoder 1.0 ([MIT notice](licenses/meshoptimizer-MIT.txt), [upstream](https://github.com/zeux/meshoptimizer/tree/v1.0)). These run locally in the browser; no decoder CDN is required. Preserve decoder notices when distributing the compiled browser bundle.

SVG validation uses fast-xml-parser 5.11.2 ([MIT notice](licenses/fast-xml-parser-MIT.txt)). Model-produced SVG is restricted to an allowlisted static document, retained as an attachment, and previewed through a locally rendered PNG. Original application source, generated artwork, hosted model access, and third-party dependencies remain separate licensing layers.
