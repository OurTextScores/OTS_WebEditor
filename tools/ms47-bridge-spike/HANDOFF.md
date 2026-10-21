# MuseScore 4.7 engine port: handoff (2026-10-21)

## Where things stand

The OTS editor runs on a fork of MuseScore 4.00 (`webmscore-fork`, Qt5 WASM, emsdk 2.0.6). This branch replaces that
engine with **upstream MuseScore v4.7.4, built to WASM without Qt** (emsdk 4.0.7), behind the **same C ABI and the
same unmodified `web-public/src/index.js`**.

- **All 184 of the 4.00 bridge's exports exist and are verified**: load/save, SVG, PDF, MIDI, audio, editing,
  selection, note input, parts and drag.
- The full suite runs green, including with fonts fetched on demand: 144 verified operations, about 80 s.
- Size: 11.26 MB wasm, 3.60 MB gzip, with playback. The 4.00 engine is 9.72 MB / 3.17 MB.
- **Not yet usable in the browser.** The bridge links for Node only (`ENVIRONMENT=node`, `NODERAWFS`). The browser
  build is the next task (below).

Branch: `engine-ms47-spike` in OTS_Web, **13 commits, not pushed** (6393dd94 … 1b098e9e). OurTextScores rule:
commit, don't push. Working tree clean.

## Read these first (all in `tools/ms47-bridge-spike/`)

| File | What it is |
|---|---|
| `PORT_LOG.md` | Checkpoint log, newest first: what was ported, the evidence, the bugs found |
| `DECISIONS.md` | The 9 product decisions. All recommendations were accepted by the user; implementation status is noted inline |
| `STUBS_AUDIT.md` | Audit of Qt-free stubs: fixed, benign and open items, and how to re-run it |
| `README.md` | Build and verify basics |
| `upstream-v4.7.4-noqt.patch` | Every change to upstream (about 25 files). Regenerate with `git diff` in `~/workspace/ms47-spike` after editing upstream |

Private background docs (gitignored) in `docs/private/`:
- `MS47_BUILD_SPIKE.md`
- `WASM_MUSESCORE4_UPGRADE.md`
- `MUSESCORE_FEATURE_PARITY_ROADMAP.md`
- `MSCX_FORMAT_DELTA_CHECKLIST.md`
- `JOJO_37_BUGFIX_COMPARISON.md`

## Layout on disk

- `~/workspace/ms47-spike`: upstream v4.7.4 worktree (detached) with the patch applied. Bridge sources are copied
  into `spike/` by the build. **Edit upstream there, then regenerate the patch.** `build.sh` refuses to run if the
  worktree and the patch disagree.
- `~/workspace/ms47-build-wasm`: default (optimized) build directory. The other directories are
  `ms47-build-wasm-playback` (fast-link debug) and `ms47-build-wasm-playback-opt`.
- `~/workspace/ms47-build-native/res`: staged engine resources (fonts, styles, instruments, MPE profiles), made by
  `stage_resources.py`.
- `~/workspace/emsdk-4.0.7`: the toolchain for this build only.

## Build and test

```bash
cd ~/workspace/OTS_Web/tools/ms47-bridge-spike
MS47_JOBS=8 ./build.sh                 # optimized, playback on (default); ~1–2 min with warm objects
MS47_FAST_LINK=ON MS47_JOBS=8 ./build.sh   # skip Binaryen while iterating

cd ~/workspace/OTS_Web
MS47_LAZY_RESOURCES=1 MS47_VERIFY_EDITS=1 MS47_VERIFY_INSPECTOR=1 MS47_VERIFY_SELECTION=1 \
MS47_VERIFY_NOTEINPUT=1 MS47_VERIFY_MEASURES=1 MS47_VERIFY_TIMELINE=1 MS47_VERIFY_SPANNERS=1 \
MS47_VERIFY_MISC=1 MS47_VERIFY_DRAG=1 MS47_VERIFY_MIDI=1 MS47_VERIFY_AUDIO=1 MS47_VERIFY_PDF=1 \
MS47_VERIFY_STUBS=1 MS47_VERIFY_PARTS=1 MS47_VERIFY_RESOURCES=1 \
MS47_SOUNDFONT=$HOME/workspace/demo_data/cache/default.sf3 node tools/ms47-bridge-spike/verify.mjs
node tools/ms47-bridge-spike/inventory.mjs   # export coverage against the 4.00 ABI ("remaining": [])
```

The verifiers compare against the shipping 4.00 Node build (`webmscore-fork/web-public/webmscore.nodejs.cjs`) where it
matters: MIDI notes, PDF page sizes, audio length.

## Next tasks, in order

1. **Browser build (DECISIONS item 8).**
   - Add a link variant producing `webmscore.lib.{js,wasm,data}` to match the 4.00 loading contract in `helper.js`:
     `ENVIRONMENT=web,worker,node`, MEMFS instead of `NODERAWFS`, `FORCE_FILESYSTEM`, and the resource root `/res`
     instead of `process.env`. `bridge.cpp` `init()` currently calls `process.env` unconditionally.
   - Preload everything under the staged root except `lazy-resources.json` (10.5 MB raw) with
     `--preload-file …@/res`.
   - Then test it through `helper.js` in Node (`getPreloadedPackage`) and in the editor.
   - The CDN must serve the lazy files and `fonts/fallback/NotoSans{JP,KR,SC}-Regular.otf`. Those fallback fonts are
     not staged anywhere yet; set `WebMscore.resourceBaseUrl` or `MSCORE_RESOURCE_BASEURL`.
2. **Rebuild and retest the 4.00 bundle with the new `index.js`.** The on-demand loader added to
   `webmscore-fork/web-public/src/index.js` is guarded (`Module._missingResources` absent → no-op), but the 4.00
   rollup bundle hasn't been rebuilt or tested with it. It uses getters/setters, not class fields, for babel.
3. **Incremental layout (DECISIONS item 9).** Port the editor's incremental-layout allowlist and oracle
   (memory `project_w7_perf_layout_oracle`). Every edit does a full layout today (`layoutLinked`).
4. **Open audit items** (`STUBS_AUDIT.md` "Open"):
   - SVG images inside scores are silently not drawn (the Qt-free `SvgRenderer` is a stub).
   - PDF export refuses GIF, BMP and 16-bit or interlaced PNG.
5. **Listening comparison of 4.7 against 4.00 playback** before switching. Timing matches and dynamics correlate
   (0.88 at 500 ms), but note shaping differs by design (MPE articulations).

## Gotchas that cost time

- **All build directories link into the same `~/workspace/ms47-spike/build.artifacts/`.** `verify.mjs` always loads
  that file; `MS47_BUILD` only picks which CMake cache it reports. A run tests whatever was linked last.
- **Fresh configure:** `muse_framework_config.h` is generated before `SpikeEngineOnly.cmake` runs. Set
  `MUSE_CONFIGURATION_IS_WEB`, `MUSE_THREADS_SUPPORT` and `MUSE_MODULE_AUDIO_EXPORT` on the command line, as
  `build.sh` now does. Otherwise the link fails (`SoundTrackWriter`, `pthread_setschedparam`).
- **Exports go inside an `extern "C"` block**, or JS reports "func is not a function". The fast-link debug build
  asserts that ccall argument counts match the native signature.
- **IoC resolves of unregistered interfaces return `nullptr` silently.** Before relying on a service, check that
  bootstrap registers it. That is how images used to crash the engine (see the audit).
- **The parts test registers a global CJK fallback font**, so tests that check unregistered-fallback behaviour must run
  before it, or without it. Order in `verify.mjs`: … PDF, stubs, parts, resources.
- **A destroyed score must release its playback model** (`releasePlaybackForScore` in `destroy`). Otherwise its stale
  engine sequence sounds under the next score's first render.
- **Test scores from MuseScore 4.6** (Bach) carry styles 4.00 misread. When 4.7 differs from 4.00, read the score's
  style before calling it a regression: 4.7 is usually the correct one.

## Decisions the user still owns

None are pending. Product-facing defaults chosen along the way, flagged so they can be revisited:
- Engine warning dialogs auto-answer **Ok** (upstream `MessageBox` guard). For example, note input over a measure
  repeat proceeds without asking.
- PDF text is glyph outlines: not selectable or searchable (accepted with DECISIONS item 2).
- Default page size is A4 (desktop picks Letter in US locales; 4.00 in the browser also used A4).
- MusicXML `inferTextType` is off, matching desktop and `MUSE_SOUNDS_INTEGRATION_ROADMAP.md`.
