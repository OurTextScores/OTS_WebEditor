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
    *   [x] A JS API that issues commands to mutate the score in WASM (selection, delete, pitch up/down, duration up/down, undo/redo, relayout exposed via webmscore fork).
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
    *   [x] AST access layer & mutation commands (selection/delete/pitch/duration/undo/redo/relayout via webmscore fork)
    *   [ ] Layout/render triggers (formalized surface)
    *   [ ] Selection model

## Guiding Principles for Phase 0

*   **Velocity > optimality.** The goal is to produce a functioning editor quickly.
*   **Do not prematurely replace the engraver.** libmscore is used as-is for now.
*   **Keep architecture modular.** All APIs should be designed so that future phases can replace libmscore with a web-native engine.
*   **Focus on UX and workflow correctness.** Rendering can be replaced later; UX cannot.
*   **Don’t over-engineer the AST format yet.** But prepare a clean bridge layer for future abstraction.

## Phase 0.2: Mutation (Fork Strategy)

Goal  
Enable score mutation by forking webmscore and exposing libmscore C++ commands to JavaScript/WASM.

Progress  
- Forked webmscore locally and exposed mutation/undo hooks via new C exports (selectElementAtPoint/deleteSelection/pitchUp/pitchDown/doubleDuration/halfDuration/undo/redo/relayout).  
- Built custom WASM artifacts with those bindings and wired the app to use them via `file:./webmscore-fork/web-public`.  
- Frontend calls the optional mutation APIs for selection, pitch/duration, delete, undo/redo, relayout; re-renders after each mutation.  
- WASM glue patched to provide correct env imports/exports and default `-platform wasm`/ENV to bypass missing Qt offscreen plugin; artifacts copied to `public/`.

## Webmscore rebuild + artifact sync

Incremental builds (preferred)  
- Ensure build env: `export EMSDK_QUIET=1`, `source ~/workspace/emsdk/emsdk_env.sh`, `export Qt5_DIR=/home/jhlusko/workspace/emsdk/build.qt5/5.15.2/wasm_32`, and `export PATH="$Qt5_DIR/bin:$PATH"`.  
- From `webmscore-fork/web-public`: `npm run compile` (runs `make release` and keeps artifacts).  
- If JS wrappers changed: from `webmscore-fork/web-public` run `npm run bundle`.  
- From repo root: `npm run sync:wasm` to copy artifacts into `public/`.
- Expected artifacts (same build): `webmscore.lib.js`, `webmscore.lib.wasm`, `webmscore.lib.data`, `webmscore.lib.mem.wasm` (plus optional `webmscore.lib.js.mem`).

Optional direct make (advanced)  
- From `webmscore-fork/web`: `make release`.  
- From `webmscore-fork/web-public`: `mv webmscore.lib.js.mem webmscore.lib.mem.wasm` (if present) and `mv webmscore.lib.js.symbols webmscore.lib.symbols`.  
- From repo root: `npm run sync:wasm`.

Clean rebuild (avoid unless needed)  
- From `webmscore-fork/web-public`: `npm run build` (runs `make clean` and removes artifacts).

### Example score
You can use this for testing: http://localhost:3000/?score=%2Ftest_scores%2Fbach_orig.mscz

## Soundfont CDN Configuration

For production deployments and embed builds, soundfonts should be hosted on a CDN to avoid bundling large files (default.sf2 is 142MB).

### Recommended: Use MuseScore_General from OSUOSL

The easiest option is to use the free MuseScore_General soundfont hosted by Oregon State University Open Source Lab:

**CDN URL:** `https://ftp.osuosl.org/pub/musescore/soundfont/MuseScore_General`

**Available files:**
- `MuseScore_General.sf3` - 38MB (compressed, recommended)
- `MuseScore_General.sf2` - 206MB (uncompressed)

**Build command:**
```bash
# Move soundfonts out of public/ to avoid OOM during build
mv public/soundfonts ~/soundfonts.backup

# Run the build with OSUOSL CDN
NEXT_PUBLIC_SOUNDFONT_CDN_URL=https://ftp.osuosl.org/pub/musescore/soundfont/MuseScore_General \
NEXT_PUBLIC_BUILD_MODE=embed \
BUILD_MODE=embed \
npm run build

# Restore soundfonts for local development
mv ~/soundfonts.backup public/soundfonts
```

The app will automatically try to load `MuseScore_General.sf3` first, then fall back to other naming conventions.

### Custom CDN Setup (Alternative)

If you need to host your own soundfonts:

1. Upload soundfont files to your CDN:
   - `default.sf3` (recommended, smaller compressed format)
   - `default.sf2` (fallback, larger uncompressed format)
   - Or: `MuseScore_General.sf3` / `MuseScore_General.sf2`

2. Configure the CDN URL via environment variable:
   ```bash
   NEXT_PUBLIC_SOUNDFONT_CDN_URL=https://cdn.example.com/soundfonts
   ```

### CDN Hosting Options (Custom)
- **GitHub Releases**: Upload soundfonts as release assets
- **S3/CloudFront**: Use AWS S3 with CloudFront CDN
- **Netlify/Vercel**: Use their built-in CDN for large assets
- **OSUOSL Mirror**: Free public CDN (recommended, already available)

### Local Development
For local development without a CDN, keep soundfonts in `public/soundfonts/`:
- `public/soundfonts/default.sf3`
- `public/soundfonts/default.sf2`

The app will try CDN URLs first (if configured), then fall back to local paths.

### Build Output
The static export build (`npm run build` with `BUILD_MODE=embed`) generates:
- `out/` directory with all static files (~38MB without soundfonts)
- WASM artifacts (webmscore.lib.wasm, webmscore.lib.mem.wasm, webmscore.lib.data)
- Static data files (data/clefs.json, data/templates.json)
- Next.js static assets
- Base path: `/score-editor` (configurable in next.config.ts)