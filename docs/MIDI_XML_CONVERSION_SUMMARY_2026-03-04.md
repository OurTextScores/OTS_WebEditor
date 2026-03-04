# MIDI <-> MusicXML Conversion Service Summary (March 4, 2026)

## 1. Detailed design spec

### Scope
- Goal: add bidirectional `midi <-> musicxml` conversion to the existing `/api/music/convert` service.
- Delivery mode: API-only (no UI changes required for this phase).
- Transport format for MIDI in API: base64 payloads.
- Validation policy:
- Hard-fail for structurally invalid MIDI payloads and invalid output shape.
- Non-blocking warnings for musical invariant drift (note count, key, meter comparisons).

### API contract
- Endpoint: `POST /api/music/convert`.
- Supported formats: `abc`, `musicxml`, `midi` (`mid` alias normalized to `midi`).
- Input payload support:
- Text inputs via `content` (UTF-8) for `abc` and `musicxml`.
- Binary MIDI via `contentBase64` / `content_base64` with `contentEncoding = base64`.
- Artifact-based flow via `inputArtifactId` for chained conversions.
- Output payload:
- `conversion.contentEncoding` and optional top-level `contentEncoding` when `includeContent=true`.
- For MIDI outputs, content is base64.

### Conversion engine architecture
- Primary conversion engine:
- `abc <-> musicxml`: existing python scripts (`xml2abc.py`, `abc2xml.py`).
- `midi <-> musicxml`: MuseScore CLI import/export pipeline.
- Runtime abstraction:
- `convertBetweenFormats(...)` dispatches by format pair.
- `convertXmlToMidi(...)` and `convertMidiToXml(...)` use temp-file orchestration.
- `runMuseScoreConvert(...)` executes candidate MuseScore binaries with optional wrapper logic.

### Normalization and encoding rules
- Added explicit encoding model:
- `utf8` for text formats.
- `base64` for MIDI payloads.
- Input normalization:
- MIDI payload whitespace stripping for base64 bodies.
- Base64 decode integrity checks (roundtrip re-encode match).
- Output normalization:
- Text output normalized with existing line-ending rules.
- MIDI output returned as compact base64.

### Validation model
- Output-shape validation:
- Existing MusicXML checks retained.
- MIDI shape check added (`MThd` header sanity and non-empty payload).
- Invariant extraction:
- MusicXML invariants: part count, measure estimate, meter, key (fifths), note count.
- MIDI invariants: track count, meter/key from meta events when present, note count from note-on events, measure estimate from division/time signature.
- Roundtrip drift checks:
- Compare meter and key when both sides provide values.
- Compare note counts with warning thresholds:
- Warning threshold: `max(6 notes, ceil(5% of expected))`.
- Strong warning threshold: `max(20 notes, ceil(15% of expected))`.
- Policy:
- Structural invalidity is hard-fail.
- Invariant mismatch is warning-only (non-blocking).

### Service-layer behavior
- Input resolution order:
- `inputArtifactId` -> `content_base64/contentBase64` -> text/session resolver.
- Input size protection:
- `MUSIC_CONVERT_MAX_INPUT_BYTES` (default 10MB), applied to decoded bytes for base64 input.
- Artifact metadata enhancements:
- Persist `encoding` and `mimeType` in artifacts.
- MIME defaults: `audio/midi` for MIDI, text MIME for text formats.
- Health response:
- Exposes midi section with MuseScore candidate command list and max input size.

### Testing design
- Unit coverage:
- format normalization (`mid` alias support), base64 flow, service response encoding propagation.
- API smoke/e2e coverage:
- MIDI base64 upload -> MusicXML conversion.
- MusicXML artifact -> MIDI roundtrip conversion.
- Artifact chain assertions (`parentArtifactId`, `sourceArtifactId`, encoding, headers).
- Runtime-aware skip behavior for environments where MuseScore CLI conversion is unavailable/non-functional.

## 2. Summary of implementation process (blockers/workarounds)

### Process completed
- Extended conversion core types, format normalization, and conversion dispatcher to include MIDI.
- Added MIDI conversion implementation through MuseScore temp-file orchestration.
- Added base64 input/output handling end-to-end in service, contracts, and client helper.
- Extended artifact schema and metadata persistence for encoding/mime type.
- Added validation logic for MIDI output shape and invariant comparison warnings.
- Added unit tests and validated with Vitest.
- Added API smoke tests for MIDI upload and roundtrip artifact-chain behavior.

### Blockers encountered
- Initial local runtime blocked on non-interactive MuseScore conversion.
- Root causes identified in `score_editor_api` runtime:
- No MuseScore 4 provisioning (only older distro `musescore` path).
- Missing `xvfb-run` and later `xauth`, causing wrapper failure.
- Wrapper-selection inconsistency in one render-smoke path when `DISPLAY` was set.

### Workarounds implemented
- Implemented container parity patch for `score_editor_api`:
- Added MuseScore 4 AppImage extraction + `musescore4` wrapper.
- Added runtime deps: `xvfb`, `xauth`, `libopengl0`, `libpipewire-0.3-0`, with `musescore3` fallback.
- Added explicit env defaults for MuseScore binary candidates and wrapper behavior.
- Fixed render-smoke path to use shared `resolveXvfbRunPath()` logic so `MUSIC_MUSESCORE_USE_XVFB=true` is honored consistently.
- Verified live conversion chain in local stack:
- `ABC -> MusicXML -> MIDI -> MusicXML` completed without errors via `score_editor_api` API.

## 3. Summary of the implementation

### Core code changes
- `lib/music-conversion.ts`
- Added `midi` format and `MusicContentEncoding`.
- Added MuseScore conversion functions for `xml->midi` and `midi->xml`.
- Added MIDI normalization and invariant extraction.
- Added validation checks and roundtrip warning thresholds.
- `lib/music-services/convert-service.ts`
- Added `contentBase64` / `content_base64` support.
- Added base64 format inference and input size guards.
- Added encoding/mime metadata in artifact creation.
- Included MIDI details in health payload and conversion response metadata.
- `lib/music-services/contracts/music-convert-contract.ts`
- Expanded schema enums and fields for MIDI + base64 payload model.
- `lib/score-artifacts.ts`
- Extended artifact type with `encoding` and `mimeType`.
- `lib/score-conversion-tool.ts`
- Added client request/response support for base64 MIDI flow.

### Test changes
- Unit tests:
- `unit/music-conversion.test.ts`
- `unit/convert-service.test.ts`
- API smoke/e2e tests:
- `tests/music-api-smoke.spec.ts`
- Added MIDI upload and roundtrip tests with artifact assertions and runtime-aware skip path.

## 4. Current blocker (non-interactive export)

### Current status
- Section 5 container/runtime parity patch is implemented.
- Non-interactive conversion is working in local `score_editor_api` runtime.

### Evidence
- `musescore4 --version` returns (`MuseScore4 4.6.3`) in `ourtextscores_score_editor_api`.
- `xvfb-run` and `xauth` are installed and available.
- Live API conversion chain succeeds:
- `ABC -> MusicXML -> MIDI -> MusicXML` with valid output artifacts and no conversion errors.

### Remaining risk
- Dev compose currently installs packages at container startup, which is slower and can fail if package mirrors or AppImage download are unavailable.

## 5. Proposal for patch / next steps

### Completed in this patch set
1. Brought `score_editor_api` runtime closer to backend MuseScore setup in both:
- `OTS_Web/Dockerfile.editor-api` (production image),
- `OurTextScores/docker-compose.yml` and `docker-compose.score-editor-image.yml` (local/runtime wiring).
2. Added MuseScore 4 wrapper defaults:
- `MUSIC_MUSESCORE_BIN=musescore4`
- `MUSIC_MUSESCORE_BIN_CANDIDATES=musescore4,mscore4portable,musescore3,musescore`
- `MUSIC_MUSESCORE_USE_XVFB=true`
3. Added missing `xauth` dependency required by `xvfb-run`.
4. Fixed wrapper-path selection consistency in `lib/music-conversion.ts` render-smoke path.

### Next priority follow-ups
1. Add conversion-capability health probe (small real conversion), not just tool-path checks.
2. Add explicit MuseScore conversion timeout env (`MUSIC_MUSESCORE_TIMEOUT_MS`), optionally split by direction.
3. Optimize base64 decode path to avoid repeated MIDI decode work in a single request.
4. Tighten format inference behavior if additional binary formats are added later.

### Verification checklist
1. Rebuild `score_editor_api` image from `OTS_Web/Dockerfile.editor-api`.
2. Confirm container has:
- `musescore4`,
- `xvfb-run`,
- `xauth`.
3. Execute API smoke:
- `musicxml -> midi`,
- `midi -> musicxml`,
- artifact-chain assertions.
4. Keep e2e skip-on-toolchain-unavailable as temporary guard until all target environments are aligned.
