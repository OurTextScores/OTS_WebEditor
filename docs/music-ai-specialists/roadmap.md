# Roadmap: Music Specialist Agents, Conversion Reliability, and Fine-Tuning

## Planning Assumptions

- Short term: leverage existing `weavemuse` + `NotaGen` plus user-selected frontier reasoning models (BYO keys) with minimal retraining.
- Mid term: unify score conversion and evaluation so model outputs are reliable in product workflows.
- Long term: fine-tune/align specialists on your own task mix and score corpus.
- Parallel track: expand first-class assistant providers (chat + patch generation) beyond `OpenAI`, `Anthropic`, and `Google/Gemini`.

## Parallel Track: First-Class LLM Provider Expansion (Chat + Patch Generation)

## Current baseline in OTS Web

- OTS already supports first-class providers for assistant chat/patch generation via UI provider selection and per-provider proxy routes for `openai`, `anthropic`, and `gemini`.
- This expansion should preserve that architecture and add providers as peers, not as agent-only tool backends.

## Candidate providers to add

Priority candidates (high value / broad demand):

- `xAI (Grok)`
- `DeepSeek`
- `Qwen`
- `Kimi` (Moonshot)

Also strong additions:

- `Mistral`
- `Meta Llama API`
- `Cohere`

Optional / region-specific track:

- `Perplexity` (search-centric workflows)
- `Zhipu GLM`, `MiniMax`, `Tencent Hunyuan`, `Baidu ERNIE`

## Provider expansion matrix (product-facing, first-class assistant)

Use this matrix to plan rollout, QA, and UI behavior:

- `Provider`
- `Primary role in OTS`
- `Chat quality / reasoning`
- `Patch generation reliability (JSON/text patch extraction)`
- `Vision/PDF attachment support`
- `Tool-calling support` (secondary here)
- `Streaming support`
- `Model listing API`
- `CORS / proxy requirement`
- `Status` (`candidate`, `prototype`, `staging`, `prod`)

## Initial recommended rollout order

1. `DeepSeek` (often easiest API compatibility path; good first non-incumbent provider)
2. `Qwen` (broad model family coverage, important ecosystem player)
3. `xAI Grok` (major demand; good parity target for first-class assistant UX)
4. `Kimi` (strong long-context/reasoning use cases depending on available API features)
5. `Mistral`
6. `Meta Llama API`
7. `Cohere`

## Phase P0 (1-2 weeks): Provider abstraction + capability registry

## Outcomes

- New providers can be added without duplicating the full chat/patch pipeline
- Product routes and UI remain first-class per provider

## Tasks

1. Extract shared `ProviderAdapter` interface from current `openai` / `anthropic` / `gemini` route logic.
2. Add `ProviderCapabilityRegistry` for chat/patch features (`json_mode`, attachments, streaming, CORS/proxy requirements).
3. Normalize error envelope shape across `/api/llm/{provider}` routes.
4. Add common tests for patch-generation response parsing (including malformed JSON wrappers).
5. Create a provider-agnostic skill catalog for music tasks (prompt template + allowed tools + output contract).

## Phase P1 (2-4 weeks): Add first four providers as first-class assistants

## Outcomes

- `Grok`, `DeepSeek`, `Qwen`, and `Kimi` available in the same assistant UX as OpenAI/Claude/Gemini

## Tasks

1. Add provider enums/labels/defaults in UI.
2. Add `/api/llm/{provider}` route and `/api/llm/{provider}/models` route for each provider.
3. Implement provider adapters and parsers.
4. Add patch-generation QA cases for each provider:
   - clean JSON patch
   - fenced JSON patch
   - explanatory text + embedded JSON patch
   - refusal / partial output
5. Add provider-specific attachment capability gating in UI (PDF/image toggles).

## Phase P2 (4-8 weeks): Reliability + policy routing for patch generation

## Outcomes

- Better patch generation success rates with automatic fallback/retry policies

## Tasks

1. Add provider-specific prompt templates for patch generation (chat vs strict JSON modes).
2. Add retry strategy:
   - retry same provider with stricter JSON instructions
   - fallback to alternate provider
3. Log patch parse failure taxonomy by provider/model.
4. Add per-provider scorecards and promotion criteria (`prototype` -> `staging` -> `prod`).

## Phase 0 (1-2 weeks): Stabilize What You Already Have

## Outcomes

- Clear answer to "which NotaGen-X are we running?"
- Reproducible inference environment
- Basic conversion smoke tests

## Tasks

1. Add a model manifest with explicit `repo_id + revision` for `NotaGen-X`.
2. Record runtime environment requirements (MuseScore, `abc2midi`, converter dependencies).
3. Add smoke tests:
   - generate ABC
   - convert ABC -> MusicXML
   - render to MIDI/PDF
4. Add logging/provenance for prompts, model version, sampling params, outputs.

## Phase 1 (2-4 weeks): Build the Conversion/Validation Core

## Outcomes

- Reliable `MusicXML <-> ABC` service used where conversion is required (primarily generation/export workflows)
- Fewer silent failures and easier debugging
- Initial deterministic WASM score-ops wrapper for direct score edits in OTS
- MusicXML-first context extraction service for reasoning agents

## Tasks

1. Wrap `NotaGen/data` conversion scripts into callable library/service functions.
2. Reuse `weavemuse` ABC -> MusicXML/render path as the default export pipeline.
3. Create an ABC normalization step (headers, formatting, dialect quirks).
4. Implement validation report schema:
   - parse/render/playback status
   - warnings/errors
   - basic musical invariants
5. Add a regression corpus of representative scores (simple, polyphonic, ornamented, atypical meters).
6. Implement `ScoreOpsTool` MVP over curated `webmscore` methods (metadata edits, transpose, basic structure edits, exports).
7. Implement `/api/music/context` (MusicXML-first, selection/range/search snippets, bounded output size).
8. Freeze tool input/output schemas for `music.context`, `music.convert`, and `music.generate` for agent/MCP reuse.
9. Define and deploy the embed companion API topology:
   - OTS static embed UI in `OurTextScores` (`/score-editor/*`)
   - OTS Editor API service for `/api/llm/*` and `/api/music/*`
   - OurTextScores reverse proxy paths (`/api/score-editor/llm/*`, `/api/score-editor/music/*`)
10. Add a shared embed API base config in OTS (`NEXT_PUBLIC_SCORE_EDITOR_API_BASE`) so LLM and music tools use one proxy base.

## Phase 2 (3-6 weeks): Introduce Dedicated Specialists in Product

## Outcomes

- The assistant routes music tasks to dedicated agents/tools
- Better UX for score generation vs analysis vs conversion
- Direct score edits become deterministic (WASM-backed) while AI remains a planner/reasoner

## Tasks

1. Implement `MusicRouter` intent classification.
2. Add `WeaveMuseSpecialist` as a planner/orchestrator agent for music workflows.
2. Add `ScoreGenerationSpecialist` backed by `NotaGen-X`.
3. Add `MusicReasoningSpecialist` backed by user-selected frontier models (BYO keys via first-class provider routes).
4. Add `ScoreConversionSpecialist` (deterministic only).
5. Add `ScoreOpsSpecialist` backed by curated `webmscore` WASM bindings.
6. Build candidate comparison UX (preview, playback, provenance, validation badges).
7. Add score-edit execution UX (proposed ops preview, apply, undo/redo, diff summary).
8. Integrate provider selection/routing so `WeaveMuseSpecialist` and patch-generation flows can choose among first-class providers by capability/policy.

## Phase 2.5 (hardening): Guardrails for AI-driven Score Edits

## Outcomes

- LLMs can request score edits safely without direct low-level engine access

## Tasks

1. Capability discovery on score load (record which optional mutation methods exist in the current build).
2. Atomic `apply_ops` batching with rollback policy.
3. Post-edit relayout + export validation before committing artifact state.
4. Unsupported-op handling (graceful fallback or user-visible explanation).
5. Provenance logging for requested vs applied ops and engine build info.

## Phase 3 (6-12 weeks): Evaluation and Quality Gates

## Outcomes

- Quantitative quality tracking before model/tool changes ship

## Evaluation Tracks

- Conversion reliability:
  - `% MusicXML -> ABC parse success`
  - `% ABC -> MusicXML render success`
  - `% end-to-end playback success`
- MusicXML context extraction reliability:
  - `% context requests returning bounded snippets under max size`
  - `% selection/range requests resolved without fallback to full-document context`
- Symbolic generation quality (NotaGen-X):
  - syntax validity
  - style adherence (human or embedding-based proxy)
  - repetition/form metrics
- Music reasoning quality (frontier BYO model):
  - task accuracy on internal prompt set
  - rubric-based human review
- Product usability:
  - time-to-first-playable-score
  - revision count to acceptable output
- Direct edit reliability:
  - `% score-op batches fully applied`
  - `% score-op batches rolled back cleanly on failure`
  - `% post-edit MusicXML export success`
- Provider platform reliability (first-class chat/patch):
  - `% patch responses parseable on first try` by provider/model
  - `% fallback success after parse failure`
  - median/95p latency by provider/model
  - `% provider route errors` (auth, quota, schema, transient)

## Phase 4 (Long Term): Fine-Tuning / Alignment Program

## MusicReasoningSpecialist model strategy (near term)

Near-term strategy:

- Use first-class provider routes and let users/org policy select the frontier model.
- Keep per-provider eval scorecards (quality, cost, latency) and default model recommendations.
- Treat reasoning model choice as a routing/policy decision, not a hardcoded specialist dependency.

Potential training data (high leverage):

- Your real assistant prompts and accepted responses (de-identified)
- Score-editing request/response pairs
- Theory Q&A linked to score snippets
- Conversion-failure repair examples (broken ABC -> corrected ABC)

Recommended approach:

1. Build and maintain an evaluation set for analysis/education/patch-planning tasks.
2. Compare candidate frontier models under identical prompts and output contracts.
3. Select defaults by tier (best quality, best latency, best cost) and expose user override.
4. Revisit fine-tuning only when provider models fail target quality on stable evals.

## NotaGen / NotaGen-X (higher leverage, higher cost)

Potential objectives:

- Style/domain adaptation (your repertoire focus)
- Instrumentation-specific generation quality
- Constraint-following improvements

Challenges:

- Data prep is more specialized (ABC/interleaved/augmented formats)
- Quality evaluation is harder than chat-style accuracy
- Inference and model packaging consistency matter more for production rollouts

Recommended approach:

1. Build dataset pipeline and evaluation first.
2. Run narrow fine-tunes for one style/instrumentation family.
3. Gate rollout with conversion + playback + human review metrics.
4. Consider preference optimization only after stable SFT/fine-tuning baselines.

## Operational Design for Fine-Tuning (Long Term)

- Dataset versioning: store immutable dataset manifests and split definitions.
- Experiment tracking: model, data, hyperparams, metrics, artifact samples.
- Checkpoint registry: explicit promotion flow (`experimental` -> `staging` -> `prod`).
- Safety/quality review: human signoff for model promotions that affect user-visible generation.

## Open Questions to Resolve Early

1. What is the canonical user-editable format in OTS (`MusicXML`, MSCZ, or both)?
2. Which workflows require ABC at all vs staying MusicXML-native end-to-end?
3. Which task family matters first: generation, analysis, editing, or educational explanations?
4. What latency budget is acceptable for generation + rendering in the product?
5. Do you want on-device/local inference, server inference, or hybrid?
6. Which providers should be exposed to all users vs hidden behind feature flags during rollout?
7. Do you want user-selectable providers everywhere, or policy-driven provider routing for patch generation?

## Recommended Next Build Slice

If you want the fastest path to value:

1. Ship `MusicXML <-> ABC` conversion service + validation reports.
2. Ship a MusicXML-first `/api/music/context` service (selection/range/search extraction).
3. Pin `NotaGen-X` revision in a local model manifest.
4. Add a curated `ScoreOpsTool` over `webmscore` for deterministic score edits.
5. Add `DeepSeek` and `Qwen` as the first new first-class assistant providers (chat + patch generation) using shared provider adapters.
6. Add a `WeaveMuse` specialist as planner/orchestrator plus a frontier-model-backed `MusicReasoningSpecialist` for analysis/explanation.
7. Add end-to-end artifact provenance in the UI/backend.
8. Deploy a companion OTS Editor API container in the existing OurTextScores Docker/Nginx stack for embed mode reliability.

## Agent Runtime Recommendation

Use OpenAI Agents SDK as the default orchestration layer; keep custom domain tooling behind MCP/services.

- Build custom only for:
  - score conversion/validation pipelines
  - deterministic score ops and artifact lifecycle
  - product policy/routing and security controls
- Use SDK/framework for:
  - agent loop, tool orchestration, session state, streaming, tracing, handoffs
- Build MCP + skill surfaces once and reuse them across providers/models:
  - MCP for deterministic execution boundaries (`ScoreOps`, conversion, artifacts)
  - skills for reusable high-level music workflows with stable output contracts
- Defer other orchestration frameworks unless required by a specific missing capability.

## Testing Practice (Music Services)

- Unit tests (required for each new service module):
  - validate request parsing/bounds/defaults
  - validate error mapping/status codes
  - validate deterministic outputs and truncation behavior
- API contract tests (required for each route wrapper):
  - success envelope
  - error envelope (`{ error }`, correct HTTP status)
- E2E tests (small critical set only):
  - one MusicXML-first reasoning context flow
  - one NotaGen generation + conversion flow
  - one embed proxy smoke test

Repository commands:

- `npm run test:music-services` for service-level unit coverage
- `npm run test` for full Vitest suite
- `npm run test:e2e:music` for music API smoke E2E
- `npx playwright test` for full browser E2E
