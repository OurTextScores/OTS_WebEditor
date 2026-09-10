export const AI_EDIT_PROGRESS_VERSION = 'ai-edit-progress@1' as const;

export const AI_EDIT_PROGRESS_PHASES = [
  'request.accepted',
  'request.validated',
  'feedback.prepared',
  'deep.started',
  'provider.attempt_started',
  'candidate.received',
  'candidate.rejected',
  'patch.applied',
  'tool.started',
  'tool.completed',
  'verification.started',
  'verification.completed',
  'candidate.finalized',
] as const;

export type AiEditProgressPhase = (typeof AI_EDIT_PROGRESS_PHASES)[number];
export type AiEditProgressOperation = 'patch' | 'deep' | 'feedback';

export const AI_EDIT_PROGRESS_TOOLS = [
  'apply_patch',
  'scoreops',
  'engine_check',
  'render',
  'measure_diff',
  'analyze',
  'record_score',
  'finalize',
] as const;

export type AiEditProgressTool = (typeof AI_EDIT_PROGRESS_TOOLS)[number];

export type AiEditProgressUpdate = {
  phase: AiEditProgressPhase;
  message: string;
  attempt?: number;
  maxAttempts?: number;
  llmCalls?: number;
  tool?: AiEditProgressTool;
  toolCalls?: number;
  candidates?: number;
  renders?: number;
  verificationLevel?: 'tool_execution' | 'patch_apply' | 'engine_load' | 'render';
};

export type AiEditProgressReporter = (update: AiEditProgressUpdate) => void;

export type AiEditProgressEvent = AiEditProgressUpdate & {
  version: typeof AI_EDIT_PROGRESS_VERSION;
  type: 'progress';
  operation: AiEditProgressOperation;
  sequence: number;
  elapsedMs: number;
};

export type AiEditProgressResultEvent = {
  version: typeof AI_EDIT_PROGRESS_VERSION;
  type: 'result';
  operation: AiEditProgressOperation;
  sequence: number;
  elapsedMs: number;
  status: number;
  body: Record<string, unknown>;
};

export const reportAiEditProgress = (
  reporter: AiEditProgressReporter | undefined,
  update: AiEditProgressUpdate,
) => {
  if (!reporter) {
    return;
  }
  try {
    reporter({
      ...update,
      message: update.message.replace(/\s+/g, ' ').trim().slice(0, 200),
    });
  } catch {
    // Progress is observational and must never alter the edit result.
  }
};
