# Remaining-exports checkpoint (in progress) — 2026-10-20

**174 of 184 exports are implemented; 10 remain (playback, PDF, MIDI).** All nine DECISIONS.md recommendations
were accepted. Added: `setSelectionFilter` (legacy mask translated, plus a one-line upstream `SelectionFilter`
patch so "Notes and rests" off excludes single notes), `savePng` (explicit refusal), `transpose`,
`layoutUntilPage`/`State`, `savePositions` (same element/event counts as 4.00 on Bach: 43/43, 657/657),
`saveMetadata`, `loadProfile`, and drag/grip/drop (`dragtools.h`; 4.7's `Measure::drop` needs `EditData::track`
for clefs). Suites `MS47_VERIFY_MISC` and `MS47_VERIFY_DRAG` pass except one check:

* **Open bug:** after committing a hairpin grip drag and undoing it, MusicXML is restored but rendered pixels are
  not (the segment is re-serialized with its autoplace offset). Investigate before relying on grip undo.

Not yet re-run: the full suite on an optimized build for this batch. Next: MIDI, the playback spike, the PDF writer,
fonts/packaging, then incremental layout.

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
