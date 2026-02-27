# ScoreOps Capability Inventory and Prioritization

## Goal

Create a concrete capability baseline for `ScoreOpsTool` and define an agent-optimized operation surface.

This document is the input to MVP scope selection.

## Sources Audited

1. `lib/webmscore-loader.ts` (`Score` interface)
2. `components/ScoreEditor.tsx` (actual runtime method usage)
3. Existing specialist docs (`integration-design.md`, `roadmap.md`, `scoreops-tool-design.md`)

## Current Exposed Method Inventory

The `Score` interface currently exposes 112 methods.

- Required core methods: `destroy`, `saveSvg`, `savePdf`, `setSoundFont`, `metadata`, `measurePositions`, `segmentPositions`
- Almost all mutation/edit methods are optional and build-dependent.

## Runtime Reality Important for Agent Design

1. Capability drift is expected: many methods are optional (`?`) and vary by build.
2. Some methods used in `ScoreEditor.tsx` are not currently typed in `Score` interface:
   - `extendSelectionNextChord`
   - `extendSelectionPrevChord`
   - `getSelectionBoundingBoxes`
3. Method signatures are low-level and not ideal for model planning (numeric enums, implicit selection assumptions, toggle semantics).

---

## Domain Grouping

### A) Load/Render/Export (not primary agent mutation surface)

`saveSvg`, `savePdf`, `saveXml`, `saveMxl`, `saveMsc`, `saveMidi`, `saveAudio`, `savePng`, `setSoundFont`

Agent suitability:

- Use via explicit export ops, not as free-form tool calls.

### B) Selection and Targeting

`selectElementAtPoint`, `selectMeasureAtPoint`, `selectPartMeasureByIndex`, `selectTextElementAtPoint`, `selectElementAtPointWithMode`, `selectNextChord`, `selectPrevChord`, `getSelectionBoundingBox`, `clearSelection`, plus observed runtime methods `extendSelectionNextChord`, `extendSelectionPrevChord`, `getSelectionBoundingBoxes`

Agent suitability:

- Core prerequisite domain.
- Current primitives are point-driven and UI-centric; agent needs range/content-driven selectors.

### C) Clipboard/Delete/History

`selectionMimeType`, `selectionMimeData`, `pasteSelection`, `deleteSelection`, `undo`, `redo`

Agent suitability:

- `deleteSelection`, `undo`, `redo` are high value.
- clipboard MIME operations should remain internal unless we design strict envelopes.

### D) Pitch/Rhythm/Entry

`pitchUp`, `pitchDown`, `transpose`, `setAccidental`, `doubleDuration`, `halfDuration`, `toggleDot`, `toggleDoubleDot`, `setNoteEntryMode`, `setNoteEntryMethod`, `setInputStateFromSelection`, `setInputAccidentalType`, `setInputDurationType`, `toggleInputDot`, `addPitchByStep`, `enterRest`, `setDurationType`, `addNoteFromRest`

Agent suitability:

- Good for deterministic edits once target selection semantics are stabilized.

### E) Notation, Text, and Expressions

`addDynamic`, `addHairpin`, `addPedal`, `addSostenutoPedal`, `addUnaCorda`, `splitPedal`, `addRehearsalMark`, `addTempoText`, `addArticulation`, `addSlur`, `addTie`, `addGraceNote`, `addTuplet`, text insertion methods (`addStaffText`, `addSystemText`, `addExpressionText`, `addLyricText`, `addHarmonyText`, `addFingeringText`, etc.), metadata setters (`setTitleText`, `setSubtitleText`, `setComposerText`, `setLyricistText`, `setSelectedText`)

Agent suitability:

- High value with typed wrappers.
- Current signatures are too granular/fragmented for model use.

### F) Structural/Layout

`toggleLineBreak`, `togglePageBreak`, `setVoice`, `changeSelectedElementsVoice`, `relayout`, `layoutUntilPage`, `layoutUntilPageState`, `setLayoutMode`, `getLayoutMode`, `setTimeSignature`, `setTimeSignatureWithType`, `setKeySignature`, `getKeySignature`, `setClef`, `toggleRepeatStart`, `toggleRepeatEnd`, `setRepeatCount`, `setBarLineType`, `addVolta`, `insertMeasures`, `removeSelectedMeasures`, `removeTrailingEmptyMeasures`

Agent suitability:

- This is the core ScoreOps domain.
- Several methods are toggle-based and should be replaced with explicit set/clear semantics at tool level.

### G) Instrumentation/Part Management

`appendPart`, `appendPartByMusicXmlId`, `removePart`, `setPartVisible`, `listInstrumentTemplates`

Agent suitability:

- Strong candidate for phase-2+ (higher risk, large side effects).

---

## Agent-Optimized Signature Design Principles

Do not expose raw method signatures directly to the agent.

### 1) Strong typed enums (string, not number)

Example:

- raw: `setClef(clefType: number)`
- agent-op: `set_clef { clef: "treble" | "bass" | "alto" | "tenor", scope: ... }`

### 2) Explicit scope object on most ops

```json
{
  "scope": {
    "partId": "P1",
    "measureStart": 29,
    "measureEnd": 37,
    "voice": 1
  }
}
```

### 3) Set semantics over toggle semantics

Avoid `toggle*` in agent contracts.

- raw: `toggleRepeatStart()`
- agent-op: `set_repeat_start { enabled: true, scope: ... }`

### 4) Deterministic target resolution

Agent should specify intent-level targets (measure range/text match), not pixel points.

### 5) Per-op preconditions + expected effect

Each op schema should support:

- `requireSelection` / `autoSelect`
- optional `expectedAffectedMin` and `expectedAffectedMax`

---

## Signature Adaptation Recommendations (Existing Primitives)

1. `setKeySignature(fifths)`
   - Wrap as `set_key_signature` with string key aliases and optional range scope.
2. `setTimeSignature` / `setTimeSignatureWithType`
   - Wrap as `set_time_signature` with `numerator`, `denominator`, `symbol`.
3. `setClef(clefType)`
   - Wrap as `set_clef` with named clef values and explicit range behavior.
4. `toggleLineBreak` / `togglePageBreak`
   - Wrap as `set_layout_break { type, enabled }`.
5. `toggleRepeatStart` / `toggleRepeatEnd` + `setRepeatCount`
   - Wrap as `set_repeat_markers { start, end, count }`.
6. Text insertion methods (`add*Text`)
   - Consolidate as `insert_text { kind, text, placementScope }`.
7. `setSelectedText`
   - Wrap as `replace_selected_text`, with optional auto-selection fallback.
8. `transpose` / `pitchUp` / `pitchDown`
   - Wrap as `transpose_selection { semitones }` and keep pitch step ops as advanced.
9. `insertMeasures` / `removeSelectedMeasures`
   - Wrap as explicit range/target-aware structural ops.

---

## Candidate New Primitives for webmscore (or wrapper-layer composites)

These are high leverage for agent workflows:

1. `selectAll()`
2. `selectMeasureRange(partId, measureStart, measureEnd, voice?)`
3. `selectByTextContent(text, options)`
4. `deleteTextByContent(text, scope?)`
5. `setClefRange(clef, partId, measureStart, measureEnd)`
6. `setKeySignatureRange(fifths, partId?, measureStart?, measureEnd?)`
7. `removeRestsInRange(partId, measureStart, measureEnd, voice?)`
8. `normalizeBeamingInRange(partId, measureStart, measureEnd, strategy?)`
9. `inspectSelectionSummary()` returning stable IDs/range summary for tool planning
10. `getCapabilities()` returning feature support for the current build

Note:

- Some of these can start as wrapper-layer composites over existing methods.
- Others will be far safer/cleaner if added natively in webmscore.

---

## Priority Proposal

### P0 (MVP)

1. `set_metadata_text`
2. `set_key_signature`
3. `set_time_signature`
4. `set_clef`
5. `transpose_selection`
6. `delete_selection`
7. `insert_measures`
8. `remove_selected_measures`
9. `set_layout_break`
10. `set_repeat_markers`
11. `add_tempo_marking`
12. `add_dynamic`

### P1

1. `replace_selected_text`
2. `insert_text` family
3. `change_voice`
4. `remove_trailing_empty_measures`
5. `part_visibility` ops

### P2

1. `remove_rests_in_measure_range`
2. `rebeam_measure_range`
3. advanced articulation/slur/tie convenience ops
4. part add/remove ops

---

## First Implementation Task (Required Before MVP Lock)

Create a concrete capability baseline and signature map:

1. Enumerate methods from `webmscore-loader` + runtime capability probe.
2. Produce a method-to-op mapping matrix:
   - `raw method`
   - `wrapper op`
   - `scope model`
   - `safety concerns`
   - `priority`
3. Identify methods requiring new signatures vs native new primitives.
4. Lock the MVP op list only after this inventory review.

This inventory step is the first ScoreOps execution task.

