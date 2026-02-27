# Music AI Specialists Plan

Docs prepared after reviewing local repos:

- `~/workspace/weavemuse`
- `~/workspace/NotaGen`
- `~/workspace/ChatMusician` (benchmark reference only; no longer the recommended production reasoning model)

Files:

- `docs/music-ai-specialists/repo-review.md`: what each repo already does and immediate implications
- `docs/music-ai-specialists/integration-design.md`: proposed specialist-agent architecture, `weavemuse` orchestration, WASM `ScoreOps` tool, user-selected BYO-key frontier reasoning model support, first-class LLM provider expansion, and score conversion pipeline
- `docs/music-ai-specialists/roadmap.md`: phased plan for conversion reliability, specialist rollout, first-class provider expansion (chat + patch generation), WASM score-edit guardrails, versioning, evals, and fine-tuning
- `docs/music-ai-specialists/embed-proxy-deployment-plan.md`: recommended deployment topology for embed mode (static editor in OurTextScores + companion OTS Editor API proxy for `/api/llm/*` and `/api/music/*`)
