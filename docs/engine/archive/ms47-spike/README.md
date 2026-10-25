> Historical migration record, archived 2026-10-24. Paths and branch/default-engine statements below describe the original audit. See [the current production guide](../../README.md).

# MuseScore 4.7 bridge re-port

An isolated Qt-free port of the OTS webmscore C ABI onto MuseScore **v4.7.4**.
The production 4.00 fork and public engine artifacts remain the application default.
This directory makes the formerly private build spike reproducible from tracked sources.

## Build and exercise the vertical slice

Prerequisites: an upstream checkout at `../MuseScore` containing tag `v4.7.4`,
Emscripten 4.0.7 installed at `../emsdk-4.0.7`, CMake, Ninja, Python 3, Node,
and the repository Playwright/Chromium installation (`npx playwright install chromium`).
Paths below are relative to the OTS_Web repository.

```sh
bash tools/ms47-bridge-spike/build.sh
MS47_VERIFY_EDITS=1 MS47_VERIFY_INSPECTOR=1 MS47_VERIFY_SELECTION=1 MS47_VERIFY_NOTEINPUT=1 node tools/ms47-bridge-spike/verify.mjs
node tools/ms47-bridge-spike/inventory.mjs
node tools/ms47-bridge-spike/verify-exports.mjs
node tools/ms47-bridge-spike/preview.mjs
```

`build.sh` uses or creates `../ms47-spike`, applies the original small Qt-free
patch, stages upstream resources, installs these bridge sources in `spike/`, and
builds `ms47_bridge` in `../ms47-build-wasm`. It preserves the standalone
`ms47_spike` target if the original harness is present. Override paths with
`MS47_SOURCE`, `MS47_BUILD`, `MS47_RESOURCE_ROOT`, and `MS47_EMSDK`.
`MS47_JOBS` defaults to two. No generated engine files are copied to `public/`.
Use `MS47_FAST_LINK=ON bash tools/ms47-bridge-spike/build.sh` during porting to
skip Binaryen optimization and retain readable WASM stack traces. Use the default
optimized build for benchmark comparisons. Reports record the actual fast-link
setting, WASM size/hash, and Node version.

The verifier imports copies of the **existing** `web-public/src/index.js` and
`helper.js`; only the generated engine import path is redirected. Thus load,
WasmRes decoding, saveSvgRaw/saveSvg, selection, pitch and undo/redo run through
the application's existing score wrappers. This is a Node test; browser worker
RPC, font fetching, resource packaging, and UI integration remain separate work.

Assertions require MusicXML and rendered pixels to change after pitch-up, return
exactly to their originals after undo, and return to the edited versions after redo.
Upstream may reorder equivalent paint operations after layout, so SVG byte order
is not an undo oracle. Chromium comparisons require identical pixels, loaded
embedded fonts, valid XML, and nonblank output. It
also exercises two score instances sequentially and rejects invalid pages and
unsupported formats. Default inputs are the small C/D/E MusicXML fixture and
`bach_orig.mscz`. Supply score paths as arguments to expand the corpus.
With `MS47_VERIFY_EDITS=1`, additional edit cases exercise saved notation, one
undo entry per command, and pixel restoration. `MS47_VERIFY_INSPECTOR=1` checks
the inspector schema, mixed values, input rejection and range undo.
`MS47_VERIFY_SELECTION=1` checks point/mode/range selection, geometry across pages,
text-frame hit tests, native clipboard paste and undo through the existing wrappers.
The legacy range-to-list export has no JS method, so that check calls its native
export directly. For a targeted
rerun, use `MS47_ONLY_EDITS=1 MS47_EDIT_CASES=addFiguredBassText` with the edits flag;
this does not run the vertical-slice corpus.
`MS47_VERIFY_NOTEINPUT=1` checks native cursor geometry, sequential pitch entry,
accidentals/dots/rests, legacy repitch/timewise indices, adding to a chord, voices,
click placement, percussion shortcuts and tablature. Musical changes must undo
and redo as single commands; the main scenarios also restore exact pixels.

SVGs, MusicXML and per-call timings are written to `/tmp/ms47-bridge-results`
(override with `MS47_OUTPUT`). Timings are wall-clock measurements, not effort
estimates, and include layout where the export performs it.

For quick C++ iteration after configuring, source the Emscripten environment and run
`python3 tools/ms47-bridge-spike/syntax_check.py`. It checks with the actual build
flags without waiting for WASM optimization.

## Port decisions

* Preserve the WasmRes envelope: uint32 error, uint32 byte count, payload, NUL.
  The existing JS reader frees it. Keep a separate malloc'd score handle because
  JS `destroy()` frees the handle after the native export releases the project.
* Keep EngravingProject alive for each score. Set LocalFileInfoProvider before
  loading; use MscReader for MSCZ/MSCX and the upstream MusicXML importer.
  Run project setup after native loading too, so padding tables use loaded styles.
* Load raw MSCX documents by wrapping them in an in-memory native ZIP. The
  upstream `MscIoMode::XmlFile` is the multi-file MSCS container, which is not the
  existing JS API's MSCX format. Export raw MSCX by extracting the score and
  including its native serialized style; verify both format and pixel round trips.
* Use `startCmd(actionName)` / `endCmd()` for edits. Upstream made `cmdPitchUp`
  protected; desktop NotationInteraction uses `upDown(true, CHROMATIC)`.
* Preserve the old note-entry method numbers with an explicit map: 4.7 inserted
  BY_DURATION, and renamed STEPTIME to BY_NOTE_NAME. Use the native pitch resolver
  for pitched entry and `Drumset::pitchForShortcut` for percussion. Initialize the
  tablature string as desktop does; use desktop's current cursor geometry.
* Access page geometry through `ldata()->bbox()`.
* Adapt the generic Qt-free font metrics from 360 DPI to engraving's 1200 DPI,
  and advertise 1200 DPI in the SVG painter. This keeps measured text, painted
  text, layout and hit boxes in the same units without repeatedly scaling fonts.
* Preserve JS dynamic indices explicitly: 4.7 inserted SFFF/SFFFZ before SFP.
  BeamMode values 3/4 kept their meaning but were renamed BEGIN16/BEGIN32.
* Parse figured-bass text with the upstream parser and replace the complete
  element through undo, keeping parsed figures and text together. New figure
  children require an explicit parent; a constructor parent alone is implicit.
* Use the public tempo properties for the removed undoSetTempo/undoSetFollowText
  methods. The existing-tempo path is checked separately from initial insertion.
* Stream SVG paint operations in order, reusing BufferedPaintProvider's state
  and save/restore implementation. Buffered DrawData groups primitives by type,
  which would lose the ordering between overlapping text, paths and polygons.
* Embed fonts returned by upstream IFontsDatabase into SVG so it does not depend
  on installed browser fonts. This is intentionally larger than outlined glyph
  SVG and requires visual tuning before production.

## Remaining scope

`inventory.mjs` compares actual KEEPALIVE names in the 4.00 bridge with this
port. Presence is implementation inventory, **not** a validation claim. The
initial slice covers load, SVG, measure selection, chromatic pitch-up, undo,
redo, MusicXML export and lifecycle. Excerpts, full selection/range semantics,
other mutations, progressive layout, metadata and playback need porting and
behavioral checks. Undo information/history use upstream public stack accessors;
they are verified with the currently ported mutations. PNG/PDF and audio are separate spike items in
`docs/private/MS47_BUILD_SPIKE.md`.

SVG images and wrapped/tabbed rectangle text currently return an explicit export
error. The provider supports paths, polygons, symbols/text, aligned rectangle
text (needed for figured bass), embedded fonts, transforms, pens, rectangle
clipping and masks. It still needs a broad visual
corpus comparison, including text shaping, font fallback and non-default paint
composition modes. A successful structural/undo test does not certify visual
parity.

The legacy 24-bit selection filter needs a compatibility decision/patch: 4.7 split
voice, chord-note and element filters and removed NOTES_AND_RESTS. That export is
still pending, rather than casting old bits into different categories.

The earlier title-alignment issue exposed a 360/1200-DPI mismatch in Qt-free
text measurement. The bridge now adapts those units, and browser text-center hit
tests cover a generated title and Bach's copyright frame. Bach now lays out as
three pages: its explicit copyright VBox/page break occupies the middle page.
The older two-page result was measured before the metrics correction. Font
fallback and broad desktop visual parity still need independent comparison.

Mutations currently request full layout after the engine command. The OTS
incremental-layout allowlist/progressive-layout work is still pending; these
runtime samples are not a claim about final editor interaction performance.
Independent engineering effort per export has not been isolated: the initial
work was batched and interrupted by laptop standby. The latest selection report
records a bounded 12-export group (including a shared DPI fix), separately from
invocation timings. Neither is a basis for extrapolating drag, excerpts or audio.

Current measured scope and evidence: [PORT_LOG.md](PORT_LOG.md). Decisions needed for the remaining exports, with
recommendations: [DECISIONS.md](DECISIONS.md).
