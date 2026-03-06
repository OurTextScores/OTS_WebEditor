# Functional Harmony Tab Design (March 5, 2026)

## 1. Objective

Add a new `Harmony` tab to OTS that is distinct from `Chordify`.

`Chordify` remains the practical chord-symbol pipeline:

- generate MusicXML `<harmony>` tags
- improve MMA accompaniment generation
- enrich scores with lead-sheet style chord labels

`Harmony` should instead target theory-oriented harmonic analysis:

- Roman numeral analysis
- local key / tonicization tracking
- phrase- and cadence-oriented summaries
- modulation and ambiguity reporting

The key product decision is separation of concerns:

1. `Chordify` answers: "What chord symbols should appear in this score?"
2. `Harmony` answers: "What is the harmonic function of this passage?"

## 2. Why a Separate Tab

The current `music21` chord-symbol pipeline is intentionally MMA-oriented.

That means it is optimized for:

- stable lead-sheet symbols
- manageable harmonic rhythm
- deterministic insertion into MusicXML `<harmony>`

It is not optimized for:

- Roman numeral correctness in ambiguous passages
- modulation boundaries
- functional reinterpretation of enharmonic spellings
- multiple plausible analyses

Putting functional analysis into the same UI would blur two different tasks and make the current production path harder to reason about.

## 3. Product Goals

## In scope

- separate `Harmony` XML sidebar tab
- analyze current MusicXML score without modifying it by default
- return per-segment Roman numeral analysis
- return local-key trajectory
- identify cadential/modulatory events where feasible
- optionally emit text annotations or a sidecar analysis artifact
- support a second backend later (`AugmentedNet`) without changing the UI contract

## Out of scope for v1

- automatic insertion of Roman numerals into the notation canvas
- full Schenkerian/prolongational analysis
- perfect handling of every non-common-practice idiom
- direct use by MMA
- replacing `Chordify`

## 4. User-Facing Behavior

## 4.1 Tab structure

Add a new XML sidebar tab:

- `Harmony`

This tab should sit beside:

- `XML`
- `Assistant`
- `NotaGen`
- `Chordify`
- `MMA`

## 4.2 Primary actions

1. `Analyze Harmony`

- runs the default functional-analysis backend on the current MusicXML
- returns analysis summary, warnings, and segment list
- does not mutate the score

2. `Analyze + Export`

- runs analysis
- persists a sidecar artifact containing machine-readable analysis
- optionally downloads:
  - JSON
  - `rntxt`-like text

3. `Analyze + Annotate (Experimental)`

- deferred / disabled initially
- later phase: insert visual annotations or staff text into score

## 4.3 Results shown in UI

The tab should show:

- backend used
- movement/measure coverage
- local key timeline summary
- Roman numeral segment list
- ambiguity/confidence warnings
- modulation / tonicization summary

Optional panels:

- `Analysis Summary`
- `Segments`
- `Warnings`
- `Raw Response`

## 5. Architecture

## 5.1 Separation from Chordify

`Chordify` and `Harmony` must have separate service entrypoints and contracts.

Reasons:

- different output types
- different quality criteria
- likely different backends
- different user expectations

Recommended split:

- `POST /api/music/harmony/analyze`
  - current `Chordify`
  - chord-symbol generation
  - optional MusicXML mutation

- `POST /api/music/functional-harmony/analyze`
  - new feature
  - Roman numeral / local key analysis
  - no score mutation by default

## 5.2 Backend abstraction

Define a normalized functional-analysis service contract so the UI does not care whether the engine is:

1. deterministic `music21` + Roman numeral heuristics
2. `AugmentedNet`
3. another future backend

Recommended internal shape:

- `functional-harmony-service.ts`
- engine adapters:
  - `functional-harmony-music21.ts`
  - `functional-harmony-augmentednet.ts` later

## 6. Data Model

## 6.1 Segment model

Each analysis segment should describe a harmonic span:

```json
{
  "movementIndex": 0,
  "measureIndex": 12,
  "measureNumber": "13",
  "startBeat": 1,
  "endBeat": 3,
  "romanNumeral": "V7/ii",
  "key": "Bb major",
  "keyTonic": "Bb",
  "keyMode": "major",
  "functionLabel": "secondary-dominant",
  "cadenceLabel": null,
  "confidence": 0.81,
  "source": "music21-roman",
  "notes": []
}
```

## 6.2 Summary model

```json
{
  "movementCount": 3,
  "measureCount": 212,
  "segmentCount": 167,
  "localKeyCount": 11,
  "modulationCount": 4,
  "cadenceCount": 9,
  "coverage": 0.93,
  "engine": "music21-roman",
  "engineMode": "deterministic"
}
```

## 6.3 Warning model

Warnings should remain plain-language, not research-jargon only.

Examples:

- `Low-confidence local key oscillation in measures 41-46.`
- `Could not assign Roman numerals for 6 segments in movement 2; returning chord roots only.`
- `Analysis backend classified 3 passages as ambiguous between parallel major/minor interpretations.`

## 7. API Design

## 7.1 Route

Add:

- `POST /api/music/functional-harmony/analyze`

Runtime:

- `nodejs`

## 7.2 Request

Draft request:

```json
{
  "content": "<score-partwise>...</score-partwise>",
  "inputArtifactId": "optional",
  "scoreSessionId": "optional",
  "backend": "music21-roman",
  "includeSegments": true,
  "includeTextExport": true,
  "persistArtifacts": true,
  "granularity": "auto",
  "preferLocalKey": true,
  "detectCadences": true,
  "detectModulations": true,
  "timeoutMs": 180000
}
```

## 7.3 Response

Draft response:

```json
{
  "ok": true,
  "engine": "music21-roman",
  "analysis": {
    "movementCount": 1,
    "measureCount": 74,
    "segmentCount": 58,
    "coverage": 0.89,
    "localKeyCount": 5,
    "modulationCount": 2,
    "cadenceCount": 4
  },
  "warnings": [],
  "segments": [],
  "keys": [],
  "cadences": [],
  "exports": {
    "json": "{...}",
    "rntxt": "m1 I\nm2 V6\n..."
  },
  "artifacts": {
    "analysis": {
      "id": "..."
    }
  }
}
```

## 8. Backend Phases

## Phase 1: deterministic `music21` backend

Goal:

- ship the tab without waiting for `AugmentedNet`

Recommended engine id:

- `music21-roman`

Implementation:

1. parse MusicXML with `music21`
2. derive local key windows
3. reduce score into harmonic windows
4. attempt Roman numeral assignment with `roman.romanNumeralFromChord`
5. classify low-confidence spans as ambiguous / unresolved instead of forcing labels

Limitations:

- weaker on chromatic common-practice repertoire
- weaker on long-range reinterpretation
- confidence must be surfaced clearly

## Phase 2: `AugmentedNet` backend

Goal:

- improve functional analysis quality for common-practice tonal repertoire

Recommended engine id:

- `augmentednet`

Role:

- optional backend selector in the Functional Harmony tab
- may become default later if operationally stable

Outputs should be normalized into the same contract as `music21-roman`.

## 9. Engine Strategy

## 9.1 Default engine

Initial recommendation:

- default to `music21-roman`

Reason:

- no model hosting
- same runtime family already used for Chordify
- lower operational risk

## 9.2 Future backend selector

Expose a backend selector only after there are at least two real backends:

- `music21 (deterministic)`
- `AugmentedNet`

Do not expose a dead selector before then.

## 10. Python Helper Design

Recommended helper:

- `tools/functional_harmony/analyze_functional_harmony.py`

Separate from:

- `tools/music21_harmony/analyze_harmony.py`

Reason:

- keep chord-symbol logic and Roman numeral logic independent
- avoid overloading one helper with divergent responsibilities

Helper responsibilities:

1. parse MusicXML
2. segment into harmonic windows
3. estimate local key
4. assign Roman numerals
5. detect cadence/modulation markers where feasible
6. emit JSON response
7. optionally emit sidecar text export

## 11. Output Formats

## 11.1 Primary output

- JSON response for UI

## 11.2 Sidecar exports

Recommended:

- `functional-harmony.json`
- `functional-harmony.rntxt`

The sidecar should not overwrite the notation score by default.

## 11.3 Score mutation

Defer actual score-annotation writing until later.

Why:

- Roman numeral rendering in the notation layer is a separate UX/design problem
- staff/system-text insertion is easy to do badly
- we should first prove analysis quality and export usefulness

## 12. UI Design

## 12.1 Controls

Initial controls:

- `Analyze Function`
- `Include Text Export`
- `Detect Cadences`
- `Detect Modulations`

Deferred controls:

- backend selector
- annotation placement mode
- granularity tuning

## 12.2 Summary cards

Recommended cards:

- `Measures`
- `Segments`
- `Coverage`
- `Local Keys`
- `Modulations`
- `Cadences`
- `Backend`

## 12.3 Segment table

Columns:

- measure
- beat range
- Roman numeral
- local key
- function label
- confidence

Useful affordances:

- sort by measure
- copy/export
- maybe click to jump to measure later

## 13. Observability

Add dedicated events:

- `music.functional_harmony.request`
- `music.functional_harmony.result`
- `music.functional_harmony.failure`

Track:

- backend
- duration
- measure count
- segment count
- warning count
- ambiguity count

## 14. Risks

Risk: users expect notation mutation immediately.

Mitigation:

- clearly present this as analysis-first
- export sidecars first
- defer score annotation until quality is understood

Risk: deterministic `music21` functional analysis may be visibly wrong on real repertoire.

Mitigation:

- label engine as deterministic / heuristic
- expose ambiguity and confidence
- keep `AugmentedNet` as the intended stronger follow-up backend

Risk: backend split creates duplicate code paths with Chordify.

Mitigation:

- share only transport and artifact plumbing
- keep musical logic separate by design

## 15. Success Criteria

Phase 1 success:

1. users can analyze a score without mutating it
2. Roman numeral segments and local keys are returned in a stable schema
3. exports can be saved and inspected outside the UI
4. no impact on Chordify or MMA production workflows

Phase 2 success:

1. `AugmentedNet` can be integrated behind the same contract
2. users can compare or switch backends without UI redesign

## 16. Recommended Next Implementation Order

1. create the contract and service skeleton
2. add the `Functional Harmony` tab UI shell
3. implement deterministic `music21-roman` helper
4. add JSON + text export
5. only after that evaluate `AugmentedNet` backend integration
