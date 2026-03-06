# Page/Range Playback WASM Design

## Problem

Dense multi-part scores such as `test_scores/faure.mscz` choke during browser playback. Full-score WAV export plays correctly but is too slow to use as an interactive playback fallback.

Current transport playback in `components/ScoreEditor.tsx` uses streamed PCM batches from `webmscore`:

- `TRANSPORT_SYNTH_BATCH_SIZE = 2`
- `SYNTH_START_PREROLL_SECONDS = 0.015`
- `score.synthAudioBatch(...)` is preferred over `score.saveAudio('wav')`

This is likely under-buffered for dense scores, but regardless of root cause we need a smaller playback unit than the entire score.

## Goal

Add native WASM primitives so the editor can play or export:

1. the current rendered page
2. an arbitrary measure range
3. eventually a user-selected measure span

The immediate product goal is a practical fallback for large scores:

- `Play Current Page`
- `Export Current Page WAV`

## Non-goals

- exact visual clipping to staff fragments or systems on a page
- phrase-aware playback boundaries
- replacing full-score transport playback
- solving the streaming under-run itself in this phase

## Recommended model

Define page playback as a measure-range operation.

Reasoning:
- page layout already knows which measures appear on which page
- audio export is musically measure-based, not SVG-fragment-based
- a measure-range primitive is more reusable than a page-only primitive
- UI can still expose page-focused actions on top of range primitives

## Proposed native primitives

### 1. `measureRangeForPage(pageIndex)`

Returns the inclusive zero-based measure span present on a page.

Suggested shape:

```ts
{ startMeasureIndex: number; endMeasureIndex: number }
```

Behavior:
- range is score-global, based on the primary measure sequence used by playback/export
- if page has no measures, return `null`
- if page index is out of range, return `null`

### 2. `selectMeasureRange(startMeasureIndex, endMeasureIndex, allParts = true)`

Selects a contiguous measure range.

Behavior:
- intended to replace repeated JS calls to `selectPartMeasureByIndex(...)`
- `allParts=true` should select the measure span across the score, not a single part
- can also support future page/range editing features

### 3. `synthAudioBatchForMeasureRange(startMeasureIndex, endMeasureIndex, batchSize)`

Returns a synth iterator for streamed playback limited to the given measure range.

Behavior:
- mirrors `synthAudioBatch(...)`
- only emits audio for the requested range
- can reuse existing `processSynthBatch(...)` pipeline if the native side exposes a suitable iterator pointer

### 4. `saveAudioForMeasureRange(format, startMeasureIndex, endMeasureIndex)`

Exports WAV/OGG/etc. for a specific measure range.

Behavior:
- mirrors `saveAudio(format)`
- initial UI use should be WAV only
- this is the safest immediate fallback for dense scores

## Optional convenience wrappers

These are nice-to-have, not required if the JS layer can compose them from the primitives above.

- `synthAudioBatchForPage(pageIndex, batchSize)`
- `saveAudioForPage(format, pageIndex)`

Recommendation:
- implement only if native code becomes materially simpler with page-first calls
- otherwise keep the native surface range-based and do page lookup in JS

## Why not solve this entirely in TypeScript?

We do have ingredients in JS:
- `score.measurePositions()`
- page state in `ScoreEditor`
- `selectPartMeasureByIndex(...)`
- `synthAudioBatchFromSelection(...)`

But a TS-only solution is weak because:
- selection semantics across all parts are not expressed cleanly today
- measure-to-playback range mapping should live with the score model
- page/range audio primitives will be useful beyond this one UI fallback
- repeated JS-side selection loops are brittle and harder to reuse in ScoreOps/agent flows

## Files that will need to change

For a new JS-visible WASM extension, the expected file chain is:

### Native / bridge
- `webmscore-fork/web/main.cpp`
- `webmscore-fork/web-public/src/index.js`
- `webmscore-fork/web-public/src/worker-helper.js`
- `lib/webmscore-loader.ts`

### App wiring
- `components/ScoreEditor.tsx`
- possibly `components/Toolbar.tsx` if we expose page playback controls there

### Generated artifacts after rebuild
- `webmscore-fork/web-public/webmscore.lib.js`
- `webmscore-fork/web-public/webmscore.webpack.mjs`
- `public/webmscore.lib.wasm`
- `public/webmscore.lib.mem.wasm`
- maybe `public/webmscore.lib.data`

## JS/TS API proposal

Add these optional methods to `Score` in `lib/webmscore-loader.ts`:

```ts
measureRangeForPage?: (pageIndex: number) => Promise<{ startMeasureIndex: number; endMeasureIndex: number } | null> | { startMeasureIndex: number; endMeasureIndex: number } | null;
selectMeasureRange?: (startMeasureIndex: number, endMeasureIndex: number, allParts?: boolean) => Promise<unknown> | unknown;
synthAudioBatchForMeasureRange?: (startMeasureIndex: number, endMeasureIndex: number, batchSize: number) => Promise<(cancel?: boolean) => Promise<unknown[]>> | ((cancel?: boolean) => Promise<unknown[]>);
saveAudioForMeasureRange?: (format: 'wav' | 'ogg' | 'flac' | 'mp3', startMeasureIndex: number, endMeasureIndex: number) => Promise<Uint8Array>;
```

## UI plan

### Phase 1: diagnostic exposure

Add temporary controls in playback UI:
- `Play Current Page`
- `Export Current Page WAV`

Behavior:
- resolve current page via existing `currentPageRef`
- call `measureRangeForPage(currentPage)`
- prefer `saveAudioForMeasureRange('wav', ...)` for the first reliable fallback
- optionally expose streamed page playback too for comparison

### Phase 2: product fallback

For large/complex scores:
- full transport play remains available
- if score is flagged large or transport stream fails, suggest:
  - `Play Current Page`
- optionally auto-fallback to page WAV after a streaming failure

## Investigation value

These primitives are not just a UX feature. They directly help isolate the playback problem.

With them we can compare:
1. full-score streaming
2. page-range streaming
3. page-range WAV
4. full-score WAV

Interpretation:
- if page-range streaming works but full-score streaming chokes, the issue is queueing/latency over long dense material
- if page-range WAV works quickly but full-score WAV is slow, score size is the dominant cost
- if even page-range streaming chokes, the problem is likely synth complexity or scheduling slack, not just total duration

## Implementation order

### Phase A
1. `measureRangeForPage(pageIndex)`
2. `saveAudioForMeasureRange(format, startMeasureIndex, endMeasureIndex)`
3. minimal UI hook: `Export Current Page WAV`

This gives the fastest reliable fallback.

### Phase B
1. `synthAudioBatchForMeasureRange(startMeasureIndex, endMeasureIndex, batchSize)`
2. minimal UI hook: `Play Current Page`
3. playback telemetry around stream timing/slack

This gives a smaller streaming target and helps diagnose under-runs.

### Phase C
1. `selectMeasureRange(...)`
2. optional page convenience wrappers
3. reuse in editing/agent workflows

## Build procedure

Use the incremental path documented in `AGENTS.md`:

```bash
cd webmscore-fork/web-public
npm run compile
npm run bundle
cd ../..
npm run sync:wasm
```

Do not use `npm run build` / clean rebuild unless necessary.

## Acceptance criteria

### Minimum
- current page measure range can be resolved from WASM
- current page WAV export works on dense scores like `faure.mscz`
- editor can trigger that export without manual XML/selection hacks

### Better
- current page streaming playback works reliably on scores where full transport playback chokes
- page/range audio APIs are reusable from both UI and future tool layers

## Recommendation

Implement `measureRangeForPage` and `saveAudioForMeasureRange` first.

That gives the quickest user-visible win and the safest fallback path. `synthAudioBatchForMeasureRange` should come immediately after, but it is the more failure-prone part of the work.
