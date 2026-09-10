# OTS_Web Editor — Agent Guide

A browser-based musical score editor built on **libmscore** (MuseScore's engraving engine) compiled to WebAssembly via the in-repo **webmscore fork** (`webmscore-fork/`, MuseScore 4.00 engine).

**libmscore is the permanent engraving backbone — there is no plan to replace it.** Strategy: stay on the 4.00 fork and selectively backport upstream readers/fixes as the format-fidelity corpus (roadmap §4) demands. Do not re-implement layout, engraving, or music semantics in TypeScript when the engine already provides them.

## Architecture

- **Next.js / React app** (`app/`, `components/`, `lib/`). The editor surface is `components/ScoreEditor.tsx`.
- **WASM engine in a worker.** The webmscore fork exposes ~135 `EMSCRIPTEN_KEEPALIVE` exports from `webmscore-fork/web/main.cpp`; the app talks to it through a worker RPC bridge.
- **Rendering is one-way:** engine → SVG → DOM. Editing is command-based: UI → WASM mutation → re-layout → re-render.
- **The WASM-side score is the single source of truth.** UI state only mirrors selection, cursors, tools.
- **Undo/redo is engine-level.** Every mutation must be wrapped in `startCmd`/`endCmd` (this is the codebase convention — never mutate outside a command).

### Reference checkouts

- `~/workspace/MuseScore` — upstream MuseScore master. **The reference for desktop behavior and conventions** (e.g., `NotationInteraction` in `src/notation/internal/notationinteraction.cpp` for interaction semantics). When implementing an editing behavior, match what desktop MuseScore does.
- `webmscore-fork/` — our fork of webmscore (MuseScore 4.00 engine), built in-repo.

## Docs conventions

`docs/private/` is **gitignored by design**. Only `docs/BUILD_EMBED.md` and `docs/AI_MODEL_CAPABILITIES_RUNBOOK.md` are tracked. If a doc referenced somewhere is "missing" from git, it lives in `docs/private/` on this machine — do **not** try to restore or re-create it from git history.

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

Test score for manual verification:
`http://localhost:3000/?score=%2Ftest_scores%2Fbach_orig.mscz`

Embed/static builds: see `docs/BUILD_EMBED.md` (soundfonts come from a CDN; `npm run build:embed` defaults `NEXT_PUBLIC_SOUNDFONT_CDN_URL` to the OSUOSL MuseScore_General mirror).

## WASM extension workflow

Use this for any `webmscore` extension, not just score mutations. An authoritative example is commit `ed2ef1e` (`fix(harmony): force jazz chord symbol rendering after tag apply`), which touched the native export, JS bridge, worker RPC layer, TypeScript loader, app consumer, and generated artifacts.

### Hand-edited layers for a new JS-visible WASM method

When adding a new C++ function to the WASM bridge, update **all** relevant layers below. Missing one usually produces a method that compiles but silently does not exist in the app.

| #   | File                                                 | What to add                                                                                          |
| --- | ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| 1   | `webmscore-fork/web/main.cpp`                        | Native implementation plus `EMSCRIPTEN_KEEPALIVE` export in the `extern "C"` block                   |
| 2   | `webmscore-fork/web-public/src/index.js`             | Main-thread score method, typically a `Module.ccall(...)` wrapper                                    |
| 3   | **`webmscore-fork/web-public/src/worker-helper.js`** | Worker RPC proxy (`this.rpc('myMethod', [...args])`). This is the layer most likely to be forgotten. |
| 4   | `lib/webmscore-loader.ts`                            | Add the method to the `Score` TypeScript interface                                                   |
| 5   | `components/ScoreEditor.tsx`                         | Wire the method into editor logic if it is user-facing                                               |
| 6   | `components/Toolbar.tsx`                             | If invoked from the toolbar, add handler/button plumbing here too                                    |
| 7   | `lib/music-services/scoreops-service.ts`             | If ScoreOps/agent flows need the method, extend schema/capability/executor/fallback handling         |
| 8   | Tests                                                | Add/update tests for any consumer layer you changed                                                  |

Notes:

- **When a native change appears not to take effect, run `npm run check:bridge` first.** It names
  the broken layer in one line (e.g. `missing-from-generated-bundle: <method> is in the bridge
source but not in webmscore.webpack.mjs; the bundle predates the source`) and costs seconds,
  versus bisecting rebuilds at ~8 minutes each.
- `worker-helper.js` and `lib/webmscore-loader.ts` are the most common omissions.
- If the change is a deep engraving fix with no new JS method, only native source + generated artifacts may change.
- If the change is app-only, you may not need ScoreOps.

### Rebuild + artifact sync (incremental — preferred)

1. `cd webmscore-fork/web-public && npm run compile`
   — the reliable C++ → WASM build path; the npm script sets up the emsdk PATH itself.
2. If JS bridge files changed (`src/index.js`, `src/worker-helper.js`, or related bundling inputs): `npm run bundle`
3. `cd ../.. && npm run sync:wasm` — copies generated artifacts into `public/`

**Step 2 is not optional, and skipping it fails silently.** `webmscore.webpack.mjs` embeds the
JS glue, so a stale bundle pairs old glue with a new `.wasm`. When no export changed the two are
interchangeable and everything works; **add or remove an export and the module stops
instantiating** — no console error, no stack trace, nothing renders anywhere, in the plain editor
as well as the compare panes. It is indistinguishable by eye from a corrupt engine build.

Note this is _not_ what `c33e7a7b` hit — that change touched no JS bridge and no export, and a
stale bundle is harmless when the export table is unchanged. Its cause is still unidentified. What
is settled is that the build environment was not to blame: a null rebuild on this machine is
byte-deterministic (identical source, identical bytes) and behaviourally identical to the committed
artifacts across the full 200-test Playwright matrix, so `7eec1985`'s "needs a reproducible build
environment before it is attempted again" does not hold. `c33e7a7b` used a 1m32s ccache build,
which is the most obvious remaining suspect and worth ruling out with a cache-cold rebuild.

**IMPORTANT — PATH pitfall:** Do NOT run `make release` directly from the shell, even after `source ~/workspace/emsdk/emsdk_env.sh`. The Makefile spawns `/bin/sh` subprocesses that do not inherit the emsdk PATH, causing `emcmake: not found`. Always use `npm run compile`.

Avoid `npm run build` (clean rebuild) unless there is a specific reason.

Generated artifacts to expect after a rebuild:

- `webmscore-fork/web-public/webmscore.lib.js`
- `webmscore-fork/web-public/webmscore.webpack.mjs`
- `public/webmscore.lib.wasm`
- `public/webmscore.lib.mem.wasm`
- sometimes `public/webmscore.lib.data`

### Verification checklist

1. Confirm the method exists across the bridge:
   `rg "myMethod" webmscore-fork/web/main.cpp webmscore-fork/web-public/src/index.js webmscore-fork/web-public/src/worker-helper.js lib/webmscore-loader.ts components/ScoreEditor.tsx`
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
