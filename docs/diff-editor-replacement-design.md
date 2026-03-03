# Diff Editor Replacement for Patch Generation

## Goal

Replace the current AI patch flow (`musicxml-patch@1` ops + single apply) with a diff-editor flow that lets users review and apply only a subset of AI-proposed edits, reusing the existing musical compare editor in `ScoreEditor`.

## Current Flow (Baseline)

- UI (`ScoreEditor.tsx`, AI mode `patch`) asks the model for `musicxml-patch@1`.
- Client parses JSON patch and applies all ops against base XML.
- User can only apply the full generated result.

### Main Gap

- No first-class selective apply UX in the AI patch path.
- Model output quality is coupled to custom patch-op correctness.

## Target Flow

1. Model generates `musicxml-patch@1` ops.
2. Client/service applies patch ops to `baseXml` to derive `proposedXml`.
3. Existing compare editor opens with `baseXml` vs `proposedXml`.
4. User selects and applies measure blocks (hunks) using existing overwrite controls.
5. Resulting merged XML is validated and applied to score.

## Proposed Architecture

### 1) Keep patch-op generator as the AI contract

- Keep existing provider stack (`/api/llm/*`) for model calls.
- Keep prompt contract in AI patch mode:
  - "return musicxml-patch@1 JSON"
- Continue using existing parser/validator for patch ops before proposing any diff.

### 2) Reuse existing compare/musical diff editor

Do not build a new diff panel. Reuse current compare flow already implemented in `ScoreEditor.tsx`:

- `compareView` modal state (`currentXml`, `checkpointXml`, `title`)
- Alignment engine (`compareAlignments`, `buildMismatchBlocks`, LCS/index alignment)
- Selective apply controls (`handleCompareOverwriteBlock`)
- XML replace primitive (`replaceMeasuresInMusicXml`)
- Final application pipeline (`applyXmlToScore`)

AI integration should open this compare modal with:
- Left: current score XML
- Right: AI proposed XML
- Title: `Assistant Proposal`

### 3) Proposal builder location: client-first, service optional

Default recommendation:
- Keep patch->`proposedXml` derivation in `ScoreEditor.tsx` (reuse existing `parseMusicXmlPatch` + `applyMusicXmlPatch` path).
- Open compare editor directly from this client-derived proposal.

Optional service module (only if needed later):
- `lib/music-services/diff-editor-service.ts`

Potential value-add of a service:
- Centralized telemetry for proposal build failures/success by provider/model.
- One canonical proposal-validation path shared by AI patch mode, agent mode, and future batch tools.
- Easier policy enforcement (size limits, XML sanitization, operation allowlists) before client render.
- Cleaner extensibility if we later support server-side proposal generation, queued jobs, or auditing.

Tradeoff:
- Additional API complexity and round-trip latency for something already available client-side today.

Conclusion:
- Start without a new API/service module.
- Add service only when cross-surface reuse or centralized policy/telemetry becomes a hard requirement.

### 4) Add apply-selected-hunks service only if needed by API

New route/service:
- `POST /api/music/diff/apply`

Input:
- `baseXml: string`
- `proposedXml: string`
- `selectedHunkIds: string[]`

Output:
- `mergedXml: string`
- `appliedHunkIds: string[]`
- `skippedHunkIds: string[]`
- `validation: { valid: boolean; error?: string }`

This is optional if all selective apply remains client-side via existing compare handlers.

### 5) Replace patch panel behavior, not compare UI

In `ScoreEditor.tsx` patch mode:
- Keep patch JSON as an inspectable intermediate.
- On successful patch parse/apply, open existing compare modal with derived `proposedXml` as right side.
- Reuse existing per-block overwrite arrows for subset apply.
- Add convenience actions in compare toolbar:
  - `Accept All AI Changes` (right -> left for all mismatch blocks)
  - `Reject All AI Changes` (close/discard compare session)

## Data Contract

### AI edit generation response

```json
{
  "mode": "diff-editor@1",
  "model": "gpt-5.2",
  "baseXml": "<score-partwise>...</score-partwise>",
  "patch": {
    "format": "musicxml-patch@1",
    "ops": []
  },
  "proposedXml": "<score-partwise>...</score-partwise>"
}
```

### Optional selected-apply request

```json
{
  "baseXml": "<score-partwise>...</score-partwise>",
  "proposedXml": "<score-partwise>...</score-partwise>",
  "selectedMeasureBlocks": [
    { "partIndex": 0, "pairs": [{ "sourceIndex": 11, "targetIndex": 11 }] }
  ]
}
```

## UI/UX State Model

New state in `ScoreEditor.tsx`:
- `aiPatch: MusicXmlPatch | null`
- `aiProposedXml: string`
- `aiDiffError: string | null`
- Reuse existing compare state for visual diff and selective apply.

Flow:
1. User clicks `Generate Diff`.
2. AI returns patch ops; client validates/parses patch.
3. Patch is applied to `baseXml` to derive `proposedXml`.
4. UI opens existing compare modal (`currentXml` vs `proposedXml`).
5. User applies only desired blocks using existing overwrite controls.
6. User closes compare when done.

## Safety and Validation

- Validate merged XML before apply (`DOMParser` parsererror check).
- Reject apply on invalid merge and show conflict/validation error.
- Auto-checkpoint before final apply (reuse existing checkpoint flow).

## Telemetry

Add metrics:
- `assistant_diff_generated`
- `assistant_diff_blocks_total`
- `assistant_diff_blocks_applied`
- `assistant_diff_apply_success`
- `assistant_diff_apply_failure`
- `assistant_diff_patch_parse_failure`
- `assistant_diff_proposal_build_failure`

## Implementation Scope

1. Replace AI patch-mode apply behavior with compare-first behavior immediately (no phased rollout).
2. Keep `musicxml-patch@1` generation as the only model contract.
3. Derive `proposedXml` by applying patch ops before any user-visible apply.
4. Reuse existing compare block-overwrite controls for subset application.
5. Add `Accept All AI Changes` convenience action (optional but recommended).

## File-Level Implementation Plan

- `components/ScoreEditor.tsx`
  - Keep patch parsing/apply logic and open compare modal with patch-derived proposal.
  - Reuse existing compare overwrite/block application paths.
- `lib/music-services/patch-service.ts`
  - Keep returning patch payload (`musicxml-patch@1`).
- `app/api/music/*` (optional only)
  - Add `diff` endpoints only if server-side selected-apply is needed later.
- `unit/*`
  - Add tests for patch->proposedXml derivation, compare modal open path, and selective block apply semantics.
- `tests/*` (Playwright e2e)
  - Add end-to-end coverage for AI patch -> compare -> selective apply.

## E2E Test Plan

Add Playwright tests (for example `tests/assistant-diff-editor.spec.ts`):

1. `ai patch opens compare editor`
- Load fixture score.
- Mock AI patch response.
- Trigger `Generate Patch`.
- Assert compare modal opens with title `Assistant Proposal`.

2. `selective block apply mutates only selected region`
- In compare modal, apply one mismatch block only.
- Assert affected measure changed in current score XML.
- Assert untouched mismatches remain.

3. `accept all applies all mismatches`
- Trigger `Accept All AI Changes`.
- Assert no remaining mismatch blocks for proposal pair.

4. `invalid patch does not open compare`
- Mock malformed/unsupported patch op response.
- Assert clear error message and no compare modal.

5. `invalid proposed xml blocks apply`
- Mock patch that yields invalid XML on apply.
- Assert error handling path and no score mutation.

## Why this is better

- Users can safely apply only trusted changes.
- The model keeps a simple and inspectable patch-op contract.
- It reuses the existing musical diff editor, so behavior is already familiar and lower risk.
