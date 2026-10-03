export const HARMONY_ANALYZE_DEFAULT_TIMEOUT_MS = 60_000;

export const HARMONY_ANALYZE_MEDIUM_TIMEOUT_MS = 180_000;

export const HARMONY_ANALYZE_LARGE_TIMEOUT_MS = 300_000;

export const estimateMusicXmlMeasureCount = (xml: string) => {
  const partMatches = [...xml.matchAll(/<part\b[^>]*\bid="[^"]+"[^>]*>([\s\S]*?)<\/part>/gi)];
  const primaryPartXml = partMatches[0]?.[1] || '';
  if (primaryPartXml) {
    return (primaryPartXml.match(/<measure\b/gi) || []).length;
  }
  const allMeasures = (xml.match(/<measure\b/gi) || []).length;
  if (!allMeasures) {
    return 0;
  }
  return allMeasures;
};

export const estimateHarmonyTimeoutMs = (xml: string) => {
  const measureTagCount = (xml.match(/<measure\b/gi) || []).length;
  if (measureTagCount >= 2000) {
    return HARMONY_ANALYZE_LARGE_TIMEOUT_MS;
  }
  if (measureTagCount >= 800) {
    return HARMONY_ANALYZE_MEDIUM_TIMEOUT_MS;
  }
  return HARMONY_ANALYZE_DEFAULT_TIMEOUT_MS;
};
