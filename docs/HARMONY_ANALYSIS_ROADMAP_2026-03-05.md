# Harmony Analysis Roadmap (March 5, 2026)

## 1. Purpose

Refocus the next music-analysis work on harmonic analysis, specifically:

1. generating MusicXML `<harmony>` tags for MMA and general score enrichment
2. supporting standalone harmonic-analysis workflows in OTS
3. keeping speculative accompaniment-model work off `main`

## 2. Current repo state

As of March 5, 2026:

- `main` in `OTS_Web` has had the ChordGAN feature work reverted to keep production deployable.
- `main` in `OurTextScores` has had the ChordGAN compose passthrough reverted for the same reason.
- ChordGAN work is preserved on dedicated branches:
  - `OTS_Web`: `chordgan-spike-2026-03-05`
  - `OurTextScores`: `chordgan-spike-2026-03-05`

This keeps user-facing production paths stable while preserving the exploratory work.

## 3. Product goal clarification

The immediate product goal is not "style transfer."

The actual near-term goal is:

- produce usable harmonic labels for scores
- write them as MusicXML `<harmony>` tags
- feed those tags into MMA template/render workflows
- expose harmonic analysis as a standalone feature in the editor

That puts accompaniment generation and harmonic analysis on separate tracks:

- accompaniment generation:
  - current: `MMA`
  - future: `AccoMontage2`
- harmonic analysis:
  - current recommendation: `music21`
  - future augmentation: `AugmentedNet`
  - research branch only: `ChordGAN` and other model experiments

## 4. Recommendations

## 4.1 Track A: `music21` harmonic tagging

Priority: highest

Why:

- directly solves the `<harmony>` requirement for MMA
- deterministic and explainable
- no model hosting or checkpoint management
- integrates naturally with MusicXML
- lower operational risk than NN-based systems

Deliverable:

- generate or update MusicXML `<harmony>` tags from uploaded/current score content

Expected role:

- default production implementation

## 4.2 Track B: `AugmentedNet` functional harmony analysis

Priority: second

Why:

- strong fit for Roman-numeral analysis
- tied to the When-in-Rome ecosystem
- useful for a standalone "Analyze Harmony" feature
- can complement, rather than replace, `music21`

Recommended role:

- optional backend for deeper functional analysis
- not required for initial MMA support

Output role:

- Roman numerals
- local key / modulation analysis
- confidence-bearing functional annotations

## 4.3 Track C: `ChordGAN`

Priority: research only

Why de-prioritized:

- public materials are research-grade and incomplete for deployment
- weak fit for the current core goal of `<harmony>` generation
- better considered as future accompaniment/style-transfer R&D

Recommended role:

- keep on branch
- do not block harmonic-analysis roadmap on it

## 5. Execution phases

## Phase 1: production chord-symbol generation via `music21`

Goal:

- create reliable `<harmony>` tags usable by MMA

Scope:

- MusicXML input only
- chord-symbol output, not full Roman-numeral analysis
- editor UI entrypoint
- API/service integration
- warning/confidence reporting

Success criteria:

- MMA starter templates use generated `<harmony>` tags rather than fallback tonic chords
- generated tags survive round-trip serialization
- manual spot checks on representative scores are acceptable

## Phase 2: standalone harmony-analysis feature

Goal:

- expose analysis results independently from MMA
- split `Chordify` from `Functional Harmony`

Scope:

- keep `Chordify` focused on chord symbols and `<harmony>` tags
- add a separate `Functional Harmony` tab for Roman numeral analysis
- provide local key / modulation summaries
- export sidecar analysis artifacts instead of mutating notation by default

Success criteria:

- user can run theory-oriented analysis without invoking MMA
- `Chordify` remains production-safe and accompaniment-oriented
- functional results are inspectable/exportable without destabilizing score mutation paths

## Phase 3: `AugmentedNet` integration

Goal:

- add deeper functional analysis to the new `Functional Harmony` tab

Scope:

- Roman numeral analysis
- local key trajectory
- optional comparison with `music21` chord-symbol output

Success criteria:

- backend can analyze MusicXML reliably
- results can be displayed or stored without destabilizing the simpler `music21` flow

## Phase 4: accompaniment-model R&D

Goal:

- revisit neural accompaniment generation after harmony-analysis path is solid

Candidates:

- `AccoMontage2`
- `ChordGAN`
- other symbolic arrangement systems

Success criteria:

- accompaniment work no longer competes with harmonic-tagging requirements

## 6. Architecture direction

Recommended architecture:

1. `music21` generates lead-sheet chord symbols for `<harmony>` tags
2. MMA consumes those tags for template/render workflows
3. `AugmentedNet` is added later as a separate analysis backend for Roman numerals
4. accompaniment models remain separate from the harmony-tagging service contract

This avoids conflating:

- chord symbols for playback/accompaniment
- functional harmonic analysis for theory-oriented workflows
- accompaniment generation models

## 7. Risks and mitigations

Risk: `music21` chordification overfits dense verticalities and non-chord tones.

Mitigation:

- simplify to harmonic-rhythm windows
- add confidence and ambiguity warnings
- normalize symbols to an MMA-friendly subset

Risk: users expect full theoretical analysis from generated `<harmony>` tags.

Mitigation:

- label the initial feature clearly as chord-symbol generation
- introduce `AugmentedNet` later for functional analysis

Risk: accompaniment-model experiments destabilize production.

Mitigation:

- keep experimental work on dedicated branches until there is a clear product path

## 8. Immediate next steps

1. design the `music21`-based harmonic-tagging service
2. design and implement a separate `Functional Harmony` tab
3. keep `Chordify` integrated into the editor and MMA workflow
4. evaluate `AugmentedNet` separately as a non-blocking follow-up backend for Functional Harmony
