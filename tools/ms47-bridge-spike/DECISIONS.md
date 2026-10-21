# MuseScore 4.7 bridge — decisions needed

**Date:** 2026-10-20 · **State:** 159 of 184 exports ported and verified (see `PORT_LOG.md`).
**All nine recommendations were accepted on 2026-10-20.** Each item states what is blocked, the options, the
accepted recommendation and the reasoning. "Used by" lists callers in
OTS_Web and OurTextScores (searched 2026-10-20). Items are ordered by impact.

| # | Decision | Recommendation | Blocks |
|---|---|---|---|
| 1 | Playback engine | Port upstream 4.7's own audio stack (as the fork does today); de-risk with a 1–2 day spike first | `saveAudio*`, `synth*`, `processSynth*` (9 exports) |
| 2 | PDF export | Native vector PDF writer in the bridge, glyphs as outlines | `savePdf` |
| 3 | Fallback fonts for text | Fetch a CJK/extended-script fallback on demand when a score needs it; keep the font-engine patches | correct layout of non-Latin text |
| 4 | Selection filter | Keep the legacy 24-bit mask API and translate it in the bridge | `setSelectionFilter` |
| 5 | MIDI export | Port 4.7's MIDI writer with a small Qt patch | `saveMidi` |
| 6 | PNG export | Drop from the engine; rasterise SVG in the browser if ever needed | `savePng` |
| 7 | Saving a part as MSCZ | Leave unsupported (explicit error) until someone needs it | `saveMsc` with a part |
| 8 | Browser resource packaging | Preload a minimal font set (~5 MB), fetch the rest lazily from the CDN | shipping the engine in the browser |
| 9 | Incremental layout | Port the W7.1 allowlist after functional parity, gated by the layout oracle | editor responsiveness on long scores |

Not decisions (straightforward remaining work): drag/grip/drop (7; 4.7 renamed `startEditDrag`/`editDrag`/`endEditDrag`
to `startDragGrip`/`dragGrip`/`endDragGrip`), `transpose`, `layoutUntilPage`/`layoutUntilPageState`, `savePositions`,
`saveMetadata`, `loadProfile`.

---

## 1. Playback engine

**Used by:** the editor transport (`synthAudioBatch`/`synthAudioBatchFromSelection` → native `processSynthBatch`),
measure-range and selection playback (`saveAudioForMeasureRange`), WAV for playback (`saveAudio('wav')`), and video
export audio (`lib/video-export`). This is the most-used feature after editing; a regression here is user-visible
immediately.

**Facts.** The 4.00 fork already plays through MuseScore's own stack: `framework/audio` (FluidSynth) driven by
engraving's MPE playback model (`webmscore-fork/web/audio`). In 4.7 the same pieces exist and are Qt-free:
`engraving/playback` has no Qt includes, `framework/audio/engine` has none, and `framework/mpe` has two non-QML files
with Qt (`articulationprofilesrepository.cpp`, `articulationstringutils.h`). Upstream builds its own Qt-free WASM
audio engine (`src/web/audioengine`, with `GLOBAL_NO_INTERNAL`), which is direct evidence the engine runs in a
browser without Qt. The spike currently builds with `MUE_BUILD_ENGRAVING_PLAYBACK=OFF`.

**Options.**
- **A. Port 4.7's audio stack** (engine + FluidSynth + MPE + engraving playback) behind the existing synth exports.
- B. Keep the 4.00 engine alongside 4.7 for playback only. Two WASM engines (~6 MB gzip together), two copies of every
  score kept in sync on each edit, and two layout/playback interpretations of the same score.
- C. Synthesize in JavaScript from exported MIDI (e.g. a JS SoundFont player). Loses MPE articulation, dynamics and
  ornament rendering, and needs a new streaming/positions pipeline.

**Spike result (2026-10-21): viable.** 4.7's stack renders Bach to the same length as 4.00, 3× faster, with closely matching phrase-level dynamics (see PORT_LOG.md). **Recommendation: A, after a 1–2 day spike.** It keeps the architecture the app already relies on, 4.7's playback is
better than 4.00's (articulation, ornaments, tremolos, dynamics on newer elements), and upstream has proved the engine
in WASM. The spike: build engraving playback + MPE + audio engine Qt-free in this harness, render the first 10 s of a
corpus score to WAV with the current soundfont, and compare duration, RMS and peaks against 4.00's output, plus
render time per second of audio. The main risk is the audio engine's worker/threading model; `MUSE_THREADS_SUPPORT` is
off in this build, so the spike must confirm synchronous rendering works, as `processSynthBatch` requires.

## 2. PDF export

**Used by:** the editor's Export ▸ PDF (`components/score-editor/commands/export.ts`) and the server-side scoreops API
(`lib/music-services/scoreops-service.ts`, Next.js routes in Node). 4.7's PDF writer is Qt (`QPdfWriter`).

**Options.**
- **A. Native PDF writer in the bridge:** an `IPaintProvider` emitting PDF content streams (paths, fills, strokes,
  transforms, clips), with text drawn as glyph outlines. The SVG writer already shapes and outlines glyphs with FreeType
  + HarfBuzz (`svgfontoutlines.h`), so the hard part exists.
- B. Convert the SVG to PDF in JavaScript (e.g. svg2pdf.js + jsPDF). Needs a DOM, so the Node scoreops path would need
  jsdom; embedded OTF/CFF music fonts are a known weak spot for such converters.
- C. Browser print-to-PDF. No server-side path at all.

**Recommendation: A.** One implementation serves the browser and Node identically, output stays vector, and it reuses
the painter-order streaming the SVG writer already gets right. Glyph outlines mean the first version's text is not
selectable or searchable; a later version can embed the fonts (Type0/CFF) for a text layer if users ask. Estimate: a few
days, plus a visual comparison of PDF and SVG renders of the corpus.

## 3. Fallback fonts for text (CJK and other scripts)

**Found while porting `addFont`:** in the Qt-free engine, glyphs missing from the score's text fonts were measured
with the missing-glyph box, and text made only of missing glyphs (e.g. a Japanese title) was **not drawn at all**. The
browser draws such glyphs with system fonts at different widths, so layout and rendering disagree (centring, collisions,
selection boxes). Desktop MuseScore never hits this because it measures text through Qt.

**Already fixed in the upstream patch** (three small `FontsEngine` changes; worth upstreaming):
`horizontalAdvance` and the bounding-rect functions now measure each run in the face that actually has the glyph, and
`resetRequiredFaces()` lets a newly registered fallback apply to fonts that were already resolved. With a fallback
registered, the verifier shows CJK text measured with it (a centred CJK title moves from x 3612 to 3130) and CJK-only
text drawn.

**Remaining decision:** where the fallback comes from. Today nothing registers one (no caller uses `addFont`).
- **A. On-demand fallback:** after load, scan the score's text for scripts the bundled fonts lack and fetch a matching
  font (e.g. Noto Sans CJK subset per language) from the CDN, then `addFont`. Cost only for scores that need it.
- B. Bundle a CJK fallback with the engine. Simple but large (a full CJK font is 15–20 MB).
- C. Do nothing. CJK lyrics and titles will mis-lay-out or vanish, as above.

**Recommendation: A**, with fonts served from the same CDN as the soundfont. The bytes form of `WebMscore.addFont`
writes into `/fonts/` via `FS_createDataFile`, which this build must export — part of item 8.

## 4. Selection filter

**Used by:** the editor's selection-filter menu (`components/toolbar/constants.ts`), persisted in localStorage as a
24-bit mask, including a user-facing **"Notes and rests"** option (bit 23).

**Facts.** 4.7 split the filter into voices (bits 0–3, unchanged), elements (the same 19 element types in a different
bit order, plus a new `TIE`) and a new notes-in-chord filter (top note … bottom note). `NOTES_AND_RESTS` no longer
exists. Passing the old mask through unchanged would silently filter the wrong categories.

**Options.**
- **A. Keep the legacy mask and translate in the bridge:** voices 1:1; element bits by name; the new `TIE` follows the
  `SLUR` bit (ties were filtered with slurs in 4.00); `NOTES_AND_RESTS` off ⇒ all notes-in-chord filters off.
- B. Change the JS API to 4.7's three-part filter now and migrate the stored mask.

**Recommendation: A now, B later.** A keeps the stored user settings and the UI working unchanged. One documented
difference: in 4.7, turning "Notes and rests" off excludes notes but rests remain selectable (4.7 has no rest filter).
Exposing 4.7's per-chord-note and tie filters is a UI feature to add after the migration, with a v2 storage key.

## 5. MIDI export

**Used by:** Export ▸ MIDI, the scoreops API, and the AMT accompaniment source (`amtAccompanySource.ts`), so it must
not regress. 4.7's writer (`importexport/midi/internal/midiexport`) uses `QFile`/`QIODevice` in about a dozen places
(`exportmidi.*`, `midishared/midifile.*`).

**Recommendation: port it with a small Qt-to-`muse::io` patch** and verify byte-level equivalence of note events
against the 4.00 export on the corpus (tempo map, tracks, note on/off pairs). It renders through engraving's
`compat/midi` renderer, which the bridge already builds, not the MPE playback model, so it does not wait for item 1.

## 6. PNG export

**Used by:** nothing (no caller in OTS_Web or OurTextScores). 4.7's PNG writer is Qt (`QImage`).

**Recommendation: drop it from the engine** and return an explicit "unsupported" error. If a PNG is ever needed (e.g.
thumbnails), rasterise the SVG in the browser (an `Image` + canvas on the main thread) or with a server-side SVG
renderer. Porting a rasteriser into the engine would add size for no current user.

## 7. Saving a part as MSCZ/MSCX

**Used by:** nothing; no caller ever selects a part (`setExcerptId`) or calls `generateExcerpts`. 4.00 produced a
standalone part file by casting the excerpt score to a `MasterScore`, which is undefined behaviour; 4.7 offers no
equivalent. The bridge now returns an explicit error instead of silently saving the full score.

**Recommendation: leave it unsupported** until a feature needs it. If one does, write the part's own score document with
upstream's `Writer::writeScore` into a single-score MSCZ container, and test that it reopens as a normal score.
Everything else about parts already works (see `PORT_LOG.md`): part-scoped exports, edits on a part propagating to the
master, and undo/redo across both.

## 8. Browser resource packaging

**Facts.** The staged engine resources are 19 MB raw (7.5 MB gzip), almost all fonts: 14 music/text font families
plus instruments and styles. The 4.00 engine ships a 3.9 MB data file. A minimal set (Leland, Bravura, Edwin, SMuFL
metadata, engraving data) is about 5 MB.

**Recommendation:** preload the minimal set with the engine, and fetch other music fonts lazily when a score's style
asks for them (Petaluma, MuseJazz, Finale fonts …), from the CDN the soundfont already uses. This also sets up item 3's
on-demand fallback fonts. Requires exporting `FS_createDataFile` (or an equivalent bridge call) and a small loader in
`web-public/src/index.js`.

## 9. Incremental layout

**Facts.** Every command currently requests a full layout of every linked score (`layoutLinked`). On the five-score
corpus edits take 2–30 ms, but the 4.00 work (W7.1) showed full relayout dominates on long scores (≈1.4 s per edit on
a 30-page score) and introduced an allowlist of edits safe for incremental layout, with an oracle that compares against
full layout.

**Recommendation:** finish functional parity first, then port the allowlist command by command, keeping the oracle as
the gate: any edit whose incremental result differs from a full layout stays on full layout. Measure on `faure.mscz`
before and after. Doing it earlier would mean re-validating it after every remaining port.
