import { z } from 'zod';
import {
  createScoreArtifact,
  getScoreArtifact,
  summarizeScoreArtifact,
  type ScoreArtifact,
} from '../score-artifacts';
import {
  clearScoreOpsSessions,
  createScoreOpsSession,
  getScoreOpsSession,
  updateScoreOpsSession,
  type ScoreOpsSessionState,
} from './scoreops-session-store';

type ScoreOpsServiceResult = {
  status: number;
  body: Record<string, unknown>;
};

type ScoreOpsErrorCode =
  | 'invalid_request'
  | 'session_not_found'
  | 'stale_revision'
  | 'unsupported_op'
  | 'invalid_scope'
  | 'target_not_found'
  | 'execution_failure';

type ScoreScope = {
  partId?: string;
  measureStart?: number;
  measureEnd?: number;
};

type MusicXmlPatchOp = {
  op: 'replace' | 'setText' | 'setAttr' | 'insertBefore' | 'insertAfter' | 'delete';
  path: string;
  value?: string;
  name?: string;
};

type MusicXmlPatch = {
  format: 'musicxml-patch@1';
  ops: MusicXmlPatchOp[];
};

const DEFAULT_INSPECT_MEASURE_LIMIT = 16;

const SCOPE_SCHEMA = z.object({
  partId: z.string().trim().min(1).optional(),
  measureStart: z.number().int().min(1).optional(),
  measureEnd: z.number().int().min(1).optional(),
}).superRefine((scope, ctx) => {
  if (scope.measureStart && scope.measureEnd && scope.measureStart > scope.measureEnd) {
    ctx.addIssue({
      code: 'custom',
      message: 'measureStart must be <= measureEnd.',
      path: ['measureStart'],
    });
  }
});

const METADATA_FIELD_SCHEMA = z.enum(['title', 'subtitle', 'composer', 'lyricist']);
const CLEF_SCHEMA = z.enum(['treble', 'bass', 'alto', 'tenor']);
const INSERT_TARGET_SCHEMA = z.enum(['end', 'after_measure']);

const SCORE_OP_SCHEMA = z.discriminatedUnion('op', [
  z.object({
    op: z.literal('set_metadata_text'),
    field: METADATA_FIELD_SCHEMA,
    value: z.string(),
  }),
  z.object({
    op: z.literal('set_key_signature'),
    fifths: z.number().int().min(-7).max(7),
    scope: SCOPE_SCHEMA.optional(),
  }),
  z.object({
    op: z.literal('set_time_signature'),
    numerator: z.number().int().min(1).max(32),
    denominator: z.union([
      z.literal(1),
      z.literal(2),
      z.literal(4),
      z.literal(8),
      z.literal(16),
      z.literal(32),
    ]),
    scope: SCOPE_SCHEMA.optional(),
  }),
  z.object({
    op: z.literal('set_clef'),
    clef: CLEF_SCHEMA,
    scope: SCOPE_SCHEMA.optional(),
  }),
  z.object({
    op: z.literal('delete_selection'),
    scope: SCOPE_SCHEMA,
  }),
  z.object({
    op: z.literal('insert_measures'),
    count: z.number().int().min(1).max(64),
    target: INSERT_TARGET_SCHEMA.default('end'),
    partId: z.string().trim().min(1).optional(),
    afterMeasure: z.number().int().min(1).optional(),
  }),
  z.object({
    op: z.literal('remove_measures'),
    scope: SCOPE_SCHEMA,
  }),
  z.object({
    op: z.literal('delete_text_by_content'),
    text: z.string().trim().min(1),
    maxDeletes: z.number().int().min(1).max(200).optional(),
  }),
]);

type ScoreOp = z.infer<typeof SCORE_OP_SCHEMA>;

const OPEN_REQUEST_SCHEMA = z.object({
  action: z.literal('open'),
  initialArtifactId: z.string().trim().min(1).optional(),
  initial_artifact_id: z.string().trim().min(1).optional(),
  content: z.string().optional(),
  text: z.string().optional(),
  scoreMeta: z.record(z.string(), z.unknown()).optional(),
  score_meta: z.record(z.string(), z.unknown()).optional(),
});

const INSPECT_REQUEST_SCHEMA = z.object({
  action: z.literal('inspect'),
  scoreSessionId: z.string().trim().min(1),
  revision: z.number().int().min(0).optional(),
  scope: SCOPE_SCHEMA.optional(),
  include: z.object({
    capabilities: z.boolean().optional(),
    selectionSummary: z.boolean().optional(),
    scoreSummary: z.boolean().optional(),
    measureSignatures: z.boolean().optional(),
    targetPreview: z.boolean().optional(),
  }).optional(),
});

const APPLY_REQUEST_SCHEMA = z.object({
  action: z.literal('apply'),
  scoreSessionId: z.string().trim().min(1).optional(),
  baseRevision: z.number().int().min(0).optional(),
  inputArtifactId: z.string().trim().min(1).optional(),
  input_artifact_id: z.string().trim().min(1).optional(),
  content: z.string().optional(),
  text: z.string().optional(),
  ops: z.array(SCORE_OP_SCHEMA).min(1),
  options: z.object({
    atomic: z.boolean().optional(),
    includePatch: z.boolean().optional(),
    includeXml: z.boolean().optional(),
    includeMeasureDiff: z.boolean().optional(),
  }).optional(),
});

const SYNC_REQUEST_SCHEMA = z.object({
  action: z.literal('sync'),
  scoreSessionId: z.string().trim().min(1).optional(),
  baseRevision: z.number().int().min(0).optional(),
  inputArtifactId: z.string().trim().min(1).optional(),
  input_artifact_id: z.string().trim().min(1).optional(),
  content: z.string().optional(),
  text: z.string().optional(),
});

const REQUEST_SCHEMA = z.discriminatedUnion('action', [
  OPEN_REQUEST_SCHEMA,
  INSPECT_REQUEST_SCHEMA,
  APPLY_REQUEST_SCHEMA,
  SYNC_REQUEST_SCHEMA,
]);

type RequestPayload = z.infer<typeof REQUEST_SCHEMA>;

function errorResult(
  status: number,
  code: ScoreOpsErrorCode,
  message: string,
  details?: Record<string, unknown>,
): ScoreOpsServiceResult {
  return {
    status,
    body: {
      ok: false,
      error: {
        code,
        message,
        ...(details ? { details } : {}),
      },
    },
  };
}

function normalizeInputArtifactId(data: {
  inputArtifactId?: string;
  input_artifact_id?: string;
  initialArtifactId?: string;
  initial_artifact_id?: string;
}) {
  return (data.inputArtifactId
    || data.input_artifact_id
    || data.initialArtifactId
    || data.initial_artifact_id
    || '').trim();
}

function readContent(data: {
  content?: string;
  text?: string;
}) {
  if (typeof data.content === 'string') {
    return data.content;
  }
  if (typeof data.text === 'string') {
    return data.text;
  }
  return '';
}

function looksLikeMusicXml(xml: string) {
  const normalized = xml.trim().toLowerCase();
  return normalized.startsWith('<?xml')
    || normalized.includes('<score-partwise')
    || normalized.includes('<score-timewise');
}

function escapeXmlText(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

type PartBlock = {
  partId: string;
  openTag: string;
  content: string;
  full: string;
  start: number;
  end: number;
};

type MeasureBlock = {
  full: string;
  attrs: string;
  numberText: string;
  number: number | null;
};

function parsePartBlocks(xml: string): PartBlock[] {
  const blocks: PartBlock[] = [];
  const partRegex = /<part\b([^>]*)\bid="([^"]+)"([^>]*)>([\s\S]*?)<\/part>/gi;
  let match: RegExpExecArray | null;
  while ((match = partRegex.exec(xml)) !== null) {
    const full = match[0];
    const openTag = full.match(/^<part\b[^>]*>/i)?.[0] || `<part id="${match[2] || ''}">`;
    const content = match[4] || '';
    const partId = match[2] || '';
    blocks.push({
      partId,
      openTag,
      content,
      full,
      start: match.index,
      end: match.index + full.length,
    });
  }
  return blocks;
}

function replacePartContents(
  xml: string,
  mutate: (part: PartBlock, index: number) => string,
): string {
  const parts = parsePartBlocks(xml);
  if (!parts.length) {
    return xml;
  }
  let cursor = 0;
  let out = '';
  parts.forEach((part, index) => {
    out += xml.slice(cursor, part.start);
    const nextContent = mutate(part, index);
    out += `${part.openTag}${nextContent}</part>`;
    cursor = part.end;
  });
  out += xml.slice(cursor);
  return out;
}

function parseMeasureBlocks(partContent: string): MeasureBlock[] {
  const measures: MeasureBlock[] = [];
  const measureRegex = /<measure\b([^>]*)>([\s\S]*?)<\/measure>/gi;
  let match: RegExpExecArray | null;
  while ((match = measureRegex.exec(partContent)) !== null) {
    const attrs = match[1] || '';
    const numberText = attrs.match(/\bnumber="([^"]+)"/i)?.[1] ?? '';
    const parsed = Number.parseInt(numberText, 10);
    measures.push({
      full: match[0],
      attrs,
      numberText,
      number: Number.isFinite(parsed) ? parsed : null,
    });
  }
  return measures;
}

function replaceMeasureNumber(measureXml: string, measureNumber: number) {
  if (/\bnumber="[^"]*"/i.test(measureXml)) {
    return measureXml.replace(/\bnumber="[^"]*"/i, `number="${measureNumber}"`);
  }
  return measureXml.replace(/<measure\b/i, `<measure number="${measureNumber}"`);
}

function ensureAttributesBlock(measureXml: string, appendInnerXml: string) {
  const attributesRegex = /<attributes\b[^>]*>([\s\S]*?)<\/attributes>/i;
  if (attributesRegex.test(measureXml)) {
    return measureXml.replace(attributesRegex, (full, inner) => {
      return `<attributes>${inner}${appendInnerXml}</attributes>`;
    });
  }
  const openTagMatch = measureXml.match(/^<measure\b[^>]*>/i);
  if (!openTagMatch) {
    return measureXml;
  }
  const openTag = openTagMatch[0];
  return `${openTag}<attributes>${appendInnerXml}</attributes>${measureXml.slice(openTag.length)}`;
}

function setOrInsertBlock(innerXml: string, tagName: string, blockXml: string) {
  const blockRegex = new RegExp(`<${tagName}\\b[^>]*>[\\s\\S]*?<\\/${tagName}>`, 'i');
  if (blockRegex.test(innerXml)) {
    return innerXml.replace(blockRegex, blockXml);
  }
  return `${innerXml}${blockXml}`;
}

function applyBlockInMeasure(measureXml: string, tagName: string, blockXml: string) {
  const attributesRegex = /<attributes\b[^>]*>([\s\S]*?)<\/attributes>/i;
  if (attributesRegex.test(measureXml)) {
    return measureXml.replace(attributesRegex, (_full, inner) => {
      return `<attributes>${setOrInsertBlock(inner as string, tagName, blockXml)}</attributes>`;
    });
  }
  return ensureAttributesBlock(measureXml, blockXml);
}

function setMovementTag(xml: string, tagName: 'movement-title' | 'movement-number', value: string) {
  const escaped = escapeXmlText(value);
  const tagRegex = new RegExp(`<${tagName}>[\\s\\S]*?<\\/${tagName}>`, 'i');
  if (tagRegex.test(xml)) {
    return xml.replace(tagRegex, `<${tagName}>${escaped}</${tagName}>`);
  }
  return xml.replace(/<score-partwise\b([^>]*)>/i, `<score-partwise$1><${tagName}>${escaped}</${tagName}>`);
}

function setCreatorTag(xml: string, creatorType: 'composer' | 'lyricist', value: string) {
  const escaped = escapeXmlText(value);
  const creatorRegex = new RegExp(`<creator\\s+type="${creatorType}">[\\s\\S]*?<\\/creator>`, 'i');
  if (creatorRegex.test(xml)) {
    return xml.replace(creatorRegex, `<creator type="${creatorType}">${escaped}</creator>`);
  }
  if (/<identification\b[\s\S]*?<\/identification>/i.test(xml)) {
    return xml.replace(/<\/identification>/i, `<creator type="${creatorType}">${escaped}</creator></identification>`);
  }
  return xml.replace(/<score-partwise\b([^>]*)>/i, `<score-partwise$1><identification><creator type="${creatorType}">${escaped}</creator></identification>`);
}

function measureInScope(measure: MeasureBlock, scope?: ScoreScope) {
  if (!scope) {
    return measure.number === 1;
  }
  const start = scope.measureStart;
  const end = scope.measureEnd ?? start;
  if (!start) {
    return measure.number === 1;
  }
  if (measure.number === null) {
    return false;
  }
  return measure.number >= start && measure.number <= (end || start);
}

function updatePartMeasures(
  partContent: string,
  transform: (measure: MeasureBlock, index: number) => MeasureBlock | null,
): { content: string; changedCount: number } {
  const measureRegex = /<measure\b[^>]*>[\s\S]*?<\/measure>/gi;
  let match: RegExpExecArray | null;
  let cursor = 0;
  let out = '';
  let changedCount = 0;
  let index = 0;
  while ((match = measureRegex.exec(partContent)) !== null) {
    const full = match[0];
    const attrsMatch = full.match(/^<measure\b([^>]*)>/i);
    const attrs = attrsMatch?.[1] || '';
    const numberText = attrs.match(/\bnumber="([^"]+)"/i)?.[1] ?? '';
    const parsed = Number.parseInt(numberText, 10);
    const measure: MeasureBlock = {
      full,
      attrs,
      numberText,
      number: Number.isFinite(parsed) ? parsed : null,
    };
    out += partContent.slice(cursor, match.index);
    const next = transform(measure, index);
    if (next === null) {
      changedCount += 1;
    } else {
      out += next.full;
      if (next.full !== measure.full) {
        changedCount += 1;
      }
    }
    cursor = match.index + full.length;
    index += 1;
  }
  out += partContent.slice(cursor);
  return { content: out, changedCount };
}

function collectMeasurePreview(xml: string, scope?: ScoreScope, limit = DEFAULT_INSPECT_MEASURE_LIMIT) {
  const results: Array<{ partId: string; measureNumber: string; truncated: boolean; xml: string }> = [];
  const partRegex = /<part\b([^>]*)>([\s\S]*?)<\/part>/gi;
  let partMatch: RegExpExecArray | null;
  while ((partMatch = partRegex.exec(xml)) !== null && results.length < limit) {
    const partId = partMatch[1]?.match(/\bid="([^"]+)"/i)?.[1] || '';
    if (scope?.partId && scope.partId !== partId) {
      continue;
    }
    const partXml = partMatch[2] || '';
    const measureRegex = /<measure\b([^>]*)>([\s\S]*?)<\/measure>/gi;
    let measureMatch: RegExpExecArray | null;
    while ((measureMatch = measureRegex.exec(partXml)) !== null && results.length < limit) {
      const attrs = measureMatch[1] || '';
      const numText = attrs.match(/\bnumber="([^"]+)"/i)?.[1] || '';
      const parsed = Number.parseInt(numText, 10);
      if (scope?.measureStart && (!Number.isFinite(parsed) || parsed < scope.measureStart)) {
        continue;
      }
      if (scope?.measureEnd && (!Number.isFinite(parsed) || parsed > scope.measureEnd)) {
        continue;
      }
      const xmlSnippet = measureMatch[0].trim();
      results.push({
        partId,
        measureNumber: numText,
        truncated: xmlSnippet.length > 1600,
        xml: xmlSnippet.length > 1600 ? `${xmlSnippet.slice(0, 1600)}\n<!-- ...truncated... -->` : xmlSnippet,
      });
    }
  }
  return results;
}

function extractScoreSummary(xml: string) {
  const partNames: Array<{ partId: string; name: string }> = [];
  const scorePartRegex = /<score-part\b[^>]*\bid="([^"]+)"[^>]*>[\s\S]*?<part-name>([\s\S]*?)<\/part-name>[\s\S]*?<\/score-part>/gi;
  let scorePartMatch: RegExpExecArray | null;
  while ((scorePartMatch = scorePartRegex.exec(xml)) !== null) {
    partNames.push({
      partId: scorePartMatch[1],
      name: scorePartMatch[2].trim(),
    });
  }

  const firstFifths = xml.match(/<key\b[^>]*>[\s\S]*?<fifths>(-?\d+)<\/fifths>[\s\S]*?<\/key>/i)?.[1] ?? null;
  const firstTime = (() => {
    const beats = xml.match(/<time\b[^>]*>[\s\S]*?<beats>(\d+)<\/beats>/i)?.[1];
    const beatType = xml.match(/<time\b[^>]*>[\s\S]*?<beat-type>(\d+)<\/beat-type>/i)?.[1];
    if (!beats || !beatType) {
      return null;
    }
    return `${beats}/${beatType}`;
  })();

  return {
    parts: partNames,
    measureCountEstimate: (xml.match(/<measure\b/gi) || []).length,
    keyFifths: firstFifths === null ? null : Number(firstFifths),
    timeSignature: firstTime,
  };
}

function resolveTargetPartIds(xml: string, partId?: string) {
  const parts = parsePartBlocks(xml).map((p) => p.partId).filter(Boolean);
  if (!parts.length) {
    return [];
  }
  if (partId) {
    return parts.includes(partId) ? [partId] : [];
  }
  return parts;
}

function applySetMetadataText(xml: string, op: Extract<ScoreOp, { op: 'set_metadata_text' }>) {
  if (op.field === 'title') {
    return { xml: setMovementTag(xml, 'movement-title', op.value), changed: true, summary: 'Updated title.' };
  }
  if (op.field === 'subtitle') {
    return { xml: setMovementTag(xml, 'movement-number', op.value), changed: true, summary: 'Updated subtitle.' };
  }
  if (op.field === 'composer') {
    return { xml: setCreatorTag(xml, 'composer', op.value), changed: true, summary: 'Updated composer.' };
  }
  return { xml: setCreatorTag(xml, 'lyricist', op.value), changed: true, summary: 'Updated lyricist.' };
}

function applySetKeySignature(xml: string, op: Extract<ScoreOp, { op: 'set_key_signature' }>) {
  const targetParts = resolveTargetPartIds(xml, op.scope?.partId);
  if (!targetParts.length) {
    return { error: 'Target part not found.' } as const;
  }
  let changed = 0;
  const nextXml = replacePartContents(xml, (part) => {
    if (!targetParts.includes(part.partId)) {
      return part.content;
    }
    const updated = updatePartMeasures(part.content, (measure) => {
      if (!measureInScope(measure, op.scope)) {
        return measure;
      }
      const nextMeasure = applyBlockInMeasure(measure.full, 'key', `<key><fifths>${op.fifths}</fifths></key>`);
      return { ...measure, full: nextMeasure };
    });
    changed += updated.changedCount;
    return updated.content;
  });
  if (!changed) {
    return { error: 'No matching measures found for set_key_signature.' } as const;
  }
  return {
    xml: nextXml,
    changed: true,
    summary: `Updated key signature in ${changed} measure(s).`,
  } as const;
}

function applySetTimeSignature(xml: string, op: Extract<ScoreOp, { op: 'set_time_signature' }>) {
  const targetParts = resolveTargetPartIds(xml, op.scope?.partId);
  if (!targetParts.length) {
    return { error: 'Target part not found.' } as const;
  }
  let changed = 0;
  const timeBlock = `<time><beats>${op.numerator}</beats><beat-type>${op.denominator}</beat-type></time>`;
  const nextXml = replacePartContents(xml, (part) => {
    if (!targetParts.includes(part.partId)) {
      return part.content;
    }
    const updated = updatePartMeasures(part.content, (measure) => {
      if (!measureInScope(measure, op.scope)) {
        return measure;
      }
      const nextMeasure = applyBlockInMeasure(measure.full, 'time', timeBlock);
      return { ...measure, full: nextMeasure };
    });
    changed += updated.changedCount;
    return updated.content;
  });
  if (!changed) {
    return { error: 'No matching measures found for set_time_signature.' } as const;
  }
  return {
    xml: nextXml,
    changed: true,
    summary: `Updated time signature in ${changed} measure(s).`,
  } as const;
}

function applySetClef(xml: string, op: Extract<ScoreOp, { op: 'set_clef' }>) {
  const targetParts = resolveTargetPartIds(xml, op.scope?.partId);
  if (!targetParts.length) {
    return { error: 'Target part not found.' } as const;
  }
  const clefMap: Record<z.infer<typeof CLEF_SCHEMA>, { sign: string; line: number }> = {
    treble: { sign: 'G', line: 2 },
    bass: { sign: 'F', line: 4 },
    alto: { sign: 'C', line: 3 },
    tenor: { sign: 'C', line: 4 },
  };
  const mapping = clefMap[op.clef];
  const clefBlock = `<clef><sign>${mapping.sign}</sign><line>${mapping.line}</line></clef>`;
  let changed = 0;
  const nextXml = replacePartContents(xml, (part) => {
    if (!targetParts.includes(part.partId)) {
      return part.content;
    }
    const updated = updatePartMeasures(part.content, (measure) => {
      if (!measureInScope(measure, op.scope)) {
        return measure;
      }
      const nextMeasure = applyBlockInMeasure(measure.full, 'clef', clefBlock);
      return { ...measure, full: nextMeasure };
    });
    changed += updated.changedCount;
    return updated.content;
  });
  if (!changed) {
    return { error: 'No matching measures found for set_clef.' } as const;
  }
  return {
    xml: nextXml,
    changed: true,
    summary: `Updated clef in ${changed} measure(s).`,
  } as const;
}

function applyDeleteTextByContent(xml: string, op: Extract<ScoreOp, { op: 'delete_text_by_content' }>) {
  const escaped = op.text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(escaped, 'g');
  let replacements = 0;
  const nextXml = xml.replace(pattern, () => {
    replacements += 1;
    return '';
  });
  if (!replacements) {
    return { error: `Text not found: ${op.text}` } as const;
  }
  if (op.maxDeletes && replacements > op.maxDeletes) {
    return {
      error: `Matched ${replacements} items, exceeding maxDeletes=${op.maxDeletes}.`,
    } as const;
  }
  return {
    xml: nextXml,
    changed: true,
    summary: `Removed ${replacements} matching text occurrence(s).`,
  } as const;
}

function applyMeasureRemoval(
  xml: string,
  scope: ScoreScope,
  reason: 'delete_selection' | 'remove_measures',
) {
  const start = scope.measureStart;
  if (!start) {
    return { error: `${reason} requires scope.measureStart.` } as const;
  }
  const end = scope.measureEnd ?? start;
  const targetParts = resolveTargetPartIds(xml, scope.partId);
  if (!targetParts.length) {
    return { error: 'Target part not found.' } as const;
  }
  let removed = 0;
  const span = Math.max(0, end - start + 1);
  const nextXml = replacePartContents(xml, (part) => {
    if (!targetParts.includes(part.partId)) {
      return part.content;
    }
    const updated = updatePartMeasures(part.content, (measure) => {
      if (measure.number !== null && measure.number >= start && measure.number <= end) {
        removed += 1;
        return null;
      }
      if (span > 0 && measure.number !== null && measure.number > end) {
        return {
          ...measure,
          full: replaceMeasureNumber(measure.full, measure.number - span),
        };
      }
      return measure;
    });
    return updated.content;
  });
  if (!removed) {
    return { error: 'No matching measures found to remove.' } as const;
  }
  return {
    xml: nextXml,
    changed: true,
    summary: `Removed ${removed} measure(s).`,
  } as const;
}

function buildInsertedMeasureXml(measureNumber: number) {
  return `<measure number="${measureNumber}"><note><rest/><duration>4</duration><voice>1</voice><type>whole</type></note></measure>`;
}

function applyInsertMeasures(xml: string, op: Extract<ScoreOp, { op: 'insert_measures' }>) {
  const targetParts = resolveTargetPartIds(xml, op.partId);
  const targetPart = targetParts[0];
  if (!targetPart) {
    return { error: 'Target part not found.' } as const;
  }
  let changed = false;
  const nextXml = replacePartContents(xml, (part) => {
    if (part.partId !== targetPart) {
      return part.content;
    }
    const measures = parseMeasureBlocks(part.content);
    if (!measures.length) {
      return part.content;
    }

    const numericMeasures = measures
      .map((m, index) => ({ index, number: m.number }))
      .filter((m): m is { index: number; number: number } => m.number !== null);
    if (!numericMeasures.length) {
      return part.content;
    }

    const lastMeasure = numericMeasures[numericMeasures.length - 1]?.number || 1;
    const targetAfter = op.target === 'after_measure'
      ? (op.afterMeasure ?? lastMeasure)
      : lastMeasure;

    const afterIndex = measures.findIndex((measure) => measure.number === targetAfter);
    const insertIndex = afterIndex >= 0 ? afterIndex + 1 : measures.length;

    const shifted = measures.map((measure) => {
      if (measure.number !== null && measure.number > targetAfter) {
        return {
          ...measure,
          full: replaceMeasureNumber(measure.full, measure.number + op.count),
          number: measure.number + op.count,
        };
      }
      return measure;
    });

    const inserted: MeasureBlock[] = Array.from({ length: op.count }).map((_, idx) => {
      const number = targetAfter + idx + 1;
      return {
        full: buildInsertedMeasureXml(number),
        attrs: ` number="${number}"`,
        numberText: String(number),
        number,
      };
    });

    shifted.splice(insertIndex, 0, ...inserted);
    changed = true;
    return shifted.map((measure) => measure.full).join('\n');
  });

  if (!changed) {
    return { error: 'Unable to insert measures at requested target.' } as const;
  }

  return {
    xml: nextXml,
    changed: true,
    summary: `Inserted ${op.count} measure(s).`,
  } as const;
}

type OpApplyResult = {
  index: number;
  op: ScoreOp['op'];
  ok: boolean;
  message: string;
};

type ApplyOneOpResult =
  | { error: string }
  | { xml: string; changed: boolean; summary: string };

function isApplyOneOpError(result: ApplyOneOpResult): result is { error: string } {
  return 'error' in result;
}

function toApplyOneOpResult(
  result:
    | { error: string }
    | { xml: string; changed: boolean; summary: string },
): ApplyOneOpResult {
  if ('error' in result) {
    return { error: result.error };
  }
  return {
    xml: result.xml,
    changed: result.changed,
    summary: result.summary,
  };
}

function applyOneOp(xml: string, op: ScoreOp): ApplyOneOpResult {
  switch (op.op) {
    case 'set_metadata_text':
      return toApplyOneOpResult(applySetMetadataText(xml, op));
    case 'set_key_signature':
      return toApplyOneOpResult(applySetKeySignature(xml, op));
    case 'set_time_signature':
      return toApplyOneOpResult(applySetTimeSignature(xml, op));
    case 'set_clef':
      return toApplyOneOpResult(applySetClef(xml, op));
    case 'delete_selection':
      return toApplyOneOpResult(applyMeasureRemoval(xml, op.scope, 'delete_selection'));
    case 'insert_measures':
      return toApplyOneOpResult(applyInsertMeasures(xml, op));
    case 'remove_measures':
      return toApplyOneOpResult(applyMeasureRemoval(xml, op.scope, 'remove_measures'));
    case 'delete_text_by_content':
      return toApplyOneOpResult(applyDeleteTextByContent(xml, op));
    default:
      return { error: `Unsupported op: ${(op as { op: string }).op}` };
  }
}

type ScorePartMeasureIndex = Map<string, {
  partXml: string;
  measures: Map<number, string>;
  numbers: number[];
}>;

function buildPartMeasureIndex(xml: string): ScorePartMeasureIndex {
  const index: ScorePartMeasureIndex = new Map();
  const parts = parsePartBlocks(xml);
  for (const part of parts) {
    const measures = new Map<number, string>();
    const numbers: number[] = [];
    for (const measure of parseMeasureBlocks(part.content)) {
      if (measure.number === null) {
        continue;
      }
      measures.set(measure.number, measure.full);
      numbers.push(measure.number);
    }
    index.set(part.partId, {
      partXml: part.full,
      measures,
      numbers,
    });
  }
  return index;
}

function buildMeasureRange(scope?: ScoreScope) {
  const start = scope?.measureStart ?? 1;
  const end = scope?.measureEnd ?? start;
  return { start, end };
}

function buildOpDerivedPatchOps(
  op: ScoreOp,
  afterXml: string,
  afterIndex: ScorePartMeasureIndex,
): MusicXmlPatchOp[] | null {
  switch (op.op) {
    case 'set_metadata_text': {
      if (op.field === 'title') {
        return [{ op: 'setText', path: '/score-partwise/movement-title', value: op.value }];
      }
      if (op.field === 'subtitle') {
        return [{ op: 'setText', path: '/score-partwise/movement-number', value: op.value }];
      }
      if (op.field === 'composer') {
        return [{ op: 'setText', path: '/score-partwise/identification/creator[@type=\'composer\']', value: op.value }];
      }
      return [{ op: 'setText', path: '/score-partwise/identification/creator[@type=\'lyricist\']', value: op.value }];
    }
    case 'set_key_signature': {
      const partIds = resolveTargetPartIds(afterXml, op.scope?.partId);
      const range = buildMeasureRange(op.scope);
      const ops: MusicXmlPatchOp[] = [];
      for (const partId of partIds) {
        const measures = afterIndex.get(partId)?.measures;
        if (!measures) {
          continue;
        }
        for (let measureNo = range.start; measureNo <= range.end; measureNo += 1) {
          if (!measures.has(measureNo)) {
            continue;
          }
          ops.push({
            op: 'setText',
            path: `/score-partwise/part[@id='${partId}']/measure[@number='${measureNo}']/attributes/key/fifths`,
            value: String(op.fifths),
          });
        }
      }
      return ops.length ? ops : null;
    }
    case 'set_time_signature': {
      const partIds = resolveTargetPartIds(afterXml, op.scope?.partId);
      const range = buildMeasureRange(op.scope);
      const ops: MusicXmlPatchOp[] = [];
      for (const partId of partIds) {
        const measures = afterIndex.get(partId)?.measures;
        if (!measures) {
          continue;
        }
        for (let measureNo = range.start; measureNo <= range.end; measureNo += 1) {
          if (!measures.has(measureNo)) {
            continue;
          }
          ops.push({
            op: 'setText',
            path: `/score-partwise/part[@id='${partId}']/measure[@number='${measureNo}']/attributes/time/beats`,
            value: String(op.numerator),
          });
          ops.push({
            op: 'setText',
            path: `/score-partwise/part[@id='${partId}']/measure[@number='${measureNo}']/attributes/time/beat-type`,
            value: String(op.denominator),
          });
        }
      }
      return ops.length ? ops : null;
    }
    case 'set_clef': {
      const partIds = resolveTargetPartIds(afterXml, op.scope?.partId);
      const range = buildMeasureRange(op.scope);
      const clefMap: Record<z.infer<typeof CLEF_SCHEMA>, { sign: string; line: string }> = {
        treble: { sign: 'G', line: '2' },
        bass: { sign: 'F', line: '4' },
        alto: { sign: 'C', line: '3' },
        tenor: { sign: 'C', line: '4' },
      };
      const mapping = clefMap[op.clef];
      const ops: MusicXmlPatchOp[] = [];
      for (const partId of partIds) {
        const measures = afterIndex.get(partId)?.measures;
        if (!measures) {
          continue;
        }
        for (let measureNo = range.start; measureNo <= range.end; measureNo += 1) {
          if (!measures.has(measureNo)) {
            continue;
          }
          ops.push({
            op: 'setText',
            path: `/score-partwise/part[@id='${partId}']/measure[@number='${measureNo}']/attributes/clef/sign`,
            value: mapping.sign,
          });
          ops.push({
            op: 'setText',
            path: `/score-partwise/part[@id='${partId}']/measure[@number='${measureNo}']/attributes/clef/line`,
            value: mapping.line,
          });
        }
      }
      return ops.length ? ops : null;
    }
    default:
      return null;
  }
}

function buildMeasureDiffFallbackPatch(beforeXml: string, afterXml: string): MusicXmlPatch {
  if (beforeXml === afterXml) {
    return { format: 'musicxml-patch@1', ops: [] };
  }

  const beforeIndex = buildPartMeasureIndex(beforeXml);
  const afterIndex = buildPartMeasureIndex(afterXml);
  const beforePartIds = Array.from(beforeIndex.keys()).sort();
  const afterPartIds = Array.from(afterIndex.keys()).sort();

  if (beforePartIds.join('|') !== afterPartIds.join('|')) {
    return {
      format: 'musicxml-patch@1',
      ops: [{
        op: 'replace',
        path: '/score-partwise',
        value: afterXml,
      }],
    };
  }

  const ops: MusicXmlPatchOp[] = [];
  for (const partId of afterPartIds) {
    const beforePart = beforeIndex.get(partId);
    const afterPart = afterIndex.get(partId);
    if (!beforePart || !afterPart) {
      continue;
    }
    if (beforePart.numbers.join(',') !== afterPart.numbers.join(',')) {
      ops.push({
        op: 'replace',
        path: `/score-partwise/part[@id='${partId}']`,
        value: afterPart.partXml,
      });
      continue;
    }
    for (const measureNo of afterPart.numbers) {
      const beforeMeasure = beforePart.measures.get(measureNo) || '';
      const afterMeasure = afterPart.measures.get(measureNo) || '';
      if (beforeMeasure !== afterMeasure) {
        ops.push({
          op: 'replace',
          path: `/score-partwise/part[@id='${partId}']/measure[@number='${measureNo}']`,
          value: afterMeasure,
        });
      }
    }
  }

  if (!ops.length) {
    return {
      format: 'musicxml-patch@1',
      ops: [{
        op: 'replace',
        path: '/score-partwise',
        value: afterXml,
      }],
    };
  }
  return { format: 'musicxml-patch@1', ops };
}

function buildScoreOpsPatch(
  ops: ScoreOp[],
  beforeXml: string,
  afterXml: string,
): { patch: MusicXmlPatch; mode: 'op-derived' | 'measure-diff-fallback'; note?: string } {
  const afterIndex = buildPartMeasureIndex(afterXml);
  const derivedOps: MusicXmlPatchOp[] = [];
  for (const op of ops) {
    const nextOps = buildOpDerivedPatchOps(op, afterXml, afterIndex);
    if (!nextOps || !nextOps.length) {
      return {
        patch: buildMeasureDiffFallbackPatch(beforeXml, afterXml),
        mode: 'measure-diff-fallback',
        note: `Op "${op.op}" does not have a deterministic patch emitter yet.`,
      };
    }
    derivedOps.push(...nextOps);
  }
  if (!derivedOps.length) {
    return {
      patch: buildMeasureDiffFallbackPatch(beforeXml, afterXml),
      mode: 'measure-diff-fallback',
      note: 'No op-derived patch operations were emitted.',
    };
  }
  return {
    patch: {
      format: 'musicxml-patch@1',
      ops: derivedOps,
    },
    mode: 'op-derived',
  };
}

function buildCapabilities() {
  return {
    ops: [
      'inspect_score',
      'inspect_scope',
      'inspect_selection',
      'set_metadata_text',
      'set_key_signature',
      'set_time_signature',
      'set_clef',
      'delete_selection',
      'insert_measures',
      'remove_measures',
      'delete_text_by_content',
    ],
    runtime: {
      executor: 'musicxml-string',
      wasmMethods: [],
      supportsAtomicRollback: true,
    },
  };
}

async function resolveSourceMusicXml(data: {
  initialArtifactId?: string;
  initial_artifact_id?: string;
  inputArtifactId?: string;
  input_artifact_id?: string;
  content?: string;
  text?: string;
}): Promise<{ xml: string; artifact: ScoreArtifact | null; error?: ScoreOpsServiceResult }> {
  const artifactId = normalizeInputArtifactId(data);
  if (artifactId) {
    const artifact = await getScoreArtifact(artifactId);
    if (!artifact) {
      return {
        xml: '',
        artifact: null,
        error: errorResult(404, 'target_not_found', 'Input artifact not found.', { artifactId }),
      };
    }
    if (artifact.format !== 'musicxml') {
      return {
        xml: '',
        artifact: null,
        error: errorResult(400, 'invalid_request', 'Input artifact must be musicxml format.', {
          artifactId,
          format: artifact.format,
        }),
      };
    }
    return { xml: artifact.content, artifact };
  }

  const xml = readContent(data);
  if (!xml.trim()) {
    return {
      xml: '',
      artifact: null,
      error: errorResult(400, 'invalid_request', 'Missing score content or input artifact.'),
    };
  }
  if (!looksLikeMusicXml(xml)) {
    return {
      xml: '',
      artifact: null,
      error: errorResult(400, 'invalid_request', 'Input does not look like MusicXML.'),
    };
  }
  return { xml, artifact: null };
}

async function openSession(payload: z.infer<typeof OPEN_REQUEST_SCHEMA>): Promise<ScoreOpsServiceResult> {
  const resolved = await resolveSourceMusicXml(payload);
  if (resolved.error) {
    return resolved.error;
  }

  const initialArtifact = resolved.artifact || await createScoreArtifact({
    format: 'musicxml',
    content: resolved.xml,
    label: 'scoreops-open',
    metadata: {
      origin: 'api/music/scoreops/session/open',
      scoreMeta: payload.scoreMeta || payload.score_meta || null,
    },
  });

  const session = createScoreOpsSession({
    content: resolved.xml,
    artifactId: initialArtifact.id,
    revision: 0,
  });

  return {
    status: 200,
    body: {
      ok: true,
      scoreSessionId: session.scoreSessionId,
      revision: session.revision,
      state: {
        artifactId: session.artifactId,
        contentHash: session.contentHash,
      },
      inputArtifact: summarizeScoreArtifact(initialArtifact),
    },
  };
}

function getSessionForRequest(scoreSessionId: string | undefined) {
  if (!scoreSessionId) {
    return null;
  }
  return getScoreOpsSession(scoreSessionId);
}

function ensureRevision(session: ScoreOpsSessionState, baseRevision: number | undefined): ScoreOpsServiceResult | null {
  if (baseRevision === undefined) {
    return null;
  }
  if (baseRevision !== session.revision) {
    return errorResult(409, 'stale_revision', `baseRevision=${baseRevision} is stale; latest is ${session.revision}`, {
      latestRevision: session.revision,
      scoreSessionId: session.scoreSessionId,
    });
  }
  return null;
}

function buildSelectionSummary(scope?: ScoreScope) {
  if (!scope?.measureStart) {
    return {
      hasSelection: false,
      selectionType: 'none',
    };
  }
  return {
    hasSelection: true,
    selectionType: 'range',
    partId: scope.partId || null,
    measureStart: scope.measureStart,
    measureEnd: scope.measureEnd ?? scope.measureStart,
  };
}

async function inspectSession(payload: z.infer<typeof INSPECT_REQUEST_SCHEMA>): Promise<ScoreOpsServiceResult> {
  const session = getSessionForRequest(payload.scoreSessionId);
  if (!session) {
    return errorResult(404, 'session_not_found', 'ScoreOps session not found.', {
      scoreSessionId: payload.scoreSessionId,
    });
  }
  const staleError = ensureRevision(session, payload.revision);
  if (staleError) {
    return staleError;
  }

  const include = {
    capabilities: payload.include?.capabilities ?? true,
    selectionSummary: payload.include?.selectionSummary ?? true,
    scoreSummary: payload.include?.scoreSummary ?? true,
    measureSignatures: payload.include?.measureSignatures ?? false,
    targetPreview: payload.include?.targetPreview ?? true,
  };

  const body: Record<string, unknown> = {
    ok: true,
    scoreSessionId: session.scoreSessionId,
    revision: session.revision,
  };

  if (include.capabilities) {
    body.capabilities = buildCapabilities();
  }
  if (include.scoreSummary) {
    body.scoreSummary = extractScoreSummary(session.content);
  }
  if (include.selectionSummary) {
    body.selectionSummary = buildSelectionSummary(payload.scope);
  }
  if (include.targetPreview) {
    body.targetPreview = {
      measures: collectMeasurePreview(session.content, payload.scope),
      hash: session.contentHash,
    };
  }
  if (include.measureSignatures) {
    const signatures = Array.from(session.content.matchAll(/<time\b[^>]*>[\s\S]*?<beats>(\d+)<\/beats>[\s\S]*?<beat-type>(\d+)<\/beat-type>[\s\S]*?<\/time>/gi))
      .slice(0, 24)
      .map((match) => `${match[1]}/${match[2]}`);
    body.measureSignatures = signatures;
  }

  return {
    status: 200,
    body,
  };
}

async function ensureSessionForApplyOrSync(payload: {
  scoreSessionId?: string;
  inputArtifactId?: string;
  input_artifact_id?: string;
  content?: string;
  text?: string;
}): Promise<{ session: ScoreOpsSessionState | null; error?: ScoreOpsServiceResult }> {
  if (payload.scoreSessionId) {
    const existing = getScoreOpsSession(payload.scoreSessionId);
    if (!existing) {
      return {
        session: null,
        error: errorResult(404, 'session_not_found', 'ScoreOps session not found.', {
          scoreSessionId: payload.scoreSessionId,
        }),
      };
    }
    return { session: existing };
  }

  const resolved = await resolveSourceMusicXml(payload);
  if (resolved.error) {
    return { session: null, error: resolved.error };
  }

  const artifact = resolved.artifact || await createScoreArtifact({
    format: 'musicxml',
    content: resolved.xml,
    label: 'scoreops-lazy-open',
    metadata: {
      origin: 'api/music/scoreops/lazy-open',
    },
  });

  const session = createScoreOpsSession({
    content: resolved.xml,
    artifactId: artifact.id,
    revision: 0,
  });

  return { session };
}

async function applyOps(payload: z.infer<typeof APPLY_REQUEST_SCHEMA>): Promise<ScoreOpsServiceResult> {
  const sessionResolution = await ensureSessionForApplyOrSync(payload);
  if (sessionResolution.error) {
    return sessionResolution.error;
  }
  const session = sessionResolution.session;
  if (!session) {
    return errorResult(500, 'execution_failure', 'Failed to resolve ScoreOps session.');
  }

  const staleError = ensureRevision(session, payload.baseRevision);
  if (staleError) {
    return staleError;
  }

  const atomic = payload.options?.atomic ?? true;
  const includeXml = payload.options?.includeXml ?? false;
  const includePatch = payload.options?.includePatch ?? false;
  const includeMeasureDiff = payload.options?.includeMeasureDiff ?? false;

  const beforeXml = session.content;
  let workingXml = beforeXml;
  const applied: OpApplyResult[] = [];
  const summaries: string[] = [];

  for (let index = 0; index < payload.ops.length; index += 1) {
    const op = payload.ops[index];
    const output = applyOneOp(workingXml, op);
    if (isApplyOneOpError(output)) {
      const failedEntry: OpApplyResult = {
        index,
        op: op.op,
        ok: false,
        message: output.error,
      };
      applied.push(failedEntry);
      if (atomic) {
        return {
          status: 422,
          body: {
            ok: false,
            scoreSessionId: session.scoreSessionId,
            baseRevision: session.revision,
            error: {
              code: 'execution_failure',
              message: output.error,
              details: {
                failedOpIndex: index,
                failedOp: op.op,
                rollback: 'completed',
                applied,
              },
            },
          },
        };
      }
      continue;
    }
    if (!output.changed) {
      const failedEntry: OpApplyResult = {
        index,
        op: op.op,
        ok: false,
        message: 'No effective change produced.',
      };
      applied.push(failedEntry);
      if (atomic) {
        return {
          status: 422,
          body: {
            ok: false,
            scoreSessionId: session.scoreSessionId,
            baseRevision: session.revision,
            error: {
              code: 'execution_failure',
              message: failedEntry.message,
              details: {
                failedOpIndex: index,
                failedOp: op.op,
                rollback: 'completed',
                applied,
              },
            },
          },
        };
      }
      continue;
    }

    workingXml = output.xml;
    summaries.push(output.summary);
    applied.push({
      index,
      op: op.op,
      ok: true,
      message: output.summary,
    });
  }

  if (workingXml === beforeXml) {
    return errorResult(422, 'execution_failure', 'No operations were applied.', {
      applied,
      atomic,
    });
  }

  const artifact = await createScoreArtifact({
    format: 'musicxml',
    content: workingXml,
    label: 'scoreops-apply-result',
    parentArtifactId: session.artifactId || undefined,
    sourceArtifactId: session.artifactId || undefined,
    metadata: {
      origin: 'api/music/scoreops/apply',
      scoreSessionId: session.scoreSessionId,
      baseRevision: session.revision,
      opCount: payload.ops.length,
      atomic,
    },
  });

  const updatedSession = updateScoreOpsSession(session.scoreSessionId, {
    content: workingXml,
    artifactId: artifact.id,
  });

  if (!updatedSession) {
    return errorResult(500, 'execution_failure', 'Failed to persist ScoreOps session update.');
  }

  const responseBody: Record<string, unknown> = {
    ok: true,
    scoreSessionId: updatedSession.scoreSessionId,
    baseRevision: session.revision,
    newRevision: updatedSession.revision,
    state: {
      artifactId: updatedSession.artifactId,
      contentHash: updatedSession.contentHash,
    },
    applied,
    changes: {
      summary: summaries.join(' '),
      count: applied.filter((entry) => entry.ok).length,
      ...(includeMeasureDiff ? {
        measurePreview: collectMeasurePreview(workingXml, undefined, DEFAULT_INSPECT_MEASURE_LIMIT),
      } : {}),
    },
    outputArtifact: summarizeScoreArtifact(artifact),
  };

  if (includeXml) {
    responseBody.output = {
      format: 'musicxml',
      content: workingXml,
    };
  }

  if (includePatch) {
    const patchBundle = buildScoreOpsPatch(payload.ops, beforeXml, workingXml);
    responseBody.patch = patchBundle.patch;
    responseBody.patchMode = patchBundle.mode;
    if (patchBundle.note) {
      responseBody.patchNote = patchBundle.note;
    }
  }

  return {
    status: 200,
    body: responseBody,
  };
}

async function syncSession(payload: z.infer<typeof SYNC_REQUEST_SCHEMA>): Promise<ScoreOpsServiceResult> {
  const sessionResolution = await ensureSessionForApplyOrSync(payload);
  if (sessionResolution.error) {
    return sessionResolution.error;
  }
  const session = sessionResolution.session;
  if (!session) {
    return errorResult(500, 'execution_failure', 'Failed to resolve ScoreOps session.');
  }

  const staleError = ensureRevision(session, payload.baseRevision);
  if (staleError) {
    return staleError;
  }

  const resolved = await resolveSourceMusicXml(payload);
  if (resolved.error) {
    return resolved.error;
  }

  const artifact = resolved.artifact || await createScoreArtifact({
    format: 'musicxml',
    content: resolved.xml,
    label: 'scoreops-sync',
    parentArtifactId: session.artifactId || undefined,
    sourceArtifactId: session.artifactId || undefined,
    metadata: {
      origin: 'api/music/scoreops/sync',
      scoreSessionId: session.scoreSessionId,
      baseRevision: session.revision,
    },
  });

  const updated = updateScoreOpsSession(session.scoreSessionId, {
    content: resolved.xml,
    artifactId: artifact.id,
  });

  if (!updated) {
    return errorResult(500, 'execution_failure', 'Failed to persist synced score session.');
  }

  return {
    status: 200,
    body: {
      ok: true,
      scoreSessionId: updated.scoreSessionId,
      baseRevision: session.revision,
      newRevision: updated.revision,
      state: {
        artifactId: updated.artifactId,
        contentHash: updated.contentHash,
      },
      outputArtifact: summarizeScoreArtifact(artifact),
    },
  };
}

export async function runMusicScoreOpsService(
  body: unknown,
  forcedAction?: RequestPayload['action'],
): Promise<ScoreOpsServiceResult> {
  const payloadInput = (body && typeof body === 'object') ? { ...(body as Record<string, unknown>) } : {};
  if (forcedAction) {
    payloadInput.action = forcedAction;
  }

  const parsed = REQUEST_SCHEMA.safeParse(payloadInput);
  if (!parsed.success) {
    return errorResult(400, 'invalid_request', 'Invalid ScoreOps request.', {
      issues: parsed.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    });
  }

  const payload = parsed.data;
  if (payload.action === 'open') {
    return openSession(payload);
  }
  if (payload.action === 'inspect') {
    return inspectSession(payload);
  }
  if (payload.action === 'apply') {
    return applyOps(payload);
  }
  return syncSession(payload);
}

const MAJOR_KEY_TO_FIFTHS: Record<string, number> = {
  C: 0,
  G: 1,
  D: 2,
  A: 3,
  E: 4,
  B: 5,
  'F#': 6,
  'C#': 7,
  F: -1,
  Bb: -2,
  Eb: -3,
  Ab: -4,
  Db: -5,
  Gb: -6,
  Cb: -7,
};

const MINOR_KEY_TO_FIFTHS: Record<string, number> = {
  A: 0,
  E: 1,
  B: 2,
  'F#': 3,
  'C#': 4,
  'G#': 5,
  'D#': 6,
  'A#': 7,
  D: -1,
  G: -2,
  C: -3,
  F: -4,
  Bb: -5,
  Eb: -6,
  Ab: -7,
};

function normalizeKeyName(value: string) {
  return value
    .replace(/major|minor/gi, '')
    .replace(/\s+/g, '')
    .replace('♭', 'b')
    .replace('♯', '#')
    .trim();
}

function parsePromptToOps(prompt: string): { ops: ScoreOp[]; unsupportedHints: string[] } {
  const ops: ScoreOp[] = [];
  const unsupportedHints: string[] = [];
  const lower = prompt.toLowerCase();

  const keyMatch = prompt.match(/key signature\s+to\s+([A-Ga-g][#b♯♭]?)(?:\s+(major|minor))?/i);
  if (keyMatch) {
    const tonic = normalizeKeyName(keyMatch[1]);
    const mode = (keyMatch[2] || 'major').toLowerCase();
    const table = mode === 'minor' ? MINOR_KEY_TO_FIFTHS : MAJOR_KEY_TO_FIFTHS;
    const fifths = table[`${tonic[0]?.toUpperCase() || ''}${tonic.slice(1)}`];
    if (typeof fifths === 'number') {
      ops.push({ op: 'set_key_signature', fifths });
    } else {
      unsupportedHints.push(`Unable to map key signature: ${keyMatch[0]}`);
    }
  }

  const timeMatch = prompt.match(/time signature\s+to\s+(\d+)\s*\/\s*(\d+)/i);
  if (timeMatch) {
    const numerator = Number(timeMatch[1]);
    const denominator = Number(timeMatch[2]);
    if ([1, 2, 4, 8, 16, 32].includes(denominator)) {
      ops.push({
        op: 'set_time_signature',
        numerator,
        denominator: denominator as 1 | 2 | 4 | 8 | 16 | 32,
      });
    } else {
      unsupportedHints.push(`Unsupported denominator for time signature: ${denominator}`);
    }
  }

  const clefMatch = prompt.match(/(?:set|change|move)[^\n.]*?(treble|bass|alto|tenor)\s+clef/i);
  if (clefMatch) {
    const clef = clefMatch[1].toLowerCase() as z.infer<typeof CLEF_SCHEMA>;
    const measureRangeMatch = prompt.match(/(measure|bar)s?\s+(\d+)\s*(?:-|to)\s*(\d+)/i);
    if (measureRangeMatch) {
      ops.push({
        op: 'set_clef',
        clef,
        scope: {
          measureStart: Number(measureRangeMatch[2]),
          measureEnd: Number(measureRangeMatch[3]),
        },
      });
    } else {
      ops.push({ op: 'set_clef', clef });
    }
  }

  const removeTextMatch = prompt.match(/remove\s+(?:the\s+)?text\s+["“]([^"”]+)["”]/i);
  if (removeTextMatch) {
    ops.push({
      op: 'delete_text_by_content',
      text: removeTextMatch[1],
      maxDeletes: 20,
    });
  }

  const removeMeasuresMatch = prompt.match(/remove\s+(?:measure|bar)s?\s+(\d+)\s*(?:-|to)\s*(\d+)/i);
  if (removeMeasuresMatch) {
    ops.push({
      op: 'remove_measures',
      scope: {
        measureStart: Number(removeMeasuresMatch[1]),
        measureEnd: Number(removeMeasuresMatch[2]),
      },
    });
  }

  const insertMeasuresMatch = prompt.match(/insert\s+(\d+)\s+(?:measure|bar)s?(?:\s+after\s+(?:measure|bar)\s+(\d+))?/i);
  if (insertMeasuresMatch) {
    const count = Number(insertMeasuresMatch[1]);
    const afterMeasure = insertMeasuresMatch[2] ? Number(insertMeasuresMatch[2]) : undefined;
    ops.push({
      op: 'insert_measures',
      count,
      target: afterMeasure ? 'after_measure' : 'end',
      ...(afterMeasure ? { afterMeasure } : {}),
    });
  }

  if (/beam|beaming|re-beam|voicing|rests?\s+\/|remove\s+rests?/i.test(lower)) {
    unsupportedHints.push('Prompt requests beaming/rest cleanup, which is not implemented in ScoreOps MVP yet.');
  }

  return { ops, unsupportedHints };
}

export async function runMusicScoreOpsPromptService(body: unknown): Promise<ScoreOpsServiceResult> {
  const data = (body && typeof body === 'object') ? (body as Record<string, unknown>) : {};
  const prompt = typeof data.prompt === 'string' ? data.prompt.trim() : '';
  if (!prompt) {
    return errorResult(400, 'invalid_request', 'Missing prompt for scoreops planning.');
  }

  const parsed = parsePromptToOps(prompt);
  if (!parsed.ops.length) {
    return errorResult(422, 'unsupported_op', 'Prompt could not be mapped to supported ScoreOps MVP operations.', {
      unsupportedHints: parsed.unsupportedHints,
    });
  }

  const applyBody: Record<string, unknown> = {
    action: 'apply',
    scoreSessionId: typeof data.scoreSessionId === 'string' ? data.scoreSessionId : undefined,
    baseRevision: typeof data.baseRevision === 'number' ? data.baseRevision : undefined,
    inputArtifactId: typeof data.inputArtifactId === 'string' ? data.inputArtifactId : (typeof data.input_artifact_id === 'string' ? data.input_artifact_id : undefined),
    content: typeof data.content === 'string' ? data.content : (typeof data.text === 'string' ? data.text : undefined),
    ops: parsed.ops,
    options: {
      atomic: true,
      includeXml: true,
      includePatch: false,
      includeMeasureDiff: true,
      ...(data.options && typeof data.options === 'object' ? data.options as Record<string, unknown> : {}),
    },
  };

  const applied = await runMusicScoreOpsService(applyBody, 'apply');
  if (applied.status >= 400) {
    return {
      status: applied.status,
      body: {
        ...applied.body,
        planner: {
          mode: 'heuristic',
          prompt,
          parsedOps: parsed.ops,
          unsupportedHints: parsed.unsupportedHints,
        },
      },
    };
  }

  return {
    status: 200,
    body: {
      ok: true,
      mode: 'scoreops-heuristic',
      planner: {
        mode: 'heuristic',
        prompt,
        parsedOps: parsed.ops,
        unsupportedHints: parsed.unsupportedHints,
      },
      execution: applied.body,
    },
  };
}

export const __scoreOpsTestOnly = {
  clearSessions: clearScoreOpsSessions,
  parsePromptToOps,
};
