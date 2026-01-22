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

## Swap Implementation Options
1) Selection MIME copy/paste (WASM-native)
   - Use `selectionMimeType` + `selectionMimeData` on source,
     then `pasteSelection` on destination.
   - Needs a reliable way to select a measure for a specific part.
2) MusicXML patch swap (JS-level)
   - Export both scores to MusicXML, replace the target `<measure>` node,
     re-import on destination.
   - Easier to control per-part, but heavy and may reset selection state.
3) C++ helper for measure swap (fastest, most consistent) - preferred
   - Add new bindings to copy/replace/insert measures by part + index.

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
- Per-part, per-measure signature string: `TS|KEY|BAR|V1|V2|V3|V4`.
  - `TS`: time signature (e.g., `4/4`, `3/8`).
  - `KEY`: key signature fifths (e.g., `0`, `-1`, `2`).
  - `BAR`: barline type (enum or short token).
  - `V1..V4`: voice tokens, each a compact sequence of events.
    - Event token: `N<pc><oct>:<dur><dots>` for notes, `R:<dur><dots>` for rests.
    - `pc` = pitch class 0-11, `oct` = octave number (optional if too noisy).
    - `dur` = denominator-based duration (e.g., `4`, `8`, `16`), `dots` = `.` count.
    - Chords: sort pitch classes ascending and join with `+` (e.g., `N0+4+7:4`).
- Example: `4/4|0|S|N0+4+7:4 R:4 N2:8 N4:8|R:1| | `

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

## Open Questions
- Do we want an explicit confidence indicator when content-aware alignment disagrees with index?
- How to highlight the exact per-part measure region (SVG class names or positions)?
- If we add WASM bindings for measure signatures, what minimal signature yields stable alignment?

## Implementation Plan
1) Add WASM bindings for per-part measure signatures and swap actions (insert before/overwrite/after). Expose them in the webmscore JS API.
2) Create a dual-score compare view: two independent webmscore workers, side-by-side SVG rendering, and locked scroll/zoom sync.
3) Implement content-aware alignment (LCS on measure signatures per part) with index fallback; map measure bounds to gutter arrow overlays.
4) Wire swap UI: bi-directional arrow clusters per measure/part, destination-only undo, and re-render after mutations.
5) Add basic test/QA hooks: unit tests for alignment and a manual checklist for swap correctness.
