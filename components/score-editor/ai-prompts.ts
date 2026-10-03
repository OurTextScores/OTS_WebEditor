import { AI_CHAT_CONTEXT_MAX_CHARS, AI_CHAT_CONTEXT_MAX_MESSAGES } from './ai-constants';
import type { AiChatMessage, AiPromptSection } from './ai-assistant-types';
import { PATCH_ANNOTATIONS_INSTRUCTION } from '../../lib/patch-annotations';

export const buildPromptWithSections = (prompt: string, sections: AiPromptSection[] = []) => {
  const trimmedPrompt = prompt.trim();
  const contextSections = sections
    .map((section) => ({
      title: section.title.trim(),
      content: section.content.trim(),
    }))
    .filter((section) => Boolean(section.title) && Boolean(section.content));
  if (!contextSections.length) {
    return trimmedPrompt;
  }

  const contextText = contextSections
    .map((section, index) => `[Context ${index + 1}] ${section.title}\n${section.content}`)
    .join('\n\n');
  if (!trimmedPrompt) {
    return contextText;
  }
  return `${trimmedPrompt}\n\n${contextText}`;
};

export const buildAiPrompt = (prompt: string, sections: AiPromptSection[] = []) => {
  const patchSpec = `Return ONLY valid JSON in the following format:
{
  "format": "musicxml-patch@1",
  "ops": [
    { "op": "replace", "path": "/score-partwise/part[@id='P1']/measure[@number='1']/note[1]", "value": "<note>...</note>" },
    { "op": "setText", "path": "/score-partwise/part[@id='P1']/measure[@number='1']/note[1]/duration", "value": "2" },
    { "op": "setAttr", "path": "/score-partwise/part[@id='P1']/measure[@number='1']/note[1]", "name": "default-x", "value": "123.45" },
    { "op": "insertAfter", "path": "/score-partwise/part[@id='P1']/measure[@number='1']/note[1]", "value": "<note>...</note>" },
    { "op": "delete", "path": "/score-partwise/part[@id='P1']/measure[@number='1']/note[2]" }
  ]
}
Use ONLY these ops: replace, setText, setAttr, insertBefore, insertAfter, delete.
Each XPath must match exactly one node.
Each replace/insertBefore/insertAfter value must contain exactly one XML element.
If you need to add multiple sibling elements, use multiple ops (for example: replace one node, then insertAfter additional nodes).

${PATCH_ANNOTATIONS_INSTRUCTION}`;
  const promptWithContext = buildPromptWithSections(prompt, sections);
  if (!promptWithContext) {
    return patchSpec;
  }
  return `${promptWithContext}\n\n${patchSpec}`;
};

export const truncateAiContext = (text: string, maxChars: number) => {
  const trimmed = text.trim();
  if (trimmed.length <= maxChars) {
    return {
      value: trimmed,
      truncated: false,
      originalLength: trimmed.length,
    };
  }
  return {
    value: trimmed.slice(0, maxChars),
    truncated: true,
    originalLength: trimmed.length,
  };
};

export const buildAiChatTranscript = (messages: AiChatMessage[]) => {
  const recentMessages = messages.slice(-AI_CHAT_CONTEXT_MAX_MESSAGES);
  if (!recentMessages.length) {
    return '';
  }
  const transcriptRaw = recentMessages
    .map(
      (message) => `${message.role === 'assistant' ? 'Assistant' : 'User'}: ${message.text.trim()}`,
    )
    .filter(Boolean)
    .join('\n\n');
  if (!transcriptRaw.trim()) {
    return '';
  }
  const transcript = truncateAiContext(transcriptRaw, AI_CHAT_CONTEXT_MAX_CHARS);
  return `${transcript.value}${
    transcript.truncated
      ? `\n\n[Chat transcript truncated from ${transcript.originalLength} characters.]`
      : ''
  }`;
};

export const shouldEnableSourceRagForPrompt = (text: string) => {
  const normalized = text.trim().toLowerCase();
  if (!normalized) {
    return false;
  }
  return [
    /\blook\s+up\b/,
    /\bresearch\b/,
    /\bsearch\b/,
    /\bfind\s+(?:sources|references|background|history|information|info)\b/,
    /\bsource\s+history\b/,
    /\bbackground\b/,
    /\bhistorical?\s+context\b/,
    /\breception\b/,
    /\bpublication\s+history\b/,
    /\bmanuscript\b/,
    /\bprovenance\b/,
    /\bcitation[s]?\b/,
    /\bcite\b/,
    /\bimslp\b/,
    /\bwikipedia\b/,
    /\bwikidata\b/,
    /\brism\b/,
    /\bopenalex\b/,
    /\bweb\b/,
    /\bonline\b/,
  ].some((pattern) => pattern.test(normalized));
};

export const formatAiDiffFeedbackError = (message: string) => {
  const trimmed = message.trim();
  if (!trimmed) {
    return 'Failed to generate a revised proposal from feedback.';
  }
  const xpathMatch = trimmed.match(/XPath\s+["']([^"']+)["']\s+matched\s+0\s+nodes/i);
  if (xpathMatch) {
    return `The AI returned a patch path that does not exist in the current score: ${xpathMatch[1]}. Update the comment with a more specific target and try again.`;
  }
  return trimmed;
};

export const aiDiffBlockContentSignature = (
  signatures: { left: string[][]; right: string[][] } | null,
  partIndex: number,
  leftIndices: number[],
  rightIndices: number[],
): string => {
  if (!signatures) {
    return '';
  }
  const leftSigs = leftIndices.map((index) => signatures.left[partIndex]?.[index] ?? `?${index}`);
  const rightSigs = rightIndices.map(
    (index) => signatures.right[partIndex]?.[index] ?? `?${index}`,
  );
  const text = `${leftSigs.join('\u0001')}\u0002${rightSigs.join('\u0001')}`;
  let hash = 5381;
  for (let i = 0; i < text.length; i += 1) {
    hash = ((hash << 5) + hash + text.charCodeAt(i)) | 0;
  }
  return `blocksig-v1:${(hash >>> 0).toString(16)}:${text.length}`;
};
