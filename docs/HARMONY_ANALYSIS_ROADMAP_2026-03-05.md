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
- split `Chordify` from `Harmony`

Scope:

- keep `Chordify` focused on chord symbols and `<harmony>` tags
- add a separate `Harmony` tab for Roman numeral analysis
- provide local key / modulation summaries
- export sidecar analysis artifacts instead of mutating notation by default

Success criteria:

- user can run theory-oriented analysis without invoking MMA
- `Chordify` remains production-safe and accompaniment-oriented
- functional results are inspectable/exportable without destabilizing score mutation paths

## Phase 3: `AugmentedNet` integration

Goal:

- add deeper functional analysis to the new `Harmony` tab

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

## 8. Phase 2.5: `music21` quality tuning

Even though `music21` is the current analysis engine, result quality is still heavily shaped by OTS-owned heuristics around reduction, segmentation, and post-processing.

Tuning backlog:

1. chord reduction before Roman-numeral assignment

- filter non-chord tones more aggressively in dense textures
- prefer metrically strong verticalities over ornamental events
- optionally collapse repeated passing sonorities inside one harmonic span

2. local-key segmentation

- replace the current 3-measure smoothing vote with a stronger region model
- require persistence before key-change promotion
- suppress one-measure oscillations unless the modulation evidence is strong

3. harmonic-span selection

- move beyond exactly one symbol per measure where cadence or applied-dominant motion is obvious
- allow beat-level subsegments only when confidence rises materially
- keep a conservative default so output remains legible

4. cadence heuristics

- upgrade from simple `V -> I` / `IV -> I` pattern checks
- incorporate inversion, metric position, and phrase-end hints
- distinguish authentic / half / deceptive / plagal more reliably

5. confidence scoring

- lower confidence when local key is unstable
- lower confidence when several candidate chords compete in the same span
- expose these scores consistently in exports/UI

6. movement and phrase boundaries

- avoid carrying prior context too aggressively across section/movement resets
- use rests, double bars, repeats, and tempo changes as soft boundary hints

7. evaluation loop

- curate a regression set from representative OTS scores
- compare Harmony output against analyst expectations on a small golden set
- tune heuristics for stability before introducing a second backend

Success criteria for this tuning phase:

- fewer obviously unstable Roman numerals on real scores
- better local-key continuity
- cadence summaries that are useful rather than merely present
- no regression in current Chordify / MMA workflows

## 9. `AugmentedNet` planning track

Goal:

- add a second Harmony backend for stronger Roman-numeral analysis without disturbing the current deterministic path

Why this is a planning track first:

- the current `music21` backend is already functional and shippable
- `AugmentedNet` adds model/runtime/dependency complexity
- backend comparison criteria should be defined before implementation work starts

Planned work:

1. repository and artifact audit

- confirm current upstream repo state
- identify pretrained checkpoint availability
- verify inference entrypoint and supported input formats
- verify license compatibility for OTS deployment

2. runtime packaging design

- decide whether `AugmentedNet` runs:
  - inside `score_editor_api`
  - as a separate service/container
  - or as a hosted remote backend
- define Python/runtime dependency isolation from the existing `music21` helper

3. adapter design

- normalize MusicXML input into the form expected by `AugmentedNet`
- normalize model output into the existing Harmony service contract:
  - `analysis`
  - `segments`
  - `keys`
  - `cadences`
  - `warnings`
  - optional annotated MusicXML

4. qualification set

- evaluate on a small corpus of OTS scores plus selected common-practice material
- compare against the current deterministic backend for:
  - coverage
  - local-key stability
  - cadence usefulness
  - obvious RN correctness

5. product decision gate

- ship as:
  - optional backend selector in `Harmony`, or
  - internal fallback / comparison mode only
- only proceed if it is meaningfully better than tuned `music21` on real scores

Open questions to answer before implementation:

- checkpoint/source-of-truth location
- runtime footprint and cold-start cost
- whether annotated MusicXML should be emitted directly or reconstructed in OTS
- whether `AugmentedNet` is robust enough on polyphonic keyboard scores outside its benchmark distribution

## 10. Immediate next steps

1. design the `music21`-based harmonic-tagging service
2. design and implement a separate `Functional Harmony` tab
3. keep `Chordify` integrated into the editor and MMA workflow
4. tune the deterministic `music21` Harmony backend on a small regression set
5. audit `AugmentedNet` as a non-blocking follow-up backend for Harmony
