# Production engine build and verification

OTS_Web uses **MuseScore v4.7.4, Qt-free, Emscripten 4.0.7**, pinned in
[`engine/musescore/upstream.json`](../../engine/musescore/upstream.json). Native sources are maintained in
[`engine/musescore/bridge/`](../../engine/musescore/bridge/); JS/worker wrappers remain in `webmscore-fork/web-public/src/`.
The historical 4.00 native tree is retained but does not build the shipping engine.

## Build and install

Prerequisites: local `../MuseScore` Git object store containing the pinned tag/commit, Emscripten 4.0.7 at
`../emsdk-4.0.7`, CMake, Ninja, Python 3, Node/npm. CMake downloads upstream HarfBuzz source on a fresh build;
bundling uses the locked `web-public/package-lock.json`. No proprietary sampler or soundfont is built in.

```bash
npm run build:engine
npm run bundle:engine -- /tmp/ots-engine-bundle
npm run install:engine -- /tmp/ots-engine-bundle
npm run check:wasm
npm run check:bridge
```

The builder uses or creates `../ms47-spike`, requires the exact pinned commit, applies the tracked Qt-free patch,
stages bridge/configuration there, and builds optimized Node and browser outputs. Default build is
`../ms47-build-wasm`, resource staging is `../ms47-build-native/res`. Configure `MS47_SOURCE`, `MS47_BUILD`,
`MS47_RESOURCE_ROOT`, `MS47_EMSDK`, `MS47_JOBS`; `MS47_FAST_LINK=ON` is for debugging, not release measurement.
`MS47_BROWSER=OFF` omits browser packaging and cannot produce an installable browser bundle.

To validate without using an already-patched worktree or warm objects:

```bash
git -C ../MuseScore worktree add --detach ../musescore-clean v4.7.4
MS47_SOURCE="$PWD/../musescore-clean" MS47_BUILD="$PWD/../musescore-clean-build" \
MS47_RESOURCE_ROOT="$PWD/../musescore-clean-res" npm run build:engine
npm run bundle:engine -- /tmp/ots-engine-bundle "$PWD/../musescore-clean-build"
```

Keep new paths absent before this command; existing worktrees may contain local edits. Build input staging retains
the pinned patch's `spike/` hook and target names as implementation details. Edit maintained sources here, never the
staged copies. To modify upstream itself, edit a dedicated pinned checkout, regenerate/review the tracked patch,
and repeat a fresh build. The old `tools/ms47-bridge-spike/build.sh` forwards to the maintained build command.

## Generated package

Bundling makes a scratch package from the current wrappers, locked bundler dependencies and `<build>/browser/`.
Installation validates all required outputs before copying them into `webmscore-fork/web-public/`, then runs
`sync:wasm` for `public/`. Install the JS/glue, WASM and data as a synchronized set. 4.7 has no separate memory
initializer; legacy `.mem.wasm` files are not new build outputs and are not required by this loader.

The `webmscore.nodejs.test.cjs` scratch bundle exposes the native module for verification; it is never installed.
Use the regular `webmscore.nodejs.cjs` for runtime consumers. The bridge audit reads all production export-bearing
headers, the JS/worker/type layers and generated glue/bundles. `inventory.mjs` also reports coverage against the
retained legacy ABI so a missing old export remains visible.

## Verification

For a scratch browser bundle (including staged on-demand fonts):

```bash
MS47_BUNDLE=/tmp/ots-engine-bundle MS47_SOURCE="$PWD/../musescore-clean" \
MS47_RESOURCE_ROOT="$PWD/../musescore-clean-res" \
MS47_VERIFY_EDITS=1 MS47_VERIFY_INSPECTOR=1 MS47_VERIFY_SELECTION=1 MS47_VERIFY_NOTEINPUT=1 \
MS47_VERIFY_MEASURES=1 MS47_VERIFY_TIMELINE=1 MS47_VERIFY_SPANNERS=1 MS47_VERIFY_MISC=1 \
MS47_VERIFY_DRAG=1 MS47_VERIFY_MIDI=1 MS47_VERIFY_AUDIO=1 MS47_VERIFY_PDF=1 \
MS47_VERIFY_STUBS=1 MS47_VERIFY_PARTS=1 MS47_VERIFY_RESOURCES=1 MS47_VERIFY_SYSTEMLOCKS=1 \
MS47_SOUNDFONT="$PWD/public/soundfonts/default.sf3" npm run verify:engine
node tools/musescore/inventory.mjs
MS47_ARTIFACTS="$PWD/../musescore-clean/build.artifacts" node tools/musescore/verify-exports.mjs
```

Install Playwright Chromium for the pixel verifiers; PDF checks also require poppler. Reports default to
`/tmp/ms47-bridge-results`; set `MS47_OUTPUT` for an isolated run. Node tests alone do not qualify browser workers.
After installation run real browser playback/timeline tests, the standard typecheck/lint/debt checks, and the
static embed build/integration tests described in [`../BUILD_EMBED.md`](../BUILD_EMBED.md).

Historical 4.00 comparisons are **opt-in**: `MS47_REFERENCE_400=/absolute/path/to/webmscore.nodejs.cjs`.
The helper validates that the bundle reports format version 400. Unset, only that historical comparison is skipped;
the current engine's semantic assertions still run. The shipping 4.7 bundle must never masquerade as a 4.00 reference.
Archived migration evidence in [`archive/ms47-spike/`](archive/ms47-spike/) describes its historical state and paths.

## Local timing diagnostics and baseline

Development builds collect bounded traces in `window.__otsPerf` and `performance.measure`. In production/static
embeds enable explicitly with `localStorage['ots.perf']='1'`. No trace is sent to analytics. History is bounded at
200 entries by the existing diagnostics infrastructure.

- `playback:prepare:full|selection|player`: soundfont readiness and native preparation.
- `playback:stream:<label>`: first PCM pull and total scheduling-startup-to-next-paint time.
- `playback:cancel`: requested or awaited cancellation; only the latter includes cancellation completion.
- `page:render`: editor SVG round trip, sanitization, DOM installation and next-paint approximation.

These are preparation/scheduling/paint measurements, **not audible output measurements**. Existing preroll/count-in
and the device output latency must be considered separately. The first-pull timer does not include native model
preparation. Diagnostics must not change chunk sizes, render horizon or playback ownership.

```bash
node tools/musescore/playback-baseline.mjs webmscore-fork/web-public /tmp/playback.json
```

This benchmark opens three cold Node processes with five stream starts each. It records boot, soundfont install,
load/SVG, native prepare, first pull and cancel, plus notation/PCM hashes. It excludes network, worker RPC, browser
scheduling and output-device latency. See [`PHASE0_2026-10-24.md`](PHASE0_2026-10-24.md) for measured results and
[`baselines/`](baselines/) for raw artifact/timing records. A local copy of the optional soundfont is needed to benchmark.
