> Historical migration record, archived 2026-10-24. Paths and branch/default-engine statements below describe the original audit. See [the current production guide](../../README.md).

# System locks: E06 and the first E09 property control

The browser UI is committed on `main` as `9b8d6a3e` in the
`ots-system-locks-ui` worktree.
The native implementation and JS/worker bridge are on `engine-ms47-spike`.
The 4.00 native bridge and production WASM files do not acquire these exports.

## API contract

All methods operate on the current `excerptId`; `-1` means the full score.

- `getSystemLockState()` returns the selected measure span, all lock spans,
  the boolean property's value/mixed/applicability state, and command availability.
- `setSystemLock(boolean)` locks the selected span into one system, using
  `EditSystemLocks::makeIntoSystem`, or removes all overlapping locks.
- `moveSelectedMeasureToSystem('previous' | 'next')` delegates to the desktop
  engine's measure-move commands. A single layout measure must be selected (a collapsed rest counts as one). These
  commands move a system boundary, including neighboring measures where needed.

Measure positions are zero-based **musical** positions, including pickups and
underlying measures in collapsed multimeasure rests. They exclude title frames
and are independent of printed measure numbers. Lock state is native data, not
inferred from SVG or recreated as line breaks.

Each mutation is one native undo transaction and lays out linked scores.
Score and part locks are independent, while their undo history is shared.
An identical lock, invalid selection or invalid argument returns false without
adding an undo entry. Locking uses desktop break-removal and overlap/splitting
semantics; unlocking an intersecting lock removes that complete lock.

The direct JS constructor checks all three native exports. The worker's load
response reports that capability, and worker-helper hides its three proxies
when it is absent. Method presence therefore reflects native support even if
new JS is accidentally paired with the old WASM. The main UI checks all three
functions and renders its System layout section only when they exist.

## Editor integration

The Properties dock contains the system-layout section. It shows lock spans,
lock/unlock, and previous/next-system commands with native availability checks.
The smallest property framework consists of a typed boolean descriptor and a
shared control for mixed values, applicability, accessible labels, and reset.
For this property, the default is unlocked; it has no inherited style value.

Reads use the editor's operation queue and discard results from stale score or
selection requests. Mutations use `performMutation`, synchronize selection into
WASM, and avoid hit-testing the old element position after reflow. Existing
inspector refreshes also refresh native system-lock state after selection or
undo/redo changes.

## Verification

```sh
bash tools/ms47-bridge-spike/build.sh
node tools/ms47-bridge-spike/verify-systemlock-capabilities.mjs
MS47_ONLY_EDITS=1 MS47_VERIFY_SYSTEMLOCKS=1 node tools/ms47-bridge-spike/verify.mjs
```

`MS47_ARTIFACTS=/path/to/artifacts` can select an isolated Node build directory
containing `ms47_bridge.js` and `.wasm`. The normal build still produces both
Node and browser variants; rebuild the 4.7 browser package and run `bundle.mjs`
when preparing that engine for deployment. Existing public binaries stay on
4.00 until the separate migration switches them.

The native suite checks input rejection, exact ranges, overlap/splitting,
locking/unlocking, system moves, insertion/deletion inside locks, collapsed
rests, separate score/part layouts, MSCX/MSCZ round trips, undo/redo, and pixel
restoration. The capability suite executes the real JS wrappers, worker helper,
and worker dispatcher with supported and unsupported module exports.

On `main`, run the two `unit/score-editor/system-locks*.test.tsx` suites along
with InspectorPanel, LeftDock, module-structure, typecheck, bridge audit and debt
checks. The editor wiring tests exercise the real ScoreEditor component using
engines with and without the capability. Native tests and browser UI wiring
tests are separate; this is not certification of every migrated browser workflow.

The default bridge audit now accepts explicitly declared native variants,
checking their source declarations without asserting they exist in the 4.00
binary. The 4.7 artifact is exercised by its native suite. On main, the optional
Score declarations are documented TypeScript-only members until that engine
package is supplied.

## Branch integration

Keep the UI commit on main independently of the migration. When incorporating
main into the engine branch, retain the nativeVariants audit declaration and
remove the three system-lock TypeScript-only allowlist entries: this branch
provides their actual JS/worker implementation. The optional Score type contract
is identical on both branches. Rebuild the browser package from this branch's
wrapper sources when switching engines; an older 4.7 package lacks these APIs
and will correctly keep the panel hidden until rebuilt.

## Validation checkpoint (2026-10-21)

The [optimized native report](results/system-locks-2026-10-21.json) records the
WASM hash and coverage. The title-frame rejection, full collapsed-rest span,
score/part persistence, structural edits, and undo pixel checks passed.
The real-wrapper capability handshake passed for supported and unsupported
engines. Main's six focused test files passed all 50 tests. Engine audit/module
checks passed all 23 tests. Both branches passed app/test typechecks, bridge
audits, and debt checks. New UI modules introduce no ESLint warnings.

This checkpoint used a separate Node artifact output, reusing the existing
engine libraries, so the migration's build outputs were untouched. Preparing
the deployable 4.7 browser package remains part of the engine switch workflow.
