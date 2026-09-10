# AI Model Capability Registry Runbook

## Purpose

The editor uses a source-controlled capability registry plus live provider metadata to decide which model-specific controls and context attachments are safe to offer. The registry is immutable at runtime. Provider discovery enriches it for 15 minutes in process memory; request failures never permanently rewrite it.

The registry lives at `lib/ai-model-capabilities/registry.json`. Resolution and validation live under `lib/ai-model-capabilities/`.

## Routine Audit

Validate the registry without making network calls:

```bash
npm run audit:ai-models
```

The command exits nonzero for malformed rules or provider request failures. Missing API keys are reported as skipped and do not fail the audit.

To query providers, set only the keys available to you:

```bash
OPENAI_API_KEY=... \
ANTHROPIC_API_KEY=... \
GEMINI_API_KEY=... \
XAI_API_KEY=... \
DEEPSEEK_API_KEY=... \
KIMI_API_KEY=... \
npm run audit:ai-models
```

Aliases accepted by the script are `GOOGLE_API_KEY`, `GROK_API_KEY`, and `MOONSHOT_API_KEY`. Keys are read from the environment and are never printed or written.

Limit a run or produce machine-readable output:

```bash
npm run audit:ai-models -- --provider=gemini
npm run audit:ai-models -- --json
```

## Interpreting Results

- `UNMATCHED` means the provider returned a model ID that has no reviewed registry rule. It is not automatically an error: the editor treats unconfirmed features conservatively.
- A matched model inherits its family and exact-model rules in file order. Later rules override only fields they declare.
- Gemini, Anthropic, xAI, and Kimi responses can add provider-advertised limits, capability flags, or modalities at runtime. OpenAI and DeepSeek model-list responses currently provide little beyond identity.
- An absent model is not proof of deprecation. Availability can vary by API key, account, region, and rollout.

## Updating the Registry

1. Run the audit and identify an unmatched model or a changed provider behavior.
2. Read the provider's official model and request documentation. Do not infer capabilities from a model name alone.
3. Prefer a narrow family rule when the provider documents a family-wide contract. Use an exact-model rule for exceptions.
   Write the pattern so it survives a point release: an exact `^claude-fable-5$` does not match `claude-fable-5-1`, and a
   model that matches no rule resolves to `unknown`, which makes the editor refuse image, PDF and max-output requests
   against it. That is how Fable 5.1 and GPT-6 reached production unusable. Reserve exact matches for a genuine exception,
   and let it declare only the fields that differ.
4. Declare only confirmed fields. Omitted fields resolve to `unknown`; do not use `supported` as a default.
5. Add an official HTTPS evidence URL, the review date, and a note when the rule is intentionally conservative.
6. Increment the registry version using `YYYY-MM-DD.N`.
7. Run the audit, focused unit tests, and typecheck.
8. Submit the change for review. The audit script reports candidates but never edits or commits the registry.

Recommended verification:

```bash
npm run audit:ai-models
npx vitest run unit/ai-model-capabilities.test.ts
npm run typecheck
```

## Runtime Failure Feedback

When a provider clearly rejects an optional parameter, log only audit-safe fields: provider, model ID, parameter name, normalized error class, and registry version. Never log API keys, prompts, score content, attachments, or raw provider responses.

A request may retry once after removing an optional parameter only when the provider explicitly identifies that parameter as unsupported. Do not retry authentication, authorization, rate-limit, token-limit, content-policy, or ambiguous failures. Runtime observations should lead to a reviewed registry change; they must not mutate `registry.json`.

## Rollback

Revert the registry or resolver change and redeploy. Because proposal/session audit records include the registry version, proposals made before the rollback remain attributable to the capability snapshot used at generation time.
