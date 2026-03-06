import { Agent, run, tool, type AgentInputItem, type Model } from '@openai/agents';
import { aisdk } from '@openai/agents-extensions';
import { OpenAIResponsesModel } from '@openai/agents-openai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { OpenAI } from 'openai';
import { z } from 'zod';
import { runMusicContextService } from '../music-services/context-service';
import { runMusicConvertService } from '../music-services/convert-service';
import { runDiffFeedbackService } from '../music-services/diff-feedback-service';
import { runFunctionalHarmonyAnalyzeService } from '../music-services/functional-harmony-service';
import { runMusicGenerateService } from '../music-services/generate-service';
import { runHarmonyAnalyzeService } from '../music-services/harmony-service';
import { runMusicPatchService } from '../music-services/patch-service';
import { runMusicRenderService } from '../music-services/render-service';
import { runMusicScoreOpsPromptService, runMusicScoreOpsService } from '../music-services/scoreops-service';
import { type TraceContext } from '../trace-http';
import {
  MUSIC_CONTEXT_TOOL_CONTRACT,
  MUSIC_CONVERT_TOOL_CONTRACT,
  MUSIC_DIFF_FEEDBACK_TOOL_CONTRACT,
  MUSIC_FUNCTIONAL_HARMONY_ANALYZE_TOOL_CONTRACT,
  MUSIC_GENERATE_TOOL_CONTRACT,
  MUSIC_HARMONY_ANALYZE_TOOL_CONTRACT,
  MUSIC_PATCH_TOOL_CONTRACT,
  MUSIC_SCOREOPS_TOOL_CONTRACT,
  MUSIC_RENDER_TOOL_CONTRACT,
} from '../music-services/contracts';
import { normalizeScoreSessionId } from '../music-services/common';

type MusicAgentToolName =
  | 'music.context'
  | 'music.convert'
  | 'music.diff_feedback'
  | 'music.functional_harmony_analyze'
  | 'music.generate'
  | 'music.harmony_analyze'
  | 'music.scoreops'
  | 'music.patch'
  | 'music.render';

type ToolDefaults = {
  context?: Record<string, unknown>;
  convert?: Record<string, unknown>;
  diff_feedback?: Record<string, unknown>;
  functional_harmony_analyze?: Record<string, unknown>;
  generate?: Record<string, unknown>;
  harmony_analyze?: Record<string, unknown>;
  scoreops?: Record<string, unknown>;
  patch?: Record<string, unknown>;
  render?: Record<string, unknown>;
};

type MusicAgentRunnerContext = {
  toolInput?: ToolDefaults;
  trace?: MusicAgentTraceContext;
  /** Stores the full (unsummarized) result of the last tool call for injection into final output */
  lastToolResult?: Record<string, unknown>;
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

/**
 * Creates a scoped model instance tied to a specific API key.
 * This avoids mutating process.env globally.
 */
function getModelForRequest(provider: string, apiKey: string, modelName: string): Model {
  if (provider === 'anthropic') {
    const client = createAnthropic({ apiKey });
    return aisdk(client(modelName));
  }
  if (provider === 'openai') {
    const client = new OpenAI({ apiKey, dangerouslyAllowBrowser: true });
    return new OpenAIResponsesModel(client, modelName);
  }
  throw new Error(`Provider "${provider}" is not yet supported in Agent mode (OpenAI and Anthropic only).`);
}

/**
 * Extracts a flattened text representation from a prompt that might be a string or multimodal array.
 */
function extractTextFromPrompt(prompt: string | AgentInputItem[]): string {
  if (typeof prompt === 'string') {
    return prompt;
  }
  return prompt
    .map((item) => {
      if ('text' in item) return item.text;
      if ('type' in item && item.type === 'input_text') return (item as any).text;
      return '';
    })
    .filter(Boolean)
    .join('\n');
}

/** Maximum size (in characters) of the serialized tool result returned to the model. */
const MAX_TOOL_RESULT_CHARS = 100000;

/**
 * Summarize a tool result for the model.  We strip large fields (like full
 * MusicXML content) so the model's next API call stays small and fast.
 * The full result is stored in runContext.lastToolResult for later injection.
 */
function summarizeForModel(
  fullResult: Record<string, unknown>,
  runContext: { context: MusicAgentRunnerContext } | undefined,
): Record<string, unknown> {
  // Store the full result for later injection into the structured output
  if (runContext?.context) {
    runContext.context.lastToolResult = fullResult;
  }

  const serialized = JSON.stringify(fullResult);
  if (serialized.length <= MAX_TOOL_RESULT_CHARS) {
    return fullResult;
  }

  // Build a summary that fits within the limit
  const summary: Record<string, unknown> = {
    tool: fullResult.tool,
    status: fullResult.status,
    ok: fullResult.ok,
    scoreSessionId: fullResult.scoreSessionId || (asRecord(fullResult.body)?.scoreSessionId),
    revision: fullResult.revision || (asRecord(fullResult.body)?.revision) || (asRecord(fullResult.body)?.newRevision),
  };

  const body = asRecord(fullResult.body);
  if (body) {
    const bodyKeys = Object.keys(body);
    const bodySnippet: Record<string, unknown> = {};

    // Special handling for music.context tool output to preserve analysis data
    if (fullResult.tool === 'music_context' && body.context) {
      const context = asRecord(body.context);
      if (context) {
        const summarizedContext: Record<string, unknown> = {
          format: context.format,
          charLength: context.charLength,
          measureCountEstimate: context.measureCountEstimate,
        };
        // Preserve ABC if present (it's compact and high-signal)
        if (context.abc) {
          summarizedContext.abc = context.abc;
        }
        // Preserve fingerprint (high-signal analytical data)
        if (context.fingerprint) {
          summarizedContext.fingerprint = context.fingerprint;
        }
        // Preserve part list if small enough
        if (context.partList) {
          summarizedContext.partList = context.partList;
        }
        if (context.sourceContext) {
          summarizedContext.sourceContext = context.sourceContext;
        }
        // Add summary of measure range
        const measureRange = asRecord(context.measureRange);
        if (measureRange) {
          summarizedContext.measureRange = {
            start: measureRange.start,
            end: measureRange.end,
            count: Array.isArray(measureRange.results) ? measureRange.results.length : 0,
            note: 'XML snippets omitted in summary; use ABC or full result for analysis.',
          };
        }
        bodySnippet.context = summarizedContext;
      }
      // Fill in remaining non-context keys
      for (const key of bodyKeys) {
        if (key !== 'context') {
          const val = body[key];
          if (typeof val === 'string' && val.length > 500) {
            bodySnippet[key] = `[${val.length} chars omitted]`;
          } else {
            bodySnippet[key] = val;
          }
        }
      }
    } else {
      if (fullResult.tool === 'music.harmony_analyze') {
        const analysis = asRecord(body.analysis);
        const summaryBody: Record<string, unknown> = {
          ok: body.ok,
          warnings: body.warnings,
          analysis: analysis ? {
            measureCount: analysis.measureCount,
            harmonyTagCount: analysis.harmonyTagCount,
            coverage: analysis.coverage,
            localKeyStrategy: analysis.localKeyStrategy,
            harmonicRhythm: analysis.harmonicRhythm,
            fallbackCount: analysis.fallbackCount,
            suppressedChangeCount: analysis.suppressedChangeCount,
          } : undefined,
          artifacts: body.artifacts,
        };
        if (typeof body.content === 'string' && body.content.trim()) {
          summaryBody.content = `[musicxml omitted, ${body.content.length} chars]`;
        }
        summary.body = summaryBody;
        summary._note = 'Full harmony analysis result stored internally; MusicXML content omitted from model summary.';
        return summary;
      }
      if (fullResult.tool === 'music.functional_harmony_analyze') {
        const analysis = asRecord(body.analysis);
        const segments = Array.isArray(body.segments) ? body.segments.slice(0, 8) : [];
        const exportsObj = asRecord(body.exports);
        const summaryBody: Record<string, unknown> = {
          ok: body.ok,
          warnings: body.warnings,
          analysis: analysis ? {
            measureCount: analysis.measureCount,
            segmentCount: analysis.segmentCount,
            coverage: analysis.coverage,
            localKeyCount: analysis.localKeyCount,
            modulationCount: analysis.modulationCount,
            cadenceCount: analysis.cadenceCount,
            engine: analysis.engine,
          } : undefined,
          segments,
          artifacts: body.artifacts,
        };
        if (typeof body.annotatedXml === 'string' && body.annotatedXml.trim()) {
          summaryBody.annotatedXml = `[musicxml omitted, ${body.annotatedXml.length} chars]`;
        }
        if (exportsObj) {
          summaryBody.exports = {
            json: typeof exportsObj.json === 'string' ? `[json omitted, ${exportsObj.json.length} chars]` : undefined,
            rntxt: typeof exportsObj.rntxt === 'string' ? `[rntxt omitted, ${exportsObj.rntxt.length} chars]` : undefined,
          };
        }
        summary.body = summaryBody;
        summary._note = 'Full functional harmony result stored internally; large exports omitted from model summary.';
        return summary;
      }
      // Default heuristic summarization for other tools
      for (const key of bodyKeys) {
        const val = body[key];
        if (typeof val === 'string' && val.length > 500) {
          bodySnippet[key] = `[${val.length} chars omitted]`;
        } else if (val && typeof val === 'object') {
          const inner = JSON.stringify(val);
          if (inner.length > 500) {
            bodySnippet[key] = `[object, ${inner.length} chars omitted]`;
          } else {
            bodySnippet[key] = val;
          }
        } else {
          bodySnippet[key] = val;
        }
      }
    }
    summary.body = bodySnippet;
  }

  summary._note = 'Full result stored internally; only summary shown here.';
  return summary;
}

const DEFAULT_MODELS: Record<string, string> = {
  openai: (process.env.MUSIC_AGENT_MODEL || 'gpt-5.2').trim(),
  anthropic: 'claude-sonnet-4-5',
};
const getDefaultModel = (provider: string) => DEFAULT_MODELS[provider] || DEFAULT_MODELS.openai;

// The @openai/agents SDK replaces dots with underscores in tool names via
// toFunctionToolName(), so the model sees music_context, music_scoreops, etc.
// The enum here must match the names the model actually outputs.
const AGENT_OUTPUT_SCHEMA = z.object({
  selectedTool: z.enum([
    'music_context',
    'music_convert',
    'music_diff_feedback',
    'music_functional_harmony_analyze',
    'music_generate',
    'music_harmony_analyze',
    'music_scoreops',
    'music_patch',
    'music_render',
  ]),
  toolStatus: z.number(),
  toolOk: z.boolean(),
  applyToScore: z.boolean().optional(),
  response: z.string(),
  error: z.string().nullable().optional(),
  result: z.string().nullable().optional().describe('JSON-encoded result object from the tool call'),
});

function promptRequestsAnalysisApply(prompt: string): boolean {
  const normalized = prompt.toLowerCase();
  const wantsAction = /\b(apply|insert|add|annotate|write|put)\b/.test(normalized);
  const wantsScoreTarget = /\b(score|staff|staves|notation)\b/.test(normalized);
  const wantsHarmonyMarkup = /\b(roman numeral|roman numerals|chord symbols?|harmony tags?)\b/.test(normalized);
  return wantsAction && (wantsScoreTarget || wantsHarmonyMarkup);
}

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

function classifyPrompt(prompt: string | AgentInputItem[]): MusicAgentToolName {
  const normalized = extractTextFromPrompt(prompt).toLowerCase();
  const isFunctionalHarmony = /\b(roman numeral|roman numerals|functional harmony|harmony analysis|analyze harmony|analyse harmony|cadence|cadences|modulation|modulations|tonicization|tonicizations|key trajectory)\b/.test(normalized);
  if (isFunctionalHarmony) {
    return 'music.functional_harmony_analyze';
  }
  const isChordify = /\b(chordify|chord symbols?|harmony tags?|lead sheet|lead-sheet|mma|accompaniment chords?)\b/.test(normalized);
  if (isChordify) {
    return 'music.harmony_analyze';
  }
  const isGenerate = /\b(generate|compose|write|create|new score|melody|variation)\b/.test(normalized);
  if (isGenerate) {
    return 'music.generate';
  }
  const isConvert = /\b(convert|conversion|abc|musicxml|xml)\b/.test(normalized)
    && (/\bto abc\b/.test(normalized) || /\bto musicxml\b/.test(normalized) || /\bto xml\b/.test(normalized));
  if (isConvert) {
    return 'music.convert';
  }
  const isPatch = /\b(change|edit|fix|remove|delete|move|transpose|revoice|beam|re-beam|rest|clef|key signature|time signature|patch|apply|export)\b/.test(normalized);
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
  prompt: string | AgentInputItem[],
  patchDefaults: Record<string, unknown>,
  scoreOpsAttempt: unknown,
  reason: string,
  trace?: MusicAgentTraceContext,
): Promise<MusicAgentResult> {
  traceLog(trace, 'music_agent.patch_fallback.start', {
    reason,
  });
  const promptText = extractTextFromPrompt(prompt);
  const patchPayload = {
    ...patchDefaults,
    prompt: typeof patchDefaults.prompt === 'string' && patchDefaults.prompt.trim()
      ? patchDefaults.prompt
      : promptText,
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
  prompt: string | AgentInputItem[],
  toolInput?: ToolDefaults,
  trace?: MusicAgentTraceContext,
): Promise<MusicAgentResult> {
  try {
    const selectedTool = classifyPrompt(prompt);
    const promptText = extractTextFromPrompt(prompt);
    const applyToScore = promptRequestsAnalysisApply(promptText);
    traceLog(trace, 'music_agent.fallback.selected_tool', {
      selectedTool,
    });
  if (selectedTool === 'music.generate') {
    const generatePayload = {
      ...(toolInput?.generate || {}),
      dryRun: true,
      prompt: (toolInput?.generate?.prompt as string | undefined) || promptText,
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
  if (selectedTool === 'music.harmony_analyze') {
    const harmonyDefaults = {
      ...(toolInput?.harmony_analyze || {}),
    };
    const contextDefaults = asRecord(toolInput?.context);
    if (!harmonyDefaults.content && typeof contextDefaults?.content === 'string') {
      harmonyDefaults.content = contextDefaults.content;
    }
    const result = trace?.traceContext
      ? await runHarmonyAnalyzeService(harmonyDefaults, { traceContext: trace.traceContext })
      : await runHarmonyAnalyzeService(harmonyDefaults);
    return {
      status: result.status,
      body: {
        mode: 'fallback',
        selectedTool,
        toolStatus: result.status,
        toolOk: result.status < 400,
        response: result.status < 400
          ? 'Chord-symbol analysis completed via fallback router.'
          : 'Chord-symbol analysis failed in fallback router.',
        applyToScore,
        result: result.body,
      },
    };
  }
  if (selectedTool === 'music.functional_harmony_analyze') {
    const functionalDefaults = {
      ...(toolInput?.functional_harmony_analyze || {}),
    };
    const contextDefaults = asRecord(toolInput?.context);
    if (!functionalDefaults.content && typeof contextDefaults?.content === 'string') {
      functionalDefaults.content = contextDefaults.content;
    }
    const result = trace?.traceContext
      ? await runFunctionalHarmonyAnalyzeService(functionalDefaults, { traceContext: trace.traceContext })
      : await runFunctionalHarmonyAnalyzeService(functionalDefaults);
    return {
      status: result.status,
      body: {
        mode: 'fallback',
        selectedTool,
        toolStatus: result.status,
        toolOk: result.status < 400,
        response: result.status < 400
          ? 'Functional harmony analysis completed via fallback router.'
          : 'Functional harmony analysis failed in fallback router.',
        applyToScore,
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
        : promptText,
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
        : promptText,
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
      console.info('[music-agent] Tool called: music.context');
      // The SDK passes a RunContext which has the 'context' property
      // In some tests or direct calls it might be the context itself
      const rawContext: any = (runContext as any)?.context || runContext;
      const defaults = rawContext?.toolInput?.context;
      const payload = mergeToolInput(defaults, input);
      if (!payload.scoreSessionId && rawContext?.toolInput?.context?.scoreSessionId) {
        payload.scoreSessionId = rawContext.toolInput.context.scoreSessionId;
        payload.baseRevision = rawContext.toolInput.context.baseRevision;
      }
      const result = await runMusicContextService(payload);
      console.info(`[music-agent] Tool music.context completed: status=${result.status}`);
      const fullResult = {
        tool: 'music.context',
        status: result.status,
        ok: result.status < 400,
        body: result.body,
        scoreSessionId: (result.body as any).scoreSessionId,
        revision: (result.body as any).revision,
      };
      return summarizeForModel(fullResult, runContext);
    },
  });

  const musicConvertTool = tool({
    name: MUSIC_CONVERT_TOOL_CONTRACT.name,
    description: MUSIC_CONVERT_TOOL_CONTRACT.description,
    parameters: MUSIC_CONVERT_TOOL_CONTRACT.inputSchema,
    strict: false,
    execute: async (input, runContext) => {
      console.info('[music-agent] Tool called: music.convert');
      const rawContext: any = (runContext as any)?.context || runContext;
      const defaults = rawContext?.toolInput?.convert;
      const payload = mergeToolInput(defaults, input);
      if (!payload.scoreSessionId && rawContext?.toolInput?.convert?.scoreSessionId) {
        payload.scoreSessionId = rawContext.toolInput.convert.scoreSessionId;
        payload.baseRevision = rawContext.toolInput.convert.baseRevision;
      }
      const result = await runMusicConvertService(payload);
      console.info(`[music-agent] Tool music.convert completed: status=${result.status}`);
      const fullResult = {
        tool: 'music.convert',
        status: result.status,
        ok: result.status < 400,
        body: result.body,
        scoreSessionId: (result.body as any).scoreSessionId,
        revision: (result.body as any).revision,
      };
      return summarizeForModel(fullResult, runContext);
    },
  });

  const musicDiffFeedbackTool = tool({
    name: MUSIC_DIFF_FEEDBACK_TOOL_CONTRACT.name,
    description: MUSIC_DIFF_FEEDBACK_TOOL_CONTRACT.description,
    parameters: MUSIC_DIFF_FEEDBACK_TOOL_CONTRACT.inputSchema,
    strict: false,
    execute: async (input, runContext) => {
      console.info('[music-agent] Tool called: music.diff_feedback');
      const rawContext: any = (runContext as any)?.context || runContext;
      const defaults = rawContext?.toolInput?.diff_feedback;
      const payload = mergeToolInput(defaults, input);
      if (!payload.scoreSessionId && rawContext?.toolInput?.diff_feedback?.scoreSessionId) {
        payload.scoreSessionId = rawContext.toolInput.diff_feedback.scoreSessionId;
        payload.baseRevision = rawContext.toolInput.diff_feedback.baseRevision;
      }
      const toolTrace = rawContext?.trace;
      const result = toolTrace?.traceContext
        ? await runDiffFeedbackService(payload, { traceContext: toolTrace.traceContext })
        : await runDiffFeedbackService(payload);
      console.info(`[music-agent] Tool music.diff_feedback completed: status=${result.status}`);
      const fullResult = {
        tool: 'music.diff_feedback',
        status: result.status,
        ok: result.status < 400,
        body: result.body,
        scoreSessionId: (result.body as any).scoreSessionId,
        revision: (result.body as any).revision ?? (result.body as any).baseRevision,
      };
      return summarizeForModel(fullResult, runContext);
    },
  });

  const musicGenerateTool = tool({
    name: MUSIC_GENERATE_TOOL_CONTRACT.name,
    description: MUSIC_GENERATE_TOOL_CONTRACT.description,
    parameters: MUSIC_GENERATE_TOOL_CONTRACT.inputSchema,
    strict: false,
    execute: async (input, runContext) => {
      console.info('[music-agent] Tool called: music.generate');
      const rawContext: any = (runContext as any)?.context || runContext;
      const defaults = rawContext?.toolInput?.generate;
      const payload = mergeToolInput(defaults, input);
      const toolTrace = rawContext?.trace;
      const result = toolTrace?.traceContext
        ? await runMusicGenerateService(payload, { traceContext: toolTrace.traceContext })
        : await runMusicGenerateService(payload);
      console.info(`[music-agent] Tool music.generate completed: status=${result.status}`);
      const fullResult = {
        tool: 'music.generate',
        status: result.status,
        ok: result.status < 400,
        body: result.body,
      };
      return summarizeForModel(fullResult, runContext);
    },
  });

  const musicHarmonyAnalyzeTool = tool({
    name: MUSIC_HARMONY_ANALYZE_TOOL_CONTRACT.name,
    description: MUSIC_HARMONY_ANALYZE_TOOL_CONTRACT.description,
    parameters: MUSIC_HARMONY_ANALYZE_TOOL_CONTRACT.inputSchema,
    strict: false,
    execute: async (input, runContext) => {
      console.info('[music-agent] Tool called: music.harmony_analyze');
      const rawContext: any = (runContext as any)?.context || runContext;
      const defaults = rawContext?.toolInput?.harmony_analyze;
      const payload = mergeToolInput(defaults, input);
      if (!payload.scoreSessionId && rawContext?.toolInput?.harmony_analyze?.scoreSessionId) {
        payload.scoreSessionId = rawContext.toolInput.harmony_analyze.scoreSessionId;
        payload.baseRevision = rawContext.toolInput.harmony_analyze.baseRevision;
      }
      const contextDefaults = rawContext?.toolInput?.context;
      if (!payload.content && !payload.scoreSessionId && typeof contextDefaults?.content === 'string') {
        payload.content = contextDefaults.content;
      }
      const toolTrace = rawContext?.trace;
      const result = toolTrace?.traceContext
        ? await runHarmonyAnalyzeService(payload, { traceContext: toolTrace.traceContext })
        : await runHarmonyAnalyzeService(payload);
      console.info(`[music-agent] Tool music.harmony_analyze completed: status=${result.status}`);
      const fullResult = {
        tool: 'music.harmony_analyze',
        status: result.status,
        ok: result.status < 400,
        body: result.body,
        scoreSessionId: (result.body as any).scoreSessionId,
        revision: (result.body as any).revision,
      };
      return summarizeForModel(fullResult, runContext);
    },
  });

  const musicFunctionalHarmonyAnalyzeTool = tool({
    name: MUSIC_FUNCTIONAL_HARMONY_ANALYZE_TOOL_CONTRACT.name,
    description: MUSIC_FUNCTIONAL_HARMONY_ANALYZE_TOOL_CONTRACT.description,
    parameters: MUSIC_FUNCTIONAL_HARMONY_ANALYZE_TOOL_CONTRACT.inputSchema,
    strict: false,
    execute: async (input, runContext) => {
      console.info('[music-agent] Tool called: music.functional_harmony_analyze');
      const rawContext: any = (runContext as any)?.context || runContext;
      const defaults = rawContext?.toolInput?.functional_harmony_analyze;
      const payload = mergeToolInput(defaults, input);
      if (!payload.scoreSessionId && rawContext?.toolInput?.functional_harmony_analyze?.scoreSessionId) {
        payload.scoreSessionId = rawContext.toolInput.functional_harmony_analyze.scoreSessionId;
        payload.baseRevision = rawContext.toolInput.functional_harmony_analyze.baseRevision;
      }
      const contextDefaults = rawContext?.toolInput?.context;
      if (!payload.content && !payload.scoreSessionId && typeof contextDefaults?.content === 'string') {
        payload.content = contextDefaults.content;
      }
      const toolTrace = rawContext?.trace;
      const result = toolTrace?.traceContext
        ? await runFunctionalHarmonyAnalyzeService(payload, { traceContext: toolTrace.traceContext })
        : await runFunctionalHarmonyAnalyzeService(payload);
      console.info(`[music-agent] Tool music.functional_harmony_analyze completed: status=${result.status}`);
      const fullResult = {
        tool: 'music.functional_harmony_analyze',
        status: result.status,
        ok: result.status < 400,
        body: result.body,
        scoreSessionId: (result.body as any).scoreSessionId,
        revision: (result.body as any).revision,
      };
      return summarizeForModel(fullResult, runContext);
    },
  });

  const musicPatchTool = tool({
    name: MUSIC_PATCH_TOOL_CONTRACT.name,
    description: MUSIC_PATCH_TOOL_CONTRACT.description,
    parameters: MUSIC_PATCH_TOOL_CONTRACT.inputSchema,
    strict: false,
    execute: async (input, runContext) => {
      console.info('[music-agent] Tool called: music.patch');
      const rawContext: any = (runContext as any)?.context || runContext;
      const defaults = rawContext?.toolInput?.patch;
      const payload = mergeToolInput(defaults, input);
      if (!payload.scoreSessionId && rawContext?.toolInput?.patch?.scoreSessionId) {
        payload.scoreSessionId = rawContext.toolInput.patch.scoreSessionId;
        payload.baseRevision = rawContext.toolInput.patch.baseRevision;
      }
      const toolTrace = rawContext?.trace;
      const result = toolTrace?.traceContext
        ? await runMusicPatchService(payload, { traceContext: toolTrace.traceContext })
        : await runMusicPatchService(payload);
      console.info(`[music-agent] Tool music.patch completed: status=${result.status}`);
      const fullResult = {
        tool: 'music.patch',
        status: result.status,
        ok: result.status < 400,
        body: result.body,
        scoreSessionId: (result.body as any).scoreSessionId,
        revision: (result.body as any).revision,
      };
      return summarizeForModel(fullResult, runContext);
    },
  });

  const musicScoreOpsTool = tool({
    name: MUSIC_SCOREOPS_TOOL_CONTRACT.name,
    description: MUSIC_SCOREOPS_TOOL_CONTRACT.description,
    parameters: MUSIC_SCOREOPS_TOOL_CONTRACT.inputSchema,
    strict: false,
    execute: async (input, runContext) => {
      console.info('[music-agent] Tool called: music.scoreops');
      const rawContext: any = (runContext as any)?.context || runContext;
      const defaults = rawContext?.toolInput?.scoreops;
      const payload = mergeToolInput(defaults, input);
      if (!payload.scoreSessionId && rawContext?.toolInput?.scoreops?.scoreSessionId) {
        payload.scoreSessionId = rawContext.toolInput.scoreops.scoreSessionId;
        payload.baseRevision = rawContext.toolInput.scoreops.baseRevision;
      }
      const contextDefaults = rawContext?.toolInput?.context;
      if (!payload.content && !payload.scoreSessionId && typeof contextDefaults?.content === 'string') {
        payload.content = contextDefaults.content;
      }

      // If agent provided structured ops, execute directly (skip regex parsing)
      if (Array.isArray(payload.ops) && payload.ops.length > 0) {
        const toolTrace = rawContext?.trace;
        if (toolTrace) {
          traceLog(toolTrace, 'music_agent.scoreops.direct_ops', {
            opCount: payload.ops.length,
            hasContent: Boolean(payload.content || payload.text),
            hasSession: Boolean(payload.scoreSessionId),
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
        console.info(`[music-agent] Tool music.scoreops (direct ops) completed: status=${result.status}`);
        const fullResult = { 
          tool: 'music.scoreops', 
          status: result.status, 
          ok: result.status < 400, 
          body: result.body,
          scoreSessionId: (result.body as any).scoreSessionId,
          revision: (result.body as any).newRevision || (result.body as any).revision,
        };
        return summarizeForModel(fullResult, runContext);
      }

      // Fallback to prompt-based parsing
      const result = await runMusicScoreOpsPromptService(payload);
      console.info(`[music-agent] Tool music.scoreops (prompt) completed: status=${result.status}`);
      const fullResult = { 
        tool: 'music.scoreops', 
        status: result.status, 
        ok: result.status < 400, 
        body: result.body,
        scoreSessionId: (result.body as any).scoreSessionId,
        revision: (result.body as any).newRevision || (result.body as any).revision,
      };
      return summarizeForModel(fullResult, runContext);
    },
  });

  const musicRenderTool = tool({
    name: MUSIC_RENDER_TOOL_CONTRACT.name,
    description: MUSIC_RENDER_TOOL_CONTRACT.description,
    parameters: MUSIC_RENDER_TOOL_CONTRACT.inputSchema,
    strict: false,
    execute: async (input, runContext) => {
      console.info('[music-agent] Tool called: music.render');
      const rawContext: any = (runContext as any)?.context || runContext;
      const defaults = rawContext?.toolInput?.render;
      const payload = mergeToolInput(defaults, input);
      if (!payload.scoreSessionId && rawContext?.toolInput?.render?.scoreSessionId) {
        payload.scoreSessionId = rawContext.toolInput.render.scoreSessionId;
        payload.baseRevision = rawContext.toolInput.render.baseRevision;
      }
      const contextDefaults = rawContext?.toolInput?.context;
      if (!payload.content && !payload.scoreSessionId && typeof contextDefaults?.content === 'string') {
        payload.content = contextDefaults.content;
      }
      const result = await runMusicRenderService(payload);
      console.info(`[music-agent] Tool music.render completed: status=${result.status}`);
      const fullResult = {
        tool: 'music.render',
        status: result.status,
        ok: result.status < 400,
        body: result.body,
        scoreSessionId: (result.body as any).scoreSessionId,
        revision: (result.body as any).revision,
      };
      return summarizeForModel(fullResult, runContext);
    },
  });

  return new Agent({
    name: 'MusicRouter',
    model: DEFAULT_MODELS.openai,
    instructions: [
      'You are a music workflow router.',
      'Users may provide PDF or image attachments representing score pages. Use these for analysis or comparison with the current MusicXML when provided.',
      'Choose exactly one tool based on the user request:',
      '- music_context: score context extraction and analysis prep. Call this first when you need to see the score content to answer questions or determine properties like key signature.',
      '  * Tip: Use `include_abc: true` for a compact representation.',
      '  * Tip: Use the `fingerprint` object in the result for high-level musical facts (note distribution, key/time signatures) to justify your harmonic reasoning.',
      '  * Tip: If the user request is about specific measures, provide `measureStart` and `measureEnd` to get targeted XML snippets.',
      '- music_harmony_analyze: generate chord symbols / MusicXML harmony tags (Chordify) for accompaniment prep and lead-sheet style analysis.',
      '  * Tip: Use this for chord symbols, harmony tags, or MMA preparation.',
      '- music_functional_harmony_analyze: Roman numerals, local keys, cadences, and modulation-oriented harmonic analysis.',
      '  * Tip: Use this for Roman numeral analysis or when the user asks about harmonic function.',
      '- music_render: generate a visual snapshot (PNG/PDF) of the score.',
      '  * Tip: Use this when you need to see visual notation particulars, layout, or symbols not easily captured in XML/ABC.',
      '- music_convert: format conversion between MusicXML and ABC.',
      '- music_diff_feedback: iterate on assistant proposals using structured per-block review feedback.',
      '- music_generate: generation/composition requests.',
      '- music_scoreops: deterministic score editing with typed operations.',
      '- music_patch: score edit requests that should produce a musicxml-patch@1 payload.',
      '',
      'When you need to analyze the score (e.g., determine current key signature from notes), call music_context first.',
      'Use music_harmony_analyze for chord-symbol / harmony-tag tasks. Use music_functional_harmony_analyze for Roman numerals, cadences, modulations, and local-key analysis.',
      'When using music_harmony_analyze or music_functional_harmony_analyze, set `applyToScore: true` only if the user actually wants the score annotated and the tool result contains applyable MusicXML.',
      'If the user wants analysis only, leave `applyToScore` false or omit it.',
      'If you need to see the score visual layout or particulars, call music_render.',
      'NEVER ask the user to provide the MusicXML, PDF, or image of the current score unless you have first tried the tools and they failed.',
      'If a tool returns "session_not_found", it means the server-side cache was cleared; in this case, and ONLY in this case, should you ask the user to "Refresh the score session".',
      'If you are in a persistent session, you can call music_context periodically to refresh your knowledge of the score if you suspect it has changed.',
      'After receiving context, if you need to make changes, call music_scoreops in a second step.',
      '',
      'Prefer music_scoreops for editing requests. When using music_scoreops, produce structured ops when possible:',
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
      'Use music_patch only when the edit is too complex for ScoreOps ops.',
      'Call one tool, inspect its result, then produce final output using the required schema.',
      'The `result` field can be null — the system will inject the full tool output automatically.',
      'Keep response concise and mention why the selected tool was chosen.',
    ].join('\n'),
    tools: [
      musicContextTool,
      musicConvertTool,
      musicDiffFeedbackTool,
      musicFunctionalHarmonyAnalyzeTool,
      musicGenerateTool,
      musicHarmonyAnalyzeTool,
      musicScoreOpsTool,
      musicPatchTool,
      musicRenderTool,
    ],
    outputType: AGENT_OUTPUT_SCHEMA,
  });
}

export async function runMusicAgentRouter(
  body: unknown,
  options?: RunMusicAgentRouterOptions,
): Promise<MusicAgentResult> {
  const trace = options?.trace;
  try {
  const data = asRecord(body);
  const provider = typeof data?.provider === 'string' ? data.provider.trim() : 'openai';
  const promptRaw = data?.prompt;
  const prompt = (typeof promptRaw === 'string' || Array.isArray(promptRaw))
    ? promptRaw as string | AgentInputItem[]
    : '';
  const promptText = extractTextFromPrompt(prompt);

  traceLog(trace, 'music_agent.router.start', {
    hasPrompt: Boolean(promptText),
    promptLength: promptText.length,
    isMultimodal: Array.isArray(prompt),
    hasToolInput: Boolean(data?.toolInput),
    useFallbackOnly: Boolean(data?.useFallbackOnly),
  });
  if (!promptText.trim()) {
    traceLog(trace, 'music_agent.router.invalid_request', {
      reason: 'missing_prompt',
    }, 'warn');
    return {
      status: 400,
      body: { error: 'Missing prompt for music agent router.' },
    };
  }

  let toolInput = asRecord(data?.toolInput) as ToolDefaults | null;
  const useFallbackOnly = Boolean(data?.useFallbackOnly);

  // Auto-wire scoreSessionId and baseRevision from top-level to tool defaults if missing
  const bodySessionId = normalizeScoreSessionId(data);
  const bodyRevision = typeof data?.baseRevision === 'number' ? data.baseRevision : (typeof data?.revision === 'number' ? data.revision : undefined);
  if (bodySessionId) {
    toolInput = toolInput || {};
    const tools: Array<keyof ToolDefaults> = [
      'context',
      'convert',
      'diff_feedback',
      'functional_harmony_analyze',
      'harmony_analyze',
      'scoreops',
      'patch',
      'render',
    ];
    for (const t of tools) {
      if (!toolInput[t] || !asRecord(toolInput[t])?.scoreSessionId) {
        toolInput[t] = {
          ...(asRecord(toolInput[t]) || {}),
          scoreSessionId: bodySessionId,
          baseRevision: bodyRevision,
        };
      }
    }
  }

  // Accept API key from request body (similar to patch-service.ts) or environment
  const requestApiKey = (typeof data?.apiKey === 'string'
    ? data.apiKey
    : (typeof data?.api_key === 'string' ? data.api_key : '')).trim();
  const envApiKey = provider === 'anthropic'
    ? (process.env.ANTHROPIC_API_KEY || '').trim()
    : (process.env.OPENAI_API_KEY || '').trim();
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

  const requestedModel = typeof data?.model === 'string' ? data.model.trim() : '';
  const maxTurnsRaw = Number(data?.maxTurns);
  const maxTurns = Number.isFinite(maxTurnsRaw) && maxTurnsRaw > 0 ? Math.floor(maxTurnsRaw) : 6;
  const defaultModel = getDefaultModel(provider);
  const currentModelName = requestedModel || defaultModel;

  traceLog(trace, 'music_agent.router.agents_sdk.start', {
    provider,
    model: currentModelName,
    maxTurns,
    isMultimodal: Array.isArray(prompt),
  });
  const agent = createMusicRouterAgent();
  
  if (data?.scoreSessionId) {
    const sessionId = String(data.scoreSessionId);
    const revision = Number(data.revision ?? data.baseRevision ?? 0);
    agent.instructions = [
      ...agent.instructions.split('\n'),
      '',
      `IMPORTANT: You are operating on an active score session: ${sessionId} (revision ${revision}).`,
      'Tools will automatically reference this session if you do not provide explicit content.',
    ].join('\n');
  }

  if (requestApiKey || provider !== 'openai') {
    // Override the agent's model with one tied to the user's specific key
    // This ensures concurrency safety.
    agent.model = getModelForRequest(provider, openaiApiKey, currentModelName);
  } else if (requestedModel) {
    agent.model = requestedModel;
  }

  const AGENT_TIMEOUT_MS = 60_000;

  try {
    console.info(`[music-agent] Starting agent run: provider=${provider}, model=${currentModelName}, maxTurns=${maxTurns}, multimodal=${Array.isArray(prompt)}`);
    const runContext: MusicAgentRunnerContext = {
      toolInput: toolInput || undefined,
      trace,
    };
    const agentPromise = run(agent, promptText, {
      maxTurns,
      context: runContext,
    });

    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error(`Agent run timed out after ${AGENT_TIMEOUT_MS / 1000}s`)), AGENT_TIMEOUT_MS);
    });

    const result = await Promise.race([agentPromise, timeoutPromise]);
    console.info(`[music-agent] Agent run completed successfully`);

    const finalOutput = asRecord(result.finalOutput);
    if (!finalOutput) {
      console.warn(`[music-agent] No structured output from agent`);
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

    // Normalize underscored selectedTool back to dotted names for frontend compatibility
    if (typeof finalOutput.selectedTool === 'string') {
      const selectedToolMap: Record<string, string> = {
        music_context: 'music.context',
        music_convert: 'music.convert',
        music_diff_feedback: 'music.diff_feedback',
        music_functional_harmony_analyze: 'music.functional_harmony_analyze',
        music_generate: 'music.generate',
        music_harmony_analyze: 'music.harmony_analyze',
        music_scoreops: 'music.scoreops',
        music_patch: 'music.patch',
        music_render: 'music.render',
      };
      finalOutput.selectedTool = selectedToolMap[finalOutput.selectedTool] || finalOutput.selectedTool.replace(/_/g, '.');
    }

    // Inject the full (unsummarized) tool result — the model only saw the summary
    if (runContext.lastToolResult) {
      finalOutput.result = JSON.stringify(runContext.lastToolResult);
    }

    traceLog(trace, 'music_agent.router.agents_sdk.complete', {
      status: 200,
      selectedTool: (finalOutput.selectedTool as string | undefined) || null,
    });
    return {
      status: 200,
      body: {
        mode: 'agents-sdk',
        provider,
        model: currentModelName,
        ...finalOutput,
      },
    };
  } catch (error) {
    console.error(`[music-agent] Agent run failed:`, error instanceof Error ? error.message : error);
    traceLog(trace, 'music_agent.router.agents_sdk.error', {
      message: error instanceof Error ? error.message : 'Music agent router failed.',
    }, 'error');

    // On timeout or agent failure, fall back to heuristic router
    console.info(`[music-agent] Falling back to heuristic router`);
    try {
      const fallbackResult = await runFallbackRouter(prompt, toolInput || undefined, trace);
      return {
        ...fallbackResult,
        body: {
          ...fallbackResult.body,
          agentError: error instanceof Error ? error.message : 'Agent run failed',
        },
      };
    } catch (fallbackError) {
      return {
        status: 500,
        body: {
          error: error instanceof Error ? error.message : 'Music agent router failed.',
          mode: 'agents-sdk',
          fallbackError: fallbackError instanceof Error ? fallbackError.message : 'Fallback also failed',
        },
      };
    }
  }
  } catch (error) {
    console.error('runMusicAgentRouter unhandled error:', error);
    return {
      status: 500,
      body: {
        error: error instanceof Error ? error.message : 'Unhandled error in music agent router',
        mode: 'error',
      },
    };
  }
}
