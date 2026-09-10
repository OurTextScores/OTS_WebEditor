export type OptionalAiRequestParameter = 'temperature' | 'maxOutputTokens';

const UNSUPPORTED_LANGUAGE =
  /(?:unsupported|not supported|does not support|is not available|cannot be used|invalid parameter|unknown parameter)/i;

export const detectUnsupportedAiRequestParameter = (
  value: unknown,
): OptionalAiRequestParameter | null => {
  const text = typeof value === 'string' ? value : JSON.stringify(value ?? '');
  if (!UNSUPPORTED_LANGUAGE.test(text)) {
    return null;
  }
  if (/temperature/i.test(text)) {
    return 'temperature';
  }
  if (
    /(?:max_output_tokens|max_completion_tokens|max_tokens|maxOutputTokens|max output)/i.test(text)
  ) {
    return 'maxOutputTokens';
  }
  return null;
};
