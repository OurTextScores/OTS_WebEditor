# ScoreOpsTool Detailed Design

## Purpose

Define a deterministic score-edit execution layer (`ScoreOpsTool`) that a server-side music agent can use safely.

Primary goals:

- Agent plans edits using typed operations (not raw XML freeform).
- Edits apply against the currently open score with revision safety.
- Responses are compact and machine-readable by default.
- Full MusicXML is available on demand, not required per step.

## Non-Goals (MVP)

- Full arbitrary MusicXML editing from the agent.
- Automatic semantic “best musical choice” for ambiguous instructions.
- Perfect bidirectional sync with multi-tab editing at launch.

## Implementation Snapshot (Current)

Implemented in OTS_Web:

- scoreops routes: `session/open`, `inspect`, `apply`, `sync`
- session + revision handling with stale revision protection (`409`)
- atomic batch apply behavior with rollback-on-failure semantics
- normalized error envelope (`ok=false`, `error.code/message/details`)
- fallback router preference for `music.scoreops` with `music.patch` compatibility fallback

Current executor mode:

- deterministic MusicXML string transformation in server runtime
- direct in-memory webmscore mutation wrappers are planned for follow-up phase

---

## Key Design Decision

Use a **hybrid architecture**:

- Agent orchestration remains server-side (`/api/music/agent`).
- Score mutation executes in the editor runtime (browser WASM), because that is where the live score exists.
- Server tracks state via revisioned handles + artifact snapshots, not by mutating score internals directly.

This keeps UX fast and avoids trying to run full `webmscore` mutation runtime in the API process.

---

## Runtime Topology

Components:

1. **MusicRouter Agent (server)**
   - Interprets user intent.
   - Emits `scoreops` batches.

2. **ScoreOps Coordinator (server)**
   - Session registry, revision checks, artifact persistence, audit/provenance.
   - Does not directly mutate browser score data.

3. **ScoreOps Executor (client)**
   - Applies typed ops on the active `Score` instance via curated WASM methods.
   - Produces operation result + change summary + optional patch/XML export.

4. **Artifact Store (server)**
   - Stores before/after snapshots and metadata (`artifactId`, hash, provenance).

---

## State and Revision Model

Each active score gets a session handle:

```json
{
  "scoreSessionId": "sess_abc123",
  "revision": 12,
  "artifactId": "art_after_12",
  "contentHash": "sha256:...",
  "updatedAt": "2026-02-27T00:00:00.000Z"
}
```

Rules:

- Every `apply` request includes `baseRevision`.
- If `baseRevision` is stale, return `409 stale_revision`.
- Successful apply increments revision atomically.
- Client and server both keep last known handle.

---

## ScoreOpsTool API Surface

Routes (proposed):

1. `POST /api/music/scoreops/session/open` (optional; see lazy bootstrap below)
2. `POST /api/music/scoreops/inspect`
3. `POST /api/music/scoreops/apply`
4. `POST /api/music/scoreops/sync` (manual UI edits happened outside tool flow)
5. `POST /api/music/scoreops/export` (optional in MVP)

### Session Bootstrap Policy (MVP)

`session/open` is optional for MVP.

Preferred MVP behavior:

- lazily create the session on first `sync` or `apply` if `scoreSessionId` is missing
- return the created handle in that same response
- keep `session/open` only for explicit preflight flows or future multi-client collaboration

### 1) Open Session

Input:

```json
{
  "initialArtifactId": "art_initial",
  "scoreMeta": { "title": "..." }
}
```

Output:

```json
{
  "scoreSessionId": "sess_abc123",
  "revision": 0
}
```

### 2) Inspect

Input:

```json
{
  "scoreSessionId": "sess_abc123",
  "revision": 13,
  "scope": {
    "partId": "P1",
    "measureStart": 29,
    "measureEnd": 37
  },
  "include": {
    "capabilities": true,
    "selectionSummary": true,
    "scoreSummary": true,
    "measureSignatures": true,
    "targetPreview": true
  }
}
```

Output:

```json
{
  "ok": true,
  "scoreSessionId": "sess_abc123",
  "revision": 13,
  "capabilities": {
    "ops": ["set_key_signature", "set_clef", "transpose_selection"],
    "wasmMethods": ["setKeySignature", "setClef", "transpose", "relayout"]
  },
  "scoreSummary": {
    "parts": [{ "partId": "P1", "name": "Strings" }],
    "measureCountEstimate": 43,
    "keyFifths": 0,
    "timeSignature": "4/4"
  },
  "selectionSummary": {
    "hasSelection": true,
    "selectionType": "range",
    "partId": "P1",
    "measureStart": 29,
    "measureEnd": 37
  },
  "targetPreview": {
    "measures": [29, 30, 31, 32, 33, 34, 35, 36, 37],
    "hash": "sha256:..."
  }
}
```

### 3) Apply

Input:

```json
{
  "scoreSessionId": "sess_abc123",
  "baseRevision": 12,
  "ops": [
    { "op": "set_key_signature", "fifths": 1, "scope": { "partId": "P1", "measureStart": 1 } },
    { "op": "delete_text_by_content", "text": "CLEAN VERSION" }
  ],
  "options": {
    "atomic": true,
    "includePatch": true,
    "includeXml": false,
    "includeMeasureDiff": true
  }
}
```

Output:

```json
{
  "ok": true,
  "scoreSessionId": "sess_abc123",
  "baseRevision": 12,
  "newRevision": 13,
  "state": {
    "artifactId": "art_after_13",
    "contentHash": "sha256:..."
  },
  "applied": [
    { "index": 0, "op": "set_key_signature", "ok": true },
    { "index": 1, "op": "delete_text_by_content", "ok": true }
  ],
  "changes": {
    "partsTouched": ["P1"],
    "measureRangesTouched": [{ "partId": "P1", "start": 1, "end": 1 }],
    "summary": "2 ops applied"
  },
  "patch": { "format": "musicxml-patch@1", "ops": [] }
}
```

### 4) Sync

When user edits score manually (toolbar, keyboard, XML panel), client sends new snapshot hash/artifact:

```json
{
  "scoreSessionId": "sess_abc123",
  "baseRevision": 13,
  "artifactId": "art_after_manual_14",
  "contentHash": "sha256:..."
}
```

Server response updates revision so agent doesn’t operate on stale state.

---

## Operation Contract

Use strongly-typed operations with strict validation.

### MVP Op Set Selection Process

The MVP op set should come from a capability inventory + prioritization pass, not from ad hoc examples.

See:

- `docs/music-ai-specialists/scoreops-capability-inventory.md`

Initial candidate families:

1. score metadata edits
2. key/time/clef edits
3. selection-scoped pitch/rhythm edits
4. structure edits (insert/remove measures, repeats, barlines)
5. safe text insertion/deletion

Lower-priority or specialist operations (for example, re-beaming heuristics) should follow after core workflows are stable.

Each op has:

- schema-validated input
- clear scope semantics
- deterministic execution mapping
- explicit failure codes

---

## Execution Semantics

### Atomicity

Default: `atomic=true`.

- Execute ops in order.
- On first failure:
  - rollback already-applied ops (undo stack),
  - return failure index + error code + rollback result.

Optional: `atomic=false` for “best effort” batches with per-op status.

### Determinism

- No freeform XPath from the agent in scoreops mode.
- Tool resolves targets from typed scopes.
- Tool verifies affected node counts and returns them.

---

## Return Payload Strategy: XML vs Diff vs Patch

Default return should be compact:

- per-op statuses
- summary of touched ranges
- new revision handle
- artifact ids/hashes

Optional flags:

- `includePatch=true`: return normalized `musicxml-patch@1` representation for audit/replay.
- `includeXml=true`: return full MusicXML string (only for export/apply fallback/debug).
- `includeMeasureDiff=true`: return parsed measure-level diff summary.

Recommendation:

- Do **not** return full XML every step.
- Persist XML in artifact store; reference by `artifactId`.

---

## How Agent Tracks Current Score State

Agent tracks a lightweight state object:

```json
{
  "scoreSessionId": "sess_abc123",
  "revision": 13,
  "artifactId": "art_after_13",
  "contentHash": "sha256:..."
}
```

Workflow:

1. Agent obtains state handle from latest tool response.
2. Next apply uses `baseRevision=13`.
3. If server returns `409 stale_revision`:
   - agent calls `inspect`,
   - updates handle,
   - replans/retries.
4. Client sends `sync` when edits occur outside scoreops pipeline.

---

## Error Model

Standardized errors:

- `400 invalid_request`
- `404 session_not_found`
- `409 stale_revision`
- `422 unsupported_op` / `invalid_scope` / `target_not_found`
- `500 execution_failure`

Error response shape:

```json
{
  "ok": false,
  "error": {
    "code": "stale_revision",
    "message": "baseRevision=12 is stale; latest is 14",
    "details": { "latestRevision": 14 }
  }
}
```

---

## Security and Guardrails

- Strict op allowlist; reject unknown operations.
- Schema validation per op.
- Bound measure ranges and payload sizes.
- Capability checks before execution (`method exists` in current build).
- Provenance logging for every apply:
  - user prompt hash
  - planned ops
  - applied ops
  - rollback events
  - model + revision + tool version

---

## Observability

Track:

- op success rate by op type
- rollback rate
- stale revision conflicts
- mean apply latency
- average ops per request
- % requests requiring fallback patch/XML path

---

## Testing Strategy

### Unit

- op schema validation
- op-to-runtime mapping
- revision conflict handling
- rollback behavior

### Integration

- end-to-end apply with known fixture score
- stale revision + retry path
- sync after manual edit
- artifact creation and hash consistency

### E2E

- user prompt -> agent scoreops plan -> apply -> visible score mutation
- undo/redo across applied batch
- embed mode with proxy base

---

## Rollout Plan

### Phase A

- Introduce `scoreops` protocol contracts and session/revision handling.
- Keep current patch flow as fallback.

### Phase B

- Implement MVP op set and client executor.
- Agent routes edit intents to scoreops first.

### Phase C

- Add measure-diff summaries and richer inspect APIs.
- Decrease reliance on XML patch fallback.

---

## Relationship to Current Patch Flow

Current `music.patch` stays as a compatibility path.

Future routing policy:

1. Try `music.scoreops` for supported deterministic edits.
2. If unsupported, fallback to `music.patch`.
3. If patch is high risk/ambiguous, require user confirmation before apply.

This preserves momentum while moving to the intended deterministic architecture.
