# Large Score Progressive Loading Plan

## Scope
This document tracks the engine-side path for making very large scores practical in the web editor, using Beethoven 9 as the benchmark corpus.

Current benchmark files:
- `/home/jhlusko/Downloads/beethoven-symphony-no-9-op-125.mscz`
- `/home/jhlusko/Downloads/beethoven-symphony-no-9-op-125.mxl`

Checkpoint commits for the work completed so far:
- `de790d5`
- `16dbde4`

## Current State (Measured)
From direct Node/WASM probes on the current in-progress engine:
- `.mscz` deferred (`doLayout=false`):
  - load: ~39.8s
  - first demand layout (`layoutUntilPageState(0)`): ~4.8s
  - pages after first demand layout: `6`
  - deep navigation (`layoutUntilPageState(6)`): ~42.8s one-time fallback to full layout
- `.mscz` eager (`doLayout=true`):
  - load: ~56.6s
- `.mxl` deferred (`doLayout=false`):
  - load: ~88.4s
  - pages immediately available: `1`
  - navigating to page 2 (`layoutUntilPageState(1)`): ~45.4s one-time fallback to full layout

Interpretation:
- Initial first-page latency is materially improved for large `.mscz`.
- The implementation is now stable (no page-6 crash in the current probe path).
- Remaining issue is a mid-navigation cliff: once the initial incremental window is exceeded, we still fall back to full layout.

## Mapping to the Original 5 Items

### 1) Instrumentation / observability
Status: **Implemented**
- Added load profile API (`loadProfile`) with stage timings: parse/setup/initial layout/total.
- Enables objective comparison of eager vs deferred behavior.

### 2) Reader-level deferred mode (highest value)
Status: **Implemented (hybrid), needs refinement**
- Added a true deferred setup path for native readers so load-time setup can skip eager `setLayoutAll()/update()`.
- Cold start now does a small range bootstrap, then falls back to full layout once outside the initial window.
- This is stable and faster for first paint, but not yet fully incremental across many pages.

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

## Proposed Next Steps (Mapped back to items 1-5)

### Phase A: Remove the page-window cliff (items #2 + #3)
Goal:
- Keep page-demand layout incremental beyond page 6 instead of triggering one large full-layout fallback.

Work:
1. Stabilize continuation after cold-start partial layout so `layoutUntilPageState(k)` can extend the laid-out frontier repeatedly.
2. Expand incrementally in bounded windows (for example, doubling measure windows) and stop as soon as target page exists.
3. Keep `layoutUntilPageState` fields authoritative so UI can show `N+` page counts during partial state.

Acceptance criteria:
- Sequential calls for `targetPage=0..20` on Beethoven `.mscz` complete without crashes.
- No single call incurs a full-score fallback unless explicitly requested.

### Phase B: Normalize import and native behavior (items #2 + #4)
Goal:
- Make `.mscz` and `.mxl` share consistent progressive semantics and avoid format-specific surprises.

Work:
1. Align deferred-load setup behavior across native reader and import reader paths.
2. Ensure first-page availability is explicit and cheap for both paths.
3. Keep identical app-side handling of progressive state regardless of file format.

Acceptance criteria:
- Both `.mscz` and `.mxl` report partial-progress states consistently after deferred load.
- Navigation semantics in the editor are the same for both formats.

### Phase C: Capability-gated rollout and user control (items #4 + #5)
Goal:
- Expose progressive mode only when the engine confirms stable incremental behavior.

Work:
1. Add an engine capability flag for "stable multi-step incremental pagination."
2. Gate app-side progressive default by that capability.
3. Keep the existing user toggle (`Progressive load: On/Off`) as an override.

Acceptance criteria:
- Progressive mode defaults on only when capability is true.
- Users can still opt out (or in for experiments) via UI toggle.

### Phase D: Observability and regression coverage (items #1 + #3 + #4)
Goal:
- Make regressions visible and prevent accidental fallback/crash regressions.

Work:
1. Extend probe/test coverage to assert:
   - deferred first-page latency does not regress badly,
   - `layoutUntilPageState` remains monotonic (`availablePages`, `laidOutMeasures`),
   - no crash at page-boundary transitions.
2. Keep focused unit tests for editor progressive navigation and fallback behavior.

Acceptance criteria:
- Existing tests pass.
- New progressive engine probe checks pass on Beethoven benchmark files.

## Risks
- Engine internals may still trigger global layout indirectly in update paths.
- Some editing operations may require broader layout invalidation than page-demand mode initially assumes.
- Worker vs non-worker behavior needs parity verification under heavy files.

## Rollout Recommendation
1. Land Phase A behind capability detection.
2. Validate on Beethoven `.mscz` and `.mxl` benchmark files.
3. Then expand app-side eligibility (Phase B).
4. Keep user toggle and eager fallback throughout rollout.
