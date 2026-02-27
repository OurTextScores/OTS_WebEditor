import { Agent, run, tool } from '@openai/agents';
import { z } from 'zod';
import { runMusicContextService } from '../music-services/context-service';
import { runMusicConvertService } from '../music-services/convert-service';
import { runMusicGenerateService } from '../music-services/generate-service';
import { runMusicPatchService } from '../music-services/patch-service';
import { runMusicScoreOpsPromptService } from '../music-services/scoreops-service';
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
};

type MusicAgentResult = {
  status: number;
  body: Record<string, unknown>;
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
  error: z.string().optional(),
  result: z.record(z.unknown()).optional(),
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

async function runFallbackRouter(prompt: string, toolInput?: ToolDefaults): Promise<MusicAgentResult> {
  const selectedTool = classifyPrompt(prompt);
  if (selectedTool === 'music.generate') {
    const result = await runMusicGenerateService({
      ...(toolInput?.generate || {}),
      dryRun: true,
      prompt: (toolInput?.generate?.prompt as string | undefined) || prompt,
    });
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
    const result = await runMusicPatchService({
      ...patchDefaults,
      prompt: typeof patchDefaults.prompt === 'string' && patchDefaults.prompt.trim()
        ? patchDefaults.prompt
        : prompt,
    });
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
    const scoreOpsResult = await runMusicScoreOpsPromptService({
      ...scoreOpsDefaults,
      prompt: typeof scoreOpsDefaults.prompt === 'string' && scoreOpsDefaults.prompt.trim()
        ? scoreOpsDefaults.prompt
        : prompt,
    });
    if (scoreOpsResult.status < 400) {
      return {
        status: scoreOpsResult.status,
        body: {
          mode: 'fallback',
          selectedTool,
          toolStatus: scoreOpsResult.status,
          toolOk: true,
          response: 'Score operations applied via fallback router.',
          result: scoreOpsResult.body,
        },
      };
    }

    const patchDefaults = {
      ...(toolInput?.patch || {}),
    };
    if (!patchDefaults.content && typeof contextDefaults?.content === 'string') {
      patchDefaults.content = contextDefaults.content;
    }
    const patchResult = await runMusicPatchService({
      ...patchDefaults,
      prompt: typeof patchDefaults.prompt === 'string' && patchDefaults.prompt.trim()
        ? patchDefaults.prompt
        : prompt,
    });
    return {
      status: patchResult.status,
      body: {
        mode: 'fallback',
        selectedTool: 'music.patch',
        toolStatus: patchResult.status,
        toolOk: patchResult.status < 400,
        response: patchResult.status < 400
          ? 'ScoreOps unsupported; generated patch via fallback router.'
          : 'ScoreOps and patch fallback both failed.',
        result: patchResult.body,
        scoreOpsAttempt: scoreOpsResult.body,
      },
    };
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
      const result = await runMusicGenerateService(payload);
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
      const result = await runMusicPatchService(payload);
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
      const result = await runMusicScoreOpsPromptService(payload);
      return {
        tool: 'music.scoreops',
        status: result.status,
        ok: result.status < 400,
        body: result.body,
      };
    },
  });

  return new Agent({
    name: 'MusicRouter',
    model: DEFAULT_MODEL,
    instructions: [
      'You are a music workflow router.',
      'Choose exactly one tool based on the user request:',
      '- music.context: score context extraction and analysis prep.',
      '- music.convert: format conversion between MusicXML and ABC.',
      '- music.generate: generation/composition requests.',
      '- music.scoreops: deterministic score editing with typed operations.',
      '- music.patch: score edit requests that should produce a musicxml-patch@1 payload.',
      'Call one tool first, inspect its result, then produce final output using the required schema.',
      'Prefer music.scoreops for editing requests. Use music.patch only when scoreops is unsupported.',
      'When available, include the chosen tool output body in `result`.',
      'Keep response concise and mention why the selected tool was chosen.',
    ].join('\n'),
    tools: [musicContextTool, musicConvertTool, musicGenerateTool, musicScoreOpsTool, musicPatchTool],
    outputType: AGENT_OUTPUT_SCHEMA,
  });
}

export async function runMusicAgentRouter(body: unknown): Promise<MusicAgentResult> {
  const data = asRecord(body);
  const prompt = typeof data?.prompt === 'string' ? data.prompt.trim() : '';
  if (!prompt) {
    return {
      status: 400,
      body: { error: 'Missing prompt for music agent router.' },
    };
  }

  const toolInput = asRecord(data?.toolInput) as ToolDefaults | null;
  const useFallbackOnly = Boolean(data?.useFallbackOnly);
  const openaiApiKey = (process.env.OPENAI_API_KEY || '').trim();
  if (useFallbackOnly || !openaiApiKey) {
    try {
      return await runFallbackRouter(prompt, toolInput || undefined);
    } catch (error) {
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
  const agent = createMusicRouterAgent();
  if (requestedModel) {
    agent.model = requestedModel;
  }

  try {
    const result = await run(agent, prompt, {
      maxTurns,
      context: {
        toolInput: toolInput || undefined,
      } satisfies MusicAgentRunnerContext,
    });

    const finalOutput = asRecord(result.finalOutput);
    if (!finalOutput) {
      return {
        status: 502,
        body: {
          error: 'MusicRouter did not return structured output.',
          mode: 'agents-sdk',
        },
      };
    }

    return {
      status: 200,
      body: {
        mode: 'agents-sdk',
        model: requestedModel || DEFAULT_MODEL,
        ...finalOutput,
      },
    };
  } catch (error) {
    return {
      status: 500,
      body: {
        error: error instanceof Error ? error.message : 'Music agent router failed.',
        mode: 'agents-sdk',
      },
    };
  }
}
