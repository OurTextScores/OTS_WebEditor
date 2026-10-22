# Incremental layout — 2026-10-21 (DECISIONS.md item 9)

**Edits no longer lay out the whole score.** The bridge first ended about 96 exports with `layoutLinked`: a full
`doLayout()` of every linked score after every edit. The 4.00 bridge never did that. Its 82 commands rely on
`endCmd`'s range layout, `doLayout()` appears three times, and `relayout()` is `setLayoutAll()` + `update()`. The
editor then adds its own full `relayout()` after edits outside its allowlist.

What changed:
- `layoutLinked` is now `masterScore()->update()`. That is a no-op once `endCmd` or `undoRedo` has laid out the edited
  range, and it finishes any pending layout-all (style changes, layout mode).
- `getScore()` marks every linked score open, because `update()` lays out only open parts (desktop: visible tabs).
- Full layout is explicit in `layoutAllLinked`: `relayout()`, new part scores, fonts and resources.

**Oracle** (`layout-oracle.mjs`, `MS47_LAYOUT_ORACLE=1` for undoable calls or `=all` for every non-read call):
- It wraps every loaded score. After each checked call it draws every page of every linked score (full score and
  each part), forces a full relayout, and draws again.
- Full suite: **939 checked calls over 121 methods, none stale**.
- Mutation check: with parts left closed, the oracle flags `pitchUp` and `undo`. Its first version missed this because
  it drew only the edited score, and was fixed to draw every linked score.

Edit speed (Node, CPU-contended):

| score | pitch edit | undo | full relayout (old cost of every edit) |
|---|---|---|---|
| Fauré, 32 pages | 28 ms | 48 ms | 2,189 ms |
| men-head, 9 pages | 14 ms | 23 ms | 123 ms |

The editor's `incrementalLayout` allowlist exists because 46 of 716 edits differed from full layout on the 4.00
engine. On 4.7 the bridge oracle finds no such edits, so the allowlist can be re-swept with the editor's own oracle
(W7.1) and likely widened. That is an editor change, still to do.

---

# Browser package, SVG contract and ABI units — 2026-10-21

**The editor runs on the 4.7 engine in Chromium.**

Browser package:
- `build.sh` also links `webmscore_lib` into `<build>/browser/webmscore.lib.{js,wasm,data}`. It follows the 4.00
  package contract: ES-module factory, MEMFS, `FORCE_FILESYSTEM`, and `FS_createDataFile` for
  `addFont`/`setSoundFont`.
- The data file is a `/res` preload of the staged root minus `lazy-resources.json`: 13.8 MB raw, 4.0 MB gzip. FreeSerif
  (3.2 MB) has to stay because it is the default Tablature font.
- A stamp file relinks when the preload changes.
- `patch_lib.py` (post-link) replaces emscripten's Node-only `await import("module")`, which Next/webpack tried to
  resolve for the browser, with `process.getBuiltinModule`. Node bundles therefore need Node >= 20.16.
- Browser builds keep the boot log off stderr (it surfaced as `console.error`) and create `/fonts`.

Bundles and tests:
- `bundle.mjs <dir>` builds web-public's real rollup bundles against the package in a scratch copy, with locked dev
  dependencies.
- `rollup.config.js` gives the Node CJS bundle a real `import.meta.url`. Emscripten 4 calls `createRequire` with it,
  and the old `""` threw.
- `verify.mjs` `MS47_BUNDLE=<dir>` runs the whole suite through `webmscore.nodejs.cjs`: green.
  - Tests pass bytes, not host paths, for `addFont`/`setSoundFont`.
  - Native exports without JS wrappers go through a test-only `__testModule` getter in `webmscore.nodejs.test.cjs`.

**SVG contract.** The editor hit-tests the engine's SVG by element class:
- `ELEMENT_SELECTION_SELECTOR`, text classes, `.Note` drag, `.StaffLines` input shadow, `.Note,.Rest` playback
  colouring, and `.selected`.
- `saveSvg` now paints element by element, as upstream `SvgWriter` and the 4.00 fork do: staff lines joined per system,
  then the page's elements in z order. Each primitive's group carries `class="<typeName>[ selected]"`.
- On Bach page 1 the classes and their counts equal the 4.00 SVG (Note/Stem 320, Beam 160, …). The only difference:
  4.00 drew the footer as part of `Page`, while 4.7 lays it out as `Text`. Test: `verify-stubs.mjs` `svgclasses`.

**ABI units.**
- 4.00 engraved at 360 DPI, and every coordinate crossing the bridge was in those units. The editor relies on that:
  engine boxes go straight into overlay boxes in SVG pixel space, and zoom presets (25–100%) and clamps are fractions of
  the SVG's natural size.
- 4.7 engraves at 1200 DPI. The first browser run showed fit-width as "9%". The bridge now converts at the boundary
  (`toAbi`/`fromAbi`, `ABI_UNIT = 360/DPI`) and stays native inside. Converted:
  - SVG size and drawing;
  - selection boxes and staff bands;
  - the note-input cursor;
  - spatium;
  - positions and page size;
  - grips;
  - every point taken by the at-point selectors, `putNote`, drag, drop and grip.
- Bach now reports page width 2975.75 (4.00: 2977.2). Spatium is 25.37 against 4.00's 24.8, which misreads this
  4.6-format file's staff size.
- Engine suite green: 145 operations.

---

# On-demand resources and the Qt-free stub audit — 2026-10-21

**On-demand resources (DECISIONS.md items 3 and 8), engine and JS loader.**
- `lazy-resources.json` lists 17 font files (9.9 MB) that stay out of the preload: optional music fonts, their Text
  companions, the FreeSerif bold/italic faces and FreeSans. FreeSerif regular stays in because it is the default
  Tablature font. The preload is 10.5 MB raw.
- The engine records font files it looked for and did not find (filesystem shim, `fonts/` only). It exposes
  `missingResources` (those files, plus CJK fallback ids `ja`/`ko`/`zh` by script found in the score's text),
  `resourceRoot`, `writeResource` and `resourcesAdded` (re-resolve text faces, load newly present music fonts,
  relayout).
- Music fonts whose files are missing now fall back to Bravura until they arrive (upstream `fontByName` patch, plus a
  bridge `addSymbolFont` that refuses missing files).
- `index.js` gains `WebMscore.resourceBaseUrl` (`MSCORE_RESOURCE_BASEURL`), `fallbackFonts` and an overridable
  `fetchResource`. After a laid-out load it fetches what is missing and lays the score out again. It is a no-op on the
  4.00 engine, and unavailable resources are not retried.
- `verify.mjs` `MS47_LAZY_RESOURCES=1` boots from a minimal copy of the resource root and serves fetches from the full
  one. The whole suite passes that way. Of the corpus, only the test's Japanese fallback needed anything.
- `verify-resources.mjs`:
  - Petaluma is fetched on load, and the relayout equals a warm load byte for byte.
  - An unavailable MuseJazz draws in Bravura and is not retried.
  - A kana title fetches and registers the Japanese fallback and is drawn.
- Still to do for item 8: the browser link variant (`webmscore.lib.{js,wasm,data}` with the preload package, MEMFS).

**Stub audit:** see `STUBS_AUDIT.md`. Fixed:
- **Crash:** any score containing an image aborted the engine (unregistered `ICryptographicHash`/`IImageProvider`).
  Now MD4 store names and header-only pixmaps. Images are embedded in SVG and in PDF (JPEG, 8-bit PNG with alpha).
- **Text corruption:** the Qt-free `Char`/`String` case and class functions truncated UTF-16 to a byte (`Ł`→`a`,
  Cyrillic `Р` treated as a space). Now Unicode-correct; lyric alignment with a verse number is fixed (it was half a
  staff space off for accented words).
- Desktop defaults restored: fret diagrams auto-update, UI colours, MusicXML `inferTextType` off.
- Upstream music fonts that were never registered are now registered.

Regression tests: `verify-stubs.mjs` (`MS47_VERIFY_STUBS=1`), and the image fixture added to the PDF corpus. Full suite
in lazy mode: green, 144 verified operations.

---

# Playback in the default build — 2026-10-21

`MS47_WITH_PLAYBACK` now defaults to ON (CMake and `build.sh`): one module with the whole 4.00 API, as the 4.00
engine is. Optimized sizes (wasm):

| | raw | gzip |
|---|---|---|
| 4.7 bridge, no playback | 9.90 MB | 3.13 MB |
| **4.7 bridge with playback (default)** | **11.26 MB** | **3.60 MB** |
| 4.00 engine (with playback) | 9.72 MB | 3.17 MB |

Playback costs 474 KB gzip; the full 4.7 engine is 13% larger than 4.00 to download. Full suite on the optimized
build: green, 137 operations; Bach renders to WAV in 1.0 s (≈150× real time; Binaryen optimization makes no
difference here, the debug directory already compiles with Release flags).

Build fix: `muse_framework_config.h` is generated before `SpikeEngineOnly.cmake` runs, so on a **fresh** configure
its FORCE-set options came out wrong (`MUSE_CONFIGURATION_IS_WEB` off, `MUSE_THREADS_SUPPORT` and
`MUSE_MODULE_AUDIO_EXPORT` on). Earlier build directories had been reconfigured and were correct; a fresh playback
build failed to link (`SoundTrackWriter`, `pthread_setschedparam`). `build.sh` now passes all three on the command
line.

Note for comparisons: every build directory links into the same `ms47-spike/build.artifacts`, and `verify.mjs`
always loads that file (`MS47_BUILD` only selects the CMake cache it reports), so a run tests whichever build was
linked last.

---

# PDF checkpoint — 2026-10-21: 184/184 exports

**Every 4.00 export now exists on the 4.7 bridge** (playback build; the default build lacks only the nine audio
exports until playback joins it). `savePdf` is the native vector writer of DECISIONS.md item 2 (`pdfpaint.h`):
the same streaming paint-provider shape as `SvgPaint`, emitting PDF 1.4 content-stream operators in painter order
(per-primitive `q … cm … Q`, clip rects and masks as pre-transformed paths, pen caps/joins/dashes, alpha through
`ExtGState`, Flate-compressed streams), with all text drawn as HarfBuzz-shaped FreeType glyph outlines cached per
glyph. No fonts are embedded, so files are small and render identically everywhere; text is not selectable or
searchable (the accepted trade-off). Images fail the export, as in SVG. Title metadata follows desktop
(`workTitle`, else the score name, plus " - part" for parts). Glyph shaping and rect-text layout are now shared
with the SVG writer (`SvgFontOutlines::shape`, `layoutRectText`).

`verify-pdf.mjs` (`MS47_VERIFY_PDF=1`): page count, page size and title checked with poppler, page size against
4.00's PDF; every page rasterised by poppler and compared with the same page's SVG rasterised by Chromium. Music
pages agree ≥ 0.998 (fraction of each image's ink with ink within 1 px in the other). The text-only page in Bach
(page number and footer) is 0.905: the browser shapes the SVG's `<text>` about 1% wider than the engraving metrics
the layout centred it with, and the PDF's outlines follow the layout, so that page has a documented 0.85 floor.
Bach: 3 pages, 45 KB in 0.34 s (4.00: 56 KB).

Bug found by comparing with 4.00's PDF: upstream `FontsDatabase::actualFont` replaces a missing family with the
plain default face, dropping bold and italic (Qt substitution keeps them; the Qt-free build never had it). Bach asks
for "Tempus Sans ITC" italic measure numbers and drew them upright. Patched to keep the requested weight/slant when
the default family has that face. The other visible differences from 4.00 on Bach (non-bold title, 18 pt measure
numbers) are 4.7 reading the file's 4.6.3 style correctly; 4.00 misread the newer format.

Full suite on the playback build: green, 137 verified operations.

Next: optimized playback build (size, speed) and folding playback into the default build; on-demand fallback
fonts and lazy resource packaging (items 3 and 8); incremental layout (item 9).

---

# Streaming playback checkpoint — 2026-10-21

**183/184 exports; only `savePdf` remains.** All nine audio exports are on 4.7's engine with the 4.00 JS ABI
unchanged: `saveAudio`, `saveAudioForMeasureRange`, `synthAudio`, `synthAudioFromSelection`,
`synthAudioForMeasureRange`, `synthAudioSelectionPreview`, `processSynth`, `processSynthBatch` (the 4.00
`SynthRes` layout: done, start/end seconds, byte size, 512 de-interleaved float frames per chunk; batches are a
malloc'd pointer array). `getValue` is now an exported runtime method (the JS `SynthRes` reader needs it).

`verify-audio.mjs` (`MS47_VERIFY_AUDIO=1`, needs `MS47_SOUNDFONT`): whole-score streaming is **bit-identical** to
`saveAudio` (12,662 chunks of Bach in 0.73 s); `synthAudio(30)` starts at 30.000 s and cancel ends the stream with
empty done records afterwards; the bar 3–4 range starts and ends at the bars' played times and its WAV length
(6.861 s) equals 4.00's to the sample; play-from-selection starts at the selected bar; a single-note preview of
400 ms sounds for 0.41 s (rounded to whole chunks). Full suite on the playback build: green, 134 verified
operations, 1m15s.

Bug found by the bit-identity check: a destroyed score's `PlaybackModel` (holding the freed `Score*`) and its
engine sequence were never released, and the stale sequence sounded under the next score's first render.
`destroy` now releases them. The spike's numbers are unaffected (that render was the process's first).

Differences from 4.00: with a measure-range selection, 4.00's `synthAudioFromSelection` started at 0 s; 4.7
starts at the selected bar. The preview auditions the selected notes/chords through `PlaybackModel`'s
off-stream events (desktop's "play on selection") instead of 4.00's playback-controller round trip. The engine is
one shared mixer: starting a stream stops whatever stream was running (the editor runs one transport at a time).

Next: `savePdf` (DECISIONS.md item 2), then an optimized playback build for size and speed, then making
playback part of the default build.

---

# Playback spike — 2026-10-21 (DECISIONS.md item 1)

**Result: 4.7's own audio stack renders in the Qt-free WASM bridge, faster than 4.00.** Behind the new
`MS47_WITH_PLAYBACK` build option (off until the streaming exports are ported): engraving playback (MPE), `muse_mpe`,
audio common and the audio engine with FluidSynth, as upstream's own web audio engine builds them. `playbacktools.h`
creates the engine services in-process (no RPC; the bridge thread is the engine thread), builds a `PlaybackModel` and
one engine sequence per score, and renders offline as upstream's `SoundTrackWriter` does. `saveAudio('wav')` works
(32-bit float, stereo, 44.1 kHz).

Bach (`bach_orig.mscz`) with the OTS demo soundfont (`demo_data/cache/default.sf3`), Node, unoptimized debug build:

| | 4.00 engine | 4.7 bridge |
|---|---|---|
| audio length | 146.999 s | 147.0 s |
| render time | 3.0 s | 0.9 s |
| RMS / peak | 0.0213 / 0.190 | 0.0227 / 0.280 |
| loudness-envelope correlation with 4.00 | — | 0.59 (10 ms), 0.70 (100 ms), 0.88 (500 ms); best lag 0–10 ms |

Notes line up in time and phrase-level dynamics track closely; note shaping differs, as expected from 4.7's MPE
articulation rendering. A listening comparison is still worth doing before switching.

Upstream patch additions for this (all Qt-free cleanups): MPE's articulation profiles repository converted from
Qt JSON to muse JSON (and its string table to `muse::String`), MPE resources guarded in CMake (served as
`:/mpe/resources/*.json` from the staged resource directory), `RESOURCE_TYPE_MAP` to `muse::String`, `workmode`
without the settings store, and `Uri`/`UriQuery` log operators moved into `namespace muse` (the same lookup fix as
`String`). Bridge setup lessons: `AudioEngine::init` needs non-zero render constraints (`minSamplesToReserve`), the
track input must name the loaded soundfont (the default names desktop's bundled "MS Basic"), the FluidSynth resolver
needs an explicit `refresh()` after loading, and the sequence duration must be set from the score's play time plus
the 3 s release tail, as desktop's playback controller does.

Next: port the streaming exports (`synthAudio*`, `processSynth*`, `saveAudioForMeasureRange`) on this engine, then
make playback part of the default build.

---

# MIDI checkpoint — 2026-10-21

**175 of 184 exports are implemented; 9 remain (playback and PDF).** `saveMidi` (`miditools.h`) uses upstream's
`ExportMidi`, compiled into the bridge with a small Qt-free patch: a `MidiIODevice` adapter over `muse::io::IODevice`
(Qt builds keep `QIODevice`), the file-name overloads and the read/import path compiled only with Qt, a `uchar`
alias and one `qPrintable`. It renders through engraving's `compat/midi`, independent of the playback decision.

`verify-midi.mjs` (`MS47_VERIFY_MIDI=1`) compares every track's notes (pitch, on/off tick, velocity) and the tempo
map against the 4.00 engine's export, with repeats expanded and not, on Bach, two small fixtures and a new
`repeat-fixture.musicxml`: identical, including velocities. One deliberate difference: **4.00 ignored
`expandRepeats=false`** and always expanded (7 notes where the fixture has 5 unexpanded); 4.7 honours the flag.
No caller is affected (the app always passes `saveMidi(true, true)`).

---

# Remaining-exports checkpoint — 2026-10-21

**174 of 184 exports are implemented; 10 remain (playback, PDF, MIDI).** All nine DECISIONS.md recommendations
were accepted. Added: `setSelectionFilter` (legacy mask translated, plus a one-line upstream `SelectionFilter`
patch so "Notes and rests" off excludes single notes, which 4.7 otherwise always keeps), `savePng` (explicit
refusal), `transpose` (static `Transpose::transpose` in 4.7), `layoutUntilPage`/`State`, `savePositions` (4.00 JSON;
same element/event counts as 4.00 on Bach: 43/43, 657/657), `saveMetadata`, `loadProfile`, and drag/grip/drop
(`dragtools.h`; 4.7 renamed the grip calls, and its `Measure::drop` needs `EditData::track` for clefs or it
discards them silently).

**Grip undo oracle.** After a committed hairpin grip drag is undone (or a drag is cancelled), MusicXML is exact
and the SVG contains exactly the same drawing primitives, but in a different paint order (undo re-inserts the
hairpin), so overlapping anti-aliased strokes blend slightly differently and pixels are not byte-identical. The
grip checks therefore compare MusicXML plus the order-independent primitive set. The native file also
re-serializes the hairpin segment with its unchanged offset (upstream `endDragGrip` resets property flags outside
the undo command); harmless for rendering, noted in case style-driven repositioning of edited hairpins matters.

`verify-misc.mjs` (`MS47_VERIFY_MISC=1`) and `verify-drag.mjs` (`MS47_VERIFY_DRAG=1`) cover the batch. The optimized
build passes every suite together: 120 verified operations; all 174 names in generated glue; `npm run check:debt`
passes. Engine boot 264 ms; WASM 9,676,864 bytes.
Evidence: [drag-misc-2026-10-21.json](results/drag-misc-2026-10-21.json).

---


# Parts, excerpts and fonts checkpoint — 2026-10-20

**159 of 184 exports are implemented; 25 remain.** This batch adds `generateExcerpts`, `appendPart`,
`appendPartByMusicXmlId`, `removePart`, `setPartVisible`, `listInstrumentTemplates`, `addFont` (`parttools.h`)
and `saveMxl`, and makes **every existing export part-aware**. Open decisions for the remaining exports, with
recommendations: [DECISIONS.md](DECISIONS.md).

Changes and compatibility decisions:

* **The bridge is no longer master-score only.** `getScore` resolves `excerptId` to the excerpt's own `Score`;
  all helpers take `Score*`. The compiler surfaced the master-only calls: measure insertion now uses
  `Score::insertMeasure(ElementType::MEASURE, ...)` (acts on the master, maps back to the local score) and repeat
  expansion goes through `masterScore()`. 4.00 cast the excerpt to `MasterScore*` (undefined behaviour) and threw on
  a bad id; the port returns a failed call.
* **Linked layout.** Master and part scores share one undo stack, so a command or undo issued through either can
  change both. `layoutLinked(score)` lays out every linked score; without parts it is the same single layout.
  A part edit undone from the master previously left the part with stale positions (MusicXML `default-x` and bar
  widths differed); now both restore exactly.
* `generateExcerpts` uses `MasterScore::initAndAddExcerpt(excerpt, true)`, the upstream form of 4.00's manual fake
  `AddExcerpt`. `saveMsc` on a part returns an explicit error (DECISIONS.md item 7).
* `listInstrumentTemplates` keeps the 4.00 ABI (an unused score pointer). 4.00 returned an empty `groupId` for all
  588 templates; 4.7 fills it. 4.7 leaves the first long name empty for some templates, so names fall back to the
  track name.
* **`addFont` and Qt-free text fallback.** `addFont` reads the family and style from the font's `name`/`OS/2`
  tables (Qt did this in 4.00) and registers it through `IFontsDatabase::addAdditionalFonts`. Making it work
  exposed gaps in upstream's Qt-free `FontsEngine` (desktop measures through Qt and never uses it): fallback faces
  were attached only when a font was first resolved, `horizontalAdvance` ignored fallback faces, and bounding
  rects measured fallback glyphs in the primary face. Three small fixes are now in the upstream patch (10 files,
  80+/9-). Without a fallback, CJK-only text is not drawn at all (DECISIONS.md item 3).

`verify-parts.mjs` (`MS47_VERIFY_PARTS=1`, runs last because `addFont` is global): excerpt generation and
idempotence, part-scoped page count/SVG/MusicXML, invalid excerpt ids, the explicit part-save error, an edit on a
part reaching the master with undo/redo across both scores, the four part mutations (native change, one undo
entry, exact MusicXML and pixel undo, redo) and their rejections, MXL for master and part, the template list, and
the CJK fallback (a centred mixed title moves from x 3612 to 3130; a CJK-only title is drawn only with the
fallback). The optimized build passes all suites together: 112 verified operations. All 159 names are in
generated glue; `npm run check:debt` passes. Corpus timings are unchanged within noise (Bach load 110 -> 102 ms).
Engine boot 201 ms; WASM 9,619,597 bytes. Evidence: [parts-2026-10-20.json](results/parts-2026-10-20.json).
No bounded effort sample was recorded for this batch.

---

# Spanner, chord-tool and fret-diagram checkpoint — 2026-10-20

**151 of 184 exports are implemented; 33 remain.** This batch adds 18: `addSlur`, `addTie`,
`addGraceNote`, `addTuplet`, `addTremolo`, `addGlissando`, `addPedal`, `addSostenutoPedal`,
`addUnaCorda`, `splitPedal`, `addAmbitus`, `explodeSelection`, `implodeSelection`, `regroupSelection`,
`resequenceRehearsalMarks`, `addFretDiagram`, `getSelectedFretDiagram`, `setSelectedFretDiagram`
(`spannertools.h`, `frettools.h`, ported from the 4.00 `web/main.cpp`).

Compatibility decisions:

* **Tremolo:** 4.4 split `Tremolo` into `TremoloSingleChord`/`TremoloTwoChord`; `TremoloType` values
  are unchanged, so the legacy index chooses the factory.
* **Undo ownership changed for two commands.** 4.7's `cmdAddTie` opens its own command (left unwrapped,
  as in 4.00); `cmdResetNoteAndRestGroupings` no longer does, so regroup is wrapped to stay one undo entry.
* **Fret offset:** 4.7's `FretDiagram::clear()` also resets the offset, so `setSelectedFretDiagram` clears
  before applying properties. `FretClear` undo data restores the whole diagram, offset included.
* `Constants::division` is `Constants::DIVISION`; `NoteType` (now in `chord.h`), `GlissandoType`,
  `FretDotType` and `FretMarkerType` keep their values.
* Fret diagrams without a chord symbol have no MusicXML representation in either engine (MusicXML frames
  live inside `<harmony>`; 4.00 never exported them), so their checks use native data and the JSON getter.

`verify-spanners.mjs` (`MS47_VERIFY_SPANNERS=1`) uses a two-part fixture (`spanner-fixture.musicxml`).
21 cases must persist a native change, export their notation, be one undo command, visibly change the
score and restore exact MusicXML and pixels on undo/redo; 7 invalid selections must be rejected without
a score change or undo entry. `MS47_ENGINE_LOG=2` shows the engine's rejection reasons;
`MS47_SPANNER_CASES` filters cases. Three test mistakes were fixed along the way, not engine bugs:
from a bar selection `selectNextChord` moves past the range (the helper now steps from the previous
bar), implode across staves combines staves into voices (not chords), and an X32010 fixture misread.

The optimized build passes every suite together (corpus, 50 edits, inspector, selection, note entry,
measures, timeline, spanners): 103 verified operations. All 151 names are in generated glue;
`npm run check:debt` passes. Engine boot 251 ms; WASM 9,566,906 bytes.
Evidence: [spanners-2026-10-20.json](results/spanners-2026-10-20.json).

Bounded engineering sample: **02:27:10–02:43:24 UTC, 16m 14s** for 18 exports, the new suite and
fixture, builds and full verification. Elapsed wall time, not independent per-export effort.

Remaining (33): parts/excerpts/instruments (`generateExcerpts`, `appendPart`, `appendPartByMusicXmlId`,
`removePart`, `setPartVisible`, `listInstrumentTemplates`, `addFont`), `setSelectionFilter` (needs the
compatibility decision noted in the README), drag/grip/drop (7), `transpose`, progressive layout
(`layoutUntilPage`, `layoutUntilPageState`), and the export/audio group (`saveMxl`, `savePng`, `savePdf`,
`saveMidi`, `saveAudio*`, `synth*`, `processSynth*`, `savePositions`, `saveMetadata`, `loadProfile`).

---

# Measures, repeats and timeline checkpoint — 2026-10-20

**133 of 184 exports are implemented; 51 remain.** This batch (24 exports) covers measure structure
(insert/remove/trailing-empty removal, pickup, measure length, spacers, line breaks), barlines,
repeat start/end and counts, voltas, markers, jumps, measure repeats, measure metadata
(signatures, irregular measures, page ranges) and the playback timeline with selection start time.
The batch was written by an earlier session and left unverified; this checkpoint builds and verifies it.

Compatibility decision found while verifying:

* **Legacy jump types 12/13 (`DCODA`, `DDBLCODA`) now create markers.** 4.7 removed them from
  `JumpType`; upstream made "Da (Double) Coda" a right-aligned To Coda-style **marker**
  (`3a42d912ae`, #16294), which is also how 4.7 reads them. The batch had kept them as custom jumps
  (`jumpTo` `coda`/`varcoda`). Its timeline test expected such a jump to reach a Coda sign, which the
  4.00 engine never did either: 4.00's `DCODA` targets label `coda` (To Coda), while the Coda sign is
  `codab`. `addJump(12|13)` now inserts `DA_CODA`/`DA_DBLCODA` through the shared marker path, as one
  undo command. The test now checks the real role: with Da Coda at bar 2, D.C. al Coda at bar 4 and
  Coda at bar 5, playback is `0,1,2,3,0,1,4,5`, and undo restores the plain D.C. order. 4.7's text for
  13 is "Da Doppia Coda" (4.00: "Da Double Coda").

The optimized build passes all suites together: five-score corpus, 50 edit scenarios, inspector,
selection, note entry, measures (cases, metadata, geometry) and timeline (repeats, Da Coda markers,
tempo, pickup, compound meter, selection start). All 133 implemented names are present in generated
glue; `npm run check:debt` passes its ratchets. Engine boot 193 ms; WASM 9,482,350 bytes.
Evidence: [measures-timeline-2026-10-20.json](results/measures-timeline-2026-10-20.json).

No bounded effort sample was recorded for this batch: it was written by an earlier session and only
verified and fixed here.

Remaining (51): parts/excerpts and instruments (`generateExcerpts`, `appendPart*`, `removePart`,
`setPartVisible`, `listInstrumentTemplates`, `addFont`), selection filter, drag/grip/drop, `transpose`,
progressive layout (`layoutUntilPage*`), spanners and chord tools (slur, tie, grace, tuplet,
tremolo, glissando, pedals, fret diagrams, ambitus, explode/implode/regroup, rehearsal resequence),
and the export/audio group (`saveMxl`, `savePng`, `savePdf`, `saveMidi`, `saveAudio*`, `synth*`,
`savePositions`, `saveMetadata`, `loadProfile`).

---

# Note-entry checkpoint — 2026-10-20

The full bridge re-port remains active. **109 of 184 exports are implemented;
75 remain.** The new group includes note-input state/cursor/method/duration,
letter and click entry, rest entry, voice selection/movement, rest-to-note,
duration replacement, stem flipping and line/page breaks. Export presence is not
a claim that every behavior is complete.

Compatibility decisions in this batch:

* Old note-entry indices are mapped explicitly: 4.7 inserted BY_DURATION and
  renamed STEPTIME to BY_NOTE_NAME. Legacy REPITCH (2) and TIMEWISE (6) have
  behavior checks.
* Letter entry uses native `resolveNoteInputParams` and `cmdAddPitch`; percussion
  uses native drum shortcuts. Tablature starts on the selected/top string as on
  desktop. Cursor geometry follows the 4.7 desktop implementation in page units.
* Pitch/rest entry owns one named command. `enterRest` is used within that
  command, avoiding the nested command opened by `cmdEnterRest`.
* Native `changeSelectedElementsVoice` replaces the removed notes-only method;
  the old extra gap-rest workaround is not applied on top of the 4.7 command.
* A raw percussion MSCX fixture exposed an earlier format mistake:
  `MscIoMode::XmlFile` is the multi-file MSCS container. Raw MSCX now loads via an
  in-memory native ZIP and exports as a standalone score with native style data.
  Earlier container-to-container round trips did not establish this contract.
  The verifier now rejects `<files>` exports and checks native-format pixel
  restoration as well as pitches and page counts.
* Native loading now runs `setupMasterScore` after reading style/parts, just as
  MusicXML import does. Without that pass, the small-staff fixture rebuilt its
  padding table using the default staff size and shifted note spacing after a
  native round trip. The added pixel gate caught this; MSCZ and raw MSCX now
  restore its printed pixels exactly.

The note-entry suite exercises C-sharp/D/dotted-E, accidental reset, rest entry,
legacy repitch, voice 2, click placement, uninterrupted left-to-right entry,
add-to-chord and legacy timewise insertion, plus percussion and tablature.
Main mutations check one undo entry and exact MusicXML/pixels after undo/redo.
Special-staff checks verify drum pitch 38 and tablature string/fret notation,
with native MusicXML restoration on undo/redo. The geometry corpus also checks
input cursors on each music page of Bach and on the two-staff fixture.

The optimized build passes all five corpus scores, **50 edit scenarios**,
inspector/undo and selection suites, and the complete note-entry suite above.
Both native formats preserve pitches, page counts and exact printed pixels on
all five scores. All 109 implemented names are present in generated glue.
`npm run check:debt` passes its ratchets; script syntax and whitespace checks pass.
Evidence, build hash, inventory and invocation samples:
[noteinput-2026-10-20.json](results/noteinput-2026-10-20.json).

This bounded engineering sample ran **01:40:58–01:58:26 UTC, 17m 28s**, for 17 new
exports plus the shared native-format/setup fixes, builds and verification.
Windows reported zero standby transitions in that interval. This is elapsed
wall time, not independent per-export effort. The full remaining scope is
preserved below; the app's shipped 4.00 engine is unchanged.

---

# Selection checkpoint — 2026-10-20

At the preceding checkpoint, **92 of 184 exports were implemented; 92 remained.**
The app still uses the shipped 4.00 engine. Export presence is not complete
behavioral compatibility.

This batch adds element/text/measure point selection, range extension, the four
selection modes, range-to-note-list conversion, selection bounding boxes, native
selection MIME data/paste, and staff/system bands. The range-to-list export has no
existing JS wrapper; its verifier calls the native export directly. Other checks
use the existing unmodified JS wrappers.

The selection tests cover four note hits and a rest, add/toggle/range/replace,
invalid points/pages/modes, unchanged MusicXML/printed pixels/undo index for
selection-only operations, copying native staff MIME into another bar with exact
pitch checks, and MusicXML/pixel restoration on undo. The spatial corpus covers
Bach across music pages and a two-staff fixture; reading staff bands preserves
selection. A copyright frame on a separate Bach page is checked by its rendered
text center and native text hit test.

The title hit test exposed a **360/1200-DPI font-metrics mismatch**: the generic
Qt-free font engine measured at 360 DPI, while engraving painted at 1200 DPI.
`fontmetrics.h` adapts the measurement provider and `SvgPaint` advertises the
engraving DPI. Measured/painted title widths must now agree within 3%, with the
rendered text center inside the native box. This changes layout: Bach now has
three pages, including a copyright VBox/page-break page without staves. The old
two-page spike result below predates the correction. Font fallback and broad
desktop visual parity still need independent evidence.

The optimized build passes the five-score corpus, all 44 existing edit scenarios,
inspector/undo checks, and the new selection suite. All 92 exports are present in
the generated glue. `npm run check:debt` passes its ratchets. Latest raw results,
build hash, export inventory and timing samples:
[selection-2026-10-20.json](results/selection-2026-10-20.json).

The bounded engineering sample ran **01:26:37–01:40:25 UTC, 13m 48s** for this
12-export group, including the shared DPI fix, builds and verification. Windows
reported no new standby entry during that interval. This is elapsed wall time;
it is not independent per-export effort and should not be extrapolated to drag,
excerpts or playback. Individual bridge invocation samples are in the JSON. The full remaining scope below is unchanged.

---

# Bridge port checkpoint — 2026-10-20

At the earlier checkpoint, **80 of 184 export names had native
implementations; 104 remained.** The inventory measures presence, not complete
behavioral compatibility. The app still uses the shipped 4.00 engine.

## Evidence at this checkpoint

The optimized `ms47_bridge` target builds Qt-free with the original eight-file,
63-line upstream patch. No additional engraving-engine patch was needed for the
currently implemented exports. Sources, build configuration, the patch and
resource stager are in this directory; generated WASM stays in the upstream
worktree's `build.artifacts/`.

The following passed against the existing JS score wrappers and WasmRes decoder:

* Load, SVG, chromatic pitch-up, undo and redo on five scores: C/D/E MusicXML,
  `bach_orig.mscz`, `four_measures.musicxml`,
  `two_staves_four_bars_lower_edit.musicxml`, and `credits_small_staff.musicxml`.
* Pitch changes checked as semitone deltas in MusicXML; undo/redo restore exact
  MusicXML and Chromium pixels. The browser checks loaded embedded fonts and
  rejects blank output. Selection must not affect printed pixels.
* The original native save/reload checks preserved pitches and page counts.
  At that checkpoint the output labeled MSCX was the MSCS XML container; the
  note-entry checkpoint above corrects the raw MSCX contract and adds pixels.
* Header creation with escaped text and its undo; invalid page/format rejection.
* **44 edit scenarios** cover rest nudging, accidental/duration/dot edits,
  noteheads, beams, multimeasure rests, dynamics (including shifted RFZ index),
  notation marks, text/fingerings/lyrics/harmony, figured bass, tempo, signatures,
  chord styles and inspector properties. Each checks persisted native data, an
  undo-history entry, MusicXML where applicable, and pixel undo/redo.
* Existing figured-bass replacement and subsequent text edits restore the old
  parsed figures on undo. Updating an existing tempo is one command.
* Inspector checks cover empty/single/mixed selection schemas, invalid values,
  unchanged-property no-ops, and range undo. Undo entries expose native command
  names and element types through the existing JSON schema.
* All 80 implemented names appear in generated engine glue (`verify-exports.mjs`).
* `npm run check:debt` passed its ratchets (existing warnings remain).

Raw results, exact build hash and per-call samples:
[2026-10-20.json](results/2026-10-20.json).
Implemented and remaining names:
[exports-2026-10-20.json](results/exports-2026-10-20.json).

## Invocation-time samples

One run, Node v24.21.0, optimized link, shared engine/font caches.
Times include layout where the export requests it. They are not engineering
porting times or an editor performance guarantee.

| Score | load + layout ms | SVG ms | pitch-up ms | undo ms | redo ms |
|---|---:|---:|---:|---:|---:|
| three_notes_cde.musicxml | 63.2 | 14.7 | 3.8 | 1.7 | 1.3 |
| bach_orig.mscz | 77.3 | 21.0 | 28.6 | 26.9 | 30.5 |

Engine/glue boot: **215.4 ms** in the default suite. WASM:
**9,314,517 bytes** raw / **2,926,854 bytes** gzip.
The SVGs embed whole fonts; resource/SVG sizes are not a chosen shipping budget.

## Port findings

* Named `startCmd` calls replace the old no-argument API. Protected
  `cmdPitchUp` is replaced with desktop's `upDown(..., CHROMATIC)`; rests use
  `cmdMoveRest`. Full layout is deliberately used during this port.
* Emscripten 4.0.7 needs explicit HEAPU8 export and imported memory to honor the
  existing helper's runtime INITIAL_MEMORY option. The response envelope and
  score lifecycle remain compatible with the existing JS wrappers.
* Dynamic enum insertion changes old JS indices after SFFZ. An explicit table
  preserves them. BeamMode indices 3/4 were renamed without changing meaning.
* Constructor parents can be implicit in 4.7. Rehearsal marks and parsed figured
  bass children need explicit parents to attach/render correctly.
* Figured bass has parsed items separate from text. Replacing the entire element
  with upstream-parsed figures through undo keeps both representations together.
* Range selection must populate its element list before inspector reads/edits.
* Public upstream undo accessors suffice; the history API translates zero-based
  entries to upstream's one-based state accessor.
* Equivalent draw operations can change order after layout. Exact pixel checks
  are the render oracle; sorting SVG primitives would incorrectly change paint
  semantics. The streaming provider preserves painter order.

## Outstanding work (not waived by this checkpoint)

Finish the remaining native exports and test behavior through the JS bridge.
Spatial selection/selection MIME are now implemented as described above.
Note-entry state and the edits described above are now implemented. Next groups
are structural edits/measure metadata, instruments/excerpts, then drag/grip/drop
and layout progression. Playback,
MIDI and PNG/PDF need their own engine/export decisions from the original spike;
their export names remain visible in the incomplete inventory.

The current bridge is master-score only. Browser worker boot/resource packaging,
real excerpt handling, complete font loading, progressive/incremental layout,
metadata/positions and the other remaining exports are not proved complete.
Title fallback recognition and the full behavior of every present export also
need broader compatibility checks. SVG image/word-wrap handling and visual
parity remain open; the Bach title alignment with a missing Tempus Sans ITC font
was the issue that led to the DPI correction above. Pixel undo tests do not establish desktop fidelity.

Engineering effort has not been isolated per export: the first batches shared
bootstrap/SVG work and were interrupted by laptop standby. Keep that separate
from the invocation samples. Record bounded effort samples for subsequent
exports before extrapolating a complete migration schedule.
