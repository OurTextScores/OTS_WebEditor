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
MS47_VERIFY_PLAYBACK_SAFETY=1 MS47_VERIFY_PLAYBACK_OPTIONS=1 \
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

## Playback safety contract (Phase 1)

`score.playbackCapabilities()` returns a versioned contract, or `null` when the native export is absent. Method
presence in a worker proxy and the score-format version alone do not prove support. The current contract advertises
safe partial-layout positions, stream-handle version 1, soundfont-generation invalidation and planar float32 PCM at
44,100 Hz, stereo, 512 frames per channel. This preserves the binary `SynthRes` ABI. JS adds source-format metadata;
the scheduler validates it and creates buffers at the source rate, allowing Web Audio to resample to a 48 kHz device.
An empty terminal record is not scheduled as silent audio.

Stream IDs are opaque monotonic integers, not addresses. One module owns one native stream/sequence; superseding
it, replacing its font or destroying its score invalidates the old ID. Old pulls/cancels return empty done records.
Completed/cancelled state is reclaimed immediately. Never dereference or reuse an ID; older engines may use pointers
behind the same numeric JS interface. Browser-scheduled sources still belong to the transport and require its own
cancellation; the native hook cannot remove PCM already scheduled in Web Audio.

Soundfont installation invalidates the module before overwriting its shared file. The tracked upstream patch
`0002-soundfont-cache-invalidation.patch` evicts FluidSynth's filename-keyed decoded cache only after native voices
are released. The generation is checked on next preparation; a failed eviction prevents the file overwrite. All
patches in `upstream.json` are applied in order. Native `playbackDiagnostics` exposes bounded lifecycle counters for
verification; it does not return score data or pointers.

Positions add `schemaVersion: 1`, `complete`, per-box `geometryAvailable`, and `writtenTick`. Missing layout retains
the box's array ID and timing events, with page `-1` and zero finite geometry. Array IDs remain scoped to a layout
snapshot; written ticks are musical anchors across layout changes, not identifiers stable across notation edits.
Legacy packages omit these additive fields. The player excludes placeholders from following/click geometry.

Current `setupMasterScore()` performs an initial layout even for `load(..., false)`. Deferred-load performance is
therefore a separate issue, not evidence that missing-layout guards were exercised. The Node-only verification
target compiles `tools/musescore/metadata-probe.h` to detach selected layout parents temporarily, call the real writer,
and restore them. That fault-injection export is excluded from the browser package and the application's Node bundle;
the safety suite asserts this exclusion.

```bash
# Actual MEMFS package: ownership, same-path audible replacement, invalid font, 100 cancellations, terminal cleanup
MS47_BUNDLE=/tmp/ots-engine-bundle MS47_VERIFY_PLAYBACK_SAFETY=1 \
MS47_SOUNDFONT="$PWD/public/soundfonts/default.sf3" npm run verify:engine
# Node-only raw-filesystem harness: missing-layout injection, IDs/timing, repeat positions and exact restoration
MS47_VERIFY_PARTIAL_POSITIONS=1 npm run verify:engine
# Mixed/old native artifacts: real JS/worker wrappers must degrade without calling absent exports
node tools/musescore/verify-playback-capabilities.mjs
```

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

## Shared playback sessions (Phase 2)

[Phase 2 execution record](PHASE2_2026-10-24.md) documents the shared editor/player transport,
compare adapters, cancellation barriers and buffering behavior. Browser-only changes use the installed
Phase 1 engine; rebuilding native artifacts is unnecessary for this phase.

- `lib/playback/session-owner.ts`: attempt/resource ownership, preparation retirement and presentation refs.
- `lib/playback/use-score-transport.ts`: shared React adapter, stream factories, Web Audio fallback and clicks.
- `lib/playback/stream-scheduler.ts` and `stream-frontier.ts`: bounded scheduling, starvation and fresh anchors.
- `components/score-editor/playback-session/`: editor adapter and explicit notation/lifecycle boundary.

`stopAt()` cancels audible output immediately and returns an awaitable retirement barrier. Await it before
mutating or destroying a score. `reset()` only invalidates/reset state; it does not replace an awaited
retirement boundary. Editor animation consumers read `clockRef`/`positionRef` or subscribe to position;
do not introduce animation-frame worker RPC or editor-root React position updates.

## Playback options (Phase 3)

[Phase 3 execution record](PHASE3_2026-10-24.md). Tempo multiplier (0.25–2.0) and written repeats are transient
per-project options (`setPlaybackOptions`, `playbackOptions`), applied by `playbackoptions.h` inside every
playback-family read and restored afterwards. Audio, timeline, positions, selection start and range windows share one
options revision; notation exports, layout and undo never see the options. Use `playbackPositionAt` /
`playbackTimeForPosition` (written tick + repeat pass) to carry a location across an options change; never rescale
seconds in JavaScript. On the app side call `useScoreTransport().setPlaybackOptions`, which retires old-option audio,
coalesces requests and resumes at the mapped location.

```bash
MS47_BUNDLE=/tmp/ots-engine-bundle MS47_VERIFY_PLAYBACK_OPTIONS=1 \
MS47_SOUNDFONT="$PWD/public/soundfonts/default.sf3" npm run verify:engine
```

## Editor following (Phase 4)

[Phase 4 execution record](PHASE4_2026-10-24.md). The editor cursor, page/system following and click-to-seek
consume `segmentPositions`/`measurePositions` events and `playbackTimeline` under the current options revision.
Shared timing lives in `lib/playback/score-following/` (no UI imports); the editor feature folder is
`components/score-editor/score-following/`. Read positions off the Play critical path, keep per-segment updates
inside `PlaybackFollowLayer`, and never derive the cursor from selection commands.

## Playback speed and repeats controls (Phase 5)

[Phase 5 execution record](PHASE5_2026-10-25.md). Editor and player share `TempoControl` / `PlayRepeatsToggle`
(`components/playback-controls/`) and the local preference store; `usePlaybackOptionsSync` applies them per score
through the transport's position-preserving change, gated on the `playbackOptions` capability.

## Prepared page turns (Phase 6)

[Phase 6 execution record](PHASE6_2026-10-25.md). Editor page navigation goes through `PageNavigator`
(`components/score-editor/page-turns/`): latest target wins, manual supersedes automatic, and commits are
generation-checked against every other canvas render (`pageInstallGenerationRef`). Following prefetches the next
page in performance order into a bounded cache, spending only the transport's scheduled-audio cushion.

## Continuous cursor (Phase 7)

[Phase 7 execution record](PHASE7_2026-10-25.md). `playbackFollowMap()` (`followmap.h`) returns repeat-expanded,
tempo-split cursor intervals with native geometry under the playback options; `resolveContinuousCursor`
interpolates only within an interval. Editor, player and video export share the resolver. Verify with
`MS47_VERIFY_FOLLOW_MAP=1` and the upstream repeat corpus `MS47_VERIFY_REPEAT_CORPUS=1` (69/69).

## Prepared playback and presentation timing (Phase 8)

[Phase 8 execution record](PHASE8_2026-10-25.md). Native preparation retains one score/excerpt's model and tracks
while its committed-change watcher, options revision and SoundFont generation match. Upstream patches 0003/0004
make reused FluidSynth voices deterministic; the verifier compares fresh/reused PCM byte for byte.
`MS47_VERIFY_PLAYBACK_REUSE=1` exercises reuse, invalidation and idle preparation; the existing audio/options/
ownership/map suites remain required. `verify-playback-reuse-mutations.mjs` builds scratch variants and restores
the maintained header/build: the edit guard is caught; the explicit extra flush is equivalent under the current
mixer lifecycle, which also flushes on activation changes.

`warmupPlayback()` prepares only when no native stream is active. The editor calls it after an idle edit through
its existing engine queue, with an already-loaded font. It never schedules audio. Optional
`playbackDiagnostics()` and `setPlaybackReuse(false)` support local A/B profiling; stop/await playback before using
the latter. `preparedPlaybackVersion: 1` advertises the native feature. Older engines return false/null.

`startup-profile.mjs <bundle> <report> [cold-process-count]` records native stage timings and PCM onset.
Set `MS47_PROFILE_REUSE=0` for fresh preparation. `browser-baseline.mjs <base-url> <report> --phase8` records real
worker/Web Audio cold/warm startup, cancellation, memory, batches 2/8/16 and isolated scheduler-policy experiments.
`playback-stress-profile.mjs` compares interleaved fresh/reused starts in the editor, while
`scheduler-policy-profile.mjs` isolates startup buffer and PCM merging policies.
`OTS_PROFILE_CONTEXTS` defaults to 3; `OTS_PROFILE_RESUME=1` resumes matching browser/WASM checkpoints. Font serving
is local and renderer 4x throttling is simulated. These tools do not establish physical-device audible latency.

Live visuals follow a valid output timestamp, with reported output/base latency as a fallback. Editor/player
visual timing controls independently trim measure/cursor presentation in real milliseconds; defaults are zero.
Editor Playback settings also offer independent measure and notehead highlighting toggles, defaulting to measure
shading. These reuse the fetched native geometry, keep the cursor visible, and preserve the score SVG's own colours.
These preferences do not change native score times or exported video. Selection buffering/merging and render
horizons retain their previous defaults pending slow-device qualification.

## Qualification (Phase 9)

[Phase 9 execution record](PHASE9_2026-10-25.md): first cross-browser runs (`PLAYWRIGHT_BROWSER=firefox|webkit`),
release escape hatches (`NEXT_PUBLIC_OTS_PLAYBACK_CURSOR`, `NEXT_PUBLIC_OTS_PLAYBACK_AUTOFOLLOW`), compressed
MusicXML import, and the local Linux setup needed for Playwright's WebKit and Firefox.

## Editor and host coverage (Phase 10)

[Phase 10 execution record](PHASE10_2026-10-26.md) records the 68-spec editor matrix, the OurTextScores
smoke matrix, browser-specific fixes, focused retests and remaining qualification limits. The
[tracked inventory](PHASE10_EDITOR_SPECS.txt) can be passed to the resumable runner's `--specs-file`.
Chromium runs on PRs; nightly/manual CI adds Firefox and WebKit across four shards.

## Read-only score object hit snapshot

Engines that export `hitTestScoreObject` advertise it on the score instance; older packages leave the method
undefined. `await score.hitTestScoreObject(page, x, y)` accepts a zero-based page and finite page-local SVG/ABI
coordinates at 360 DPI. It uses the native selection picker's topmost selectable item and tolerance without
changing selection. The version-1 result reports `ok` for a visible note or rest, with zero-based measure,
staff and voice where available, and a page-local bounding rectangle (or `null` if geometry is unavailable).
Other results are `no-hit`, `unsupported`, `invalid-input`, or `unavailable`. A hit on a different selectable
item does not search through it for a note. Rectangles are engine bounds, not precise glyph ink outlines.

The entire lookup and geometry read occur in one native call. Results contain **no native address or handle**:
they are snapshots and may be stale after any edit, relayout, page/excerpt switch, score replacement or resource
change. Consumers must reject responses belonging to an old score or render generation and query again; this API
does not provide a universal generation counter or stable identity. Existing point selection behavior is unchanged.

To check the actual engine implementation, in addition to the normal build and bridge checks:

```bash
MS47_VERIFY_OBJECT_GEOMETRY=1 npm run verify:engine -- public/test_scores/three_notes_cde.musicxml
PLAYWRIGHT_PORT=3018 npx playwright test tests/score-object-geometry.spec.ts
```

For a development-only inspection overlay, open the editor with `inspectGeometry=1` in the URL and hover over
notation while holding Alt+Shift. The outline and status show the native snapshot; hover never selects an item.
The diagnostic is absent from production builds and compare mode. It clears on pointer input and keyboard activity,
and re-queries after the page SVG is replaced. The displayed measure, staff and voice indices are zero-based; the
page label is one-based. A stale, unsupported or unavailable result does not draw a box. Snapshot validity is still
limited by the lack of a universal native mutation generation: use it as a diagnostic, not as a persistent anchor.

## MusicXML fidelity and visual-review pilot

Five original fixtures and their provenance live in `tools/musescore/fixtures/osmd-fidelity/`. They cover nested tuplets,
cross-system ties, cross-staff notes, a hidden note and pickup lyrics. OSMD's BSD licence permits reuse subject to its
conditions; individual scores and transcriptions may have separate rights or notices, so inspect each file before
redistributing it. The pilot fixtures are original, not copies of OSMD scores.

```bash
node tools/musescore/check-fidelity-assertions.mjs
MS47_VERIFY_FIDELITY=1 MS47_OUTPUT=/tmp/ots-fidelity-check npm run verify:engine -- public/test_scores/three_notes_cde.musicxml
```

The verifier checks source, import/export, unedited reload, title edit, export and edited reload, and checks targeted
SVG elements as well as rendering. It writes `fidelity-failures.json` to `MS47_OUTPUT` and fails if any expectation
fails. The nested-tuplet fixture still imports with extra rests and dots, and exports as five beats instead of four; the input needs independent musical review. A patch fixes the observed pickup lyric endpoint on import and round trip, with an additional two-verse check. The nested-tuplet failures are not suppressed or presented as a passing semantic suite.

For a visual comparison, use separate, new directories; the verifier writes a capture manifest even when semantic
assertions fail. Create the parent directory first. Run both commands on the same controlled host, with the same
engine/resources/fonts and browser. Review semantic failures separately from image diffs.

```bash
mkdir -p .playwright-runs/osmd-visual
MS47_VERIFY_FIDELITY=1 MS47_FIDELITY_CAPTURE="$PWD/.playwright-runs/osmd-visual/run-a" MS47_OUTPUT=/tmp/ots-fidelity-a npm run verify:engine -- public/test_scores/three_notes_cde.musicxml
MS47_VERIFY_FIDELITY=1 MS47_FIDELITY_CAPTURE="$PWD/.playwright-runs/osmd-visual/run-b" MS47_OUTPUT=/tmp/ots-fidelity-b npm run verify:engine -- public/test_scores/three_notes_cde.musicxml
node tools/musescore/visual-report.mjs .playwright-runs/osmd-visual/run-a .playwright-runs/osmd-visual/run-b .playwright-runs/osmd-visual/report-ab
```

Capture and report directories must not already exist. The report records commits, dirty state, engine/fixture/tool
hashes, browser, viewport, fonts and environment; incompatible environments and missing or altered captures fail.
It emits sorted differences, full baseline/current images, red overlays and up to six labelled changed-region crops
per page; the report records omitted regions and dimensions. The default per-channel threshold is zero; override with
`OSMD_VISUAL_THRESHOLD=0..255` only with a documented reason. Any visual difference or incomplete comparison exits 1.
This compares the **same** renderer; it is not a cross-engine correctness oracle. Review changes against the checked-in baseline before accepting a new one. System font and fontconfig files are hashed
by content; a missing inventory or an environment mismatch makes the report fail.

### Pinned visual regression check

The `Engraving visual report` workflow captures the five original fixtures with the packaged browser engine in a
Playwright container pinned by digest. It compares them with `tools/musescore/visual-baseline/` and uploads the
current capture, full images, red overlays, crops and JSON/Markdown report on every run. It checks image hashes,
fixture hashes, browser and Node versions, capture code and font/configuration content; environment mismatches and
missing images fail. The kernel is recorded for diagnosis but is not used as a rendering-environment key, since the
container shares its runner's kernel. The package's preloaded font data is used with lazy resource fetching disabled;
this is a repeatable, limited rendering configuration, not coverage for CDN-loaded fonts.

To reproduce the CI capture, use a disposable checkout: the container runs `npm ci`, which replaces that checkout's
`node_modules`. Git LFS must have populated `public/webmscore.lib.wasm` and `public/webmscore.lib.data` first.
Run from the checkout root, with `visual-artifacts/` absent:

```bash
docker run --rm -v "$PWD:/work" -w /work \
  -e OTS_VISUAL_ENVIRONMENT='mcr.microsoft.com/playwright@sha256:3bed4b1a12f2338642f3d8cba28e291deef3c66bd4a964bbeb3e57bbff511dbd' \
  mcr.microsoft.com/playwright@sha256:3bed4b1a12f2338642f3d8cba28e291deef3c66bd4a964bbeb3e57bbff511dbd \
  bash -c 'git config --global --add safe.directory /work && npm ci --ignore-scripts --no-audit --no-fund && bash tools/musescore/run-visual-ci.sh tools/musescore/visual-baseline visual-artifacts'
```

The baseline records the current nested-tuplet semantic failures. The visual job records them separately and is not a
passing fidelity gate; `MS47_VERIFY_FIDELITY=1` remains strict. Pixel differences are review prompts, not proof of an
engraving defect. To update a baseline, capture into a new directory in the workflow's pinned image, compare it with
the old baseline, review the full pages and crops, and explain each expected change in the review. Replace the
baseline files only after that review; never overwrite a capture or report directory in place. Changes to fixtures,
fonts, the container or capture code also require a reviewed baseline refresh.

Validate fixture syntax and the nested passage duration with `python3 tools/musescore/validate-fidelity-fixtures.py` (requires lxml and the pinned MuseScore source checkout).

For regression triage while the nested-tuplet discrepancy remains, run the strict command above with a fresh
`MS47_OUTPUT` directory and then run:

```bash
node tools/musescore/check-fidelity-baseline.mjs /tmp/ots-fidelity-check/fidelity-failures.json
```

This comparator reports whether the exact, reviewed known-failure set is unchanged; it fails for new failures or
unexpected fixes. It does not make the strict fidelity suite pass. The lyric check uses the rendered extension's
endpoint rather than requiring a particular XML spelling. The targeted lyric test also checks independent verses and explicit stop markers over two MusicXML round trips:

```bash
MS47_VERIFY_LYRIC_EXTENSIONS=1 npm run verify:engine -- public/test_scores/three_notes_cde.musicxml
```

The pinned MuseScore MusicXML import code documents that nested tuplets are not yet supported. A pre-existing Qt-free native 4.7.4 spike reproduced both original discrepancies, but its build provenance was not independently established, and a desktop GUI comparison has not been completed.

## OSMD cross-engine triage pilot

This developer-only pilot runs the five original, provenance-recorded fidelity fixtures through the pinned OSMD
checkout and the OTS MuseScore/WASM engine. It records the input's MusicXML facts, OSMD's parsed source objects,
and MuseScore's exported MusicXML facts, then saves both renderings for human inspection. It is **not a correctness
oracle or a pixel-diff gate**: independent engravers make different legitimate layout choices, and either reader or
the input may be wrong. It does not test edit/export/reload or replace the separate strict fidelity suite.

Build the OSMD checkout at the revision in `tools/musescore/osmd-pilot.json` using that checkout's documented build.
The tool requires that exact revision, version and clean tracked sources; it records the actual generated bundle's
SHA-256 and lockfile hash, but cannot independently prove that an existing bundle was built from those sources.
Use a fresh output directory each time:

```bash
mkdir -p .playwright-runs/osmd-cross-engine
OSMD_SOURCE="$PWD/../opensheetmusicdisplay" \
MS47_VERIFY_CROSS_ENGINE=1 \
MS47_CROSS_OUTPUT="$PWD/.playwright-runs/osmd-cross-engine/my-run" \
MS47_OUTPUT=/tmp/ots-cross-engine-my-run \
npm run verify:engine -- public/test_scores/three_notes_cde.musicxml
```

Set `MS47_BUNDLE` to a bundled engine directory to exercise its browser package through the node harness. The
`report.json` records revision and artifact hashes, fixture hashes, OSMD diagnostics, engine resource hash, options,
counts and artifacts; `report.md` links renderings. OSMD's XML system and page break options are enabled deliberately.
OSMD shows all generated SVGs; MuseScore's picture is page 1 only. Different page sizes, fonts, margins and spacing
are expected, so images should be inspected, not subtracted. The report directory is exclusive; it cannot overwrite a
previous report. A discrepancy is reported for review without making the command fail; load/render failures make
it fail and are recorded per fixture.

The counts cover part count, common measure count, pitched note count, rests and visible pitched noteheads. Input
and MuseScore counts come from MusicXML; OSMD counts unique source notes and checks its pinned `PrintObject` and
`NoteHeadShape.NONE` semantics. Notehead visibility is a limited source-level approximation, not SVG ink counting.
Unequal per-part measure counts and unpitched/nonstandard notes are marked unsupported for the relevant metrics.
Synthetic rests, shared noteheads, hidden staves, repeats, multiple voices, percussion, pitch spelling, ties,
lyrics, nested durations and layout can require further normalization or independent assertions. Matching counts
cannot establish correctness. Only five small, single-part fixtures were sampled; they cannot establish a useful
false-positive rate or justify running this comparison as an automated catalogue gate.

## Local page-delivery profiling

The developer scripts below measure the current editor in headless Chromium with its real worker and WASM. Start an
isolated development server first, warm its compilation, then use new output paths (the scripts refuse to overwrite
reports):

```bash
NEXT_DIST_DIR=.next-dev-phase7 npx next dev --webpack --hostname 127.0.0.1 --port 3037
# In another terminal:
node tools/musescore/page-navigation-profile.mjs http://127.0.0.1:3037/ /tmp/page-navigation.json
node tools/musescore/page-prefetch-profile.mjs http://127.0.0.1:3037/ /tmp/page-prefetch.json
node tools/musescore/full-layout-profile.mjs http://127.0.0.1:3037/ /tmp/full-layout.json
```

Navigation compares initial target-page misses to repeated cache hits and checks score export, selection and undo
invariants. It records worker `saveSvg` RPC, measured SVG-container `innerHTML`, a DOM mutation commit and an
animation-frame-plus-task paint proxy, not a physical display paint. Set `OTS_PAGE_PROFILE_GC=1` for separate forced
main-page GC snapshots; do not compare those timings to normal runs. `OTS_PAGE_PROFILE_CONTEXTS` and
`OTS_PAGE_PROFILE_CYCLES` adjust the sample count. The prefetch script observes an actual Bach playback turn with a
local `public/soundfonts/default.sf3` and checks the page was rendered once before the boundary;
`OTS_PREFETCH_CONTEXTS` controls repetitions. The full-layout script measures explicit relayout RPC on an unedited
score; it is separate from page turns and does not replace the incremental/full layout oracle.

These scripts are diagnostic, not performance gates. The JSON records fixture and WASM hashes, environment, raw
samples, p50/p95 and scope limitations. Main-page JS heap and DOM counters do not measure worker or WASM usage; the
playback diagnostic's WASM heap number is capacity, not used memory. Use a controlled production build, more samples
and representative devices before making product performance claims.
