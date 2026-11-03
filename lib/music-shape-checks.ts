/**
 * What a converter's output must look like, per format (lib/music-conversion.ts validation): non-empty, and the
 * format's root or headers present. Severity says whether a miss fails the conversion.
 */
import type { MusicFormat, ValidationCheck } from './music-conversion';
import { decodeMidiBase64 } from './music-invariants';

/** An MNX document: a JSON object with "mnx" (its version) and "global" members. */
export function isMnxJson(text: string): boolean {
  if (!text.trimStart().startsWith('{')) return false;
  try {
    const doc: unknown = JSON.parse(text);
    return typeof doc === 'object' && doc !== null && 'mnx' in doc && 'global' in doc;
  } catch {
    return false;
  }
}

export const basicValidationChecks = (
  format: MusicFormat,
  content: string,
  midiBytes?: Buffer | null,
): ValidationCheck[] => {
  const checks: ValidationCheck[] = [];
  const trimmed = content.trim();
  checks.push({
    id: 'non-empty-output',
    ok: trimmed.length > 0,
    severity: 'error',
    message:
      trimmed.length > 0 ? 'Converter produced non-empty output.' : 'Converter output was empty.',
  });

  if (format === 'abc') {
    checks.push({
      id: 'abc-header-x',
      ok: /(^|\n)X:\s*\d+/m.test(trimmed),
      severity: 'warning',
      message: /(^|\n)X:\s*\d+/m.test(trimmed)
        ? 'ABC includes X: tune index header.'
        : 'ABC is missing X: header (some downstream tools may expect it).',
    });
    checks.push({
      id: 'abc-header-k',
      ok: /(^|\n)K:\s*\S+/m.test(trimmed),
      severity: 'error',
      message: /(^|\n)K:\s*\S+/m.test(trimmed)
        ? 'ABC includes K: key header.'
        : 'ABC is missing K: key header.',
    });
  } else if (format === 'musicxml') {
    checks.push({
      id: 'musicxml-root',
      ok: /<score-partwise\b|<score-timewise\b/.test(trimmed),
      severity: 'error',
      message: /<score-partwise\b|<score-timewise\b/.test(trimmed)
        ? 'MusicXML root element detected.'
        : 'MusicXML root element was not detected.',
    });
    checks.push({
      id: 'xml-declaration',
      ok: /^<\?xml\b/.test(trimmed),
      severity: 'warning',
      message: /^<\?xml\b/.test(trimmed)
        ? 'XML declaration detected.'
        : 'XML declaration is missing (usually acceptable, but atypical).',
    });
  } else if (format === 'mei') {
    const hasRoot = /<mei\b[^>]*music-encoding\.org\/ns\/mei/.test(trimmed);
    checks.push({
      id: 'mei-root',
      ok: hasRoot,
      severity: 'error',
      message: hasRoot ? 'MEI root element detected.' : 'MEI root element was not detected.',
    });
  } else if (format === 'mnx') {
    const hasRoot = isMnxJson(trimmed);
    checks.push({
      id: 'mnx-root',
      ok: hasRoot,
      severity: 'error',
      message: hasRoot
        ? 'MNX document detected ("mnx" and "global" members).'
        : 'MNX document was not detected (a JSON object with "mnx" and "global" members).',
    });
  } else if (format === 'midi') {
    const resolvedMidiBytes = midiBytes === undefined ? decodeMidiBase64(trimmed) : midiBytes;
    const hasHeader = Boolean(
      resolvedMidiBytes &&
      resolvedMidiBytes.length >= 4 &&
      resolvedMidiBytes.subarray(0, 4).toString('ascii') === 'MThd',
    );
    checks.push({
      id: 'midi-header',
      ok: hasHeader,
      severity: 'error',
      message: hasHeader
        ? 'MIDI header detected.'
        : 'MIDI header (MThd) not detected; payload is not valid base64 MIDI.',
    });
  } else {
    checks.push({
      id: 'kern-spine',
      ok: /(^|\n)\*\*kern(\s|$)/m.test(trimmed),
      severity: 'error',
      message: /(^|\n)\*\*kern(\s|$)/m.test(trimmed)
        ? '**kern spine declaration detected.'
        : '**kern spine declaration was not detected.',
    });
    checks.push({
      id: 'kern-terminator',
      ok: /(^|\n)\*-(\s|$)/m.test(trimmed),
      severity: 'warning',
      message: /(^|\n)\*-(\s|$)/m.test(trimmed)
        ? '**kern spine terminator detected.'
        : '**kern spine terminator was not detected.',
    });
  }

  return checks;
};
