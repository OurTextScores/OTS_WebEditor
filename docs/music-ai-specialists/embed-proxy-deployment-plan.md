# Embed Proxy Deployment Plan (OTS Web + OurTextScores)

## Decision Summary

Use a **companion OTS Editor API service** for embed deployments.

- Keep the OTS editor UI as a static embed build (`/score-editor/*`) hosted by `OurTextScores`
- Deploy a separate **server runtime** (owned by `OTS_Web`) for:
  - `/api/llm/*`
  - `/api/music/*`
- Expose it to the browser through **same-origin reverse proxy paths** in `OurTextScores` (Nginx)

## Why this is the recommended structure

- `MusicXML <-> ABC` conversion, artifact persistence, roundtrip validation, and render smoke tests require server-side tooling.
- MusicXML context extraction (`/api/music/context`) for agent prompts requires server-side artifact access and bounded extraction logic.
- `MusicReasoningSpecialist` (frontier BYO model routes) and `NotaGen` specialist routes also require a server (key handling, artifact orchestration, conversion pipeline).
- Static embed builds cannot run Next `app/api/*` routes.
- `OurTextScores` already uses Docker + Nginx reverse proxy with localhost-bound services, which matches this pattern well.

## Recommended Topology

### Browser / OurTextScores frontend

- Loads static editor iframe from `https://www.ourtextscores.com/score-editor/`
- Calls same-origin proxy paths:
  - `/api/score-editor/llm/*`
  - `/api/score-editor/music/*`

### OurTextScores reverse proxy (Nginx)

- Routes those prefixes to a separate OTS Editor API container (localhost-bound)

### OTS Editor API service (Docker container)

- Runs `OTS_Web` server runtime (initially Next.js Node runtime)
- Hosts:
  - `/api/llm/*`
  - `/api/music/*`
- Has toolchain dependencies for music conversion/validation:
  - Python + NotaGen scripts
  - `abc2midi`
  - MuseScore CLI (for optional render smoke tests)

## Service placement: same repo, separate container

This does **not** require a new repo yet.

- Keep API code and contracts in `OTS_Web` while the surface is still evolving
- Deploy it as a distinct service/container in the existing `OurTextScores` VPS stack

This preserves:

- fast iteration in one repo
- clean operational boundary (separate container/process)
- future ability to extract to a dedicated service later if needed

## Path and Env Conventions (recommended)

### Browser-facing (same-origin on OurTextScores)

- `/api/score-editor/llm/*` -> OTS Editor API `/api/llm/*`
- `/api/score-editor/music/*` -> OTS Editor API `/api/music/*`

### OTS embed client env

Use a single API base for both LLM and music routes (recommended):

- `NEXT_PUBLIC_SCORE_EDITOR_API_BASE=/api/score-editor`

This avoids separate per-feature proxy envs and keeps embed routing simple.

## Notes on direct browser fallbacks

- Some general LLM providers can work browser-direct in non-embed contexts.
- `Claude/Anthropic` generally requires a proxy due to CORS.
- **`/api/music/*` has no browser-direct fallback** in practice because it depends on server-side conversion/artifact logic.

## Deployment Phasing

### Phase 1 (ship now)

- Run OTS Editor API as a Next.js Node server container
- Reverse-proxy via OurTextScores Nginx
- Reuse current `app/api/llm/*` and `app/api/music/*` routes

### Phase 2 (optional later)

Extract to a dedicated Node service (Express/Fastify) if needed for:

- job queue integration
- independent scaling
- stronger observability / worker separation
- reduced Next runtime coupling

## Operational Notes

- Bind service port to `127.0.0.1` and expose through Nginx only
- Configure route-specific timeouts for `/api/score-editor/music/*` (longer than normal API routes)
- Rate-limit AI/music routes separately from core app routes
- Do not log BYO Hugging Face tokens
- Prefer a mounted artifact volume over ephemeral `/tmp` if you want cross-restart artifact continuity
