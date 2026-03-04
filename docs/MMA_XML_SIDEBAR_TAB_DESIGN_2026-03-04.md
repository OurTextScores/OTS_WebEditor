# MMA XML Sidebar Tab Design (March 4, 2026)

## 1. Objective

Add a new `MMA` tab in the existing MusicXML sidebar (`ScoreEditor`) so users can:
- author/paste MMA scripts (`.mma` / `.txt` syntax),
- generate accompaniment MIDI with MMA,
- optionally convert generated MIDI to MusicXML,
- apply the generated MusicXML back into the editor.

This should integrate with the existing `POST /api/music/convert` pipeline (already supports `midi <-> musicxml`) and existing artifact/trace conventions.

## 2. Why this shape

MMA is a command-line accompaniment generator that takes chord/directive text files and outputs MIDI (not MusicXML directly). Per MMA docs, standard usage is `mma inputfile` (writes `inputfile.mid`) or `mma -f FILE inputfile` for explicit output path.

Design implication: MMA integration should be treated as a specialist pipeline:
1. MMA script -> MIDI (MMA CLI),
2. MIDI -> MusicXML (existing convert service),
3. optional apply-to-score in the web editor.

## 3. Scope and non-goals

### In scope (v1)
- New sidebar tab and UI workflow in `components/ScoreEditor.tsx`.
- New API routes for MMA render/template.
- Artifact creation for MMA script, MIDI, and optional MusicXML.
- Validation and warning reporting in MMA endpoints.
- Observability parity with existing music services (`requestId`, `traceId`, summary logs).

### Out of scope (v1)
- Automatic high-fidelity chord analysis from arbitrary polyphonic MusicXML.
- Perfect auto-arrangement from full scores.
- Full merge engine that appends accompaniment as a new part while preserving all engraving details.

## 4. UX design (XML sidebar tab)

### 4.1 Tab placement and behavior
- Add tab button `MMA` beside existing `XML`, `Assistant`, `NotaGen`.
- New `xmlSidebarTab` union value: `'mma'`.
- When selected:
- lazy-load current XML (same pattern used for `notagen`/`assistant`).
- show MMA editor and generation controls.

### 4.2 Layout inside the MMA tab

Top controls:
- `Starter` select: `Blank`, `Lead Sheet (auto)`, `12-bar Blues (demo)`.
- `Generate starter from score` button (uses score XML to propose meter/key/tempo/chord grid).
- `Render MIDI` button.
- `Render + Convert to MusicXML` button.

Main editor:
- Code editor (text mode) for MMA source (`data-testid="mma-editor"`).

Result pane:
- Status + diagnostics (`errors`, `warnings`, `stdout/stderr excerpt`).
- Artifacts section:
- `Download .mma`
- `Download .mid`
- `Download .musicxml` (if conversion requested)
- `Apply MusicXML to score` (replace current score via existing `applyXmlToScore`).

Safety/clarity text:
- Explicit note: "MMA generates accompaniment from chord directives; output will not preserve source melody unless encoded in the MMA script."

### 4.3 Apply behavior (v1)
- `Apply MusicXML to score` uses existing full-score apply path (`applyXmlToScore`).
- No part-append merge in v1 (avoids brittle merge logic and hidden musical regressions).
- If no score is loaded, `Apply` opens generated XML as a new score (same approach used in NotaGen output handling).

## 5. Backend/API design

## 5.1 New routes

1. `POST /api/music/mma/template`
- Purpose: generate a starter MMA script from current score context.
- Input:
  - standard score resolution payload (`scoreSessionId` or `content`),
  - optional `strategy` (`harmony-first` | `meter-key-only`),
  - optional `maxMeasures`.
- Output:
  - `template` (string),
  - `analysis` (meter/key/tempo/measure estimate/chord coverage),
  - `warnings` (e.g., no harmony symbols found).

2. `POST /api/music/mma/render`
- Purpose: compile MMA script and optionally return converted MusicXML.
- Input:
  - `script` (required),
  - `includeMidi` (default true),
  - `includeMusicXml` (default false),
  - `timeoutMs` (bounded),
  - `persistArtifacts` (default true).
- Output:
  - `midiBase64` when requested,
  - `musicxml` when requested,
  - `artifacts` (`input`, `midi`, optional `musicxml`),
  - `validation`, `warnings`,
  - `provenance` (`engine: mma`, command, duration, truncated stderr).

## 5.2 Internal service module

Add `lib/music-services/mma-service.ts` with:
- `runMmaTemplateService(body, options)`
- `runMmaRenderService(body, options)`

And shared helpers (can live in `lib/music-mma.ts`):
- `buildStarterTemplateFromXml(xml)`
- `runMmaCompile({ script, timeoutMs, traceContext })`
- `validateMmaScript/script-size`
- `validateMidiOutput` (reuse existing MIDI checks from conversion stack where possible)

## 5.3 Contracts

Add new contracts:
- `lib/music-services/contracts/music-mma-template-contract.ts`
- `lib/music-services/contracts/music-mma-render-contract.ts`

Register in:
- `lib/music-services/contracts/index.ts`

If desired for agent tooling later, names should be:
- `music.mma_template`
- `music.mma_render`

## 5.4 Execution pipeline (`/api/music/mma/render`)

1. Validate request (`script` non-empty, size cap, timeout bounds).
2. Write temp input file `input.mma`.
3. Run MMA CLI with explicit output file:
- `mma -f output.mid input.mma`
4. Hard-fail if CLI exits non-zero or output file missing/empty.
5. Read MIDI, validate structural shape (`MThd`, non-empty).
6. If `includeMusicXml=true`, call existing `convertMusicNotation`:
- `inputFormat: 'midi'`, `outputFormat: 'musicxml'`, `contentEncoding: 'base64'`.
7. Create artifacts (`mma`, `midi`, optional `musicxml`) with parent linkage.
8. Return payload + validation + provenance.

## 6. Starter-template strategy

`/api/music/mma/template` should produce usable (not perfect) scripts quickly.

### 6.1 Extraction order from MusicXML
1. Meter/key/tempo from `<attributes>` and `<sound tempo>` / metronome data.
2. Harmony symbols from `<harmony>` tags when available.
3. If no harmony tags, fallback to per-measure placeholder (`C`), plus warning.

### 6.2 Output template format
Template skeleton:
- `Tempo`, `TimeSig`, `KeySig`,
- `Groove` (default `Swing` or configurable default),
- bar lines with chord symbols,
- comments marking inferred vs placeholder values.

Example shape:
```mma
Tempo 108
TimeSig 4 4
KeySig C
Groove Swing

1  C   | F   | G7  | C   |
```

## 7. Runtime dependencies and config

### 7.1 Required binary
- MMA CLI (`mma`) installed in `score_editor_api` image.
- Python 3 runtime (MMA dependency).

### 7.2 Env config
- `MUSIC_MMA_BIN` (default `mma`)
- `MUSIC_MMA_TIMEOUT_MS` (default `60000`)
- `MUSIC_MMA_MAX_SCRIPT_BYTES` (default `262144`)
- `MUSIC_MMA_MAX_STDERR_CHARS` (default `8000`)

### 7.3 Health check
Add MMA section to conversion/service health (or a dedicated MMA health route):
- binary found,
- test compile with a tiny embedded script,
- output MIDI sanity check.

## 8. Validation and warning model

### Hard-fail conditions
- Empty/oversized script.
- MMA compile failure.
- Missing/empty output MIDI.
- Invalid MIDI header (`MThd` absent).
- Requested MusicXML conversion fails.

### Warning-only conditions
- Template generation had no harmonic data (`<harmony>` missing).
- Source vs result meter mismatch.
- Source vs result key mismatch.
- Measure estimate drift above threshold.

Notes:
- Note-count drift should not be used as a blocker for MMA accompaniment workflows.

## 9. Observability integration

Use existing trace conventions (`resolveTraceContext`, `applyTraceHeaders`, `logApiRouteSummary`) and JSON event logs.

New events:
- `music.mma.template.request`
- `music.mma.template.result`
- `music.mma.render.request`
- `music.mma.render.compile_result`
- `music.mma.render.convert_result`
- `music.mma.render.summary`

Suggested event fields:
- `requestId`, `traceId`, `sessionId`, `clientSessionId`
- `durationMs`, `timeoutMs`, `scriptBytes`
- `includeMusicXml`, `warningsCount`
- `artifactIds`
- `exitCode` / `stderrTruncated`

## 10. Test design

### Unit
- `mma-service` template extraction and fallback behavior.
- render request validation and timeout bounds.
- compile-result parsing and error mapping.

### Route tests
- `POST /api/music/mma/template` success/failure cases.
- `POST /api/music/mma/render` with/without MusicXML conversion.

### UI unit (`unit/ScoreEditor.test.tsx`)
- MMA tab renders.
- Render buttons call expected endpoints.
- Apply button calls `applyXmlToScore` path when xml exists.

### API smoke/e2e (`tests/music-api-smoke.spec.ts`)
- Render demo MMA script -> MIDI artifact.
- Render + convert -> MusicXML artifact.
- Runtime-aware skip if MMA binary unavailable.

## 11. Implementation map (files)

Frontend:
- `components/ScoreEditor.tsx` (new tab state/UI/actions)

Routes:
- `app/api/music/mma/template/route.ts` (new)
- `app/api/music/mma/render/route.ts` (new)

Services:
- `lib/music-services/mma-service.ts` (new)
- `lib/music-services/contracts/*mma*.ts` (new)
- `lib/music-services/contracts/index.ts` (register)

Optional shared runtime helpers:
- `lib/music-mma.ts` (new)
- `lib/music-conversion.ts` (reuse helpers; minimal additions only if needed)

Tests:
- `unit/mma-service.test.ts` (new)
- `unit/mma-routes.test.ts` (new)
- `unit/ScoreEditor.test.tsx` (update)
- `tests/music-api-smoke.spec.ts` (update)

## 12. Rollout recommendation

Phase 1 (recommended immediate):
- Manual script editing + render + optional MIDI->XML conversion + apply.

Phase 2:
- Auto-template from score (`/template`) and better chord extraction heuristics.

Phase 3 (only if user demand justifies):
- Part-append merge mode for accompaniment insertion into existing score.

## 13. Open questions for implementation start

- Preferred default groove for starter templates (`Swing` vs `BossaNova` vs user-selectable)?
  - User-selectable
- Should `Apply` default to replace score (v1 proposal) or force explicit confirmation each time?
  - it should checkpoint existing score and then replace
- Do we want to expose MMA stderr log verbatim in UI, or a sanitized/truncated version only?
  - sanitized

## 14. Next steps
Merge editor

## Sources

- MMA home and project overview: https://www.mellowood.ca/mma/
- MMA reference manual (overview/running): https://www.mellowood.ca/mma/online-docs/html/ref/node1.html
- MMA command usage and `-f` output option: https://www.mellowood.ca/mma/online-docs/html/ref/node2.html
- MMA tutorial examples (groove + chord chart workflow): https://mellowood.ca/mma/online-docs/html/tut/node5.html

## Implementation plan:
Implementation order

 Step 1: Shared helpers — lib/music-mma.ts (new)

 MMA-specific utilities used by both service endpoints:

 - buildStarterTemplateFromXml(xml, options?) — regex-based extraction of:
   - Meter from <time><beats> + <beat-type>
   - Key from <key><fifths>
   - Tempo from <sound tempo="...">
   - Harmony from <harmony> → <root><root-step> + optional <root-alter>, <kind>
   - Measure numbers from <measure number="...">
   - Output: MMA script string with Tempo, TimeSig, KeySig, Groove, and chord bars
   - If no <harmony> found: placeholder C chords + warning
 - validateMmaScript(script) — size cap check (MUSIC_MMA_MAX_SCRIPT_BYTES), non-empty
 - runMmaCompile({ script, outputPath?, timeoutMs }) — write temp .mma file, exec mma -f output.mid input.mma, read output MIDI, validate MThd
 header, return { midiBase64, stderr }
 - Env config constants: MUSIC_MMA_BIN, MUSIC_MMA_TIMEOUT_MS, MUSIC_MMA_MAX_SCRIPT_BYTES, MUSIC_MMA_MAX_STDERR_CHARS

 Reuse from lib/music-conversion.ts: decodeMidiBase64 (for MIDI validation), runCommandWithCandidates pattern, temp dir management pattern.

 Step 2: MMA service — lib/music-services/mma-service.ts (new)

 Two exported functions following the existing { status, body } return pattern:

 runMmaTemplateService(body, options?)
 - Resolve score content via resolveScoreContent(body) (existing utility in common.ts)
 - Call buildStarterTemplateFromXml(xml)
 - Return { template, analysis: { meter, key, tempo, measures, harmonyCoverage }, warnings }

 runMmaRenderService(body, options?)
 - Validate script (required, size cap)
 - Call runMmaCompile() to get MIDI
 - Create mma-script artifact (format: 'mma', encoding: 'utf8')
 - Create midi artifact (format: 'midi', encoding: 'base64', parent: script artifact)
 - If includeMusicXml requested: call existing convertMusicNotation({ inputFormat: 'midi', outputFormat: 'musicxml', content: midiBase64,
 contentEncoding: 'base64' })
 - Create musicxml artifact if conversion succeeded (parent: midi artifact)
 - Return { midiBase64?, musicxml?, artifacts, validation, warnings, provenance }

 Step 3: Contracts (new files)

 - lib/music-services/contracts/music-mma-template-contract.ts
 - lib/music-services/contracts/music-mma-render-contract.ts
 - Register both in lib/music-services/contracts/index.ts

 Follow existing contract pattern from music-convert-contract.ts.

 Step 4: API routes (new)

 - app/api/music/mma/template/route.ts — POST handler delegating to runMmaTemplateService
 - app/api/music/mma/render/route.ts — POST handler delegating to runMmaRenderService

 Both follow the existing route pattern: resolveTraceContext, try/catch with MusicServiceError, applyTraceHeaders, logApiRouteSummary.

 Step 5: Artifact type extension

 In lib/score-artifacts.ts, the format field on ScoreArtifact is typed as MusicFormat ('abc' | 'musicxml' | 'midi'). MMA scripts need 'mma'
 format support. Options:
 - Add 'mma' to MusicFormat in lib/music-conversion.ts
 - Or use a separate type for artifact format that's broader than conversion format

 Decision: add 'mma' to a new ScoreArtifactFormat type in lib/score-artifacts.ts (superset of MusicFormat), since MMA is not a format the
 conversion service converts between — it's an artifact-only format.

 Step 6: Frontend — ScoreEditor.tsx changes

 State additions (alongside existing sidebar state ~line 696):
 xmlSidebarTab type: add 'mma' to union
 mmaScript: string (editor content)
 mmaBusy: boolean
 mmaError: string | null
 mmaMidiBase64: string | null
 mmaMusicXml: string | null
 mmaTemplateWarnings: string[]
 mmaRenderResult: object | null  (provenance/validation for display)

 Tab button: Add MMA button after NotaGen (always visible, not gated on aiEnabled — MMA doesn't require AI keys).

 Tab content (xmlSidebarTab === 'mma'):

 1. Header section: "MMA (Accompaniment)" with info link to https://www.mellowood.ca/mma/
 2. Starter controls:
   - "Generate from Score" button → calls POST /api/music/mma/template with current score XML, populates mmaScript
   - If template returns warnings (e.g. no harmony), show them inline
 3. MMA editor: CodeMirrorEditor with language="none", editable, using mmaScript state
 4. Action buttons:
   - "Render MIDI" → calls /api/music/mma/render with { script, includeMusicXml: false }
   - "Render + Convert to XML" → calls /api/music/mma/render with { script, includeMusicXml: true }
 5. Result section (shown when results exist):
   - Status/diagnostics (warnings, stderr excerpt)
   - Download buttons: .mma, .mid, .musicxml (when available)
   - "Apply MusicXML to Score" button → uses existing applyXmlToScore path (same as XML tab's Apply)
   - Safety note: "MMA generates accompaniment from chord directives; output will not preserve source melody."
 6. Generated XML preview: CodeMirrorEditor (read-only, xml language) showing mmaMusicXml when available — user reviews before clicking Apply

 Handler functions:
 - handleMmaGenerateTemplate() — get current XML via score.saveXml(), POST to /api/music/mma/template, set mmaScript
 - handleMmaRender(includeMusicXml) — POST to /api/music/mma/render, set results
 - handleMmaApply() — call existing applyXmlToScore with mmaMusicXml (auto-checkpoint if dirty, same pattern as XML tab Apply)
 - handleMmaDownload(type) — download helpers for .mma/.mid/.musicxml

 Step 7: Unit tests

 unit/mma-service.test.ts (new):
 - Template generation: extracts meter/key/tempo/chords from sample XML
 - Template fallback: placeholder chords when no <harmony> elements
 - Render validation: rejects empty script, oversized script
 - Render service: mocked compile → artifact creation flow
 - MusicXML conversion: mocked convert call when includeMusicXml=true

 unit/music-mma.test.ts (new):
 - buildStarterTemplateFromXml with various MusicXML inputs (with/without harmony, different meters/keys)
 - validateMmaScript edge cases

 unit/convert-service.test.ts (update):
 - Add musescoreBins to mock config if not already present (already done in current changes)

 Step 8: API smoke tests

 tests/music-api-smoke.spec.ts (update):
 - POST /api/music/mma/template with minimal XML → returns template string
 - POST /api/music/mma/render with simple MMA script → returns MIDI
 - Runtime-aware skip if MMA binary unavailable (same pattern as MIDI tooling skip)

 Files to create

 - lib/music-mma.ts
 - lib/music-services/mma-service.ts
 - lib/music-services/contracts/music-mma-template-contract.ts
 - lib/music-services/contracts/music-mma-render-contract.ts
 - app/api/music/mma/template/route.ts
 - app/api/music/mma/render/route.ts
 - unit/mma-service.test.ts
 - unit/music-mma.test.ts

 Files to modify

 - components/ScoreEditor.tsx — add 'mma' to tab union, new state vars, tab button, tab content panel, handler functions
 - lib/score-artifacts.ts — add ScoreArtifactFormat type with 'mma'
 - lib/music-services/contracts/index.ts — register MMA contracts
 - tests/music-api-smoke.spec.ts — add MMA endpoint smoke tests

 Key reuse points

 - resolveScoreContent() from lib/music-services/common.ts for template endpoint input
 - convertMusicNotation() from lib/music-conversion.ts for MIDI→XML step in render
 - createScoreArtifact() / summarizeScoreArtifact() from lib/score-artifacts.ts
 - runCommandWithCandidates() pattern from lib/music-conversion.ts for MMA CLI execution
 - postScoreEditorJson() in ScoreEditor for frontend API calls
 - applyXmlToScore existing handler for Apply button
 - downloadBlob() for file downloads
 - CodeMirrorEditor component for MMA script + XML preview editors
 - Trace/logging infrastructure (resolveTraceContext, applyTraceHeaders, logApiRouteSummary)

 Verification

 1. Unit tests: npm run test — mma-service and music-mma test suites pass
 2. Type check: npm run typecheck — no new type errors
 3. Manual UI check: npm run dev, open score editor, verify MMA tab appears, editor renders, buttons are wired
 4. Template generation: Load a score with chord symbols, click "Generate from Score", verify MMA script populates with correct
 meter/key/tempo/chords
 5. Render (requires MMA binary): Enter simple MMA script, click "Render + Convert to XML", verify MIDI and XML artifacts created, preview shows
  XML, Apply updates score
6. Smoke tests: npm run smoke — MMA endpoint tests pass (or skip cleanly if MMA binary unavailable)

## 15. Implementation status (started)

Completed in this branch:
- Added shared MMA helper runtime: `lib/music-mma.ts`.
- Added MMA services: `runMmaTemplateService()` and `runMmaRenderService()` in `lib/music-services/mma-service.ts`.
- Added new API routes:
  - `POST /api/music/mma/template`
  - `POST /api/music/mma/render`
- Added MMA tool contracts and registered them in the contracts index.
- Added sidebar UI integration in `components/ScoreEditor.tsx`:
  - new `MMA` tab,
  - starter selection + template generation,
  - render MIDI / render+convert XML,
  - diagnostics/warnings,
  - download buttons,
  - apply generated XML via existing checkpointed replace flow (`applyXmlToScore`).
- Extended artifact format typing to support `mma` script artifacts.
- Added Docker image runtime support/env defaults for MMA (`Dockerfile.editor-api`).
- Added new unit tests:
  - `unit/music-mma.test.ts`
  - `unit/mma-service.test.ts`
  - `unit/mma-routes.test.ts`
  - updated `unit/music-service-contracts.test.ts`
- Added API smoke coverage updates in `tests/music-api-smoke.spec.ts`:
  - MMA template endpoint
  - MMA render (+optional MusicXML conversion) with runtime-aware tooling skip

Pending / fast-follow:
- Local/CI runtime verification that `mma` binary is available in all target containers.
- Merge editor fast-follow (append/accompaniment part workflow) remains separate from this Phase 1 replace-based apply path.
