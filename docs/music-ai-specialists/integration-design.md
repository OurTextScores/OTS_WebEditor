# Integration Design: Dedicated Music Specialists for the Assistant

## Goals

- Let the assistant delegate music tasks to specialized components instead of one general model.
- Support workflows that begin from uploaded scores (`.musicxml` / `.xml`) and return edited/generated scores.
- Use `MusicXML` as the default model context for reasoning/edit planning, and use `ABC` only when required (for example, NotaGen generation/compression fallback).
- Make model swaps (e.g., newer `NotaGen-X`) safe and traceable.

## Proposed Specialist Architecture

## Roles

- `MusicRouter`
  - Classifies task intent and dispatches to specialists.
  - Examples: generate score, explain harmony, transform motif, convert formats, render playback.

- `WeaveMuseSpecialist` (planner/orchestrator)
  - Runs as a music-focused agent that can call other specialists/tools.
  - Best used for decomposition, style-generation planning, and coordinating model + deterministic score edits.
  - Should not receive direct unrestricted access to raw WASM exports.

- `ScoreConversionSpecialist` (deterministic tools)
  - Canonicalizes and validates score artifacts.
  - Handles `MusicXML -> ABC`, `ABC -> MusicXML`, and render/export steps for generation/conversion workflows.
  - No LLM/model generation.

- `ScoreOpsSpecialist` (deterministic `webmscore` WASM wrapper)
  - Applies direct score mutations inside OTS using a curated command surface over the WASM bindings.
  - Owns selection-aware edits, structural edits, metadata edits, and exports on the canonical score.
  - Returns machine-readable edit results + updated serialized artifacts.

- `ScoreGenerationSpecialist` (NotaGen-X / NotaGen)
  - Style-conditioned symbolic generation.
  - Produces ABC first, then requests conversion/rendering.

- `MusicReasoningSpecialist` (frontier model, user-selected, BYO key)
  - Conversational music understanding/composition assistance using MusicXML-first context.
  - Backed by the same first-class provider stack used for assistant chat/patch generation, with per-user model selection and key ownership.
  - Useful for analysis, variation suggestions, theory QA, edit planning, and prompt-to-structure tasks.

- `ScoreCritic` (optional later)
  - Constraint checking and quality scoring (syntax, playability, voice-leading heuristics, form constraints).

## Why a Curated WASM Tool (not all bindings)

- Your local `webmscore` wrapper already exposes many optional mutation methods and exports, but these methods are build-dependent and low-level.
- Raw export/function access is unsafe for LLMs:
  - lifecycle misuse (`load`/`destroy`)
  - invalid selection state assumptions
  - layout/audio calls mixed with mutations in fragile sequences
  - parameter misuse for engine-specific enums
- A curated tool layer gives:
  - capability checks (method exists in current build)
  - atomic batching + rollback (`undo`) on failure
  - post-edit validation and relayout
  - stable AI contract while WASM bindings evolve

## `ScoreOpsTool` (WASM-backed) Design

## Tool contract (high-level)

Expose a deterministic tool the AI can call, backed by `lib/webmscore-loader.ts` methods:

- `inspect_score`
- `inspect_selection`
- `apply_ops` (atomic batch)
- `undo`
- `redo`
- `export_score`
- `preview_selection_audio`

## Example `apply_ops` shape

```json
{
  "artifact_id": "score_123",
  "selection": {
    "mode": "current"
  },
  "ops": [
    { "op": "transpose_selection", "semitones": 2 },
    { "op": "add_tempo_text", "bpm": 108 },
    { "op": "set_title", "text": "Theme in D" }
  ],
  "validate_after": true,
  "export": ["musicxml", "midi"]
}
```

## Suggested first-pass operation set

- Metadata/text:
  - `set_title`
  - `set_subtitle`
  - `set_composer`
  - `set_lyricist`
  - `set_selected_text`
- Pitch/rhythm edits:
  - `transpose_selection`
  - `pitch_up`
  - `pitch_down`
  - `double_duration`
  - `half_duration`
  - `toggle_dot`
- Structural edits:
  - `insert_measures`
  - `remove_selected_measures`
  - `remove_trailing_empty_measures`
  - `toggle_repeat_start`
  - `toggle_repeat_end`
  - `set_repeat_count`
- Notation/context:
  - `set_time_signature`
  - `set_key_signature`
  - `set_clef`
  - `add_tempo_text`
  - `add_dynamic`
  - `add_slur`
  - `add_tie`
- Exports/previews:
  - `export_musicxml`
  - `export_midi`
  - `export_audio`
  - `preview_selection_audio`

## Execution guardrails

- Serialize score operations per `artifact_id` (single writer).
- Validate selection prerequisites before each op.
- Run `relayout` before export/preview when mutations occurred.
- On batch failure:
  - capture failing op index + error
  - attempt rollback (`undo`) for already-applied ops
  - return partial status explicitly (never silent)
- Persist provenance: requested ops, applied ops, unsupported ops, engine build capabilities.

## Artifact Model (important)

Create a shared `ScoreArtifact` record used by all specialists and tools:

- `artifact_id`
- `source_format` (`musicxml`, `abc`, `midi`, etc.)
- `canonical_musicxml_path` (primary for users and reasoning models)
- `canonical_abc_path` (required for NotaGen/generation workflows; optional otherwise)
- `derived_files` (`midi`, `mp3`, `pdf`, `png`, `svg`)
- `metadata` (title, composer/style prompt, meter, key, instrumentation)
- `provenance` (which model/tool created each derivative, parameters, prompt)
- `validation` (syntax/parse/render/playback results)
- `editor_capabilities` (available WASM mutation/export methods in the current runtime)

Why:

- It prevents format-specific ad hoc glue between tools.
- It makes retry/fallback logic safe (e.g., regenerate ABC, keep existing MusicXML if conversion fails).

## Conversion Strategy (`MusicXML <-> ABC`)

## Recommendation

Treat conversion as a first-class pipeline stage, not a side effect hidden inside model tools. Do not force conversion for every reasoning request.

## Directional behavior

- `MusicXML -> ABC`
  - Use/derive from `NotaGen/data` conversion scripts and wrap as a stable service function.
  - Normalize headers and dialect conventions after conversion.
  - Run validation immediately (ABC parse + render smoke test).

- `ABC -> MusicXML`
  - Reuse the working `weavemuse` conversion path (already producing `.xml`, `.pdf`, `.midi`, `.mp3`).
  - Keep raw model ABC output and normalized ABC output separately for debugging.

## Round-trip policy

Do not assume exact structural round-trip equality.

Use layered validation:

- Parse success (`ABC` parser + `MusicXML` parser)
- Render success (MuseScore or equivalent)
- Playback success (`abc2midi` / MIDI render path)
- Optional semantic checks:
  - measure count
  - key/meter preservation
  - pitch-duration totals per measure

## Orchestration Flow (example)

## 1. User uploads MusicXML and asks for style transfer

1. `MusicRouter` routes to `ScoreConversionSpecialist`.
2. Convert `MusicXML -> ABC`, normalize, validate, store `ScoreArtifact`.
3. `MusicReasoningSpecialist` (frontier reasoning model) summarizes structure / extracts motif plan (optional).
4. `ScoreGenerationSpecialist` (NotaGen-X) generates candidate ABC conditioned on style + optional motif constraints.
5. `ScoreConversionSpecialist` converts candidate ABC -> MusicXML/MIDI/PDF/MP3 and validates.
6. Assistant returns best candidate + alternatives + provenance.

## 2. User asks theory/explanation over an existing score

1. Use canonical `MusicXML` context by default.
2. Route to `MusicReasoningSpecialist` using the active user-selected model/provider.
3. Return explanation plus optionally annotated MusicXML snippets and rendered previews.

## 3. User asks for direct edits on the currently open score

1. `MusicRouter` routes to `WeaveMuseSpecialist` (planner) if the request is multi-step, otherwise directly to `ScoreOpsSpecialist`.
2. `WeaveMuseSpecialist` inspects score + selection context (and optional MusicXML/ABC context).
3. It calls `ScoreOpsTool.inspect_selection` / `inspect_score` to confirm targets.
4. It submits an `apply_ops` batch to `ScoreOpsSpecialist`.
5. `ScoreOpsSpecialist` applies curated WASM-backed mutations, relayouts, validates, and exports updated MusicXML + previews.
6. Assistant returns a summary of applied edits and the updated score artifact.

## Versioning / Model Registry Design

## Problem

`weavemuse` currently references HF repos like `manoskary/NotaGenX-Quantized` without a revision pin. That makes "latest" ambiguous and upgrades non-reproducible.

## Recommendation

Add a local model registry manifest (YAML/JSON), e.g.:

```json
{
  "notagen_x_quantized": {
    "repo_id": "manoskary/NotaGenX-Quantized",
    "revision": "<commit-or-tag>",
    "format": "hf",
    "capabilities": ["abc_generation", "style_conditioned"],
    "validated_on": "2026-02-25"
  }
}
```

Use this manifest for:

- startup checks (report if deployed weights differ from expected revision)
- controlled upgrades
- A/B testing newer model revisions

## Integration Notes for OTS Web

- You already have score-related infrastructure in this repo (`webmscore-fork`), which makes rendering/preview integration a good fit.
- `OTS_Web` already exposes a large optional mutation/edit surface in `lib/webmscore-loader.ts`, which is the right backend for a deterministic `ScoreOpsTool`.
- `ScoreEditor` already captures selection MIME XML and rendered context for AI prompts, which can be reused for `WeaveMuseSpecialist` planning while keeping actual edits deterministic.
- `OTS_Web` already has a first-class provider pattern for assistant chat/patch generation (provider selector + per-provider `/api/llm/{provider}` routes for `openai`, `anthropic`, `gemini`), which should be extended rather than replaced.
- Keep model execution and conversion as backend services/jobs; keep the web app focused on artifact display, review, and human-in-the-loop edits.
- Store generated artifacts and validation reports so users can compare model candidates.
- Add a focused context-extraction service so agents can request targeted MusicXML snippets (selection/range/search) rather than sending full documents every turn.

## Agent Runtime Strategy: Build vs Framework

Recommendation: use the OpenAI Agents SDK as the orchestration runtime, and keep music-domain tools behind MCP servers plus deterministic service APIs.

- Why:
  - You already need multi-provider model routing, tool calls, streaming, and tracing; the Agents SDK ships those directly (`agents`, handoffs, sessions, tracing, MCP support).
  - It remains model/provider agnostic, so your BYO-key frontier model strategy stays intact.
  - It reduces custom orchestration code while preserving your existing domain boundaries (`ScoreConversionSpecialist`, `ScoreOpsSpecialist`, artifact store).
- What to keep custom:
  - Deterministic score tools, conversion pipelines, artifact validation, and policy routing should stay in your own services.
  - Product-specific UI/UX logic (assistant panel, score diffs, approval flow) should stay in OTS/OurTextScores.
- What not to do first:
  - Do not build a bespoke orchestration runtime before proving specialist workflows.
  - Do not introduce a second large orchestration framework unless you have a concrete gap the Agents SDK cannot cover.

Practical split:

- OpenAI Agents SDK:
  - agent loop, tool invocation contracts, handoffs, session memory, traces.
- MCP servers:
  - expose `ScoreOpsTool`, conversion, and artifact services with tight capability boundaries.
- Skill catalog (your own):
  - define reusable high-level tasks (e.g., "harmonic analysis", "style transfer draft", "selection rewrite") that map to prompts + tool policies, independent of underlying model/provider.
- OTS backend services:
  - enforce auth, quotas, provenance, validation gates, and long-running job handling.

## First-Class LLM Provider Expansion (Chat + Patch Generation)

## Scope (important)

This is not only about tool-calling from agent frameworks.

Add new providers as first-class assistants in the same product flows you already support:

- chat assistant mode
- patch generation (e.g., MusicXML patch / score-edit planning)
- model listing / selection UX
- proxy route support
- provider-specific attachment and response parsing

## Recommended provider architecture

Keep the current `provider -> route` shape, but introduce shared abstractions:

- `ProviderAdapter`
  - request mapping (prompt/messages, attachments, max tokens, temperature)
  - response text extraction
  - error normalization
  - model list fetch/parsing
- `ProviderCapabilityRegistry`
  - `chat_text`
  - `json_mode`
  - `tool_calling`
  - `vision_image`
  - `pdf_attachment`
  - `streaming`
  - `reasoning_mode`
  - `max_context`
  - `cors_direct_ok` (important for embed mode)

Why:

- Patch generation and chat flows require consistent behavior even when provider APIs differ.
- It avoids branching `ScoreEditor` logic for each new provider.
- It lets routing choose providers by capability and policy, not just names.

## Provider onboarding checklist (first-class assistant)

1. Add provider enum + labels/default model/default max tokens in UI state.
2. Add `/api/llm/{provider}` route for chat/patch generation requests.
3. Add `/api/llm/{provider}/models` route for model discovery.
4. Implement adapter parse/normalize logic (text, errors, attachments).
5. Register capability flags and product constraints (CORS/proxy requirements).
6. Add provider-specific tests for:
   - plain chat response
   - JSON/patch response extraction
   - attachment handling (image/PDF if supported)
   - error mapping
7. Add fallback policy (e.g., retry same task on another provider when parse fails).

## Suggested Interfaces (thin, practical)

- `POST /api/music/convert` (`input_format`, `output_format`, file/artifact ref)
- `POST /api/music/generate` (prompt/style/constraints, optional seed score)
- `POST /api/music/context` (artifact/content + selection/range/search filters, bounded MusicXML snippets)
- `POST /api/music/score-ops` (`artifact_ref`, `ops[]`, selection, validate/export options)
- `GET /api/music/artifacts/:id`
- `POST /api/llm/:provider` (first-class assistant chat/patch generation proxy)
- `GET /api/llm/:provider/models` (model list proxy)

## Embed + Proxy Deployment Topology (OurTextScores)

Because `OTS_Web` is often deployed as a static embed build inside `OurTextScores`, split deployment responsibilities:

- **Static embed UI** (iframe) stays in `OurTextScores` at `/score-editor/*`
- **OTS Editor API service** (server runtime) hosts:
  - `/api/llm/*`
  - `/api/music/*`
- `OurTextScores` reverse-proxies browser requests to the OTS service under a same-origin prefix:
  - `/api/score-editor/llm/*`
  - `/api/score-editor/music/*`

Why this matters:

- `/api/music/*` (conversion, artifacts, validation, specialists) requires server-side execution and tooling (Python converters, optional MuseScore/`abc2midi`)
- static embed builds cannot run Next `app/api/*` routes
- same-origin proxying avoids fragile cross-origin/CORS behavior for embed mode

Short-term deployment recommendation:

- run `OTS_Web` API routes as a **separate Node container** (Next.js runtime) in the existing `OurTextScores` Docker/Nginx stack
- keep code in the `OTS_Web` repo (no new repo yet)

Longer-term option:

- extract the API runtime into a dedicated Node service (Express/Fastify) once job queues / scaling / operational separation justify the refactor

## Near-Term Technical Tasks

1. Extract a reusable converter module from current `weavemuse`/`NotaGen` script paths.
2. Define `ScoreArtifact` schema and persist it.
3. Add validation pipeline and return machine-readable failures.
4. Add model registry manifest with explicit `NotaGen-X` revision pinning.
5. Route assistant intents to specialists instead of a single generic music tool.
6. Add a curated `ScoreOpsTool` wrapper over `webmscore` WASM bindings (not raw binding passthrough).
7. Introduce shared `ProviderAdapter` + `ProviderCapabilityRegistry` for first-class LLM provider expansion (chat + patch generation).
