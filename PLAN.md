## Voices: Minimal Implementation Design

### Goals
- Enable true multi-voice entry/editing using libmscore (no custom layout).
- Match MuseScore behavior for voice selection:
  - Voice buttons change input voice in note-entry mode.
  - Voice buttons move selected notes/rests to that voice when not in note-entry mode.
- Keep scope minimal: no voice visibility toggles, exchange voices, or rest-merging UI yet.

### Handbook behavior (summary)
- A voice is an independent rhythmic line on a staff; default is voice 1, voice 2 used for second line.
- Voices 1/3 are stems up, voices 2/4 stems down (engraving handles this).
- Selecting notes/rests and clicking a voice button moves them to that voice; compatible rhythms combine into chords.
- Note-entry cursor/selection uses a voice-specific color (can be deferred to Phase 1 UI polish).

### MuseScore implementation touchpoints
- Input voice: `InputState::setVoice` adjusts track to `(staff * VOICES + voice)` and handles tuplets.
  - Files: `src/engraving/dom/input.cpp`, `src/engraving/dom/input.h`
- Note-entry voice selection: `NotationNoteInput::setCurrentVoice`.
  - File: `src/notation/internal/notationnoteinput.cpp`
- Moving notes to another voice: `Score::changeSelectedElementsVoice`.
  - File: `src/engraving/dom/score.cpp`

### Proposed minimal API surface (WASM)
- Keep existing `setVoice(voiceIndex)` but ensure input state is seeded:
  - If `inputState.track()` or `segment()` is invalid, call `setInputStateFromSelection()` before `InputState::setVoice`.
- Expose new binding:
  - `changeSelectedElementsVoice(voiceIndex)` → `Score::changeSelectedNotesVoice` in this libmscore fork.
  - Note: this build moves notes only (rests are not moved yet).

### UI behavior
- Track UI voice state locally (selected voice button).
- When Note Input is enabled:
  - If there is a selection, call `setInputStateFromSelection()` then `setVoice(voiceIndex)`.
  - If there is no selection, prompt user to select a chord/rest first (minimal) or select the nearest chord/rest using existing selection logic.
- When Note Input is disabled:
  - If there is a selection, call `changeSelectedElementsVoice(voiceIndex)` and re-render/reselect.
  - If there is no selection, only update UI voice state (no mutation).

### Selection + rendering
- After `changeSelectedElementsVoice`, relayout + `renderScore()` then refresh selection from SVG.
- Preserve unified selection flow: avoid DOM-only reselect fallback except where SVG lacks selection markers.

### Tests
- Unit test: voice button in edit mode calls `changeSelectedElementsVoice` and relayout.
- Unit test: voice button in note-entry mode calls `setInputStateFromSelection` then `setVoice`.
- Unit test: voice button with no selection does not call voice mutation and shows alert (or no-op, if preferred).

### Out of scope (Phase 1+)
- Voice visibility toggles per staff.
- Exchange voices tooling.
- Voice color customization in UI.
- Rest merge settings UI.
