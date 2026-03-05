# ChordGAN Extension Design (March 4, 2026)

## 1. Objective

Add a `ChordGAN` specialist workflow to OTS that can:
- accept a source score (MusicXML/MIDI),
- apply style transfer conditioned on harmonic content,
- return generated MIDI and canonical MusicXML,
- support both "replace score" and "append generated parts" apply modes.

This should follow the existing NotaGen + MMA integration patterns (artifact lifecycle, trace headers, telemetry, and streaming UX).

## 1.1 Current status

As of March 5, 2026:

- OTS-side `ChordGAN` routes, contracts, service wiring, and sidebar UI exist.
- End-to-end transfer works against a Hugging Face Gradio Space using the current fallback MIDI transformer.
- Download and append/apply flows are implemented on the OTS side.
- Local verification exposed one important operational detail: direct `OTS_Web` development uses `OTS_Web/.env.local`, while `OurTextScores` containerized runs use `OurTextScores/.env` plus compose passthrough.

The main remaining milestone is not OTS plumbing; it is replacing the placeholder transformer in `ChordGAN-Space` with real ChordGAN inference.

## 2. Feasibility and recommendation

### 2.1 Can we do a Hugging Face Space approach like NotaGen?

Yes, and it remains the recommended deployment model for the real-model rollout.

Rationale:
- OTS already has stable Gradio Space integration in the generation flow and frontend SSE handling.
- Hugging Face Spaces support Gradio and Docker SDKs, plus secrets/hardware controls.
- You already have Hugging Face billing + ZeroGPU access, which aligns with a Gradio-first rollout.

### 2.2 Key caveat

Public ChordGAN materials are research-grade, not production packaged:
- paper + README emphasize style transfer and TensorFlow 1.15 compatibility,
- repository UX is notebook-centric and minimally operationalized.

So "Space + adapter wrapper" is feasible, but we should plan for a model-runtime hardening phase before production reliability targets.

## 3. Product scope

### In scope (v1)
- New `ChordGAN` sidebar tab in `ScoreEditor`.
- Server endpoints for:
  - style options discovery,
  - transfer request (sync + stream),
  - conversion/artifact persistence.
- HF Space backend support (token + space id + api_name).
- Output integration:
  - download MIDI/MusicXML,
  - apply replace,
  - append as new part(s) to current score.
- Real ChordGAN inference running inside the HF Space, replacing the current fallback transformer.

### Out of scope (v1)
- End-to-end model training orchestration in OTS.
- Multi-model auto-routing and ensemble transfer.
- Full "musically aware merge engine" beyond current append-part behavior.

## 4. User workflow design

## 4.1 New XML sidebar tab

Add `ChordGAN` next to `NotaGen` and `MMA`.

Controls:
- `Backend`: `huggingface-space` (v1 only).
- `Space ID`: default from env.
- `Style target`: e.g. `classical`, `jazz`, `pop` (fetched from options endpoint).
- `Input mode`: `Current score` or `Artifact ID`.
- `Output mode`: `MIDI only` or `MIDI + MusicXML`.
- `Apply mode`: `Replace score` or `Append as new parts`.
- `Run` button, `Apply` button, `Download` buttons.

Status/results:
- live progress log (SSE),
- warnings/errors,
- generated MusicXML preview editor,
- metadata pane (space id, endpoint, duration, artifact ids).

## 4.2 Behavior

Input source defaults to current score:
1. Resolve current MusicXML from editor.
2. Convert MusicXML -> MIDI (existing convert service).
3. Send MIDI + style parameters to ChordGAN backend.
4. Receive generated MIDI.
5. Convert MIDI -> canonical MusicXML (existing convert service).
6. Persist artifacts and expose apply/download actions.

## 5. Backend design

## 5.1 New routes

1. `POST /api/music/chordgan/options`
- Returns available style labels and runtime metadata for configured Space.

2. `POST /api/music/chordgan/transfer`
- Non-streaming transfer endpoint.
- Accepts source (inline or artifact), style target, backend config, validation options.

3. `POST /api/music/chordgan/transfer/stream`
- SSE endpoint for long-running jobs (recommended default from UI).
- Emits `ready`, `status`, `progress`, `result`, `error`.

## 5.2 Service module

Add `lib/music-services/chordgan-service.ts`:
- `runChordGanOptionsService(body, options?)`
- `runChordGanTransferService(body, options?)`
- `runChordGanTransferStreamService(body, options?)`

Shared helper module: `lib/music-chordgan.ts`:
- request parsing/normalization,
- Gradio Space call adapter,
- output extraction and sanitization,
- validation helpers for MIDI/MusicXML.

## 5.3 Contracts

Add and register:
- `music-chordgan-options-contract.ts` (`music.chordgan_options`)
- `music-chordgan-transfer-contract.ts` (`music.chordgan_transfer`)

Keep `music.generate` specialized for NotaGen for now; avoid overloading schema until ChordGAN stabilizes.

## 6. Data contracts (v1 draft)

## 6.1 Transfer request

- `backend`: `"huggingface-space"` (required)
- `spaceId`: string
- `hfToken`/`hf_token`: optional
- `style`: string (required)
- `content` + `inputFormat` (`musicxml` or `midi`) OR `inputArtifactId`
- `includeMidi`: boolean (default `true`)
- `includeMusicXml`: boolean (default `true`)
- `persistArtifacts`: boolean (default `true`)
- `validate`: boolean (default `true`)
- `deepValidate`: boolean (default `false`)
- `timeoutMs`: bounded integer
- `applyModeHint`: `"replace"` | `"append"` (UI hint only)

## 6.2 Transfer response

- `ok`: boolean
- `specialist`: `"chordgan"`
- `backend`: `"huggingface-space"`
- `outputArtifactId`: optional (musicxml)
- `generatedMidiArtifactId`: optional
- `outputArtifact`, `generatedMidiArtifact`: summaries
- `validation`: conversion validation blocks
- `warnings`: string[]
- `provenance`: `{ provider, spaceId, endpoint, durationMs, strategy }`
- `content` (optional by flag): `{ midiBase64?, musicxml? }`

## 7. HF Space deployment design

## 7.1 Recommended runtime: Gradio Space (ZeroGPU-first)

Why:
- ZeroGPU is compatible with Gradio Spaces and can reduce inference cost for first rollout.
- OTS already uses Gradio-client patterns in NotaGen, lowering integration risk and implementation time.

Runtime shape:
- Gradio Space app with pinned Python dependencies.
- Model code + checkpoint(s) loaded at startup (or first request with warm-cache handling).
- Minimal APIs:
  - `/options` (styles, model info),
  - `/transfer` (input midi + style => output midi).

Current state:
- The deployed Space currently serves OTS-compatible `/options` and `/transfer` endpoints.
- The implementation is intentionally a fallback transformer, not the research model.

Fallback plan:
- If ChordGAN cannot run reliably in Gradio/ZeroGPU constraints (dependency, memory, or startup issues), switch to paid GPU Gradio hardware first.
- Use Docker Space only if Gradio runtime constraints still block reliability while keeping the same OTS API contract.

## 7.2 Security and ops

- Use HF Space secret for any gated asset token.
- Keep OTS token optional; support public Space mode.
- Enforce payload limits and timeout caps in OTS before backend call.

## 7.3 API compatibility with OTS

Use Gradio API contracts that match existing NotaGen client behavior:
- inspect endpoints via `view_api()` during setup,
- call with explicit `api_name`,
- use async `submit` and status polling for streamed UX.

Operational note:
- Private Spaces require `MUSIC_CHORDGAN_SPACE_TOKEN` in the OTS server environment.
- Direct local testing of `OTS_Web` requires the token in `OTS_Web/.env.local`; `OurTextScores/.env` is not read by `npm run dev` in `OTS_Web`.

## 7.4 Real-model Space implementation plan

The next priority is to replace the placeholder `transform_midi_bytes()` implementation in `ChordGAN-Space/app.py` with real ChordGAN inference.

Recommended sub-phases:

1. Reproduce the research model locally outside HF
- obtain the exact ChordGAN codebase/checkpoints intended for deployment
- verify a deterministic CLI or Python entrypoint exists for:
  - load checkpoint
  - accept input MIDI / piano-roll representation
  - return generated accompaniment/style-transfer MIDI

2. Wrap model I/O behind the existing Space contract
- keep `/options` unchanged
- keep `/transfer` input as `(midi_base64, style)`
- convert incoming MIDI into whatever symbolic representation the model expects
- convert model output back to MIDI bytes/base64

3. Hardware and runtime qualification
- start on Gradio + ZeroGPU if the model loads and inference latency is acceptable
- if model init or inference does not fit ZeroGPU constraints, move to paid GPU Gradio hardware before considering Docker Space

4. Production hardening
- warm-load checkpoint on startup where possible
- bound inference time and input duration
- return structured failure messages for:
  - unsupported MIDI complexity
  - model load failure
  - inference timeout
  - output decode/serialization failure

5. Regression verification
- compare fallback-transformer output vs real-model output only for contract compatibility, not musical quality
- verify OTS still receives:
  - valid MIDI base64
  - successful MIDI -> MusicXML conversion when requested
  - stable append-part behavior in the editor

## 8. Validation model

Hard-fail:
- source decode/conversion fails,
- ChordGAN backend call fails or times out,
- generated MIDI missing/empty/invalid header,
- requested MusicXML conversion fails canonicalization.

Warnings:
- note-count drift exceeds threshold (default 10-15%),
- key/time signature drift,
- measure-count drift,
- append merge had partial placement fallback.

Leverage current conversion validators and invariant extractors rather than adding a separate validation engine.

## 9. Observability integration

Emit service + route events aligned with current schema:
- `music.chordgan.options.request/result`
- `music.chordgan.transfer.request`
- `music.chordgan.transfer.backend_result`
- `music.chordgan.transfer.convert_result`
- `music.chordgan.transfer.summary`

Required fields:
- `requestId`, `traceId`, `sessionId`, `clientSessionId`,
- `durationMs`, `timeoutMs`,
- `spaceId`, `style`,
- `artifactIds`,
- `warningCount`, `errorCode`.

Add editor telemetry channel:
- `channel: 'chordgan'` on client request events.

## 10. Rollout plan

Phase 0: OTS scaffold
- status: completed
- add contracts/routes/service skeleton
- return validated request echo and static option list

Phase 1: OTS integration with Space contract
- status: completed
- connect OTS to HF Space `/options` + `/transfer`
- persist MIDI artifact
- return MIDI download in UI
- implement MusicXML conversion and replace/append apply actions

Phase 2: Space operational bring-up
- status: completed for fallback transformer
- Space repo created
- Hugging Face deployment/runbook completed
- auth and endpoint compatibility verified

Phase 3: Real ChordGAN model in HF Space
- status: next priority
- integrate actual ChordGAN runtime/checkpoints into `ChordGAN-Space`
- keep existing OTS API contract stable
- validate model output can be serialized back to MIDI reliably

Phase 4: Hardening and quality gates
- startup/inference smoke tests
- latency and timeout tuning
- musically representative regression corpus
- optional hardware escalation from ZeroGPU to paid GPU if needed

## 11. Risks and mitigations

Risk: legacy model runtime instability (TF1 stack) under Gradio/ZeroGPU limits.
- Mitigation: first reproduce locally, pin dependency versions, add startup smoke-test, then escalate hardware before changing platform.

Risk: low-quality transfer for certain genres/content.
- Mitigation: expose warnings + keep append mode default to avoid destructive replace.

Risk: API drift in Space endpoints.
- Mitigation: explicit endpoint names + boot-time compatibility check.

Risk: cold starts/latency on free hardware.
- Mitigation: streaming UX, timeout controls, and optional upgrade path to paid GPU/Docker Space for production SLOs.

## 12. Implementation notes for OTS codebase

Use existing patterns as templates:
- NotaGen streaming flow in `ScoreEditor` and `/api/music/generate/stream`.
- Music conversion pipeline in `convertMusicNotation`.
- artifact persistence and summary responses from current music services.
- trace propagation via `resolveTraceContext`, `withTraceHeaders`, and route summaries.

Avoid touching stable NotaGen behavior in the first ChordGAN PR; add parallel codepaths.

## 13. Decision summary

Recommended decision:
1. Build ChordGAN as a new specialist with dedicated routes (`/api/music/chordgan/*`).
2. Keep Hugging Face **Gradio Space** as the serving contract for the next phase.
3. Treat the current Space implementation as a bring-up scaffold, not the final model backend.
4. Make "real ChordGAN model running in the Space" the next primary milestone.
5. Reuse existing OTS MIDI<->MusicXML conversion + artifact + append-part machinery unchanged while the Space backend evolves.
6. Keep Docker Space only as a fallback if Gradio runtime constraints block reliability after GPU escalation.

This keeps parity with NotaGen’s operational model, leverages your current Hugging Face setup, and focuses the next effort on the actual remaining technical risk: model runtime and packaging.
