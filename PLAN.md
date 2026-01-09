# PHASE 0 — Maintain libmscore (WASM) as the Engraving Backbone

## High-Level Goal

Phase 0 aims to produce a functional, browser-based musical score editor as quickly as possible by using MuseScore’s existing engraving engine (libmscore) compiled to WebAssembly. The intention is to avoid implementing any layout or rendering logic in this phase, allowing rapid iteration on web UI, workflows, collaboration models, and AST handling.

This phase is explicitly designed to unblock product development while deferring all nonessential complexity (layout engines, custom renderers, constraint solvers) to later phases.

**The output should be a working editor where scores load, render, and respond to user input.**

## Core Principle: Reuse Maximum Functionality From libmscore

`libmscore` is MuseScore’s internal engraving engine and score model. When compiled to WASM (via the existing “webmscore” project), it can run entirely in the browser.

Phase 0 deliberately relies heavily on this engine for:
*   Parsing MSCZ/MusicXML input
*   Semantic model creation (MuseScore AST)
*   Layout (spacing, collisions, beaming, slurs, ties)
*   Rendering to SVG

The key design constraint in Phase 0 is:
**Do not re-implement anything that libmscore already provides unless absolutely necessary.**

This allows the editor to ship early in a stable form.

## Primary Capabilities Required in Phase 0

Future phases will gradually replace libmscore, but for Phase 0 the system must be able to:

### 1. Load Scores in the Browser
*   Accept MSCZ (MuseScore compressed scores)
*   Accept MusicXML files
*   Pass raw data to webmscore for parsing
*   **Output:** A MuseScore AST object residing on the WASM side.

### 2. Render the Score to SVG
*   Use webmscore’s built-in APIs for layout → SVG generation
*   Inject resulting SVG into the web framework (React, Vue, Svelte, etc.)
*   This produces a visually correct, fully engraved score without implementing layout code.

### 3. Display the Rendered Score in a Browser UI
*   Wrap the generated SVG in an interactive component
*   Support zoom, pan, scrolling
*   Attach hit-testing overlays or coordinate mapping
*   This is the beginning of the web-native editor UI.

### 4. Enable Note/Element Selection
*   Use either:
    *   SVG event listeners, or
    *   Hit-test queries via webmscore
*   Highlight selected notes, rests, measures, slurs, etc.
*   Selection is the foundation for editing operations.

### 5. Manipulate the Score Through JS→WASM API Calls
This is the critical bridge. You must expose (or wrap) WASM-side functions for:
*   Altering pitches
*   Changing durations
*   Inserting/deleting notes or measures
*   Adding articulations
*   Modifying clefs/time signatures
*   Toggling accidentals, ties, slurs

All of these mutate the internal MuseScore AST stored in WASM memory. Each mutation triggers a:
1.  WASM AST update
2.  Re-layout
3.  Re-render → SVG
4.  UI refresh

### 6. Implement Undo/Redo
High-level requirement:
*   Capture semantic operations (not DOM diffs)
*   Store a linear or branchable history of AST-level intentions
*   Since the renderer re-generates SVG each time, undo/redo is implemented at the model level.

### 7. Handle Semantic Diff/Merge
For multi-user collaboration and version control:
*   Serialize MuseScore AST → JSON-like neutral format (Phase 1 formalizes this)
*   Compute diff between versions
*   Merge changes where possible
*   Phase 0 provides the API skeleton for diff/merge, even if a clean AST format is finalized later.

### 8. Primary Focus: Web Editor UX
Because engraving is fully delegated to WASM, Phase 0 developer effort must concentrate on:
*   UI layout and ergonomics
*   Responsiveness
*   Interactions with SVG
*   Navigation
*   Visual feedback for editing
*   Selection logic
*   File loading/saving
*   Basic toolbars (note duration palette, accidentals, etc.)

This ensures rapid end-to-end functionality.

## Architecture Overview (High-Level)

```mermaid
graph TD
    UI[Web UI (React / Vue / Svelte)] -->|JS-WASM Bridge (API wrappers)| WASM
    WASM[webmscore (WASM)] -->|SVG output| SVGView
    
    subgraph WASM_Container [webmscore (WASM)]
        direction TB
        Engine[MuseScore engine compiled to WebAssembly]
        Parsing[Parsing (MSCZ/MusicXML → AST)]
        Engraving[Full engraving/layout]
        Rendering[SVG rendering]
        AST[Internal AST storage]
    end

    subgraph UI_Container [Web UI]
        SVGView[SVG-based Score View (DOM <svg>, event listeners)]
    end
```

**Key design features:**
*   Rendering is one-way (webmscore → SVG → UI)
*   Editing is command-based (UI → WASM mutation → re-render)
*   Undo/redo uses semantic commands, not diffing SVG
*   All complex music theory/layout logic lives inside WASM

## Technical Constraints and Considerations

### 1. Licensing
*   libmscore is GPL; Phase 0 cannot be shipped as a closed-source browser product if WASM is client-side.
*   Server-only engraving (fallback mode) avoids this, but Phase 0 assumes client-side WASM for fastest development.

### 2. Performance
*   WASM execution is fast enough for full re-layout on each change.
*   SVG injection is cheap because:
    *   SVG is static
    *   Rendering happens only when the AST changes.

### 3. State Management
*   Keep WASM AST as the single source of truth.
*   UI state mirrors selections, cursors, tools, etc.
*   Use a unidirectional data flow model.

### 4. Editor Extensibility
Phase 0 must leave space for:
*   Custom AST
*   Custom layout engine
*   Incremental rendering
*   Future ML modules
*   Multi-user collaboration

The system is designed so that libmscore can be swapped out later without rewriting the UI.

## Deliverables Expected From Phase 0

1.  **Load-and-render pipeline:**
    *   [x] MSCZ or MusicXML → WASM → SVG → UI
2.  **Basic editor UI:**
    *   [ ] Note selection and highlighting
    *   [x] Zoom/pan/scroll
    *   [ ] Basic editing tools (pitch change, duration change)
3.  **AST mutation layer (via WASM bridge):**
    *   [ ] A JS API that issues commands to mutate the score in WASM.
4.  **Undo/redo manager:**
    *   [ ] Command-based
    *   [ ] Replays semantic operations, not SVG diffs
5.  **Diff/merge prototype:**
    *   [ ] Basic abstractions for versioning AST snapshots
6.  **Stable UX foundation:**
    *   [x] Panels, toolbars, keyboard shortcuts (Basic Toolbar implemented)
    *   [x] React/Vue/Svelte state management
    *   [ ] Components for systems, measures, notes
7.  **Documentation of public APIs for Phase 1 integration:**
    *   [ ] AST access layer
    *   [ ] Layout/render triggers
    *   [ ] Selection model
    *   [ ] Mutation commands

## Guiding Principles for Phase 0

*   **Velocity > optimality.** The goal is to produce a functioning editor quickly.
*   **Do not prematurely replace the engraver.** libmscore is used as-is for now.
*   **Keep architecture modular.** All APIs should be designed so that future phases can replace libmscore with a web-native engine.
*   **Focus on UX and workflow correctness.** Rendering can be replaced later; UX cannot.
*   **Don’t over-engineer the AST format yet.** But prepare a clean bridge layer for future abstraction.

## Current Status (WASM fork)
- Custom webmscore fork exposes mutation/undo APIs; app wiring calls them when available.
- WASM glue patched to fix instantiation, provide env imports/exports, and default Qt platform args/ENV to `wasm`; artifacts copied into `public/`.
- Score loads and renders SVG at `/?score=/test_scores/bach_orig.mscz`; UI shows toolbar/zoom.
- Note entry bindings are exposed and wired (setNoteEntryMode/method, setInputStateFromSelection, setInputAccidentalType, setInputDurationType, toggleInputDot, addPitchByStep, enterRest) with a Note Input toggle in the toolbar.
- Input-by-note-name shortcuts are active when Note Input is enabled: A–G note names, accidentals before note (`+` sharp, `-` flat, `=` natural), `1–8` durations, `0` rest, `.` dot, `T` tie, `Shift` to add to chord.

## Next Steps
1. Rebuild webmscore with platform=`wasm` baked in (remove memory-initializer `offscreen` patch) and automate copying `webmscore.lib.*` artifacts into `public/`.
2. Implement reliable selection/hit-testing (DOM overlay or WASM hit-test) and wire mutations to the selected element; add visual highlight.
3. Add a lightweight regression check in the dev/build flow to verify required wasm/data/mem files are present and loadable.
4. **Next feature to tackle:** stabilize selection persistence (highlight state) across undo/redo and mutations, and document the JS↔WASM selection contract for Phase 0.
5. **Milestone: comprehensive test coverage**
   - Add/maintain unit + integration coverage with `npm run coverage` (Vitest).
   - Add/maintain end-to-end regression coverage with `npx playwright test`.
   - Define “full coverage” as:
     - 100% Vitest coverage for `app/`, `components/`, `lib/`, `scripts/` (excluding `.next/`, `public/`, `webmscore-fork/`).
     - 100% “wrapper surface” coverage: every JS↔WASM mutation/export wrapper has at least one Playwright test asserting a real score change (via MSCX export or SVG assertions).
   - Prefer stable selectors (`data-testid`) for Playwright to avoid ambiguous button names as the toolbar grows.

## Input by Note Name Mode (Status + Next Steps)

### Current Status
- Note entry mode is toggled via the toolbar, using `NoteEntryMethod::STEPTIME`.
- Keyboard input in note entry mode follows the handbook: accidentals before note name (`+`, `-`, `=`), A–G note names, `1–8` durations, `0` rest, `.` for dot, `T` for tie, `Shift` for chord entry.
- In normal mode, accidentals and dotting apply to the selected note.
- Unit coverage exists for note entry shortcuts in `unit/ScoreEditor.test.tsx`.

### Next Steps
1. **UI polish for note entry state**
   - Add an on-screen legend or compact status widget showing current duration, dot state, and accidental while Note Input is enabled.
   - Add keyboard hints for note entry (A–G, `1–8`, `0`, `.` , `+/-/=` , `T`).
2. **Toolbar behavior in note entry mode**
   - Allow accidental/duration controls to be active even if selection overlay is hidden, as long as Note Input is enabled.
3. **Hotkeys to align with handbook**
   - Add `N` to toggle Note Input on/off, `Esc` to exit note input.
4. **Verification**
   - Add/extend tests to confirm: toggling Note Input by keyboard; accidentals set before note insert in note entry mode; note entry UI state updates on key press.

## WASM Build / Sync (timed commands)
- Debug rebuild (from `webmscore-fork/web/build.debug`): `/usr/bin/time -v emmake make -j8 webmscore`
- Copy artifacts to web-public → Next: `npm run sync:wasm` (copies `.wasm/.data/.mem.wasm` to `public/`)
- Rebundle worker glue (from `webmscore-fork/web-public`): `/usr/bin/time -v npx rollup -c`

## Selection / Mutation Contract (Phase 0)
- WASM is the source of truth for selection; the DOM overlay is visual only.
- UI calls `selectElementAtPoint(page, x, y)` using the center of the clicked element (page-relative) to set selection in WASM.
- After any mutation/undo/redo + re-render, re-run `selectElementAtPoint` with the last known point to keep WASM state and SVG highlights aligned.
- If the SVG lacks `selected` markers, the overlay falls back to the last known element index.

## Current Status (worker/WASM)
- Signature mismatch crash fixed via full rebuild; debug flags reduced to avoid finalize OOM.
- Mutation/selection APIs exposed in both main-thread and worker builds (`selectElementAtPoint`, delete/pitch/duration, undo/redo, relayout).
- Playwright smoke `scripts/debug-select.js` exercises toolbar mutations end-to-end; selection persists across undo/redo with the reselect hook.
- Audio playback uses `saveAudio`/WAV and prefers `synthAudioBatch` streaming; streaming occasionally errors (needs investigation).

## Wrapper Priorities (available exports to wrap)
1) Selection + core edit: `selectElementAtPoint`, `deleteSelection`, `pitchUp/Down`, `doubleDuration/halfDuration`, `undo/redo`, `relayout`.
2) Render/output: `saveSvg`, `savePng`, `savePdf`, `savePositions`, `saveMetadata`.
3) Score IO: `load`, `saveXml/Mxl/Msc`, `saveMidi`, `saveAudio`, `generateExcerpts`, `addFont`, `init`.
4) Info/housekeeping: `version`, `setLogLevel`, `title`, `npages`, `destroy`.
5) Playback (optional): `synthAudio`, `processSynth`, `processSynthBatch`.


Phase 0.2: Mutation (Fork Strategy)
Goal Description
Enable score modification (mutation) by forking webmscore and exposing the underlying libmscore C++ commands to JavaScript.

Progress (completed)
- Forked webmscore locally and exposed mutation/undo hooks via new C exports (selectElementAtPoint/deleteSelection/pitchUp/pitchDown/doubleDuration/halfDuration/undo/redo/relayout).
- Built the custom WASM artifacts with those bindings and wired the app to use them via `file:./webmscore-fork/web-public`.
- Frontend now calls the optional mutation APIs for selection, pitch, duration, delete, undo/redo; re-renders after each mutation.

User Review Required
IMPORTANT

Build Environment: Building webmscore requires the Emscripten SDK (emcc). I need to verify if this is available or if we need to set it up. Fork Maintenance: We will be maintaining a custom build of webmscore.

Proposed Changes
1. Fork & Setup
Clone webmscore repository (or LibreScore/webmscore).
Verify build prerequisites.
2. Expose C++ APIs
Modify the Emscripten bindings (likely in src/ or mscore/) to expose the following libmscore functions:

Selection: cmdSelectAll, cmdSelectNext, etc. (if not already exposed).
Mutation:
cmdDeleteSelection(): Deletes the currently selected elements.
cmdSetPitch(int pitch): Sets the pitch of the selected note.
cmdAddInterval(int interval): Adds an interval to the selection.
cmdChangeDuration(int duration): Changes duration.
Undo/Redo: cmdUndo(), cmdRedo().
3. Build & Integrate
Compile the forked version to WASM (
webmscore.lib.wasm
, 
webmscore.js
).
Replace the node_modules/webmscore files with our custom build (or link it).

## Phase 0.3: Selection Tracking via SVG Class Markers

### Problem Statement
When pitching up/down a note, the blue selection overlay doesn't follow the note to its new position - it disappears completely. This occurs because the SVG is regenerated after mutations, causing element indices to change and making JavaScript-based selection tracking unreliable.

### Implemented Solution (WASM-side)
Modified the MuseScore SVG generator to add a "selected" class to elements that are currently selected in the score's internal selection state.

**Files Modified:**
1. `/webmscore-fork/src/importexport/imagesexport/internal/svggenerator.h`
   - Added forward declaration for `Score` class
   - Modified `setElement()` signature to accept optional `Score` parameter

2. `/webmscore-fork/src/importexport/imagesexport/internal/svggenerator.cpp`
   - Added includes: `<algorithm>`, `libmscore/score.h`, `libmscore/select.h`
   - Modified `getClass()` function to check selection state and append " selected" to class
   - Added `_score` member to `SvgPaintEngine` class
   - Updated `setElement()` to store both element and score pointers
   - Handles three selection modes: `isRange()`, `isSingle()`, `isList()`
   - Uses `std::find()` for C++17 compatibility (not `vector::contains()`)

3. `/webmscore-fork/src/importexport/imagesexport/internal/svgwriter.cpp`
   - Updated all three `setElement()` call sites to pass score pointer (lines 147, 163, 221)

**Build Process:**
```bash
cd webmscore-fork/web/build.release
make -j8
cd ../../..
npm run sync:wasm  # Copies all WASM artifacts to public/
```

### Current Status
- ✅ WASM builds successfully with selection-checking code
- ✅ SVG elements have proper class attributes (Note, Stem, Beam, etc.)
- ❌ "selected" class is NOT appearing on clicked elements

### Investigation Needed
The "selected" class is not being added to SVG elements despite:
1. The WASM code compiling and running without errors
2. The score loading and rendering correctly
3. Element classes being properly set (verified 320 "Note" elements, 160 "Beam" elements, etc.)

**Possible causes:**
1. Selection state is empty when `getClass()` is called during SVG generation
2. SVG generation happens before selection is registered in MuseScore's internal state
3. The score's `selection()` method returns an empty selection during rendering
4. Timing issue: SVG is cached/rendered before the WASM selection state updates

**Next debugging steps:**
1. Add C++ debug logging to `getClass()` to verify:
   - Whether `score` parameter is non-null
   - What `selection().state()` returns
   - How many elements `selection().elements()` contains
2. Verify that clicking actually updates MuseScore's internal selection before SVG regeneration
3. Check if there's a separate "render with selection" vs "render without selection" code path

### Alternative Approach (if current method fails)
If the selection state is not available during SVG generation, we may need to:
1. Export a separate WASM function to mark elements as selected by ID/index
2. Trigger SVG regeneration after explicitly setting selection markers
3. Or use a completely JavaScript-based approach with overlays (less ideal but more reliable)

Current Next Steps
- Keep tracking the generated `web-public/webmscore.*` artifacts (for install without rebuild); ignore only transient build trees (`web/build.release`, `.cache`).
- Document/re-run `npm run compile` in `web-public` when bindings change.
- Expand mutation surface as needed (e.g., duration set, add interval, select by element id) and expose via C/JS bridge following the same pattern.
- **DEBUG:** Add logging to WASM `getClass()` function to understand why "selected" class isn't being applied
4. Frontend Integration
Update ScoreEditor.tsx to use the new methods.
Add UI controls (Delete button, Undo/Redo buttons).
Verification Plan
Manual Verification
Delete Test: Select a note, press Delete. Verify it disappears.
Undo Test: Press Undo. Verify the note reappears.
Save/Reload: Verify changes persist in the session (AST is updated).

## Text Feature Plan

### Key text features and complexities

1. **Title/Subtitle/Composer frames**
   * Already have `setHeaderText`/`getText` helpers; complexity is ensuring text style exists before editing and syncing with `score.title()`/`subtitle()` calls.
   * Needs toolbar input box + dedicated "Apply" controls to edit `TextStyleType::TITLE/SUBTITLE/COMPOSER`.

2. **Staff/System/Expression text**
   * `Score::addText` can create different text styles; requires ensuring selection is a chord/rest/measure to attach the annotation.
   * Expressions need placement below staff (already default) and should reuse existing edit/undo infrastructure via commands, so our wrapper should call new WASM binding and rely on `TextBase::undoChangeProperty`.
   * System text is anchored to a staff/chord but displayed centrally; tricky part is making sure selection is valid (system vs staff).

3. **Lyrics**
   * `Score::addLyrics` needs the selection to be a note/rest/lyrics; there are multiple lyric lines (`LYRICS_ODD`, `LYRICS_EVEN`) with numbering.
   * Need to support inputting syllabic text and verifying that the text appears just below the note via `saveMsc` check.

4. **Chord symbols (Harmony text)**
   * Involves `Harmony` objects with parsing/realizing chord names; editing should trigger `Harmony::setHarmony` to keep MIDI playback in sync.
   * Complexity: there are multiple harmony styles (standard, roman, Nashville). Need a dropdown for choosing style and prompt for chord text; also ensure invalid chord names degrade gracefully.

5. **Fingering/String/Technique text**
   * Already supported via `Score::addText` with note context; hooking up to new controls must verify selection is a Note (and respects tablature settings).
   * Must map to `TextStyleType::FINGERING`, `LH_GUITAR_FINGERING`, etc., so UI can choose the desired text style.

6. **Figured bass (FB)**
   * `FiguredBass::addFiguredBassToSegment` attaches to the first voice; needs first track of staff selection and may create an annotation block.
   * Adding multiple FB items per measure may require reusing existing segmentation; need to ensure our WASM binding returns the FB object for undo/redo but we can just call add and re-render.

7. **Text blocks or standalone frames**
   * MuseScore text blocks are anchored to frames (VBOX/TBOX); we probably skip full block editing for Phase 0, but note the extra UI would need a frame selection, so start with simpler annotations.

8. **Special characters & formatting**
   * Text input can include MuseScore symbol placeholders (`<sym>…</sym>`). Need to ensure our prompt defaults accept raw XML or plain text and rely on `TextBase::plainToXmlText`.
   * Keep editing simple: allow plain text entry via `prompt()`, but document that advanced formatting is out of scope for now.

9. **Editing vs. Adding text**
   * We should expose both "insert text" and "edit selected text" paths; editing requires retrieving current `TextBase::plainText` before prompting, then setting via new binding.
   * Selection overlay must know when the currently selected element is a text object to route commands appropriately.

10. **Undo/Redo/Selection alignment**
   * Every text mutation should call `score.relayout` after executing the WASM command, so the UI overlays stay sync'ed; reselect logic already handles strolling overlays.

### Next steps summary

* Prioritize features based on user needs (header text + staff/system/expression text are foundational).
* Add precise WASM bindings for these actions with minimal UI prompts.
* Expand toolbar with grouped dropdowns plus `data-testid` identifiers for Playwright coverage.
* Document testing strategy focusing on MSCX output for inserted text.

## Hairpin Text (Dynamics lines)

1. **Hairpin creation**
   * Already backed by `Score::addHairpin`; we only need a toolbar hook and WASM binding that toggles crescendo/decrescendo.
   * Hairpins are drawn as `TextStyleType::HAIRPIN`, but creation occurs in `hairpin.cpp`, so our binding can directly call `Score::addHairpin`.
2. **Placement context**
   * Requires selecting a chord/rest because hairpins span between chord rests. We'll reuse the existing selection guard (must have selection).
3. **Undo/Redo and relayout**
   * Because hairpins modify spans, ensure the mutation wrapper starts a command/relayout in WASM and the UI reselects the same element afterwards.
4. **Testing**
   * Add a Playwright test verifying a crescendo/decrescendo symbol appears in the exported MSCX (`<hairpin type="crescendo">`).

## Input by Note Name (Keyboard)

Scope: keyboard note-name entry (A–G) with accidentals and ties. Skip mouse/MIDI/virtual piano pitch entry.

1. **WASM API surface**
   * Expose note-entry helpers in `web/main.cpp`:
     - `setNoteEntryMode(bool)` and `setNoteEntryMethod(int)` (default to REPITCH/TIMEWISE as needed).
     - `setInputStateFromSelection()` to seed `inputState.segment/track` from the current selection.
     - `addPitchByStep(noteIndex, addToChord, insert)` that calls `Score::cmdAddPitch` and respects `inputState`.
     - `enterRest()` wired to `Score::cmdEnterRest(inputState().duration())`.
     - `setInputAccidentalType(int)` or `toggleAccidental(int)` wired to `Score::toggleAccidental` (note-entry path).
     - `toggleTie()` wired to `Score::cmdAddTie`/`cmdToggleTie` for note-entry ties.
   * Keep `setDurationType` as the primary way to set the input duration before letter entry.

2. **UI state + controls**
   * Add a "Note Input" toggle in the toolbar; when active, show an indicator and enable key capture.
   * Reuse existing duration controls (32nd → whole) and voice selection to set input state for new notes.
   * Add accidental buttons that switch between "edit selection" and "note-entry accidental" depending on note-entry mode.
   * Add a "Tie" toggle/button to arm tying in note-entry mode.

3. **Keyboard handling (ScoreEditor)**
   * When note-entry mode is active, capture A–G to call `addPitchByStep` (0=C … 6=B).
   * Support accidentals: `#` (sharp), `b` (flat), `n` (natural), `=` (natural) to set input accidental state.
   * Support ties: `T` (or `+`) to toggle tie mode / call `toggleTie`.
   * Respect focus: ignore keystrokes in text inputs/textarea/select to avoid stealing typing.

4. **Selection + cursor behavior**
   * Entering note-entry mode requires a selected chord/rest; otherwise prompt the user to select a starting point.
   * After each note entry, reselect the newly created chord/rest and update the selection overlay.
   * Keep input state aligned with selection changes (call `setInputStateFromSelection` after selection updates).

5. **Tests**
   * Unit tests for keyboard mapping (A–G, accidentals, tie) → WASM binding calls.
   * Playwright: enable note-entry, press keys, assert MSCX changes for pitch and accidental; verify tie creation (`<Tie>`/`<Spanner>` in export).
