# ScoreOps MVP Runbook

## What is implemented

- New service: `lib/music-services/scoreops-service.ts`
- Session state store: `lib/music-services/scoreops-session-store.ts`
- API routes:
  - `POST /api/music/scoreops/session/open`
  - `POST /api/music/scoreops/inspect`
  - `POST /api/music/scoreops/apply`
  - `POST /api/music/scoreops/sync`
- Agent router preference for edit prompts:
  - first: `music.scoreops`
  - fallback: `music.patch`
- Executor routing:
  - preferred executor can be requested per call via `options.preferredExecutor` (`auto|wasm|xml`)
  - `auto` attempts wasm execution first (unless disabled), then falls back to xml executor

## Implemented MVP operations

- `set_metadata_text`
- `set_key_signature`
- `set_time_signature`
- `set_clef`
- `delete_selection` (measure-range scoped)
- `insert_measures`
- `remove_measures`
- `delete_text_by_content` (bridge helper; useful for removing title text)

## Error model

Normalized error payload (all scoreops endpoints):

```json
{
  "ok": false,
  "error": {
    "code": "invalid_request|session_not_found|stale_revision|unsupported_op|invalid_scope|target_not_found|execution_failure",
    "message": "...",
    "details": {}
  }
}
```

## Local test commands

Run score/music service tests:

```bash
cd ~/workspace/OTS_Web
npm run test:music-services
```

Run only scoreops tests:

```bash
cd ~/workspace/OTS_Web
npx vitest run unit/scoreops-service.test.ts unit/scoreops-route.test.ts unit/music-agent-router.test.ts
```

Typecheck with higher memory (avoids common OOM on large Next worktrees):

```bash
cd ~/workspace/OTS_Web
npm run typecheck
```

## Manual API checks

Open session:

```bash
curl -sS -X POST http://localhost:3000/api/music/scoreops/session/open \
  -H 'Content-Type: application/json' \
  -d '{"content":"<?xml version=\"1.0\"?><score-partwise version=\"4.0\"><part-list><score-part id=\"P1\"><part-name>Piano</part-name></score-part></part-list><part id=\"P1\"><measure number=\"1\"><attributes><key><fifths>0</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>F</sign><line>4</line></clef></attributes><note><rest/><duration>4</duration><voice>1</voice><type>whole</type></note></measure></part></score-partwise>"}' | jq .
```

Apply ops:

```bash
curl -sS -X POST http://localhost:3000/api/music/scoreops/apply \
  -H 'Content-Type: application/json' \
  -d '{
    "scoreSessionId":"sess_xxx",
    "baseRevision":0,
    "ops":[
      {"op":"set_key_signature","fifths":1},
      {"op":"set_clef","clef":"treble"}
    ],
    "options":{"includeXml":true}
  }' | jq .
```

## Current limitations

- Executor is hybrid:
  - wasm mutation path for supported P0 operations
  - deterministic MusicXML transform fallback for unsupported/absent wasm methods
- Scope semantics are measure-oriented in MVP.
- Beaming/voicing/rest-normalization operations are not implemented yet.
- Prompt planner is heuristic (`heuristic-v2`): it decomposes multi-step prompts and reports unsupported steps, but does not perform deep semantic planning.
- `includePatch` currently uses:
  - op-derived patch emitters for supported ops (metadata/key/time/clef)
  - automatic measure-diff fallback when no deterministic emitter exists
- `executor` metadata in apply response reports selected path and fallback reason (if any).

## Recommended next steps

1. Add native selection/range primitives in webmscore for agent-safe measure/voice targeting.
2. Expand wasm-backed op coverage beyond P0 and reduce xml fallback frequency.
3. Harden planner with capability-aware op decomposition and explicit unsupported-step remediation hints.
