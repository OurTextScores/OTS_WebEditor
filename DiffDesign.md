# Diff Compare Design Research

Last updated: 2025-02-14

## Requirements (from user)
- Side-by-side full score view: left and right panes, both editable.
- Swap controls between panes: 3 arrows per measure ("place before", "overwrite", "place after").
- Per-part swaps (not whole score), aligned by measure index.
- Separate undo histories per pane.
- Locked sync: scroll and zoom stay in sync (no playback sync).
- Prefer independent WASM instances; also investigate multi-score in one module.
- Arrows are bi-directional.

## UI Concept
- Two full score views in a split layout.
- A middle gutter with arrow clusters aligned to measures.
- Each part has its own lane (row) so swaps are per-part.
- Hovering a measure lane highlights corresponding measures in both panes.
- Arrow cluster directionality: left-to-right and right-to-left actions available.

## Swap Semantics
- Insert before: copy source measure before target index in the destination part.
- Overwrite: replace target measure with source measure (measure index preserved).
- Insert after: copy source measure after target index in the destination part.
- Swap action records history on the destination only.

## Technical Research: Multiple Scores vs Multiple WASMs
### Current JS Loader
- `lib/webmscore-loader.ts` imports default `webmscore` and caches `ready`.
- In browser builds, the default export comes from `webmscore.webpack.mjs`.

### Worker Wrapper (Independent WASM per score)
- `webmscore-fork/web-public/src/worker.js` uses a single `score` variable per worker.
  - The worker can only host one score at a time.
  - Each `WebMscore.load(...)` in the worker wrapper creates a new worker instance.
- `webmscore-fork/web-public/webmscore.webpack.mjs` exports the worker wrapper (`WebMscoreW`) as default.
  - This means multiple calls to `WebMscore.load(...)` create multiple workers with isolated WASM state.
  - This fits the "independent WASM per pane" requirement without additional work.

### Multiple Scores in One WASM Module
- `webmscore-fork/web/main.cpp` stores each loaded project in a global `instances` set.
  - `_load(...)` returns a `MasterScore*` pointer; multiple scores can exist.
  - `destroy(...)` removes the instance from the global set.
- There is a global `s_globalContext`, and `_load(...)` sets `setCurrentProject(...)`.
  - No other code sets the current project after load.
  - Risk: some operations may rely on the global context pointing to the active project.
- The non-worker JS wrapper (`webmscore-fork/web-public/src/helper.js`) binds a single global `Module`.
  - You can create multiple `WebMscore` instances, but they share a module.
  - This likely works for read/export, but may have subtle cross-talk for edits.

### Summary
- Independent WASM per pane is achievable today by using the default worker wrapper.
- Multi-score in one module is theoretically possible but risky due to global context.
- To make multi-score reliable, consider adding a binding like `setCurrentProject(score_ptr)` and calling it before each operation.

## Continuous View (Pageless)
- MuseScore supports continuous layout via `LayoutMode::LINE` (vertical continuous).
- webmscore previously forced PAGE mode during SVG/position exports; added a `setLayoutMode` binding and removed forced PAGE mode so compare can render as continuous.

## Reflow Mode (JHLUSKO CHANGES)
- Use `LayoutMode::SYSTEM` to keep a continuous view while honoring line breaks.
- Add WASM bindings to get/set measure line breaks in bulk:
  - `measureLineBreaks()` -> JSON array of booleans.
  - `setMeasureLineBreaks(breaks)` -> applies line breaks without undo history.
- Compare UI adds a `Score/Reflow` toggle:
  - Reflow is the default compare view.
  - Reflow adds line breaks before and after non-matching measure blocks (keeps matching runs flowing).
  - Store original breaks per score and restore when reflow is disabled or compare closes.

## Swap Implementation Options
1) Selection MIME copy/paste (WASM-native)
   - Use `selectionMimeType` + `selectionMimeData` on source,
     then `pasteSelection` on destination.
   - Needs a reliable way to select a measure for a specific part.
2) MusicXML patch swap (JS-level)
   - Export both scores to MusicXML, replace the target `<measure>` node,
     re-import on destination.
   - Easier to control per-part, but heavy and may reset selection state.
   - NOTE: currently pursuing this option
3) C++ helper for measure swap (fastest, most consistent) - preferred
   - Add new bindings to copy/replace/insert measures by part + index.
   - NOTE: an abandoned attempt at this is on branch score-diff-overwrite-with-new-bindings

## Overlay & Alignment Strategy
- Use `measurePositions()` from each score to map measure index to y-coordinate.
- Build a per-part list of measure bounds and render arrows in the gutter.
- Index alignment is the fallback; consider content-aware alignment for better matching.

### Content-Aware Alignment (proposal)
- Compute a lightweight measure signature per part from score data (notes + durations + rests + time signature).
- Use LCS to align measure sequences per part, then map to gutter arrows.
- When confidence is low (no matching signature), fall back to strict index alignment.
- This can be implemented either:
  - JS-side by exporting per-part MusicXML and hashing measure contents, or
  - WASM-side with a new binding that returns per-part measure signatures.

#### Recommended Signature Format (WASM-side)
- Goal: stable across layout changes, sensitive to musical content.
- Per-part, per-measure signature string:
  `TS|KEY|BAR|S<staffIdx>:V0=<...>,V1=<...>,V2=<...>,V3=<...>;S<staffIdx>:...`
  - `TS`: time signature (e.g., `4/4`, `3/8`).
  - `KEY`: key signature fifths (e.g., `0`, `-1`, `2`) or `?` if unknown.
  - `BAR`: barline type (enum or short token).
  - `S<staffIdx>`: staff lanes within the part.
  - `V0..V3`: voice tokens per staff, each a compact sequence of events.
    - Event token: `N<pc><oct>:<dur><dots>` for notes, `R:<dur><dots>` for rests.
    - `pc` = pitch class 0-11, `oct` = octave number.
    - `dur` = base duration value (e.g., `4`, `8`, `16`, `2/1`, `4/1`), `dots` = `.` count.
    - Chords: sort pitch classes ascending and join with `+` (e.g., `N0+4+7:4`).
- Full-measure rests use `R:M`.
- Example: `4/4|0|1|S0:V0=N0o4+4o4+7o4:4 R:4,V1=,V2=,V3=`

##### Phased Detail Strategy
- Phase A (start): pitches + durations + rests + time/key/barline.
- Phase B: add tuplets, articulations, ties/slurs, dynamics, lyrics.
- Phase C: include all remaining symbols/notations so the diff reflects complete musical detail.
- Keep the signature format extensible so new tokens can be appended without breaking alignment.

#### Proposed WASM Bindings
- `measureSignatureCount(score_ptr, partIndex)` -> number of measures in part.
- `measureSignatureAt(score_ptr, partIndex, measureIndex)` -> UTF-8 string signature.
- Optional batch: `measureSignatures(score_ptr, partIndex)` -> JSON array of strings.
- Optional: `measureMetaAt(score_ptr, partIndex, measureIndex)` -> `{number, tick, timeSig, keySig, barline}` for debugging.
- Measure indices should align with `measurePositions()` (i.e., `firstMeasureMM`/`nextMeasureMM` traversal).


## Implementation Plan
1) Add WASM bindings for per-part measure signatures and swap actions (insert before/overwrite/after). Expose them in the webmscore JS API.
2) Create a dual-score compare view: two independent webmscore workers, side-by-side SVG rendering, and locked scroll/zoom sync.
3) Add reflow compare layout: `SYSTEM` layout mode plus per-measure line breaks (toggleable, restores on exit).
4) Implement content-aware alignment (LCS on measure signatures per part) with index fallback; map measure bounds to gutter arrow overlays.
5) Wire swap UI: bi-directional arrow clusters per measure/part, destination-only undo, and re-render after mutations.
6) Add basic test/QA hooks: unit tests for alignment and a manual checklist for swap correctness.


## Current Issues (2026-02-??)
### Issues
- Compare gutter row spacing is off after switching to overwrite-only arrows; rows no longer align with the expected measure rhythm in the gutter.
- Overwrite arrows are placeholders only; no actual measure copy/paste is happening yet.

### Next Steps
- Normalize gutter row heights (single shared min-height) so empty rows preserve spacing without extra UI chrome.
- Implement overwrite actions:
  - Select source measure by part/index → export selection MIME.
  - Select target measure by part/index → paste selection MIME (overwrite).
  - Relayout, re-render target pane, refresh `measurePositions`, and re-run alignment.
