# MuseScore 4.7 engine port: handoff (2026-10-21)

## Where things stand

The OTS editor runs on a fork of MuseScore 4.00 (`webmscore-fork`, Qt5 WASM, emsdk 2.0.6). This branch replaces that
engine with **upstream MuseScore v4.7.4, built to WASM without Qt** (emsdk 4.0.7), behind the **same C ABI and the
same unmodified `web-public/src/index.js`**.

- **All 184 of the 4.00 bridge's exports exist and are verified**: load/save, SVG, PDF, MIDI, audio, editing,
  selection, note input, parts and drag.
- The full suite runs green, including with fonts fetched on demand: 144 verified operations, about 80 s.
- Size: 11.26 MB wasm, 3.60 MB gzip, with playback. The 4.00 engine is 9.72 MB / 3.17 MB.
- **Runs in the browser:** the editor loads the 4.7 package (`build.sh` also links `webmscore.lib.*`).

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

## Next tasks, in order (updated 2026-10-22)

Done since the first handoff:
- browser package (`webmscore.lib.*`, `bundle.mjs`);
- 4.00 coordinate units at the ABI;
- incremental layout with the layout oracle;
- 4.00 SVG contract: classes, outlined text, stable order;
- editor parity fixes from the Playwright suite;
- the other agent's system locks (engine side; their UI is on `main`).

Editor suite on 4.7: **355/360** in the last full run (2026-10-22, post-edit relayout skipped); the 4 failures pass on
rerun (load flakes). The tracked 4.00 `webmscore.webpack.mjs` is rebuilt with the new `index.js` and passes its suite
apart from known 4.00 failures. Use `--reporter=list,json` (`PLAYWRIGHT_JSON_OUTPUT_FILE`) so a stopped run keeps its
progress. Runs
use worktrees `~/workspace/ots-ms47-browser` (4.7, port 3150) and `~/workspace/ots-400-baseline` (4.00, port 3160),
with results in `~/workspace/ms47-e2e-results/`.

1. Done 2026-10-22: compare highlight geometry (a reflow race in the spec, now polled); system-lock UI on this engine
   (undo refresh fixed on `main`, `tests/system-locks-engine.spec.ts`); the editor skips its post-edit relayout on
   4.7 (`layoutsAfterCommands`; evidence in PORT_LOG).
2. **Ship prep:** host the lazy fonts and the `fonts/fallback/NotoSans{JP,KR,SC}-Regular.otf` CDN files.
3. **Listening comparison** of 4.7 against 4.00 playback (needs a person): matched pairs and a guide are in
   `~/workspace/ms47-e2e-results/listening/`. Timing matches; Bach is about 1.7 dB louder on 4.7 (check dynamics).
4. Deferred audit items (`STUBS_AUDIT.md`): SVG images in scores and PDF GIF/BMP. No local score uses them (2,316
   checked). Font family substitution was checked and is benign.

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
