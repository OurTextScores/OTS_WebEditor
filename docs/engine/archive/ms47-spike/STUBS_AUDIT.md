> Historical migration record, archived 2026-10-24. Paths and branch/default-engine statements below describe the original audit. See [the current production guide](../../README.md).

# Qt-free stub audit (2026-10-21)

The 4.7 bridge builds MuseScore with `MUSE_QT_SUPPORT=OFF` and the `*_NO_INTERNAL` options. Desktop always runs the Qt
code paths, so anything that behaves differently without Qt is untested upstream. The trigger was
`FontProvider::addSymbolFont`, which returns success without looking at the file, so a missing music font "loaded"
and drew nothing. This audit looks for every other such place in the code the bridge actually compiles.

## Method

1. **Compiled sources only.** The 564 translation units of `ms47_bridge` (unity files expanded from the build tree),
   plus their headers: 946 files. Third-party code is excluded.
2. **Markers.** `NOT_IMPLEMENTED`, `NOT_SUPPORTED`, "not implemented". Nearly all are upstream behaviour shared with
   desktop; the Qt-specific ones are listed below.
3. **Preprocessor branches.** Every `#if` on `NO_QT_SUPPORT`, `*_NO_INTERNAL`, `ENGRAVING_NO_ACCESSIBILITY`,
   `ENGRAVING_NO_API`, `MUSE_THREADS_SUPPORT`, `MUSE_MODULE_AUDIO_EXPORT` and the draw options: 208 blocks. 83 contain
   only Qt type conversions or includes (harmless); the other 125 were read one by one.
4. **Alternative implementations.** Sources CMake swaps in when Qt is off (`draw/internal/fontprovider.cpp`,
   `fontsdatabase.cpp`, `fontsengine.cpp`; pugixml; the general RPC channel).
5. **Unregistered services.** The IoC container returns `nullptr` for an unregistered interface, silently.
   - Static check: every `Inject<>`, `INJECT()` and `resolve<>()` in the compiled code, compared with what the bridge
     registers at boot.
   - Dynamic check: a temporary hook in `modulesioc.h` printed each missed resolve during the full suite.
   - Every interface used but never registered was traced to its call sites.
6. **The bridge's own stand-ins** (`SpikeFileSystem`, `SpikeApplication`, `SpikeEngravingConfiguration`,
   `SpikeMusicXmlConfiguration`), compared value by value with desktop's `EngravingConfiguration` and
   `MusicXmlConfiguration` defaults.

`verify-stubs.mjs` (`MS47_VERIFY_STUBS=1`) holds the regression tests. To re-run the dynamic check, add a print to the
`m_map.end()` branch of `ModulesIoC::doResolvePtrByInfo` and run the full suite. Don't commit the hook.

## Fixed

| Where | What happened without Qt | Fix | Test |
|---|---|---|---|
| `draw/internal/fontprovider.cpp` `addSymbolFont` | Returned success for any path, so a missing music font counted as loaded and drew nothing instead of falling back | Bridge font provider refuses a missing file. Upstream `EngravingFontsProvider::fontByName` returns the fallback when a font did not load (patch) | `verify-resources.mjs` (unavailable MuseJazz → Bravura) |
| `global/types/string.cpp` `Char::isLetter/isSpace/isPunct/toLower/toUpper`, `String::toLower/toUpper` | Cast the UTF-16 unit to `unsigned char` and called the C-locale functions. Every non-ASCII character was misread: U+0141 `Ł` was read as `A` (`toLower` returned `a`), Cyrillic `Р` (U+0420) as a space, `é` not a letter. Effects: lyric alignment with verse numbers, line breaking, word navigation, rehearsal-mark letters, case-insensitive part-name matching | musl's Unicode-aware `isw*`/`tow*`; `isSpace` adds the no-break spaces and NEL, as Qt does (patch) | `verify-stubs.mjs` `unicode` ("1. éa" now lands on "1. ea": it was 83 units off) |
| `global/types/string.cpp` `String::simplified` | Returned the string unchanged | Trim plus collapse whitespace runs, as `QString::simplified` (patch) | covered with `unicode` build |
| `ICryptographicHash` never registered | `ImageStore::add` dereferenced it: **any score containing an image crashed the engine** on load (`memory access out of bounds`) | Bridge MD4 implementation (`imagetools.h`). MD4 exactly, because images are stored and looked up as `Pictures/<md4>.<ext>` | `verify-stubs.mjs` `image` |
| `IImageProvider` never registered | `Image::init` and raster drawing dereferenced it (same crash) | Bridge provider keeps the encoded bytes and reads the size from the PNG/JPEG/GIF/BMP header. The SVG writer embeds the bytes; the PDF writer embeds JPEG directly and decodes 8-bit non-interlaced PNG (with alpha as a soft mask) | `image`, `verify-pdf.mjs` image fixture (agrees with SVG at 0.998) |
| `draw/internal/fontsdatabase.cpp` `actualFont` | A missing family fell back to the plain default face, dropping bold/italic (Qt keeps them) | Keep weight and slant when the default family has that face (patch) | Bach measure numbers (PORT_LOG, PDF checkpoint) |
| `SpikeEngravingConfiguration::autoUpdateFretboardDiagrams` | `false`; desktop default `true`, so editing a chord symbol did not update its linked fret diagram | `true` | — |
| `SpikeEngravingConfiguration` UI colours | Voice/selection colours all blue; frame, formatting, unlinked, invisible, warning and critical colours differed. Visible in `saveSvg(…, highlightSelection)` | Desktop values, including the 0.6 tint for invisible items and Qt's `lighter(135)` for highlights | — |
| `SpikeMusicXmlConfiguration::inferTextType` | `true`; desktop default `false`. MusicXML import guessed tempo/expression types from words, which `MUSE_SOUNDS_INTEGRATION_ROADMAP.md` explicitly rejects | `false` | full suite unchanged |
| Bootstrap font registration | Gootville, MuseJazz, Finale Maestro/Broadway and the FreeSerif bold/italic faces were never registered (their scores silently used Bravura), and the Text-font substitutions were missing | Registered as upstream `EngravingModule::onInit` does | `verify-resources.mjs` |

## Benign (documented, no change)

| Where | Behaviour | Why it is acceptable |
|---|---|---|
| `IInteractive` never registered | `MessageBox::warning` has its own guard: logs "interactive disabled" and answers **Ok**. Reached by: tuplet ratio that cannot be notated (informational), note input over a measure repeat ("will remove measure repeat"), and replacing measure contents (`cmd.cpp`). | No crash (tested: `warning`). Confirmations are auto-accepted, which is desktop's default button. If the editor should ask the user instead, the bridge would need to surface these messages; that would be a product feature, not a stub fix. |
| `IEngravingElementsProvider` | Devtools element registry; every use is null-checked | Diagnostics only |
| `IMidiOutPort` | FluidSynth's live MIDI-out mirror; null-checked | No MIDI devices in the browser |
| `IApiRegister`, `IInteractiveUriRegister`, `INotationReadersRegister`, `INotationWritersRegister` | Resolved only in module registration hooks the bridge never calls | Not on any executed path |
| `IRpcChannel`, `ITickerProvider` | Used only by `EngineController` and `Ticker`, which the bridge does not construct | Bridge drives the engine directly |
| `global/translation.cpp` | `trc/mtrc` return the English source string | 4.00 in the browser had no translations either; engine strings are English |
| `ENGRAVING_NO_ACCESSIBILITY` (21 blocks) | No accessibility tree or screen-reader descriptions | No bridge export used them; the editor has its own announcer |
| `ENGRAVING_NO_API` | No plugin API types | No plugins in the editor |
| `MUSE_THREADS_SUPPORT` off | Mixer renders tracks on one thread | WASM build is single-threaded; Bach still renders at ≈150× real time |
| `MUSE_MODULE_AUDIO_EXPORT` off | No `SoundTrackWriter` | The bridge has its own WAV writer and streaming exports |
| `midifile.cpp` read path, `workmode.cpp` settings, `filesystemwatcher.cpp` | Guarded out by the patch or no-ops | MIDI import is not exported; no settings store; nothing watches files |
| `draw/internal/fontsdatabase.cpp` `insertSubstitution` (no-Qt) | A no-op (it only fed `QFont::insertSubstitution`), so the family substitutions bootstrap registers (MScore Text → Leland Text, …) do nothing | Checked 2026-10-22. The Text fonts are sparse (Leland Text has 127 glyphs; MScore, Gootville, MuseJazz and Finale Maestro Text lack the metronome notes), but the engine handles missing symbols itself before fonts are resolved: `TextFragment` switches a run whose glyph the musical text font lacks to `FALLBACK_SYMBOLTEXT_FONT` (Bravura Text), as desktop does. A tempo mark in MScore/Gootville Text draws its note from Bravura Text on both. Nothing in the engine requests the `ScoreFont` alias. |
| `SpikeFileSystem` `remove/copy/move/makePath/makeLink/streams` | `NotSupported` | Engraving reads and writes whole files only; no executed caller |
| `SpikeEngravingConfiguration` `defaultPageSize` | Always A4; desktop picks Letter in US locales | Same as 4.00 in the browser. Score files carry their own page size |
| `allowReadingImagesFromOutsideMscz`, Guitar Pro flags, `preferSameStringForTranspose`, `minDistanceForPartialSkylineCalculated`, `specificSlursLayoutWorkaround` | `false` | Same as desktop defaults (the layout flags follow the Guitar Pro experimental setting, off by default) |
| `canLayoutIcons`, `iconsFontFamily`, `guiScaling`, style-file paths | Off/empty/1.0 | Palette-icon and preferences features the bridge does not use |

## Open

| Where | Behaviour | Recommendation |
|---|---|---|
| `draw/svgrenderer.cpp` (no-Qt) | Every method is `NOT_SUPPORTED`: an SVG image in a score has size zero and is not drawn, silently | Keep the bytes and parse `width/height/viewBox` in a bridge `SvgRenderer` stand-in. The SVG writer can then embed it as `<image href="data:image/svg+xml…">`; PDF would need an SVG→PDF path (or a raster fallback). Rare in scores, so worth doing only if the corpus has them. **Corpus check 2026-10-22:** of 2,316 unique local scores (OpenScore Lieder included), 5 contain images, all PNG/JPEG and none SVG, GIF or BMP. Four draw them in SVG and PDF on 4.7; the fifth (a MuseScore 0.9.6 file, image inside a measure) loses it on 4.00 too. Keep deferred. |
| PDF image formats | GIF, BMP, 16-bit or interlaced PNG fail `savePdf` with a clear message (SVG embeds them all) | Decode on demand if they appear in real scores. None in the 2,316-score corpus check (see the SVG row). |
| `saveAsPng` (paste of images) | Writes only PNG sources | Same: needs a codec only for non-PNG sources |
