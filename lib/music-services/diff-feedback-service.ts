import { asRecord, normalizeScoreSessionId, resolveScoreContent, type ServiceResult } from './common';
import {
  applyMusicXmlPatch,
  parseMusicXmlPatch,
  resolveProvider,
  runMusicPatchService,
  type MusicXmlPatch,
} from './patch-service';
import { type TraceContext } from '../trace-http';

const BLOCK_STATUS_VALUES = new Set(['accepted', 'rejected', 'comment', 'pending']);
const FEEDBACK_CHAT_MAX_MESSAGES = 24;
const FEEDBACK_CHAT_MAX_CHARS = 40_000;
const FEEDBACK_COMMENT_MAX_CHARS = 500;
const FEEDBACK_GLOBAL_COMMENT_MAX_CHARS = 2_000;

export type DiffFeedbackBlockStatus = 'accepted' | 'rejected' | 'comment' | 'pending';

export type DiffFeedbackBlock = {
  partIndex: number;
  measureRange: string;
  status: DiffFeedbackBlockStatus;
  comment?: string;
};

type DiffFeedbackChatMessage = {
  role: 'user' | 'assistant';
  text: string;
};

const sanitizeText = (value: string, maxChars: number) => (
  value
    .replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxChars)
);

const parseBlocks = (value: unknown) => {
  if (!Array.isArray(value)) {
    return { blocks: [] as DiffFeedbackBlock[], error: 'blocks must be an array.' };
  }
  const blocks: DiffFeedbackBlock[] = [];
  for (let i = 0; i < value.length; i += 1) {
    const block = asRecord(value[i]);
    if (!block) {
      return { blocks: [], error: `blocks[${i}] must be an object.` };
    }
    const partIndex = Number(block.partIndex);
    const measureRange = typeof block.measureRange === 'string' ? sanitizeText(block.measureRange, 128) : '';
    const statusRaw = typeof block.status === 'string' ? block.status.trim().toLowerCase() : '';
    if (!Number.isInteger(partIndex) || partIndex < 0) {
      return { blocks: [], error: `blocks[${i}].partIndex must be a non-negative integer.` };
    }
    if (!measureRange) {
      return { blocks: [], error: `blocks[${i}].measureRange is required.` };
    }
    if (!BLOCK_STATUS_VALUES.has(statusRaw)) {
      return { blocks: [], error: `blocks[${i}].status is invalid.` };
    }
    const comment = typeof block.comment === 'string'
      ? sanitizeText(block.comment, FEEDBACK_COMMENT_MAX_CHARS)
      : '';
    blocks.push({
      partIndex,
      measureRange,
      status: statusRaw as DiffFeedbackBlockStatus,
      ...(statusRaw === 'comment' ? { comment } : {}),
    });
  }
  return { blocks, error: '' };
};

const parseChatHistory = (value: unknown): DiffFeedbackChatMessage[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item) => {
      const record = asRecord(item);
      const role = record?.role === 'assistant' ? 'assistant' : (record?.role === 'user' ? 'user' : null);
      const text = typeof record?.text === 'string' ? sanitizeText(record.text, 8_000) : '';
      if (!role || !text) {
        return null;
      }
      return { role, text };
    })
    .filter((message): message is DiffFeedbackChatMessage => Boolean(message));
};

const buildChatHistorySection = (chatHistory: DiffFeedbackChatMessage[]) => {
  if (!chatHistory.length) {
    return '';
  }
  const recent = chatHistory.slice(-FEEDBACK_CHAT_MAX_MESSAGES);
  const transcriptRaw = recent
    .map((message) => `${message.role === 'assistant' ? 'Assistant' : 'User'}: ${message.text}`)
    .join('\n\n');
  if (!transcriptRaw.trim()) {
    return '';
  }
  const transcript = transcriptRaw.slice(0, FEEDBACK_CHAT_MAX_CHARS);
  const truncatedNote = transcript.length < transcriptRaw.length
    ? `\n[Chat transcript truncated from ${transcriptRaw.length} characters.]`
    : '';
  return [`RECENT CHAT HISTORY:`, transcript + truncatedNote].join('\n');
};

const renderBlock = (block: DiffFeedbackBlock, includeComment: boolean) => {
  const base = `- Part ${block.partIndex + 1}, measures ${block.measureRange}`;
  if (includeComment && block.comment) {
    return `${base}: "${block.comment}"`;
  }
  return base;
};

export function buildFeedbackPrompt(args: {
  iteration: number;
  blocks: DiffFeedbackBlock[];
  globalComment?: string;
  chatHistory?: DiffFeedbackChatMessage[];
}) {
  const accepted = args.blocks.filter((block) => block.status === 'accepted');
  const rejected = args.blocks.filter((block) => block.status === 'rejected');
  const revise = args.blocks.filter((block) => block.status === 'comment');
  const pending = args.blocks.filter((block) => block.status === 'pending');
  const globalComment = sanitizeText(args.globalComment || '', FEEDBACK_GLOBAL_COMMENT_MAX_CHARS);
  const chatSection = buildChatHistorySection(args.chatHistory || []);

  return [
    `PATCH REVISION FEEDBACK (iteration ${Math.max(0, Math.floor(args.iteration))}):`,
    '',
    chatSection,
    chatSection ? '' : null,
    'ACCEPTED (already applied to current score):',
    ...(accepted.length ? accepted.map((block) => renderBlock(block, false)) : ['- (none)']),
    '',
    'REJECTED (do not include in revised patch):',
    ...(rejected.length ? rejected.map((block) => renderBlock(block, false)) : ['- (none)']),
    '',
    'REVISE (generate new patch ops for these):',
    ...(revise.length ? revise.map((block) => renderBlock(block, true)) : ['- (none)']),
    '',
    'PENDING (user has not reviewed, keep if still relevant):',
    ...(pending.length ? pending.map((block) => renderBlock(block, false)) : ['- (none)']),
    '',
    globalComment ? `GLOBAL NOTE: "${globalComment}"` : null,
    globalComment ? '' : null,
    'Generate a revised musicxml-patch@1 targeting only the REVISE and PENDING items.',
    'Do not re-include REJECTED items. ACCEPTED items are already in the current score.',
  ]
    .filter((line): line is string => line !== null)
    .join('\n');
}

export async function runDiffFeedbackService(
  body: unknown,
  options?: { traceContext?: TraceContext },
): Promise<ServiceResult> {
  const data = asRecord(body);
  const parsedBlocks = parseBlocks(data?.blocks);
  if (parsedBlocks.error) {
    return {
      status: 400,
      body: { error: parsedBlocks.error },
    };
  }
  if (!parsedBlocks.blocks.length) {
    return {
      status: 400,
      body: { error: 'At least one feedback block is required.' },
    };
  }

  const resolution = await resolveScoreContent(body);
  if (resolution.error) {
    return resolution.error;
  }

  const provider = resolveProvider(data?.provider);
  const model = typeof data?.model === 'string' ? data.model.trim() : '';
  const apiKey = typeof data?.apiKey === 'string'
    ? data.apiKey
    : (typeof data?.api_key === 'string' ? data.api_key : '');
  const maxTokens = Number(data?.maxTokens ?? data?.max_tokens);
  const iteration = Number.isFinite(Number(data?.iteration)) ? Math.max(0, Math.floor(Number(data?.iteration))) : 0;
  const chatHistory = parseChatHistory(data?.chatHistory);

  const feedbackPrompt = buildFeedbackPrompt({
    iteration,
    blocks: parsedBlocks.blocks,
    globalComment: typeof data?.globalComment === 'string' ? data.globalComment : '',
    chatHistory,
  });

  // TODO: emit `assistant_diff_feedback_sent` and block-count telemetry from this service.
  const patchResult = await runMusicPatchService({
    provider,
    model,
    apiKey,
    maxTokens: Number.isFinite(maxTokens) && maxTokens > 0 ? maxTokens : undefined,
    content: resolution.xml,
    prompt: feedbackPrompt,
  }, options);

  if (patchResult.status >= 400) {
    // TODO: emit `assistant_diff_feedback_response_failure` telemetry.
    return {
      status: patchResult.status,
      body: {
        ...patchResult.body,
        scoreSessionId: resolution.session?.scoreSessionId ?? normalizeScoreSessionId(data),
        baseRevision: resolution.session?.revision ?? (typeof data?.baseRevision === 'number' ? data.baseRevision : null),
        iteration,
        feedbackPrompt,
      },
    };
  }

  const patchPayload = asRecord(patchResult.body.patch);
  const parsedPatch = parseMusicXmlPatch(JSON.stringify(patchPayload || {}));
  if (parsedPatch.error || !parsedPatch.patch) {
    // TODO: emit `assistant_diff_feedback_response_failure` telemetry.
    return {
      status: 422,
      body: {
        error: parsedPatch.error || 'Generated patch payload was invalid.',
        feedbackPrompt,
      },
    };
  }

  const applied = await applyMusicXmlPatch(resolution.xml, parsedPatch.patch as MusicXmlPatch);
  if (applied.error || !applied.xml.trim()) {
    // TODO: emit `assistant_diff_feedback_response_failure` telemetry.
    return {
      status: 422,
      body: {
        error: applied.error || 'Failed to apply revised patch to current score XML.',
        patch: parsedPatch.patch,
        feedbackPrompt,
      },
    };
  }

  // TODO: emit `assistant_diff_feedback_response_success` telemetry.
  return {
    status: 200,
    body: {
      scoreSessionId: resolution.session?.scoreSessionId ?? normalizeScoreSessionId(data),
      baseRevision: resolution.session?.revision ?? (typeof data?.baseRevision === 'number' ? data.baseRevision : null),
      iteration: iteration + 1,
      patch: parsedPatch.patch,
      proposedXml: applied.xml,
      feedbackPrompt,
      provider,
      model: typeof patchResult.body.model === 'string' ? patchResult.body.model : model,
      retried: Boolean(patchResult.body.retried),
    },
  };
}
