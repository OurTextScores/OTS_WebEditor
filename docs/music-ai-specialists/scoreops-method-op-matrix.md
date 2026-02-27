# ScoreOps Method-to-Op Mapping Matrix

## Purpose

Translate current `webmscore` method surface into an agent-safe `ScoreOpsTool` operation contract.

This matrix is the scoping artifact used to finalize the ScoreOps MVP op set.

## Legend

- `Priority`: `P0` (MVP), `P1` (next), `P2` (later), `N/A` (not exposed as agent op)
- `Needs Primitive`: `No` (wrapper over existing), `Wrapper` (composite wrapper), `Native` (new webmscore method recommended)
- `Atomic`: should participate in batch rollback by default

---

## Mapping Matrix

| Raw wasm method(s) | Proposed scoreops op | Agent-facing signature (summary) | Scope model | Preconditions / checks | Failure + rollback behavior | Priority | Needs primitive |
|---|---|---|---|---|---|---|---|
| `metadata` | `inspect_score` | `{ include: { scoreSummary: true } }` | global | score loaded | read-only, no rollback | P0 | No |
| `measurePositions`, `segmentPositions`, `measureSignatures?`, `measureSignatureAt?`, `measureSignatureCount?` | `inspect_scope` | `{ scope, include: { measureContext: true } }` | range/selection | score loaded | read-only, no rollback | P0 | No |
| `getSelectionBoundingBox`, `getSelectionBoundingBoxes` (runtime), `selectionMimeType?`, `selectionMimeData?` | `inspect_selection` | `{ include: { selectionSummary: true } }` | selection | selection present for detailed output | read-only | P0 | Wrapper |
| `saveXml?`, `saveMxl?`, `saveMsc?`, `saveMidi?`, `savePdf`, `savePng?`, `saveSvg`, `saveAudio?` | `export_score` | `{ formats: ["musicxml","midi","pdf"] }` | global/selection | required export methods available | if export fails after mutation, mutation stands; export error explicit | P0 | No |
| `setTitleText?`, `setSubtitleText?`, `setComposerText?`, `setLyricistText?` | `set_metadata_text` | `{ field: "title|subtitle|composer|lyricist", value }` | global | method exists per field | atomic op failure; rollback batch | P0 | No |
| `setSelectedText?` | `replace_selected_text` | `{ value, selectionPolicy }` | selection | editable text selected or auto-select policy | fail if no valid text target; rollback | P1 | Wrapper |
| `setKeySignature?`, `getKeySignature?` | `set_key_signature` | `{ key: "G major" | "1", scope? }` | global/range | method exists; key parse succeeds | fail + rollback; include previous key in details | P0 | Wrapper |
| `setTimeSignature?`, `setTimeSignatureWithType?` | `set_time_signature` | `{ numerator, denominator, symbol? }` | global/range | method exists | fail + rollback | P0 | Wrapper |
| `setClef?` | `set_clef` | `{ clef: "treble|bass|alto|tenor", scope }` | range | method exists; scope resolvable | fail + rollback | P0 | Wrapper |
| `transpose?` | `transpose_selection` | `{ semitones, scope? }` | selection/range | selection exists or range can be selected | fail + rollback | P0 | Wrapper |
| `pitchUp?`, `pitchDown?` | `transpose_stepwise` | `{ direction: "up|down", steps }` | selection | selection exists | fail + rollback | P1 | Wrapper |
| `setAccidental?` | `set_accidental` | `{ accidental: "sharp|flat|natural|double-sharp|double-flat", scope? }` | selection/range | selection exists | fail + rollback | P1 | Wrapper |
| `doubleDuration?`, `halfDuration?`, `setDurationType?`, `toggleDot?`, `toggleDoubleDot?` | `set_duration` / `scale_duration` / `set_dots` | typed duration operations | selection/range | selection exists | fail + rollback | P1 | Wrapper |
| `changeSelectedElementsVoice?`, `setVoice?` | `set_voice` | `{ voice: 1..4, scope }` | selection/range | selection exists | fail + rollback | P1 | Wrapper |
| `insertMeasures?` | `insert_measures` | `{ count, target: "start|after-selection|end", scope? }` | structure | target resolvable | fail + rollback | P0 | No |
| `removeSelectedMeasures?` | `remove_measures` | `{ scope }` | range | selected/range measure set non-empty | fail + rollback | P0 | Wrapper |
| `removeTrailingEmptyMeasures?` | `trim_trailing_empty_measures` | `{}` | global | method exists | fail + rollback | P1 | No |
| `toggleLineBreak?`, `togglePageBreak?`, `measureLineBreaks?`, `setMeasureLineBreaks?` | `set_layout_break` | `{ breakType: "line|page", enabled, scope }` | range/measure | measure targets resolvable | fail + rollback | P1 | Wrapper |
| `toggleRepeatStart?`, `toggleRepeatEnd?`, `setRepeatCount?`, `setBarLineType?`, `addVolta?` | `set_repeat_markers` | `{ start?, end?, count?, barline?, volta? , scope }` | measure/range | measure targets resolvable | fail + rollback | P1 | Wrapper |
| `deleteSelection?` | `delete_selection` | `{ scope?, strict? }` | selection/range | selection/range resolvable | fail + rollback | P0 | Wrapper |
| `pasteSelection?` | `paste_clipboard` (internal only) | not exposed to model in MVP | selection | clipboard available | likely UI-only, not model | N/A | N/A |
| `clearSelection?` | `clear_selection` | `{}` | selection | none | no-op if empty | P2 | No |
| `selectElementAtPoint?`, `selectTextElementAtPoint?`, `selectMeasureAtPoint?`, `selectPartMeasureByIndex?`, `selectElementAtPointWithMode?`, `selectNextChord?`, `selectPrevChord?`, `extendSelectionNextChord` (runtime), `extendSelectionPrevChord` (runtime) | `select_scope` family | `{ selector: { type, ... } }` | selection/range | selector resolvable | fail non-destructively (no rollback needed) | P0 | Wrapper |
| *(none today; desired)* | `select_all` | `{ target: "score|part|measure-range" }` | global/range | score loaded | no mutation | P0 | Native |
| *(none today; desired)* | `select_measure_range` | `{ partId, measureStart, measureEnd, voice? }` | range | valid range | no mutation | P0 | Native |
| *(none today; desired)* | `select_by_text_content` | `{ text, matchMode, scope? }` | selection/range | text index or traversal available | no mutation | P1 | Native |
| *(none today; desired)* | `delete_text_by_content` | `{ text, scope?, maxDeletes? }` | range/global | target text nodes found | fail if strict and none found; rollback | P0 | Native (or heavy wrapper) |
| *(none today; desired)* | `set_key_signature_range` | `{ key, partId?, measureStart?, measureEnd? }` | range/global | range resolution | fail + rollback | P1 | Native |
| *(none today; desired)* | `set_clef_range` | `{ clef, partId, measureStart, measureEnd }` | range | range resolution | fail + rollback | P1 | Native |
| *(none today; desired)* | `remove_rests_in_range` | `{ partId, measureStart, measureEnd, voice?, strategy }` | range | validated edit strategy | fail + rollback | P2 | Native |
| *(none today; desired)* | `normalize_beaming_in_range` | `{ partId, measureStart, measureEnd, strategy }` | range | beaming engine support | fail + rollback | P2 | Native |
| `addTempoText?` | `add_tempo_marking` | `{ bpm, scope? }` | selection/measure | target resolvable | fail + rollback | P0 | Wrapper |
| `addDynamic?` | `add_dynamic` | `{ dynamic: "pp..ff", scope }` | selection/range | target resolvable | fail + rollback | P0 | Wrapper |
| `addHairpin?`, `addPedal?`, `addSostenutoPedal?`, `addUnaCorda?`, `splitPedal?` | `add_expression_mark` | typed expression options | selection/range | target resolvable | fail + rollback | P1 | Wrapper |
| `addArticulation?`, `addSlur?`, `addTie?`, `addGraceNote?`, `addTuplet?` | `add_notation` | typed notation options | selection/range | target resolvable | fail + rollback | P1 | Wrapper |
| `addStaffText?`, `addSystemText?`, `addExpressionText?`, `addLyricText?`, `addHarmonyText?`, `addFingeringText?`, `addLeftHandGuitarFingeringText?`, `addRightHandGuitarFingeringText?`, `addStringNumberText?`, `addInstrumentChangeText?`, `addStickingText?`, `addFiguredBassText?` | `insert_text` | `{ kind, text, scope }` | selection/range/global | kind supported | fail + rollback | P1 | Wrapper |
| `appendPart?`, `appendPartByMusicXmlId?`, `removePart?`, `setPartVisible?`, `listInstrumentTemplates?` | `manage_parts` | `{ action, ... }` | global/part | template/instrument available | fail + rollback | P2 | Wrapper |
| `undo?`, `redo?` | `history_step` | `{ direction: "undo|redo", steps? }` | session | undo stack available | no rollback (this is rollback) | P1 | No |
| `relayout?`, `layoutUntilPage?`, `layoutUntilPageState?` | `relayout_score` / post-mutation hook | usually internal; optional explicit op | global | method exists | fail reported; prior mutations remain | P0 (internal) | No |
| `setLayoutMode?`, `getLayoutMode?` | `set_layout_mode` | `{ mode: "page|line|system|..." }` | global | method exists | fail + rollback | P2 | Wrapper |
| `setSoundFont`, `synthAudioBatchFromSelection?`, `synthSelectionPreviewBatch?`, `saveAudio?` | `preview_audio` | `{ mode: "selection|full", durationMs? }` | selection/global | audio capabilities available | non-mutating, no rollback | P1 | Wrapper |
| `destroy` | none (lifecycle only) | not model-exposed | N/A | internal | N/A | N/A | N/A |
| `loadProfile?` | none (diagnostics) | optional `inspect_runtime` include | N/A | internal | no mutation | P2 | No |

---

## Methods Not Exposed Directly to Agent (by design)

These should remain internal or wrapped:

- raw point/pixel selection methods (`selectElementAtPoint*`) as direct model controls
- clipboard MIME details (`selectionMimeType`, `selectionMimeData`, `pasteSelection`)
- lifecycle/runtime methods (`destroy`, low-level loader behavior)

Reason: they are UI/runtime-fragile, not semantically stable for agent planning.

---

## Priority Summary

### P0 (MVP baseline)

- `inspect_score`
- `inspect_selection`
- `inspect_scope`
- `set_metadata_text`
- `set_key_signature`
- `set_time_signature`
- `set_clef`
- `transpose_selection`
- `delete_selection`
- `insert_measures`
- `remove_measures`
- `add_tempo_marking`
- `add_dynamic`

### P1

- `replace_selected_text`
- `insert_text`
- `set_duration` / `set_accidental` / `set_voice`
- `set_layout_break`
- `set_repeat_markers`
- `history_step`
- `preview_audio`

### P2

- advanced cleanup/notation transforms (`remove_rests_in_range`, `normalize_beaming_in_range`)
- part/instrument management
- layout mode and deeper diagnostics

---

## Required Follow-Up Before Implementation

1. Reconcile typed `Score` interface with runtime-used methods:
   - add `extendSelectionNextChord`
   - add `extendSelectionPrevChord`
   - add `getSelectionBoundingBoxes`
2. Add `getCapabilities()` helper output in executor so agent paths are capability-gated.
3. Decide which `Native` primitives are added to webmscore vs wrapper composites in OTS.
4. Finalize JSON schemas for P0 ops based on this matrix.

