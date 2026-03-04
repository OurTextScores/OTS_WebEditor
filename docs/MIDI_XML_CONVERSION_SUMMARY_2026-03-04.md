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
- In local runtime, non-interactive MuseScore export/import commands hang and time out.
- Observed environment characteristics:
- `musescore` is present but version is `MuseScore2 2.3.2`.
- `xvfb-run` is missing.
- `DISPLAY=:0` exists (Xwayland), but CLI conversion still stalls during initialization/export.
- Result: API MIDI conversions return timeout/tooling errors in this environment.

### Workarounds implemented
- Added robust e2e test behavior:
- Tests try multiple real MIDI fixtures.
- Tests skip only when errors indicate runtime/toolchain unavailability (command missing, display issues, timeout).
- Preserved hard-fail semantics for actual request/validation failures where tooling is expected to work.

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

### Current blocker statement
- MIDI conversion in this runtime is blocked by non-interactive MuseScore export/import instability.

### Evidence
- `musescore --version` reports `MuseScore2 2.3.2`.
- `xvfb-run` not installed.
- CLI export commands (`-o ...`) for both XML and MIDI inputs time out without producing output artifacts.
- Debug logs show GUI/Qt initialization but no conversion completion.

### Impact
- Unit tests pass (mocked/service-layer behavior), but true runtime MIDI conversion cannot be relied on in this container.
- New e2e tests skip under this condition to avoid false negatives, but runtime functionality remains blocked until container/tooling is fixed.

## 5. Proposal for patch / next steps

### Corrected diagnosis (container split)
1. The known-good MuseScore 4 AppImage setup already exists in `OurTextScores/backend/Dockerfile` (extract AppImage, call `mscore4portable` directly, wrap with `xvfb-run`).
2. The MIDI/XML conversion service runs in `score_editor_api` (OTS_Web), not in backend derivative pipeline.
3. Current `score_editor_api` runtime paths do not include equivalent MuseScore provisioning:
- Dev compose service uses `node:20-bookworm` + ad-hoc `apt-get install python3-pyparsing`.
- Production image (`OTS_Web/Dockerfile.editor-api`) has no MuseScore/xvfb install.

### Recommended patch (container/runtime)
1. Bring `score_editor_api` to parity with backend MuseScore setup.
2. For `score_editor_api` production image (`OTS_Web/Dockerfile.editor-api`):
- Install `xvfb`, `libopengl0`, `libpipewire-0.3-0`, and `musescore3` fallback.
- Download/extract MuseScore 4 AppImage at build time.
- Create `/usr/local/bin/musescore4` wrapper that runs `/opt/musescore4/bin/mscore4portable` via `xvfb-run` with timeout.
3. For local compose dev (`OurTextScores/docker-compose.yml` score_editor_api service):
- Either switch to the built editor-api image, or install equivalent MuseScore tooling in the startup command.
- Set env explicitly for conversion service:
  - `MUSIC_MUSESCORE_BIN=musescore4`
  - `MUSIC_MUSESCORE_BIN_CANDIDATES=musescore4,mscore4portable,musescore3,musescore`
4. Keep `musescore3` as fallback path in case AppImage extraction/download is unavailable.

### Recommended code patch (follow-up)
1. Add conversion-capability smoke check in health (tiny XML->MIDI or MIDI->XML probe), not just script-path checks.
2. Add an env-controlled wrapper preference:
- `MUSIC_MUSESCORE_USE_XVFB=true|false` and force wrapper usage when enabled, even if `DISPLAY` is set.
3. Add dedicated timeout controls for MuseScore conversions:
- `MUSIC_MUSESCORE_TIMEOUT_MS` (or import/export split).
4. Keep e2e skip logic only as a temporary guard; convert to strict pass once container parity is deployed.

### Verification plan after patch
1. Rebuild and run `score_editor_api` with updated image/runtime.
2. Verify inside container:
- `musescore4 --version` returns quickly.
- A tiny non-interactive export command writes output file successfully.
3. Run MIDI API smoke tests (`tests/music-api-smoke.spec.ts`) and confirm no skips.
4. Run full flow validation:
- `midi -> musicxml -> midi` roundtrip with artifact-chain checks.
- health endpoint reports MIDI converter as available and probe passes.
