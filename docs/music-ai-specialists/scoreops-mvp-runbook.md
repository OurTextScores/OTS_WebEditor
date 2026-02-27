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

- Executor is currently a deterministic **MusicXML string transformer** (not direct in-memory webmscore mutation calls).
- Scope semantics are measure-oriented in MVP.
- Beaming/voicing/rest-normalization operations are not implemented yet.
- `includePatch` currently returns placeholder normalization, not a full structural XML diff.

## Recommended next steps

1. Add native selection/range primitives in webmscore for agent-safe measure/voice targeting.
2. Move executor from string transforms to direct wasm mutation wrappers where available.
3. Implement true normalized diff/patch generation for audit/export.
