# music21 Agent Extension Options (March 5, 2026)

## 1. Objective

Compare three ways to expose deeper `music21` functionality to the OTS agent stack:

1. curated deterministic tools
2. a dedicated task-based `music21` sub-agent
3. a sandboxed code-execution `music21` analysis lab

The goal is to separate:

- production-safe agent capabilities
- advanced analysis flexibility
- true arbitrary-code execution

These are not the same thing and should not be evaluated as one binary choice.

## 2. Current Baseline

Current OTS architecture already has the following relevant pieces:

- deterministic service endpoints for analysis and transformation
- an agent router with a curated tool surface
- a UI that can preview and explicitly apply score mutations
- Python helper patterns for `music21` analysis

That means the question is not whether OTS can run `music21`.

It already can.

The question is what capability boundary should exist between:

- the main agent
- analysis logic
- user-controlled execution power

## 3. Option A: Curated Deterministic Tools

### Definition

Expose only fixed, schema-driven services to the agent, for example:

- `music.harmony_analyze`
- `music.functional_harmony_analyze`

The agent can choose these tools, inspect results, and optionally surface explicit apply actions to the user.

### Example user requests handled well

- "Add chord symbols to this score."
- "Analyze the harmony in this passage."
- "Insert Roman numerals."
- "Find likely modulations."

### Strengths

- lowest security risk
- strongest observability
- clear request/response contracts
- deterministic logging and provenance
- easy to test and regression-check
- easiest to support in the UI
- straightforward to expose through agent mode, MCP, or specialists

### Weaknesses

- every new analysis capability must be productized first
- less flexible for exploratory musicology tasks
- slower iteration when analysts want bespoke workflows

### Operational profile

- simple
- consistent with current OTS architecture
- production-safe by default

### Best use

- default user-facing production capabilities

## 4. Option B: Dedicated Task-Based music21 Sub-Agent

### Definition

Introduce a second agent or specialist that owns a dedicated `music21` runtime, but it does **not** accept arbitrary Python code.

Instead, it accepts structured analysis intents such as:

- `derive_roman_numerals`
- `find_modulations`
- `extract_cadence_candidates`
- `compare_phrase_harmony`
- `summarize_key_trajectory`
- `annotate_score_with_function_labels`

The main agent delegates difficult theory or analysis tasks to this sub-agent, which returns structured analysis results and optional artifacts.

### Conceptual flow

1. main agent receives a request
2. main agent determines this is a specialized harmonic-analysis task
3. main agent calls `music.analysis_subagent`
4. sub-agent runs inside a dedicated Python environment with `music21`
5. sub-agent returns:
   - summary
   - warnings
   - structured analysis
   - optional annotated MusicXML
   - optional sidecar artifacts
6. main agent explains results or offers apply actions

### Strengths

- much more expressive than curated fixed tools
- no raw arbitrary code execution required
- better separation of concerns than letting the main agent directly call low-level helpers
- easier to evolve analysis features without constantly expanding top-level router instructions
- still gives product control over allowed task classes

### Weaknesses

- more complexity than curated tools
- requires a second planning/execution surface
- prompts and task schemas must still be designed carefully
- less deterministic than fully fixed tools
- harder to regression-test than narrow endpoints

### Security profile

- materially safer than arbitrary code execution
- still needs isolation if the sub-agent has broad filesystem or runtime access
- safer if implemented as a dedicated service/container with no ambient access to the main app runtime

### Operational profile

- moderate complexity
- likely worth it if OTS wants richer analysis without opening code execution

### Best use

- advanced harmonic-analysis workflows
- power-user / research-facing analysis that is still product-supported

## 5. Option C: Sandboxed Code-Execution music21 Lab

### Definition

Allow the agent, or a dedicated analysis agent, to generate Python code that runs against a restricted environment containing:

- `music21`
- possibly helper libraries
- a score artifact mounted as input

This is the most powerful option.

It is also the highest-risk option.

### Important distinction

This is **not** just "run Python with some restrictions".

It only becomes credible if execution happens inside a real isolated environment such as:

- a dedicated container
- a microVM
- a hardened sandbox service

Python-level restrictions alone are not an adequate security boundary.

### Strengths

- maximum flexibility
- fastest way to explore custom analyses
- best fit for research questions that do not justify productizing a dedicated tool
- can support bespoke workflows that the current product does not yet know about

### Weaknesses

- highest security risk
- highest operational complexity
- weakest reproducibility unless heavily instrumented
- easiest place for latency, memory, and timeout failures
- highest prompt-injection blast radius
- hardest to debug and support as a user-facing feature

### Security risks

Without strong isolation, arbitrary code execution can lead to:

- filesystem access to unintended data
- environment/secret exposure
- network exfiltration
- subprocess abuse
- dependency abuse
- denial of service by CPU/memory exhaustion

### Minimum viable isolation requirements

If OTS ever does this, the minimum acceptable posture is:

- separate execution service, not in-process with the Next app
- no network egress by default
- read-only root filesystem
- ephemeral writable workspace only
- strict CPU, memory, and wall-clock limits
- dropped Linux capabilities
- seccomp or equivalent syscall restrictions
- no host mounts except explicit input artifacts
- full provenance: prompt, generated code, inputs, outputs, timing, exit reason
- forced cleanup after each run
- feature flag or privileged access tier

### Best use

- admin-only analysis lab
- internal research
- carefully gated power-user workflow

It is not the right first production surface.

## 6. Risk Comparison

### 6.1 Security

- Curated tools: low
- Task-based sub-agent: medium
- Code-exec lab: high unless strongly sandboxed

### 6.2 Product stability

- Curated tools: high
- Task-based sub-agent: medium-high
- Code-exec lab: low-medium

### 6.3 Flexibility

- Curated tools: low-medium
- Task-based sub-agent: high
- Code-exec lab: very high

### 6.4 Observability / supportability

- Curated tools: high
- Task-based sub-agent: medium
- Code-exec lab: low unless heavily instrumented

### 6.5 Time to ship safely

- Curated tools: fastest
- Task-based sub-agent: moderate
- Code-exec lab: slowest

## 7. Can the Risks of Arbitrary Python Be Mitigated?

Yes, but only with real isolation.

What does **not** count as a sufficient mitigation:

- filtering imports in prompt text
- blocking a few builtins
- AST checks alone
- running `exec()` in the same process and hoping prompt discipline is enough

What **does** count:

- an isolated execution boundary with OS/container controls
- no ambient credentials
- no network by default
- strict resource limits
- durable audit trail

So the answer is:

- yes, the risks can be mitigated
- no, they cannot be responsibly mitigated by "just sandboxing Python a bit" inside the current app runtime

## 8. Recommended Architecture

Recommendation:

### Tier 1: production

Use curated deterministic tools as the default exposed surface.

Reason:

- safest
- easiest to support
- already aligned with OTS patterns

### Tier 2: advanced analysis

Add a dedicated task-based `music21` sub-agent.

Reason:

- provides substantial flexibility beyond fixed tools
- avoids opening arbitrary code execution
- can still be isolated and observed as a service boundary

### Tier 3: research lab

Only later, and only if truly needed, add a sandboxed code-exec analysis lab.

Reason:

- this is a different trust model
- best treated as research/admin capability, not general user-facing agent behavior

## 9. Recommended Sub-Agent Design

If OTS wants the more powerful middle path, the next design target should be:

- `music.analysis_subagent`

### Responsibilities

- accept a bounded analysis goal
- retrieve the score artifact or session-backed MusicXML
- run one or more approved `music21` workflows
- return structured results plus optional artifacts

### Allowed task families

Examples:

- harmonic analysis
- cadence extraction
- key-region segmentation
- phrase-level comparison
- voice-leading diagnostics
- chord inventory / pitch-class summaries
- measure-range specific queries

### Disallowed in v1

- arbitrary Python source text from the model
- unrestricted file access
- arbitrary package installation
- arbitrary subprocess execution
- unrestricted network access

### Interface sketch

```json
{
  "task": "find_modulations",
  "scoreSessionId": "...",
  "options": {
    "measureStart": 1,
    "measureEnd": 64,
    "includeAnnotatedXml": true
  }
}
```

Response sketch:

```json
{
  "ok": true,
  "engine": "music21-subagent",
  "summary": {
    "modulationCount": 3,
    "coverage": 0.94
  },
  "result": {
    "regions": [],
    "warnings": []
  },
  "artifacts": {
    "annotatedXml": null,
    "json": null
  }
}
```

## 10. Integration with the Main Agent

If the sub-agent route is chosen, the main agent should not see raw low-level Python details.

The main agent should see a single curated tool such as:

- `music.analysis_subagent`

The sub-agent itself can internally decide whether to use:

- fixed `music21` workflows
- multiple helper passes
- later, an alternate backend like `AugmentedNet`

This preserves a clean outer contract while keeping inner implementation flexible.

## 11. Recommendation Summary

If the question is "what should OTS ship first?"

Answer:

1. curated deterministic tools
2. then a task-based `music21` sub-agent if more flexibility is needed
3. only then consider sandboxed arbitrary code execution

If the question is "can arbitrary Python be made safe enough?"

Answer:

- partially, yes
- but only with real sandbox/service isolation
- and even then it should be treated as a different capability tier, not just a more powerful version of the same tool

## 12. Proposed Next Step

If OTS wants to explore the more powerful path without overcommitting to arbitrary code execution, the next design/implementation target should be:

- a task-based `music21` analysis sub-agent service

That gives most of the practical upside while avoiding most of the code-exec risk.
