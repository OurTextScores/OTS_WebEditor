# Repo Review: WeaveMuse, NotaGen, ChatMusician (Benchmark Only)

## Executive Summary

- `weavemuse` already has a practical symbolic generation toolchain around NotaGen, including ABC output and conversions to MusicXML/PDF/MIDI/MP3.
- `NotaGen` is ABC-native and includes data scripts for both `MusicXML -> ABC` and `ABC -> MusicXML`.
- `ChatMusician` is ABC-native and conversation/instruction oriented, but should be treated as a benchmark/reference rather than the default production reasoning model.
- The major missing piece for your assistant is not raw capability but a stable orchestration layer: format normalization, model version pinning, and evaluation.

## WeaveMuse Findings (`~/workspace/weavemuse`)

## What it already has

- Multi-agent orchestration via `smolagents` and a Gradio interface (`/home/jhlusko/workspace/weavemuse/app.py` and `weavemuse/agents/agents_as_tools.py`).
- A dedicated NotaGen tool with local and remote modes (`weavemuse/tools/notagen_tool.py`).
- A conversion pipeline that turns generated ABC into MusicXML/PDF/MIDI/MP3/PNG (`weavemuse/tools/notagen_tool.py`, `weavemuse/models/notagen/convert.py`).
- UI logic that discovers and surfaces generated `.abc`, `.xml`, `.midi`, `.mp3`, `.pdf`, and rendered images (`weavemuse/interfaces/gradio_interface.py`).

## NotaGen-X usage status (important)

- `weavemuse` explicitly references `manoskary/NotaGenX-Quantized` in the local NotaGen tool/model manager (`weavemuse/tools/notagen_tool.py`, `weavemuse/models/notagen/model_manager.py`, `weavemuse/models/notagen/inference.py`).
- It also keeps a fallback path to `ElectricAlexis/NotaGen` (`weavemuse/tools/notagen_tool.py`, `weavemuse/models/notagen/inference.py`).
- From local code review alone, I cannot confirm whether this is the latest public `NotaGen-X` release, because the repo IDs are not pinned to a specific HF revision/commit.

## Immediate implication

- You do not need to invent the ABC -> MusicXML direction; it already exists in `weavemuse`.
- You likely do need a first-class `MusicXML -> ABC` ingress path for assistant workflows that start from uploaded scores.

## NotaGen Findings (`~/workspace/NotaGen`)

## What it already has

- ABC-native generation/training pipeline (patch-level hierarchical model).
- Documentation for `NotaGen-X` and local/online demos in the README (`/home/jhlusko/workspace/NotaGen/README.md`).
- Data conversion scripts documented for:
  - `MusicXML -> ABC` via `1_batch_xml2abc.py`
  - ABC preprocessing/augmentation/interleaving
  - `ABC -> MusicXML` via `3_batch_abc2xml.py`
  (`/home/jhlusko/workspace/NotaGen/data/README.md`)

## Immediate implication

- `NotaGen` provides the missing reverse conversion direction you called out (XML to ABC), but today it appears as dataset scripts rather than a clean service/API boundary.
- For production assistant integration, wrap these conversions behind a dedicated converter service/tool with deterministic behavior and validation.

## ChatMusician Findings (`~/workspace/ChatMusician`, benchmark/reference)

## What it already has

- ABC-native conversational music model based on LLaMA2 continual pretraining + SFT (`/home/jhlusko/workspace/ChatMusician/README.md`).
- LoRA fine-tuning workflow with DeepSpeed (`/home/jhlusko/workspace/ChatMusician/model/train/train.py`, `model/train/scripts/train.sh`).
- Demo post-processing that writes ABC, runs `abc2midi`, and uses MuseScore for rendering/audio (`/home/jhlusko/workspace/ChatMusician/model/infer/chatmusician_web_demo.py`).

## Immediate implication

- `MusicReasoningSpecialist` should use a user-selected frontier model (BYO key) through first-class provider routes.
- Reasoning/planning should stay MusicXML-first; use ABC primarily for NotaGen generation or optional compression fallback.
- `ChatMusician` remains useful as an offline benchmark/regression target for ABC-native music instruction behavior.
- `NotaGen/NotaGen-X` remains a strong fit for a "style-constrained symbolic score generation" specialist.

## Cross-Repo Gaps / Risks

- No shared artifact schema across repos (score metadata, provenance, conversion logs, validation status).
- No explicit model revision pinning (HF repo IDs are mutable targets).
- Conversion quality and round-trip fidelity are not treated as a first-class test surface yet.
- ABC dialect differences (headers, tuplets, ornaments, metadata) can break downstream tools if not normalized.
- LLM-driven score editing should not call raw score-engine/WASM exports directly without a curated wrapper (too easy to misuse low-level selection/layout/lifecycle calls).

## OTS Web-Specific Opportunity (WASM score editing)

- `OTS_Web` already has a rich `webmscore` wrapper with optional mutation methods in `lib/webmscore-loader.ts`.
- The current `Score` interface includes many deterministic edit/export primitives (e.g., `transpose`, `setTitleText`, `undo`, `redo`, `saveXml`, `saveMidi`, `saveAudio`, selection APIs).
- `ScoreEditor` already gathers AI context including selection boxes and selection MIME XML, which is a strong base for AI-guided but deterministic editing.

## Immediate implication

- You can pair `weavemuse` (LLM/planner/music model orchestration) with a deterministic WASM-backed score-edit tool in OTS instead of trying to make the model emit raw MusicXML patches for every edit.

## Recommended Short-Term Focus

1. Build a single score conversion/normalization layer (`MusicXML <-> ABC`) with validation.
2. Add model version pinning + runtime manifest checks for `NotaGenX` in the assistant stack.
3. Split specialists by role:
   - `ScoreGenerationSpecialist` (NotaGen-X)
   - `MusicReasoningSpecialist` (frontier model, user-selected, BYO key)
   - `ScoreConversionSpecialist` (deterministic tools only)
   - `ScoreOpsSpecialist` (deterministic WASM-backed editing over curated operations)
