import { Agent, run, tool } from '@openai/agents';
import { z } from 'zod';
import { runMusicContextService } from '../music-services/context-service';
import { runMusicConvertService } from '../music-services/convert-service';
import { runMusicGenerateService } from '../music-services/generate-service';
import { runMusicPatchService } from '../music-services/patch-service';
import { runMusicScoreOpsPromptService, runMusicScoreOpsService } from '../music-services/scoreops-service';
import { type TraceContext } from '../trace-http';
import {
  MUSIC_CONTEXT_TOOL_CONTRACT,
  MUSIC_CONVERT_TOOL_CONTRACT,
  MUSIC_GENERATE_TOOL_CONTRACT,
  MUSIC_PATCH_TOOL_CONTRACT,
  MUSIC_SCOREOPS_TOOL_CONTRACT,
} from '../music-services/contracts';

type MusicAgentToolName = 'music.context' | 'music.convert' | 'music.generate' | 'music.scoreops' | 'music.patch';

type ToolDefaults = {
  context?: Record<string, unknown>;
  convert?: Record<string, unknown>;
  generate?: Record<string, unknown>;
  scoreops?: Record<string, unknown>;
  patch?: Record<string, unknown>;
};

type MusicAgentRunnerContext = {
  toolInput?: ToolDefaults;
  trace?: MusicAgentTraceContext;
};

type MusicAgentResult = {
  status: number;
  body: Record<string, unknown>;
};

type MusicAgentTraceLogLevel = 'info' | 'warn' | 'error';

type MusicAgentTraceContext = {
  traceId?: string;
  traceContext?: TraceContext;
  detailed?: boolean;
  log?: (level: MusicAgentTraceLogLevel, event: string, payload: Record<string, unknown>) => void;
};

type RunMusicAgentRouterOptions = {
  trace?: MusicAgentTraceContext;
};

const asRecord = (value: unknown): Record<string, unknown> | null => (
  value && typeof value === 'object' ? value as Record<string, unknown> : null
);

const DEFAULT_MODEL = (process.env.MUSIC_AGENT_MODEL || 'gpt-5.2').trim();

const AGENT_OUTPUT_SCHEMA = z.object({
  selectedTool: z.enum(['music.context', 'music.convert', 'music.generate', 'music.scoreops', 'music.patch']),
  toolStatus: z.number().int(),
  toolOk: z.boolean(),
  response: z.string(),
  error: z.string().nullable().optional(),
  result: z.string().nullable().optional().describe('JSON-encoded result object from the tool call'),
});

function mergeToolInput(
  defaults: Record<string, unknown> | undefined,
  input: unknown,
) {
  return {
    ...(defaults || {}),
    ...(asRecord(input) || {}),
  };
}

function traceLog(
  trace: MusicAgentTraceContext | undefined,
  event: string,
  payload: Record<string, unknown>,
  level: MusicAgentTraceLogLevel = 'info',
) {
  if (!trace?.detailed || !trace.log) {
    return;
  }
  trace.log(level, event, {
    ...(trace.traceId ? { traceId: trace.traceId } : {}),
    ...payload,
  });
}

function classifyPrompt(prompt: string): MusicAgentToolName {
  const normalized = prompt.toLowerCase();
  const isGenerate = /\b(generate|compose|write|create|new score|melody|variation)\b/.test(normalized);
  if (isGenerate) {
    return 'music.generate';
  }
  const isConvert = /\b(convert|conversion|abc|musicxml|xml)\b/.test(normalized)
    && (/\bto abc\b/.test(normalized) || /\bto musicxml\b/.test(normalized) || /\bto xml\b/.test(normalized));
  if (isConvert) {
    return 'music.convert';
  }
  const isPatch = /\b(change|edit|fix|remove|delete|move|transpose|revoice|beam|re-beam|rest|clef|key signature|time signature|patch|apply)\b/.test(normalized);
  if (isPatch) {
    return 'music.scoreops';
  }
  return 'music.context';
}

function extractPlannerDetails(scoreOpsBody: Record<string, unknown> | null) {
  const planner = asRecord(scoreOpsBody?.planner);
  const parsedOps = Array.isArray(planner?.parsedOps) ? planner.parsedOps : [];
  const supportedSteps = Array.isArray(planner?.supportedSteps) ? planner.supportedSteps : [];
  const unsupportedSteps = Array.isArray(planner?.unsupportedSteps) ? planner.unsupportedSteps : [];
  return {
    planner,
    parsedOps,
    supportedSteps,
    unsupportedSteps,
    hasSupportedPlan: parsedOps.length > 0 || supportedSteps.length > 0,
  };
}

async function runPatchFallback(
  prompt: string,
  patchDefaults: Record<string, unknown>,
  scoreOpsAttempt: unknown,
  reason: string,
  trace?: MusicAgentTraceContext,
): Promise<MusicAgentResult> {
  traceLog(trace, 'music_agent.patch_fallback.start', {
    reason,
  });
  const patchPayload = {
    ...patchDefaults,
    prompt: typeof patchDefaults.prompt === 'string' && patchDefaults.prompt.trim()
      ? patchDefaults.prompt
      : prompt,
  };
  const patchResult = trace?.traceContext
    ? await runMusicPatchService(patchPayload, { traceContext: trace.traceContext })
    : await runMusicPatchService(patchPayload);
  return {
    status: patchResult.status,
    body: {
      mode: 'fallback',
      selectedTool: 'music.patch',
      toolStatus: patchResult.status,
      toolOk: patchResult.status < 400,
      response: patchResult.status < 400
        ? 'Generated patch fallback after ScoreOps routing decision.'
        : 'ScoreOps routing and patch fallback both failed.',
      result: patchResult.body,
      scoreOpsAttempt,
      scoreOpsRouting: {
        reason,
        path: 'patch',
      },
    },
  };
}

async function runFallbackRouter(
  prompt: string,
  toolInput?: ToolDefaults,
  trace?: MusicAgentTraceContext,
): Promise<MusicAgentResult> {
  try {
    const selectedTool = classifyPrompt(prompt);
    traceLog(trace, 'music_agent.fallback.selected_tool', {
      selectedTool,
    });
  if (selectedTool === 'music.generate') {
    const generatePayload = {
      ...(toolInput?.generate || {}),
      dryRun: true,
      prompt: (toolInput?.generate?.prompt as string | undefined) || prompt,
    };
    const result = trace?.traceContext
      ? await runMusicGenerateService(generatePayload, { traceContext: trace.traceContext })
      : await runMusicGenerateService(generatePayload);
    return {
      status: result.status,
      body: {
        mode: 'fallback',
        selectedTool,
        toolStatus: result.status,
        toolOk: result.status < 400,
        response: result.status < 400
          ? 'Prepared generation request via fallback router.'
          : 'Generation request failed in fallback router.',
        result: result.body,
      },
    };
  }
  if (selectedTool === 'music.convert') {
    const result = await runMusicConvertService({
      ...(toolInput?.convert || {}),
    });
    return {
      status: result.status,
      body: {
        mode: 'fallback',
        selectedTool,
        toolStatus: result.status,
        toolOk: result.status < 400,
        response: result.status < 400
          ? 'Conversion completed via fallback router.'
          : 'Conversion failed in fallback router.',
        result: result.body,
      },
    };
  }
  if (selectedTool === 'music.patch') {
    const patchDefaults = {
      ...(toolInput?.patch || {}),
    };
    const contextDefaults = asRecord(toolInput?.context);
    if (!patchDefaults.content && typeof contextDefaults?.content === 'string') {
      patchDefaults.content = contextDefaults.content;
    }
    const patchPayload = {
      ...patchDefaults,
      prompt: typeof patchDefaults.prompt === 'string' && patchDefaults.prompt.trim()
        ? patchDefaults.prompt
        : prompt,
    };
    const result = trace?.traceContext
      ? await runMusicPatchService(patchPayload, { traceContext: trace.traceContext })
      : await runMusicPatchService(patchPayload);
    return {
      status: result.status,
      body: {
        mode: 'fallback',
        selectedTool,
        toolStatus: result.status,
        toolOk: result.status < 400,
        response: result.status < 400
          ? 'Patch generated via fallback router.'
          : 'Patch generation failed in fallback router.',
        result: result.body,
      },
    };
  }
  if (selectedTool === 'music.scoreops') {
    const scoreOpsDefaults = {
      ...(toolInput?.scoreops || {}),
    };
    const contextDefaults = asRecord(toolInput?.context);
    if (!scoreOpsDefaults.content && typeof contextDefaults?.content === 'string') {
      scoreOpsDefaults.content = contextDefaults.content;
    }

    // If ops array is provided (e.g., from a future UI), execute directly
    if (Array.isArray(scoreOpsDefaults.ops) && scoreOpsDefaults.ops.length > 0) {
      const directResult = await runMusicScoreOpsService({
        action: 'apply',
        scoreSessionId: scoreOpsDefaults.scoreSessionId,
        baseRevision: scoreOpsDefaults.baseRevision,
        inputArtifactId: scoreOpsDefaults.inputArtifactId || scoreOpsDefaults.input_artifact_id,
        content: scoreOpsDefaults.content || scoreOpsDefaults.text,
        ops: scoreOpsDefaults.ops,
        options: {
          atomic: true,
          includeXml: true,
          includeMeasureDiff: true,
          ...(scoreOpsDefaults.options || {}),
        },
      }, 'apply');
      return {
        status: directResult.status,
        body: {
          mode: 'fallback',
          selectedTool: 'music.scoreops',
          toolStatus: directResult.status,
          toolOk: directResult.status < 400,
          response: directResult.status < 400
            ? 'Score operations applied via direct ops execution.'
            : 'Direct ops execution failed.',
          result: directResult.body,
        },
      };
    }

    const scoreOpsPayload = {
      ...scoreOpsDefaults,
      prompt: typeof scoreOpsDefaults.prompt === 'string' && scoreOpsDefaults.prompt.trim()
        ? scoreOpsDefaults.prompt
        : prompt,
    };
    const scoreOpsResult = await runMusicScoreOpsPromptService(scoreOpsPayload);
    const scoreOpsBody = asRecord(scoreOpsResult.body);
    const {
      planner,
      parsedOps,
      unsupportedSteps,
      hasSupportedPlan,
    } = extractPlannerDetails(scoreOpsBody);
    traceLog(trace, 'music_agent.scoreops.initial_result', {
      status: scoreOpsResult.status,
      hasSupportedPlan,
      parsedOpsCount: parsedOps.length,
      unsupportedStepCount: unsupportedSteps.length,
    });

    if (scoreOpsResult.status < 400) {
      return {
        status: scoreOpsResult.status,
        body: {
          mode: 'fallback',
          selectedTool,
          toolStatus: scoreOpsResult.status,
          toolOk: true,
          response: unsupportedSteps.length
            ? 'Applied supported ScoreOps steps; some requested steps are not yet supported.'
            : 'Score operations applied via fallback router.',
          result: scoreOpsResult.body,
          scoreOpsRouting: {
            reason: unsupportedSteps.length ? 'partially_mappable' : 'fully_mappable',
            path: 'scoreops',
            unsupportedStepCount: unsupportedSteps.length,
          },
        },
      };
    }

    const patchDefaults = {
      ...(toolInput?.patch || {}),
    };
    if (!patchDefaults.content && typeof contextDefaults?.content === 'string') {
      patchDefaults.content = contextDefaults.content;
    }
    const error = asRecord(scoreOpsBody?.error);
    const errorCode = typeof error?.code === 'string' ? error.code : '';

    if (errorCode === 'unsupported_op' && !hasSupportedPlan) {
      return runPatchFallback(prompt, patchDefaults, scoreOpsResult.body, 'no_mappable_steps', trace);
    }

    if (hasSupportedPlan && parsedOps.length > 0) {
      traceLog(trace, 'music_agent.scoreops.retry_xml.start', {
        parsedOpsCount: parsedOps.length,
      });
      const retryResult = await runMusicScoreOpsService({
        action: 'apply',
        scoreSessionId: scoreOpsPayload.scoreSessionId,
        baseRevision: scoreOpsPayload.baseRevision,
        inputArtifactId: scoreOpsPayload.inputArtifactId,
        input_artifact_id: scoreOpsPayload.input_artifact_id,
        content: scoreOpsPayload.content,
        text: scoreOpsPayload.text,
        ops: parsedOps,
        options: {
          atomic: true,
          includeXml: true,
          includePatch: false,
          includeMeasureDiff: true,
          preferredExecutor: 'xml',
        },
      }, 'apply');
      traceLog(trace, 'music_agent.scoreops.retry_xml.result', {
        status: retryResult.status,
      });

      if (retryResult.status < 400) {
        return {
          status: retryResult.status,
          body: {
            mode: 'fallback',
            selectedTool: 'music.scoreops',
            toolStatus: retryResult.status,
            toolOk: true,
            response: 'Recovered ScoreOps execution via xml executor retry.',
            result: {
              ok: true,
              mode: 'scoreops-retry',
              planner,
              execution: retryResult.body,
            },
            scoreOpsRouting: {
              reason: 'execution_failed_after_plan_retry_success',
              path: 'scoreops',
            },
            scoreOpsAttempt: scoreOpsResult.body,
          },
        };
      }

      return runPatchFallback(prompt, patchDefaults, {
        initial: scoreOpsResult.body,
        retry: retryResult.body,
      }, 'execution_failed_after_plan_retry_failed', trace);
    }

    return runPatchFallback(prompt, patchDefaults, scoreOpsResult.body, 'scoreops_failed_no_recoverable_plan', trace);
  }
  const result = await runMusicContextService({
    ...(toolInput?.context || {}),
  });
  return {
    status: result.status,
    body: {
      mode: 'fallback',
      selectedTool,
      toolStatus: result.status,
      toolOk: result.status < 400,
      response: result.status < 400
        ? 'Context extracted via fallback router.'
        : 'Context extraction failed in fallback router.',
      result: result.body,
    },
  };
  } catch (error) {
    traceLog(trace, 'music_agent.fallback.exception', {
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
    }, 'error');
    return {
      status: 500,
      body: {
        mode: 'fallback',
        error: error instanceof Error ? error.message : 'Fallback router failed.',
      },
    };
  }
}

function createMusicRouterAgent() {
  const musicContextTool = tool({
    name: MUSIC_CONTEXT_TOOL_CONTRACT.name,
    description: MUSIC_CONTEXT_TOOL_CONTRACT.description,
    parameters: MUSIC_CONTEXT_TOOL_CONTRACT.inputSchema,
    strict: false,
    execute: async (input, runContext) => {
      const defaults = (runContext?.context as MusicAgentRunnerContext | undefined)?.toolInput?.context;
      const payload = mergeToolInput(defaults, input);
      const result = await runMusicContextService(payload);
      return {
        tool: 'music.context',
        status: result.status,
        ok: result.status < 400,
        body: result.body,
      };
    },
  });

  const musicConvertTool = tool({
    name: MUSIC_CONVERT_TOOL_CONTRACT.name,
    description: MUSIC_CONVERT_TOOL_CONTRACT.description,
    parameters: MUSIC_CONVERT_TOOL_CONTRACT.inputSchema,
    strict: false,
    execute: async (input, runContext) => {
      const defaults = (runContext?.context as MusicAgentRunnerContext | undefined)?.toolInput?.convert;
      const payload = mergeToolInput(defaults, input);
      const result = await runMusicConvertService(payload);
      return {
        tool: 'music.convert',
        status: result.status,
        ok: result.status < 400,
        body: result.body,
      };
    },
  });

  const musicGenerateTool = tool({
    name: MUSIC_GENERATE_TOOL_CONTRACT.name,
    description: MUSIC_GENERATE_TOOL_CONTRACT.description,
    parameters: MUSIC_GENERATE_TOOL_CONTRACT.inputSchema,
    strict: false,
    execute: async (input, runContext) => {
      const defaults = (runContext?.context as MusicAgentRunnerContext | undefined)?.toolInput?.generate;
      const payload = mergeToolInput(defaults, input);
      const result = trace?.traceContext
        ? await runMusicGenerateService(payload, { traceContext: trace.traceContext })
        : await runMusicGenerateService(payload);
      return {
        tool: 'music.generate',
        status: result.status,
        ok: result.status < 400,
        body: result.body,
      };
    },
  });

  const musicPatchTool = tool({
    name: MUSIC_PATCH_TOOL_CONTRACT.name,
    description: MUSIC_PATCH_TOOL_CONTRACT.description,
    parameters: MUSIC_PATCH_TOOL_CONTRACT.inputSchema,
    strict: false,
    execute: async (input, runContext) => {
      const defaults = (runContext?.context as MusicAgentRunnerContext | undefined)?.toolInput?.patch;
      const payload = mergeToolInput(defaults, input);
      const result = trace?.traceContext
        ? await runMusicPatchService(payload, { traceContext: trace.traceContext })
        : await runMusicPatchService(payload);
      return {
        tool: 'music.patch',
        status: result.status,
        ok: result.status < 400,
        body: result.body,
      };
    },
  });

  const musicScoreOpsTool = tool({
    name: MUSIC_SCOREOPS_TOOL_CONTRACT.name,
    description: MUSIC_SCOREOPS_TOOL_CONTRACT.description,
    parameters: MUSIC_SCOREOPS_TOOL_CONTRACT.inputSchema,
    strict: false,
    execute: async (input, runContext) => {
      const defaults = (runContext?.context as MusicAgentRunnerContext | undefined)?.toolInput?.scoreops;
      const payload = mergeToolInput(defaults, input);
      const contextDefaults = (runContext?.context as MusicAgentRunnerContext | undefined)?.toolInput?.context;
      if (!payload.content && typeof contextDefaults?.content === 'string') {
        payload.content = contextDefaults.content;
      }

      // If agent provided structured ops, execute directly (skip regex parsing)
      if (Array.isArray(payload.ops) && payload.ops.length > 0) {
        const toolTrace = (runContext?.context as MusicAgentRunnerContext | undefined)?.trace;
        if (toolTrace) {
          traceLog(toolTrace, 'music_agent.scoreops.direct_ops', {
            opCount: payload.ops.length,
            hasContent: Boolean(payload.content || payload.text),
          });
        }
        const result = await runMusicScoreOpsService({
          action: 'apply',
          scoreSessionId: payload.scoreSessionId,
          baseRevision: payload.baseRevision,
          inputArtifactId: payload.inputArtifactId || payload.input_artifact_id,
          content: payload.content || payload.text,
          ops: payload.ops,
          options: {
            ...(payload.options || {}),
            atomic: true,
            includeXml: true,
            includeMeasureDiff: true,
          },
        }, 'apply');
        if (toolTrace) {
          traceLog(toolTrace, 'music_agent.scoreops.direct_ops.result', {
            status: result.status,
            hasOutput: Boolean(result.body?.output?.content),
            bodyKeys: Object.keys(result.body || {}),
          });
        }
        return { tool: 'music.scoreops', status: result.status, ok: result.status < 400, body: result.body };
      }

      // Fallback to prompt-based parsing
      const result = await runMusicScoreOpsPromptService(payload);
      return { tool: 'music.scoreops', status: result.status, ok: result.status < 400, body: result.body };
    },
  });

  return new Agent({
    name: 'MusicRouter',
    model: DEFAULT_MODEL,
    instructions: [
      'You are a music workflow router.',
      'Choose exactly one tool based on the user request:',
      '- music.context: score context extraction and analysis prep. Call this first when you need to see the score content to answer questions or determine properties like key signature.',
      '- music.convert: format conversion between MusicXML and ABC.',
      '- music.generate: generation/composition requests.',
      '- music.scoreops: deterministic score editing with typed operations.',
      '- music.patch: score edit requests that should produce a musicxml-patch@1 payload.',
      '',
      'When you need to analyze the score (e.g., determine current key signature from notes), call music.context first.',
      'After receiving context, if you need to make changes, call music.scoreops in a second step.',
      '',
      'Prefer music.scoreops for editing requests. When using music.scoreops, produce structured ops when possible:',
      '  Key signature: { op: "set_key_signature", fifths: <-7..7> }  (C=0, G=1, D=2, F=-1, Bb=-2, etc.)',
      '  Time signature: { op: "set_time_signature", numerator: N, denominator: N }',
      '  Clef: { op: "set_clef", clef: "treble|bass|alto|tenor" }',
      '  Metadata: { op: "set_metadata_text", field: "title|subtitle|composer|lyricist", value: "..." }',
      '  Delete text: { op: "delete_text_by_content", text: "...", maxDeletes: 20 }',
      '  Transpose: { op: "transpose_selection", semitones: N, scope?: { measureStart, measureEnd } }',
      '  Insert measures: { op: "insert_measures", count: N, target: "start|end|after_measure" }',
      '  Remove measures: { op: "remove_measures", scope: { measureStart, measureEnd } }',
      '  Tempo: { op: "add_tempo_marking", bpm: N }',
      '  Dynamic: { op: "add_dynamic", dynamic: "pp|p|mp|mf|f|ff|..." }',
      '  Insert text: { op: "insert_text", kind: "staff|system|expression|lyric|harmony", text: "..." }',
      '  Accidental: { op: "set_accidental", accidental: "sharp|flat|natural|double-sharp|double-flat" }',
      '  Duration: { op: "set_duration", durationType: "whole|half|quarter|eighth|16th|..." }',
      '  Voice: { op: "set_voice", voice: 1-4 }',
      '  Layout break: { op: "set_layout_break", breakType: "line|page", enabled: true }',
      '  Repeat markers: { op: "set_repeat_markers", start?: true, end?: true }',
      '  Undo/redo: { op: "history_step", steps: N }  (positive for redo, negative for undo)',
      '',
      'If the edit cannot be expressed as structured ops, pass the prompt text and ScoreOps will attempt parsing.',
      'Use music.patch only when the edit is too complex for ScoreOps ops.',
      'Call one tool first, inspect its result, then produce final output using the required schema.',
      'CRITICAL: Always include the full tool result in the `result` field as a JSON string.',
      'The `result` field must contain JSON.stringify() of the exact tool output: { tool: "music.scoreops", status: number, ok: boolean, body: {...} }.',
      'Keep response concise and mention why the selected tool was chosen.',
    ].join('\n'),
    tools: [musicContextTool, musicConvertTool, musicGenerateTool, musicScoreOpsTool, musicPatchTool],
    outputType: AGENT_OUTPUT_SCHEMA,
  });
}

export async function runMusicAgentRouter(
  body: unknown,
  options?: RunMusicAgentRouterOptions,
): Promise<MusicAgentResult> {
  const trace = options?.trace;
  const data = asRecord(body);
  const prompt = typeof data?.prompt === 'string' ? data.prompt.trim() : '';
  traceLog(trace, 'music_agent.router.start', {
    hasPrompt: Boolean(prompt),
    promptLength: prompt.length,
    hasToolInput: Boolean(data?.toolInput),
    useFallbackOnly: Boolean(data?.useFallbackOnly),
  });
  if (!prompt) {
    traceLog(trace, 'music_agent.router.invalid_request', {
      reason: 'missing_prompt',
    }, 'warn');
    return {
      status: 400,
      body: { error: 'Missing prompt for music agent router.' },
    };
  }

  const toolInput = asRecord(data?.toolInput) as ToolDefaults | null;
  const useFallbackOnly = Boolean(data?.useFallbackOnly);
  // Accept API key from request body (similar to patch-service.ts) or environment
  const requestApiKey = (typeof data?.apiKey === 'string'
    ? data.apiKey
    : (typeof data?.api_key === 'string' ? data.api_key : '')).trim();
  const envApiKey = (process.env.OPENAI_API_KEY || '').trim();
  const openaiApiKey = requestApiKey || envApiKey;

  if (useFallbackOnly || !openaiApiKey) {
    try {
      const fallbackResult = await runFallbackRouter(prompt, toolInput || undefined, trace);
      traceLog(trace, 'music_agent.router.fallback.complete', {
        status: fallbackResult.status,
        selectedTool: (fallbackResult.body.selectedTool as string | undefined) || null,
      });
      return fallbackResult;
    } catch (error) {
      traceLog(trace, 'music_agent.router.fallback.error', {
        message: error instanceof Error ? error.message : 'Fallback music router failed.',
      }, 'error');
      return {
        status: 500,
        body: {
          error: error instanceof Error ? error.message : 'Fallback music router failed.',
          mode: 'fallback',
        },
      };
    }
  }

  // If using request-provided API key, temporarily set it for the Agents SDK
  const priorApiKey = process.env.OPENAI_API_KEY;
  if (requestApiKey) {
    process.env.OPENAI_API_KEY = requestApiKey;
  }

  const requestedModel = typeof data?.model === 'string' ? data.model.trim() : '';
  const maxTurnsRaw = Number(data?.maxTurns);
  const maxTurns = Number.isFinite(maxTurnsRaw) && maxTurnsRaw > 0 ? Math.floor(maxTurnsRaw) : 6;
  traceLog(trace, 'music_agent.router.agents_sdk.start', {
    model: requestedModel || DEFAULT_MODEL,
    maxTurns,
  });
  const agent = createMusicRouterAgent();
  if (requestedModel) {
    agent.model = requestedModel;
  }

  try {
    const result = await run(agent, prompt, {
      maxTurns,
      context: {
        toolInput: toolInput || undefined,
        trace,
      } satisfies MusicAgentRunnerContext,
    });

    const finalOutput = asRecord(result.finalOutput);
    if (!finalOutput) {
      traceLog(trace, 'music_agent.router.agents_sdk.invalid_output', {
        reason: 'missing_structured_output',
      }, 'warn');
      return {
        status: 502,
        body: {
          error: 'MusicRouter did not return structured output.',
          mode: 'agents-sdk',
        },
      };
    }

    traceLog(trace, 'music_agent.router.agents_sdk.complete', {
      status: 200,
      selectedTool: (finalOutput.selectedTool as string | undefined) || null,
    });
    return {
      status: 200,
      body: {
        mode: 'agents-sdk',
        model: requestedModel || DEFAULT_MODEL,
        ...finalOutput,
      },
    };
  } catch (error) {
    traceLog(trace, 'music_agent.router.agents_sdk.error', {
      message: error instanceof Error ? error.message : 'Music agent router failed.',
    }, 'error');
    return {
      status: 500,
      body: {
        error: error instanceof Error ? error.message : 'Music agent router failed.',
        mode: 'agents-sdk',
      },
    };
  } finally {
    // Restore original API key
    if (requestApiKey) {
      if (priorApiKey !== undefined) {
        process.env.OPENAI_API_KEY = priorApiKey;
      } else {
        delete process.env.OPENAI_API_KEY;
      }
    }
  }
}
