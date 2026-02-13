# Large Score Progressive Loading Plan

## Scope
This document tracks the engine-side path for making very large scores practical in the web editor, using Beethoven 9 as the benchmark corpus.

Current benchmark files:
- `/home/jhlusko/Downloads/beethoven-symphony-no-9-op-125.mscz`
- `/home/jhlusko/Downloads/beethoven-symphony-no-9-op-125.mxl`

Checkpoint commit for the work completed so far:
- `de790d5`

## Current State (Measured)
From direct Node/WASM probes after `de790d5`:
- `.mscz` deferred (`doLayout=false`): ~89.7s load, 196 pages already laid out.
- `.mscz` eager (`doLayout=true`): ~91.3s load, 196 pages.
- `.mxl` deferred (`doLayout=false`): ~150.4s load, 278 pages already laid out.

Interpretation:
- Deferred mode is currently not materially reducing total layout for `.mscz`/`.mxl`.
- The biggest remaining blocker is in engine setup/layout internals, not UI paging.

## Mapping to the Original 5 Items

### 1) Instrumentation / observability
Status: **Implemented**
- Added load profile API (`loadProfile`) with stage timings: parse/setup/initial layout/total.
- Enables objective comparison of eager vs deferred behavior.

### 2) Reader-level deferred mode (highest value)
Status: **Partially implemented, not effective yet**
- Deferred path exists in web entrypoints, but engine setup still triggers full-layout behavior.
- This is the primary remaining work.

### 3) Structured progressive API
Status: **Implemented**
- Added `layoutUntilPageState(page)` returning structured fields:
  - `targetSatisfied`, `availablePages`, `totalMeasures`, `laidOutMeasures`, `loadedUntilTick`, `hasMorePages`, `isComplete`.
- JS worker/non-worker wrappers and TS surface added.

### 4) App integration (page-demand UX)
Status: **Implemented**
- Score editor now:
  - uses progressive path where enabled,
  - requests layout on next-page navigation,
  - tracks dynamic page count and “has more pages” state.

### 5) Fallback + user control
Status: **Implemented (initial)**
- Added a UI toggle: `Progressive load: On/Off`.
- Logic currently keeps progressive mode scoped conservatively.
- Safe fallback to eager layout remains in place.

## Proposed Next Steps (What happens next)

### Phase A: Make item #2 truly effective in engine
Goal:
- Ensure `doLayout=false` for large scores avoids full pagination at load time.

Work:
1. Add a true deferred setup mode in `EngravingProject::doSetupMasterScore()` so load-time setup does not force full layout/update.
2. Add explicit load/setup options in WASM entrypoint to select deferred setup behavior.
3. Return a capability bit/state from WASM indicating whether deferred mode is genuinely active.

Acceptance criteria:
- On Beethoven `.mscz`, deferred load is materially faster than eager (target: significant reduction in initial load wall time, then page-demand layout for later pages).
- `layoutUntilPageState(0)` reports incomplete total layout after initial load (`hasMorePages=true`).

### Phase B: Expand progressive eligibility safely (items #4/#5 follow-through)
Goal:
- Enable progressive mode for `.mscz`/`.mxl` when engine capability confirms true deferred operation.

Work:
1. Gate format eligibility by capability (not by extension only).
2. Keep current fallback and toggle as safety valves.
3. Add telemetry logs around fallback triggers for debugging.

Acceptance criteria:
- `.mscz` and `.mxl` can use progressive mode when engine says it is safe.
- If capability is absent or fails, app falls back cleanly to eager load.

### Phase C: Hardening and regression coverage
Goal:
- Prevent regressions in loading, pagination, and editing behavior.

Work:
1. Add/extend tests for:
   - progressive load selection,
   - `layoutUntilPageState` handling,
   - fallback behavior.
2. Verify representative operations on partially laid-out scores:
   - selection,
   - mutation,
   - undo/redo,
   - export of current page.

Acceptance criteria:
- Existing tests pass.
- New progressive-path tests pass in CI.

## Risks
- Engine internals may still trigger global layout indirectly in update paths.
- Some editing operations may require broader layout invalidation than page-demand mode initially assumes.
- Worker vs non-worker behavior needs parity verification under heavy files.

## Rollout Recommendation
1. Land Phase A behind capability detection.
2. Validate on Beethoven `.mscz` and `.mxl` benchmark files.
3. Then expand app-side eligibility (Phase B).
4. Keep user toggle and eager fallback throughout rollout.
