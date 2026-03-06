# music21 Agent Extension Design (March 5, 2026)

## 1. Objective

Expose the existing `music21`-backed analysis capabilities to the OTS music agent without introducing a second orchestration path or unsafe arbitrary Python execution.

This extension should let the agent:

1. generate chord-symbol tags for accompaniment workflows (`Chordify`)
2. run Roman-numeral / local-key analysis (`Harmony`)
3. reason over those results in the same agent session
4. optionally hand annotated MusicXML back to the UI for user-approved application

It should **not** expose raw `music21` function dispatch or general Python execution.

## 2. Current Framework Review

The current agent framework is already structured for this kind of extension, but the wiring is manual.

### 2.1 Current control plane

- API entrypoint: [app/api/music/agent/route.ts](/home/jhlusko/workspace/OTS_Web/app/api/music/agent/route.ts)
- Router/orchestrator: [lib/music-agents/router.ts](/home/jhlusko/workspace/OTS_Web/lib/music-agents/router.ts)
- Tool contract registry: [lib/music-services/contracts/index.ts](/home/jhlusko/workspace/OTS_Web/lib/music-services/contracts/index.ts)
- Frontend agent client/apply behavior: [components/ScoreEditor.tsx](/home/jhlusko/workspace/OTS_Web/components/ScoreEditor.tsx)

### 2.2 Important observations

1. Contracts are not auto-exposed to the agent.

- `MUSIC_TOOL_CONTRACTS` is a registry, but [router.ts](/home/jhlusko/workspace/OTS_Web/lib/music-agents/router.ts) manually imports and exposes a curated subset.
- Adding a new service contract alone does not make it available to the agent.

2. The agent output schema is static.

- `AGENT_OUTPUT_SCHEMA` enumerates the allowed selected tools.
- Every new tool requires schema changes and selected-tool normalization logic.

3. Tool defaults are also static.

- `ToolDefaults` and the auto-wiring of `scoreSessionId` / `baseRevision` only cover the current tool set.
- New analysis tools need to be added there explicitly.

4. The fallback router is intent-classifier driven.

- `classifyPrompt()` only knows about `context`, `convert`, `generate`, `scoreops`, `patch`, and `render`.
- If we want non-Agents-SDK mode to use analysis tools, the heuristic classifier must be extended too.

5. The frontend only has special handling for some tool results.

- `music.patch` and `music.scoreops` results have dedicated apply flows.
- New analysis tools will need either:
  - read-only result rendering only, or
  - explicit preview/apply branches in the client.

6. Tool-result summarization matters.

- `summarizeForModel()` already strips large payloads to keep token usage bounded.
- This will be critical for Harmony/Chordify because they can return large XML strings.

## 3. Design Principle

Do **not** expose generic `music21` function calls like:

- `function: "roman.romanNumeralFromChord"`
- `function: "stream.chordify"`
- `function: "analyze"`

Reasons:

- too much prompt-surface ambiguity
- unsafe and brittle argument construction
- backend/runtime coupling to internal Python details
- weak observability and poor schema stability

Instead, expose **curated deterministic tools** backed by our existing services.

## 4. Recommended Agent Tool Surface

### 4.1 Tool 1: `music.harmony_analyze`

Meaning:

- this is the current `Chordify` workflow
- generate MusicXML `<harmony>` tags and chord-symbol analysis

Backed by:

- [lib/music-services/harmony-service.ts](/home/jhlusko/workspace/OTS_Web/lib/music-services/harmony-service.ts)
- [app/api/music/harmony/analyze/route.ts](/home/jhlusko/workspace/OTS_Web/app/api/music/harmony/analyze/route.ts)

Primary use cases:

- "Add chord symbols to this score."
- "Prepare this score for MMA."
- "Find the implied harmony and tag it."

Recommended agent defaults:

- `insertHarmony: true`
- `includeContent: true` only when the user explicitly wants the result applied/exported
- `persistArtifacts: true`
- `harmonicRhythm: "auto"`
- `maxChangesPerMeasure: 2`

### 4.2 Tool 2: `music.functional_harmony_analyze`

Meaning:

- this is the current `Harmony` workflow
- produce Roman numerals, local keys, cadence/modulation summaries, and optional annotated MusicXML

Backed by:

- [lib/music-services/functional-harmony-service.ts](/home/jhlusko/workspace/OTS_Web/lib/music-services/functional-harmony-service.ts)
- [app/api/music/functional-harmony/analyze/route.ts](/home/jhlusko/workspace/OTS_Web/app/api/music/functional-harmony/analyze/route.ts)

Primary use cases:

- "Analyze the harmony of this passage."
- "Add Roman numerals to the score."
- "Where does it modulate?"
- "Show cadences / tonicizations."

Recommended agent defaults:

- `includeSegments: true`
- `includeTextExport: true`
- `includeAnnotatedContent: false` by default
- `persistArtifacts: true`
- `preferLocalKey: true`

When the user explicitly asks to annotate the score:

- set `includeAnnotatedContent: true`

## 5. Why Two Tools, Not One

The split should mirror the current product split:

- `Chordify` is accompaniment-oriented and writes chord symbols
- `Harmony` is theory-oriented and writes Roman numerals

Combining both into a single agent tool would blur:

- output semantics
- default application behavior
- expected artifacts
- UI preview/apply behavior

## 6. Router Extension Plan

### 6.1 `router.ts`

Extend these areas in [lib/music-agents/router.ts](/home/jhlusko/workspace/OTS_Web/lib/music-agents/router.ts):

1. Imports

- import `runHarmonyAnalyzeService`
- import `runFunctionalHarmonyAnalyzeService`
- import `MUSIC_HARMONY_ANALYZE_TOOL_CONTRACT`
- import `MUSIC_FUNCTIONAL_HARMONY_ANALYZE_TOOL_CONTRACT`

2. Tool name enums/types

- add `music.harmony_analyze`
- add `music.functional_harmony_analyze`

3. `ToolDefaults`

- add `harmony_analyze?: Record<string, unknown>`
- add `functional_harmony_analyze?: Record<string, unknown>`

4. `AGENT_OUTPUT_SCHEMA`

- extend allowed selected tools:
  - `music_harmony_analyze`
  - `music_functional_harmony_analyze`

5. Tool normalization map

- map:
  - `music_harmony_analyze -> music.harmony_analyze`
  - `music_functional_harmony_analyze -> music.functional_harmony_analyze`

6. Tool definitions

- add `tool({ ... execute })` wrappers matching the pattern used for the existing tools
- pass trace/session defaults the same way the router does for `context`, `patch`, `render`, etc.

7. Agent instructions

- teach the model when to use each analysis tool
- examples:
  - use `music_harmony_analyze` for chord symbols / MMA preparation
  - use `music_functional_harmony_analyze` for Roman numerals / modulations / cadences

### 6.2 Fallback router

Extend `classifyPrompt()` to detect analysis requests.

Recommended heuristic rules:

- route to `music.functional_harmony_analyze` when prompt includes:
  - `roman numeral`
  - `harmony analysis`
  - `cadence`
  - `modulation`
  - `tonicization`
  - `functional harmony`

- route to `music.harmony_analyze` when prompt includes:
  - `chordify`
  - `chord symbols`
  - `harmony tags`
  - `lead sheet`
  - `MMA`
  - `accompaniment chords`

Fallback priority:

1. explicit Harmony/Chordify request
2. edit/generate/convert/render/context

### 6.3 Session auto-wiring

When top-level `scoreSessionId` is present, auto-populate defaults for:

- `harmony_analyze`
- `functional_harmony_analyze`

the same way the router currently auto-populates:

- `context`
- `convert`
- `diff_feedback`
- `scoreops`
- `patch`
- `render`

## 7. Result Handling Strategy

### 7.1 Phase A: read-only + explicit apply

Recommended first agent behavior:

- tool runs
- assistant summarizes findings
- full tool result is preserved in `result`
- UI does **not** auto-apply score mutations from Harmony/Chordify tool calls

This keeps the first agent extension safe and predictable.

### 7.2 Phase B: explicit apply affordances

If the user asks:

- "apply chord symbols"
- "insert Roman numerals"

then the UI can offer specialized apply actions based on selected tool:

- `music.harmony_analyze`
  - preview tagged MusicXML
  - `Apply Chordify Output`

- `music.functional_harmony_analyze`
  - preview annotated MusicXML
  - `Apply Roman Numerals`

Important:

- still require an explicit user click
- do not auto-apply simply because the agent used the tool

## 8. Summarization Requirements

The router’s `summarizeForModel()` should add tool-specific summarization for these two tools.

### 8.1 `music.harmony_analyze`

Keep:

- measure count
- tagged count
- coverage
- warnings
- harmonic-rhythm settings
- artifact ids

Strip or replace:

- full tagged MusicXML content

### 8.2 `music.functional_harmony_analyze`

Keep:

- measure count
- segment count
- local key count
- modulation count
- cadence count
- warnings
- top N segments
- artifact ids

Strip or replace:

- full annotated MusicXML
- full JSON export
- full RN text export

Rationale:

- the model should reason over the analysis summary, not repeatedly ingest full XML payloads

## 9. Frontend Extension Plan

### 9.1 `ScoreEditor.tsx`

The current agent result handler should grow two additional branches:

1. `music.harmony_analyze`

- store tagged XML result in agent state
- optionally open XML compare/review
- provide an `Apply Chordify Output` action

2. `music.functional_harmony_analyze`

- store annotated XML result in agent state
- store JSON / RN text exports in agent state
- provide an `Apply Roman Numerals` action

### 9.2 `toolInput` construction

When agent mode is active, add optional defaults for:

- `toolInput.harmony_analyze`
- `toolInput.functional_harmony_analyze`

Default recommendation:

- carry `scoreSessionId` / `baseRevision`
- do not pass full XML when session-backed context is available

## 10. Optional Secondary Surface: `MusicSpecialistsTool`

If we want the same capabilities outside the agent router, extend:

- [lib/music-specialists-tool.ts](/home/jhlusko/workspace/OTS_Web/lib/music-specialists-tool.ts)

with:

- `callMusicChordify(...)`
- `callMusicHarmony(...)`

This is useful for:

- future MCP exposure
- assistant-specialist orchestration
- typed non-agent consumers

This is optional for the first agent integration pass.

## 11. Observability

Add the same style of structured logs already used elsewhere:

- `music_agent.tool.harmony_analyze.start`
- `music_agent.tool.harmony_analyze.complete`
- `music_agent.tool.functional_harmony_analyze.start`
- `music_agent.tool.functional_harmony_analyze.complete`

Track:

- session-backed vs content-backed requests
- timeout overrides
- whether annotated/tagged XML was requested
- artifact creation counts

## 12. Test Plan

### 12.1 Router tests

Extend:

- [unit/music-agent-router.test.ts](/home/jhlusko/workspace/OTS_Web/unit/music-agent-router.test.ts)

Add coverage for:

- new selected-tool enum values
- tool default auto-wiring
- fallback classifier routing to analysis tools
- selected-tool normalization from underscore to dotted names

### 12.2 Route/service tests

Reuse existing service coverage:

- [unit/harmony-service.test.ts](/home/jhlusko/workspace/OTS_Web/unit/harmony-service.test.ts)
- [unit/functional-harmony-service.test.ts](/home/jhlusko/workspace/OTS_Web/unit/functional-harmony-service.test.ts)

Add focused agent-router mocks for the new tools.

### 12.3 Frontend tests

Add targeted tests for:

- agent result parsing for `music.harmony_analyze`
- agent result parsing for `music.functional_harmony_analyze`
- apply button enablement / disabled states

## 13. Recommended Rollout

### Phase 1

- expose both analysis tools to the agent router
- no auto-apply
- results visible in thread / inspector only

### Phase 2

- add explicit apply buttons for agent-returned Chordify/Harmony outputs

### Phase 3

- optional extension to `MusicSpecialistsTool`
- optional MCP/tool-server exposure

## 14. Recommendation

The right first extension is:

1. expose existing deterministic services, not raw `music21`
2. add both `music.harmony_analyze` and `music.functional_harmony_analyze` to the router
3. keep application human-approved
4. add tool-specific summarization before letting the agent use these heavily

This fits the current framework with minimal architectural churn and preserves the deterministic safety boundary around `music21`.
