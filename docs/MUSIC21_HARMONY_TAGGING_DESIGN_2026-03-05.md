# music21 Harmony Tagging Design (March 5, 2026)

## 1. Objective

Add a production-grade harmony-tagging workflow to OTS that:

- accepts MusicXML input
- analyzes harmonic content with `music21`
- inserts MusicXML `<harmony>` tags
- returns tagged MusicXML plus analysis metadata and warnings
- improves MMA starter-template generation by providing explicit chord symbols

This is primarily a chord-symbol generation feature, not a full Roman-numeral-analysis engine.

## 2. Why `music21`

`music21` is the recommended first implementation because it already has the core primitives needed for this job:

- MusicXML parsing and serialization
- score reduction via `Stream.chordify()`
- local-key analysis via `analysis.floatingKey`
- chord-symbol generation via `harmony`
- optional Roman-numeral support via `roman`

This gives us a deterministic, inspectable implementation path without model serving or checkpoint management.

## 3. Product scope

## In scope

- MusicXML input
- harmonic-window extraction
- chord-symbol generation
- MusicXML `<harmony>` insertion
- analysis warnings/confidence
- editor integration
- MMA integration

## Out of scope for v1

- full Roman-numeral analysis UI
- modulation graph visualization
- neural harmonic-analysis backends
- perfect voice-leading-aware jazz/pop/classical parsing
- non-MusicXML-first input handling

## 4. Current state and gap

Current MMA flow in `OTS_Web`:

- `buildStarterTemplateFromXml()` in [music-mma.ts](/home/jhlusko/workspace/OTS_Web/lib/music-mma.ts:523)
  - reads existing `<harmony>` tags if present
  - otherwise uses note-based per-measure inference
  - otherwise falls back to tonic chords

This is useful as a fallback, but it is not strong enough as the primary harmonic-analysis feature.

Gap:

- there is no dedicated service that writes explicit `<harmony>` tags back into MusicXML
- MMA currently depends on best-effort inference instead of reusable score annotations

## 5. Proposed user-facing behavior

## 5.1 Editor entrypoint

Add a new XML sidebar tab:

- `Harmony`

Primary actions:

1. `Analyze score`
- runs `music21` analysis on current MusicXML
- shows summary, warnings, and preview of proposed harmony tags

2. `Insert harmony tags`
- writes generated `<harmony>` tags into the score
- updates current editor XML/session

3. `Analyze + use for MMA`
- optional convenience action
- runs analysis first, then regenerates MMA starter template from the tagged score

## 5.2 Output modes

The backend should support:

- `analysis only`
- `return tagged MusicXML`
- `persist artifact`

The UI should expose:

- summary metrics
- warnings
- optional XML preview
- apply action

## 6. Backend API design

## 6.1 Route

Add:

- `POST /api/music/harmony/analyze`

Optional future split:

- `POST /api/music/harmony/analyze`
- `POST /api/music/harmony/apply`

For v1, a single route is enough if it can return both analysis and tagged XML.

## 6.2 Request shape

Draft request:

```json
{
  "content": "<score-partwise>...</score-partwise>",
  "inputFormat": "musicxml",
  "inputArtifactId": "optional",
  "insertHarmony": true,
  "persistArtifacts": true,
  "harmonicRhythm": "auto",
  "maxChangesPerMeasure": 2,
  "preferLocalKey": true,
  "includeRomanNumerals": false,
  "simplifyForMma": true
}
```

Notes:

- only one of `content` or `inputArtifactId` is required
- `inputFormat` should be constrained to `musicxml`
- `simplifyForMma` defaults to `true`

## 6.3 Response shape

Draft response:

```json
{
  "ok": true,
  "engine": "music21",
  "analysis": {
    "measureCount": 74,
    "taggedMeasureCount": 68,
    "harmonyTagCount": 82,
    "coverage": 0.919,
    "localKeyStrategy": "floating-key",
    "harmonicRhythm": "auto"
  },
  "warnings": [
    "Reduced 6 measure(s) to tonic fallback due to low-confidence chord extraction."
  ],
  "content": {
    "musicxml": "<score-partwise>...</score-partwise>"
  },
  "artifacts": {
    "outputArtifact": {
      "id": "..."
    }
  },
  "segments": [
    {
      "measure": 1,
      "offsetBeats": 0,
      "symbol": "Bb",
      "roman": null,
      "key": "Bb major",
      "confidence": 0.92,
      "source": "music21-chordify"
    }
  ]
}
```

## 7. Service design

Add:

- `lib/music-services/harmony-service.ts`

Primary entrypoint:

- `runHarmonyAnalyzeService(body, options?)`

Responsibilities:

1. resolve MusicXML source
2. invoke Python analysis helper
3. validate output
4. persist artifacts if requested
5. return summaries and warnings

## 8. Python integration design

## 8.1 Why Python

`music21` is Python-native. The cleanest implementation is to run a dedicated Python helper rather than reimplement chordification heuristics in TypeScript.

Recommended helper:

- `tools/music21_harmony/analyze_harmony.py`

Execution model:

- Node route/service spawns Python helper
- request payload passed by temp file or stdin JSON
- response returned as JSON on stdout

Recommended env:

- `MUSIC_HARMONY_PYTHON=python3`
- `MUSIC_HARMONY_SCRIPT=/app/tools/music21_harmony/analyze_harmony.py`
- `MUSIC_HARMONY_TIMEOUT_MS=60000`

## 8.2 Python helper responsibilities

1. parse MusicXML
2. run harmonic reduction
3. derive chord symbols
4. optionally derive Roman numerals
5. write `<harmony>` tags into MusicXML
6. emit machine-readable JSON response

## 9. Harmonic analysis algorithm

## 9.1 Input preparation

1. parse full score with `music21.converter.parseData()`
2. expand repeats only if explicitly requested later
3. preserve measure numbers and offsets
4. ignore grace-note-only events for v1

## 9.2 Score reduction

Primary reduction:

- `score.chordify()`

Then derive harmonic windows using one of:

- `auto`
- `measure`
- `beat`

Recommended default:

- `auto`

`auto` policy:

1. start with measure-level windows
2. split within a measure only when:
   - strong vertical sonority change is detected
   - downbeat vs mid-measure sonority differ materially
   - resulting number of changes does not exceed `maxChangesPerMeasure`

Recommended v1 cap:

- `maxChangesPerMeasure = 2`

This keeps outputs useful for MMA rather than over-fragmented.

## 9.3 Local key estimation

Use:

- `music21.analysis.floatingKey.KeyAnalyzer`

Policy:

1. estimate local key per measure
2. smooth rapid measure-to-measure oscillation with short-window majority vote
3. expose local key in analysis output

Reason:

- chord naming quality improves when evaluated in local tonal context
- the same sonority can otherwise produce unstable enharmonic naming

## 9.4 Candidate chord extraction

For each harmonic window:

1. collect active pitches from the chordified reduction
2. discard duplicate pitch classes
3. compute candidate sonority
4. attempt:
   - `harmony.chordSymbolFigureFromChord(...)`
   - or equivalent chord-symbol generation utilities
5. if `includeRomanNumerals=true`, also compute:
   - `roman.romanNumeralFromChord(...)`

## 9.5 Simplification rules for MMA

Raw `music21` chord symbols must be normalized before insertion when `simplifyForMma=true`.

Recommended v1 normalization:

- keep:
  - major triads
  - minor triads
  - dominant sevenths
  - major sevenths
  - minor sevenths
  - diminished / half-diminished where clear
- normalize:
  - enharmonic spellings to score-local key preference
  - slash chords only when bass note is structurally stable
- reduce or warn on:
  - suspended / altered / extended jazz chords beyond MMA-friendly subset
  - highly ambiguous pitch collections
  - clusters caused by ornaments/non-chord tones

Fallback order:

1. simplified detected chord
2. carried-forward prior stable chord
3. tonic chord for local key

## 9.6 Confidence model

Use heuristic confidence rather than fake probabilistic confidence.

Suggested factors:

- pitch-class coverage of detected chord
- presence of clear root/third/fifth
- stability across onset span
- consistency with local key
- agreement between raw chord symbol and Roman-numeral back-derivation

Suggested buckets:

- `high`
- `medium`
- `low`

Return numeric score only if it maps cleanly from deterministic heuristics.

## 10. MusicXML insertion strategy

## 10.1 Placement

Insert `<harmony>` into the first part/staff at the relevant measure offset.

Rules:

1. preserve existing `<harmony>` tags unless `replaceExisting=true`
2. if inserting at beat > 0, place before the first note/chord event at that offset
3. do not modify note/rest durations

## 10.2 Existing harmony behavior

Modes:

- `preserve`
- `replace`
- `fill-missing`

Recommended default:

- `fill-missing`

Reason:

- users may upload scores that already contain partial harmony annotations
- we should not overwrite curated content by default

## 11. Validation

Hard-fail:

- input is not parseable MusicXML
- output MusicXML serialization fails
- output XML is empty
- output loses part/measure structure

Warnings:

- low-confidence measure fallback
- unresolved ambiguity
- too many harmonic changes suppressed by rhythm cap
- existing harmony tags preserved in some regions

Sanity checks:

- output is well-formed XML
- at least one part and one measure exist
- harmony-tag count matches analysis summary

## 12. Integration with MMA

## 12.1 Near-term integration

Do not remove current `buildStarterTemplateFromXml()` fallback path immediately.

Instead:

1. if score already contains `<harmony>`, use it
2. else if harmony analysis has just been run, use tagged XML
3. else fall back to current note-based inference

## 12.2 Longer-term integration

Once `music21` tagging is stable:

- update MMA workflow to recommend running harmony analysis first
- keep note-based inference only as last-resort fallback

## 13. Observability

Add route/service events:

- `music.harmony.analyze.request`
- `music.harmony.analyze.python_result`
- `music.harmony.analyze.summary`

Recommended fields:

- `durationMs`
- `measureCount`
- `harmonyTagCount`
- `coverage`
- `warningCount`
- `fallbackCount`
- `existingHarmonyMode`
- `artifactIds`

## 14. Testing plan

## 14.1 Unit tests

- request parsing
- symbol normalization
- fallback selection
- validation summary construction

## 14.2 Fixture tests

Use representative MusicXML fixtures:

- simple chorale
- piano score with clear block harmony
- melody + accompaniment texture
- score with pre-existing partial `<harmony>` tags
- score with modulations / chromaticism

Assertions:

- XML remains well formed
- expected number of harmony tags
- no empty output
- warnings are surfaced on ambiguous material

## 14.3 Manual QA

Manual acceptance checks:

1. run analysis on a score without `<harmony>`
2. inspect generated tags in XML
3. generate MMA template
4. confirm fewer fallback-tonic warnings
5. spot-check 8-16 measures for obvious harmonic errors

## 15. Future extension: `AugmentedNet`

`AugmentedNet` should be treated as a future complementary backend, not a replacement for this service.

Recommended later role:

- add Roman-numeral analysis
- compare against `music21` output
- expose local-key/function overlays in the UI

Hybrid future architecture:

1. `music21` produces `<harmony>` tags for MMA
2. `AugmentedNet` produces Roman numerals and key-function analysis
3. UI can show both without conflating them

## 16. Decision summary

Recommended decision:

1. implement a dedicated `music21` harmony-analysis service first
2. target MusicXML `<harmony>` generation, not full functional analysis
3. integrate it directly with MMA
4. retain current note-based MMA inference only as fallback
5. evaluate `AugmentedNet` later as an optional deeper-analysis backend
