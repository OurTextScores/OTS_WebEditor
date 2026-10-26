# OTS_Web Editor — Agent Guide

A browser-based musical score editor built on **libmscore** (MuseScore's engraving engine) compiled to WebAssembly via the production **MuseScore v4.7.4 Qt-free bridge** (`engine/musescore/`, Emscripten 4.0.7).

**libmscore is the permanent engraving backbone — there is no plan to replace it.** The accepted 4.7 bridge is maintained in `engine/musescore/bridge/`; build/verification tools live in `tools/musescore/`. `webmscore-fork/web-public/` retains the JS API, worker RPC and generated package; the old native 4.00 tree is retained for history and is not the production build. Do not re-implement layout, engraving, or music semantics in TypeScript when the engine already provides them.

## Architecture

- **Next.js / React app** (`app/`, `components/`, `lib/`). The editor surface is `components/ScoreEditor.tsx`.
- **WASM engine in a worker.** The production bridge exposes `EMSCRIPTEN_KEEPALIVE` exports across `engine/musescore/bridge/bridge.cpp` and its domain headers; the app talks to it through a worker RPC bridge.
- **Rendering is one-way:** engine → SVG → DOM. Editing is command-based: UI → WASM mutation → re-layout → re-render.
- **The WASM-side score is the single source of truth.** UI state only mirrors selection, cursors, tools.
- **Undo/redo is engine-level.** Every mutation must be wrapped in `startCmd`/`endCmd` (this is the codebase convention — never mutate outside a command).

### Reference checkouts

- `~/workspace/MuseScore` — upstream MuseScore master. **The reference for desktop behavior and conventions** (e.g., `NotationInteraction` in `src/notation/internal/notationinteraction.cpp` for interaction semantics). When implementing an editing behavior, match what desktop MuseScore does.
- `~/workspace/ms47-spike` — pinned v4.7.4 worktree, used by the production build by default. See `engine/musescore/upstream.json` for exact commit/toolchain.
- `engine/musescore/` — maintained native production bridge, patch and build configuration.
- `webmscore-fork/web-public/` — JS/worker wrappers and package artifacts. The remaining 4.00 native tree is legacy.

## Docs conventions

`docs/private/` is **gitignored by design**. Production engine/build documentation under `docs/engine/` is tracked alongside the existing public runbooks. If a doc referenced somewhere is "missing" from git, it lives in `docs/private/` on this machine — do **not** try to restore or re-create it from git history.

Key private docs:

- `docs/private/MUSESCORE_FEATURE_PARITY_ROADMAP.md` — feature roadmap vs. desktop MuseScore; current priorities.
- `docs/private/WASM_MUSESCORE4_UPGRADE.md` — file-format upgrade path (4.x readers, MSCVERSION status).
- `docs/private/SECURITY_CORRECTNESS_FINDINGS.md` — issues found during the parity survey.
- `docs/private/AI_PATCH_AGENT_SANDBOX_DESIGN.md` — AI patch agent sandbox design.

## Dev, test, verify

```bash
npm run dev          # dev server on :3000 (checks WASM artifacts first)
npm run test         # vitest unit tests (unit/)
npm run typecheck    # app + tests tsconfigs
npm run lint
npx playwright test  # e2e (see playwright.config*.ts)
```

Long or cross-browser Playwright runs: use the resumable runner, which runs one spec file at a time, prints a
progress line after each, and keeps results in `.playwright-runs/<name>/` (git-ignored; `test-results/` is wiped by
every Playwright run). Rerunning the same command skips specs already recorded (`--rerun-failed`, `--fresh`). Set
`PLAYWRIGHT_PORT`: the default 3000 may be another app (OurTextScores' Docker frontend).

```bash
PLAYWRIGHT_PORT=3013 PLAYWRIGHT_BROWSER=webkit node scripts/playwright-resumable.mjs --run my-run tests/a.spec.ts tests/b.spec.ts
```

Browsers: `PLAYWRIGHT_BROWSER=chromium|firefox|webkit`; on Ubuntu 26.04 also `PLAYWRIGHT_HOST_PLATFORM_OVERRIDE=ubuntu24.04-x64`.
Playwright's Firefox build has no optimizing WebAssembly compiler (the engine runs 5-10x slower than for users), so
use it for correctness; `PLAYWRIGHT_FIREFOX_EXECUTABLE=/path/to/stock/firefox` drives stock Firefox over WebDriver
BiDi for timing, but that driver hangs on pages with iframes. See `docs/engine/PHASE9_2026-10-25.md`.

Test score for manual verification:
`http://localhost:3000/?score=%2Ftest_scores%2Fbach_orig.mscz`

Embed/static builds: see `docs/BUILD_EMBED.md` (soundfonts come from a CDN; `npm run build:embed` defaults `NEXT_PUBLIC_SOUNDFONT_CDN_URL` to the OSUOSL MuseScore_General mirror).

## Module structure

`components/ScoreEditor.tsx` was one 18,900-line function. It is now a ~9,700-line composition root (decomposition plan: `docs/private/SCOREEDITOR_DECOMPOSITION_PLAN_2026-10-02.md`, §12 is the log). **New editor behaviour goes in a module, never in `ScoreEditor.tsx`.** The rules below are Viritura's (its `AGENTS.md` has the originals), adapted. The ones with a check say which.

Where things live now (`components/score-editor/`): `core/` (`useEditorCore`: the score session, selection model and `performMutation`, passed to command modules as `core`), `commands/` (edit handlers by concept), `canvas/` (gestures, marquee, note drag, grips, and the canvas components), `compare/` (compare hooks and components), `ai-tools/`, plus flat modules named for one concept. Reaching for `useEditorCore`'s `EditorCore` is the way to get at the editor from a new module; do not thread dozens of props.

1. **A feature is a folder** with one public surface, its `index.ts` barrel. Outside the folder, import from the barrel; anything not re-exported is private. (New folders only; the existing ones gain barrels as they are touched.)
2. **Name files by the concept they hold, never by kind.** Good: `musicXmlPatch.ts`, `measureAlignment.ts`, `selectionModel.ts`. Bad: `utils.ts`, `helpers.ts`, `shared.ts`, `internal.ts`, `misc.ts`, `common.ts`, or a `utils/` folder. If you cannot name the file in three words around one concept, the split is wrong. Checked by `unit/module-structure.test.ts`.
3. **Size limits prompt a question, not a slice.** Is there a sub-concept here that deserves its own name? If not, the file is fine. A source file over 900 lines must have an entry in `scripts/technical-debt-budget.json` (`modules`); budgets only go down, and a raise needs a logged reason (`check:debt`). `max-lines-per-function` (200 code lines) is a warning with a count budget.
4. **A `.tsx` file exports components only.** Hooks, types, constants and helpers go in `.ts` siblings in the same folder.
5. **Every lint or type suppression says why**: `// eslint-disable-next-line rule -- reason`. No reason, no suppression. Checked by `unit/module-structure.test.ts`; the debt audit also caps their number.
6. **Do not weaken a test, widen a type to `any`, or add a suppression to make a move compile.**

### Extraction playbook (cheapest to most invasive)

Work down the list and stop when the file is under its limit.

1. **Types** to a `types.ts` sibling. **Constants** to a `constants.ts` sibling.
2. **Pure helpers** (no state, no refs) to a module named for what they do.
3. **An effect with 30+ lines and a non-trivial cleanup is a custom hook.** Call the new hook where the effect used to be: effect order is behaviour.
4. **A `useCallback` or handler body** to `xImpl(args)` in a sibling `.ts` with an explicit args interface. When three or more handlers share a dependency surface, name it as a `*Ctx` interface (the editor's is `EditorCore`, introduced in step S4 of the plan) instead of passing props one by one.
5. **`if`/`else` ladders on a string kind** become a `switch` over a discriminated union or a `Record<Kind, Handler>`.

Anti-patterns: a reducer for its own sake when independent `useState` calls would do; container/presenter splits that remove no complexity; a view model with dozens of fields (a component with 40 props has two jobs).

### What worked in the decomposition (and what to watch)

- **Move by dependency graph, not by name.** Resolve identifiers with the TypeScript checker; word matching misses shadowed names and shorthand properties.
- **Effects:** extract an effect together with the refs only it uses, and call the hook at the effect's original position so effect order is unchanged. Moving a `ref.current = x` assignment out of a component makes `react-hooks/exhaustive-deps` treat that ref as a DOM ref in cleanups left behind: move the cleanup with it, or read the ref through a getter (the suppression cap is small).
- **Values defined later in render:** pass them through a `lateInputs` ref assigned each render and read at call time. `tsc` cannot see a render-time TDZ.
- **Refs and setters returned from a hook are not known-stable** to `exhaustive-deps`: list them in dependency arrays (they never change at runtime).
- **JSX:** compose, do not pass a view model. Overlays become children of a frame component; keep each component's props small. Slice the exact JSX by line range, rename closed-over names to props, and let `tsc` list what is missing.
- **A hook is not always the answer.** A cluster of ~300 statements that would return ~170 names (compare) is a prop dump; move its big handlers as `xImpl(ctx, ...)` functions instead.
- **Tests:** write characterization tests for the moved code and break it on purpose (mutation check) to prove they bite. Survivors are real gaps (an unasserted `stopPropagation`, an unmounted cleanup).
- **Test files have their own typecheck.** Run `npm run typecheck` (app and tests), not only `tsc -p .`, and read `npm run check:debt` to its last line after the final edit. Do not spread `...over` (typed `unknown`) into a mock context: build the typed object, then `Object.assign(ctx, over)`.
- **Under CPU contention** (another heavy job on the machine) unit tests time out in bulk and early Playwright specs flake; check `uptime` before suspecting the code, and rerun failures alone and against `HEAD` (`git stash -u`).

Still in `ScoreEditor.tsx` by decision (not oversight): `renderCompare` (119 inputs), the `mode` panel (97), and the URL and file-load handler bodies (~50 inputs each). Decompose them when a feature needs them, not as a mechanical pass.

## WASM extension workflow

Use this for any `webmscore` extension, not just score mutations. An authoritative example is commit `ed2ef1e` (`fix(harmony): force jazz chord symbol rendering after tag apply`), which touched the native export, JS bridge, worker RPC layer, TypeScript loader, app consumer, and generated artifacts.

### Hand-edited layers for a new JS-visible WASM method

When adding a new C++ function to the WASM bridge, update **all** relevant layers below. Missing one usually produces a method that compiles but silently does not exist in the app.

| #   | File                                                  | What to add                                                                                          |
| --- | ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| 1   | `engine/musescore/bridge/bridge.cpp` + domain headers | Native implementation plus `EMSCRIPTEN_KEEPALIVE` export in the `extern "C"` block                   |
| 2   | `webmscore-fork/web-public/src/index.js`              | Main-thread score method, typically a `Module.ccall(...)` wrapper                                    |
| 3   | **`webmscore-fork/web-public/src/worker-helper.js`**  | Worker RPC proxy (`this.rpc('myMethod', [...args])`). This is the layer most likely to be forgotten. |
| 4   | `lib/webmscore-loader.ts`                             | Add the method to the `Score` TypeScript interface                                                   |
| 5   | `components/score-editor/` feature module             | Wire the method into editor logic if it is user-facing                                               |
| 6   | shell command registry and transport/menu UI          | If invoked from the toolbar, add handler/button plumbing here too                                    |
| 7   | `lib/music-services/scoreops-service.ts`              | If ScoreOps/agent flows need the method, extend schema/capability/executor/fallback handling         |
| 8   | Tests                                                 | Add/update tests for any consumer layer you changed                                                  |

Notes:

- **When a native change appears not to take effect, run `npm run check:bridge` first.** It names
  the broken layer in one line (e.g. `missing-from-generated-bundle: <method> is in the bridge
source but not in webmscore.webpack.mjs; the bundle predates the source`) and costs seconds,
  versus bisecting rebuilds at ~8 minutes each.
- `worker-helper.js` and `lib/webmscore-loader.ts` are the most common omissions.
- If the change is a deep engraving fix with no new JS method, only native source + generated artifacts may change.
- If the change is app-only, you may not need ScoreOps.

### Rebuild + artifact sync (incremental — preferred)

1. `npm run build:engine` — builds the pinned Qt-free 4.7 engine from tracked sources/patches.
2. `npm run bundle:engine -- /tmp/ots-engine-bundle` — bundles the fresh browser artifacts with the maintained JS/worker wrappers.
3. Install the synchronized package and run `npm run sync:wasm`, as documented in [docs/engine/README.md](docs/engine/README.md).
4. `npm run check:bridge` checks production native declarations, JS, worker, types and generated artifacts.

Use `MS47_SOURCE`, `MS47_BUILD`, `MS47_RESOURCE_ROOT`, `MS47_EMSDK`, and `MS47_JOBS` for isolated builds. See the production guide for fresh-checkout verification and artifact installation. The default worktree is already patched; never edit its staged `spike/` copies. Change maintained sources under `engine/musescore/`, or update the tracked upstream patch for upstream changes.

Do not use the legacy `webmscore-fork/web-public` `compile` command or `web/Makefile` for production 4.7 work. Native, JS glue, bundles, resources and served WASM must be installed together; stale export tables can prevent module initialization. The `spike/` staging name and `MS47_*` CMake target/options remain compatibility details of the pinned patch, not source ownership.

### Verification checklist

1. Confirm the method exists across the bridge:
   `rg "myMethod" engine/musescore/bridge webmscore-fork/web-public/src/index.js webmscore-fork/web-public/src/worker-helper.js lib/webmscore-loader.ts components/ScoreEditor.tsx`
2. Confirm the bundled JS contains it:
   `rg "myMethod" webmscore-fork/web-public/webmscore.lib.js webmscore-fork/web-public/webmscore.webpack.mjs`
3. Restart `npm run dev`
4. Hard refresh the browser if it was already open
5. If useful, probe the loaded score instance in devtools via the existing editor debug hooks

### Design rule

Prefer adding a native WASM primitive when the UI or agent would otherwise need to reconstruct score semantics indirectly in TypeScript or from SVG. Good candidates:

- page/range playback/export
- score-wide or range-wide selection helpers
- anything that would otherwise require repeated JS-side measure/point selection loops
- anything that should be reusable by both UI and ScoreOps/agent layers

## Gotchas

**MusicXML pickup measures:**

- Pickup measures use `<measure number="0" implicit="yes">`.
- All `<attributes>` (divisions, key, time, clefs, staves) must go on the pickup measure. Measure 1 must NOT have its own `<attributes>` block or you get duplicate clefs/time signatures.
- Rest notes in the pickup need an explicit `<type>` element (e.g., `<type>quarter</type>`) — without it MuseScore renders a whole rest regardless of the `<duration>` value.

## AI patch flow

The assistant patch-generation flow keeps `musicxml-patch@1` JSON ops as the model contract, applies them to derive `proposedXml`, and opens the existing compare/diff UI for selective hunk apply. Keep patch ops as an inspectable intermediate.

## Licensing

libmscore/webmscore is **GPL-3.0** and ships client-side as WASM, permanently. The engine and fork sources must remain GPL-compliant and distributable; don't introduce GPL-incompatible code into `webmscore-fork/`.
