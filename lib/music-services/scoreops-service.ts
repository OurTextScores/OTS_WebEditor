import { z } from 'zod';
import {
  createScoreArtifact,
  getScoreArtifact,
  summarizeScoreArtifact,
  type ScoreArtifact,
} from '../score-artifacts';
import { loadWebMscoreInProcess, type Score } from '../webmscore-loader';
import {
  asRecord,
  errorResult,
  looksLikeMusicXml,
  normalizeInputArtifactId,
  normalizeScoreSessionId,
  readBoolean,
  readContent,
  resolveScoreContent,
  type ServiceResult,
} from './common';
import { sanitizeEditorLaunchContext } from '../editor-launch-context';
import {
  clearScoreOpsSessions,
  createScoreOpsSession,
  getScoreOpsSession,
  updateScoreOpsSession,
  type ScoreOpsSessionState,
  type ScoreOpsSessionMetadata,
} from './scoreops-session-store';

type ScoreOpsServiceResult = ServiceResult;

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

type ScoreOpsExecutorMode = 'auto' | 'wasm' | 'xml';

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
const DYNAMIC_SCHEMA = z.enum([
  'ppp', 'pp', 'p', 'mp', 'mf', 'f', 'ff', 'fff', 'fp', 'sfz',
  'pppppp', 'ppppp', 'pppp', 'ffff', 'fffff', 'ffffff',
  'pf', 'sf', 'sff', 'sffz', 'sfp', 'sfpp', 'rfz', 'rf', 'fz',
]);
const INSERT_TARGET_SCHEMA = z.enum(['start', 'end', 'after_measure']);
const DURATION_TYPE_SCHEMA = z.enum([
  'long', 'breve', 'whole', 'half', 'quarter', 'eighth',
  '16th', '32nd', '64th', '128th', '256th', '512th', '1024th',
]);
const VOICE_SCHEMA = z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]);
const ACCIDENTAL_SCHEMA = z.enum(['sharp', 'flat', 'natural', 'double-sharp', 'double-flat']);
const TEXT_KIND_SCHEMA = z.enum([
  'staff', 'system', 'expression', 'lyric', 'harmony',
  'fingering', 'instrument_change', 'sticking',
]);
const BREAK_TYPE_SCHEMA = z.enum(['line', 'page']);
const BARLINE_TYPE_SCHEMA = z.enum([
  'normal', 'double', 'end', 'start-repeat', 'end-repeat', 'end-start-repeat',
]);

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
  z.object({
    op: z.literal('transpose_selection'),
    semitones: z.number().int().min(-24).max(24),
    scope: SCOPE_SCHEMA.optional(),
  }),
  z.object({
    op: z.literal('add_tempo_marking'),
    bpm: z.number().int().min(20).max(400),
    scope: SCOPE_SCHEMA.optional(),
  }),
  z.object({
    op: z.literal('add_dynamic'),
    dynamic: DYNAMIC_SCHEMA,
    scope: SCOPE_SCHEMA.optional(),
  }),
  z.object({
    op: z.literal('select_measure_range'),
    scope: SCOPE_SCHEMA,
  }),
  z.object({
    op: z.literal('select_all'),
  }),
  z.object({
    op: z.literal('replace_selected_text'),
    value: z.string(),
    scope: SCOPE_SCHEMA.optional(),
  }),
  z.object({
    op: z.literal('set_duration'),
    durationType: DURATION_TYPE_SCHEMA,
    scope: SCOPE_SCHEMA.optional(),
  }),
  z.object({
    op: z.literal('set_voice'),
    voice: VOICE_SCHEMA,
    scope: SCOPE_SCHEMA.optional(),
  }),
  z.object({
    op: z.literal('set_accidental'),
    accidental: ACCIDENTAL_SCHEMA,
    scope: SCOPE_SCHEMA.optional(),
  }),
  z.object({
    op: z.literal('insert_text'),
    kind: TEXT_KIND_SCHEMA,
    text: z.string().trim().min(1),
    scope: SCOPE_SCHEMA.optional(),
  }),
  z.object({
    op: z.literal('set_layout_break'),
    breakType: BREAK_TYPE_SCHEMA,
    enabled: z.boolean().default(true),
    scope: SCOPE_SCHEMA.optional(),
  }),
  z.object({
    op: z.literal('set_repeat_markers'),
    start: z.boolean().optional(),
    end: z.boolean().optional(),
    count: z.number().int().min(1).max(32).optional(),
    barline: BARLINE_TYPE_SCHEMA.optional(),
    scope: SCOPE_SCHEMA.optional(),
  }),
  z.object({
    op: z.literal('history_step'),
    direction: z.enum(['undo', 'redo']),
    steps: z.number().int().min(1).max(50).default(1),
  }),
  z.object({
    op: z.literal('export_score'),
    formats: z.array(z.enum(['musicxml', 'midi', 'pdf'])).min(1),
  }),
  z.object({
    op: z.literal('add_pickup'),
    numerator: z.number().int().min(1).max(32),
    denominator: z.union([
      z.literal(1),
      z.literal(2),
      z.literal(4),
      z.literal(8),
      z.literal(16),
      z.literal(32),
    ]),
  }),
]);

type ScoreOp = z.infer<typeof SCORE_OP_SCHEMA>;

type ScoreOpName = ScoreOp['op'];

type ScoreOpsMutationOpSupport = Record<ScoreOpName, {
  xml: boolean;
  wasm: boolean;
}>;

const SCOREOPS_MUTATION_OPS: ScoreOpName[] = [
  'set_metadata_text',
  'set_key_signature',
  'set_time_signature',
  'set_clef',
  'delete_selection',
  'insert_measures',
  'remove_measures',
  'delete_text_by_content',
  'transpose_selection',
  'add_tempo_marking',
  'add_dynamic',
  'replace_selected_text',
  'set_duration',
  'set_voice',
  'set_accidental',
  'insert_text',
  'set_layout_break',
  'set_repeat_markers',
  'history_step',
  'add_pickup',
  'export_score',
];

const SCOREOPS_WASM_ELIGIBLE_OPS = new Set<ScoreOpName>([
  'set_metadata_text',
  'set_key_signature',
  'set_time_signature',
  'set_clef',
  'delete_selection',
  'insert_measures',
  'remove_measures',
  'transpose_selection',
  'add_tempo_marking',
  'add_dynamic',
  'select_measure_range',
  'select_all',
  'replace_selected_text',
  'set_duration',
  'set_voice',
  'set_accidental',
  'insert_text',
  'set_layout_break',
  'set_repeat_markers',
  'history_step',
  'add_pickup',
  'export_score',
]);

const SCOREOPS_SELECTION_OPS = [
  'select_measure_range',
  'select_all',
] as const;

const SCOREOPS_INSPECT_OPS = [
  'inspect_score',
  'inspect_scope',
  'inspect_selection',
] as const;

const SCOREOPS_CAPABILITY_PROBE_XML = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list>
    <score-part id="P1"><part-name>Music</part-name></score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>1</divisions>
        <key><fifths>0</fifths></key>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <clef><sign>G</sign><line>2</line></clef>
      </attributes>
      <note>
        <pitch><step>C</step><octave>4</octave></pitch>
        <duration>4</duration>
        <type>whole</type>
      </note>
    </measure>
  </part>
</score-partwise>`;

const SCOREOPS_WASM_METHOD_KEYS = [
  'saveXml',
  'relayout',
  'selectPartMeasureByIndex',
  'setTitleText',
  'setSubtitleText',
  'setComposerText',
  'setLyricistText',
  'setKeySignature',
  'setTimeSignature',
  'setClef',
  'insertMeasures',
  'removeSelectedMeasures',
  'transpose',
  'addTempoText',
  'addDynamic',
  'setSelectedText',
  'setDurationType',
  'doubleDuration',
  'halfDuration',
  'toggleDot',
  'toggleDoubleDot',
  'setVoice',
  'changeSelectedElementsVoice',
  'setAccidental',
  'addStaffText',
  'addSystemText',
  'addExpressionText',
  'addLyricText',
  'addHarmonyText',
  'toggleLineBreak',
  'togglePageBreak',
  'toggleRepeatStart',
  'toggleRepeatEnd',
  'setRepeatCount',
  'setBarLineType',
  'undo',
  'redo',
] as const;

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
    preferredExecutor: z.enum(['auto', 'wasm', 'xml']).optional(),
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
  scoreMeta: z.record(z.string(), z.unknown()).optional(),
  score_meta: z.record(z.string(), z.unknown()).optional(),
});

const REQUEST_SCHEMA = z.discriminatedUnion('action', [
  OPEN_REQUEST_SCHEMA,
  INSPECT_REQUEST_SCHEMA,
  APPLY_REQUEST_SCHEMA,
  SYNC_REQUEST_SCHEMA,
]);

type RequestPayload = z.infer<typeof REQUEST_SCHEMA>;

function readScoreMeta(
  payload: {
    scoreMeta?: Record<string, unknown>;
    score_meta?: Record<string, unknown>;
  },
): Record<string, unknown> | null {
  return asRecord(payload.scoreMeta) || asRecord(payload.score_meta) || null;
}

function buildSessionMetadata(
  payload: {
    scoreMeta?: Record<string, unknown>;
    score_meta?: Record<string, unknown>;
  },
  existing?: ScoreOpsSessionMetadata | null,
): ScoreOpsSessionMetadata | null {
  const scoreMeta = readScoreMeta(payload);
  const launchContext = sanitizeEditorLaunchContext(scoreMeta?.launchContext);
  const next: ScoreOpsSessionMetadata = {
    ...(existing || {}),
  };

  if (scoreMeta) {
    next.scoreMeta = scoreMeta;
  }
  if (launchContext) {
    next.launchContext = launchContext;
  }

  return Object.keys(next).length > 0 ? next : null;
}

function errorResultWrapper(
  status: number,
  code: ScoreOpsErrorCode,
  message: string,
  details?: Record<string, unknown>,
): ScoreOpsServiceResult {
  return errorResult(status, code, message, details);
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

  const partDetails: Array<{
    partId: string;
    keyFifths: number | null;
    timeSignature: string | null;
    clef: { sign: string; line: string } | null;
  }> = [];
  if (partNames.length > 1) {
    const parts = parsePartBlocks(xml);
    for (const part of parts) {
      const fifthsMatch = part.content.match(/<key\b[^>]*>[\s\S]*?<fifths>(-?\d+)<\/fifths>[\s\S]*?<\/key>/i);
      const beatsMatch = part.content.match(/<time\b[^>]*>[\s\S]*?<beats>(\d+)<\/beats>/i);
      const beatTypeMatch = part.content.match(/<time\b[^>]*>[\s\S]*?<beat-type>(\d+)<\/beat-type>/i);
      const clefSignMatch = part.content.match(/<clef\b[^>]*>[\s\S]*?<sign>([A-Z])<\/sign>/i);
      const clefLineMatch = part.content.match(/<clef\b[^>]*>[\s\S]*?<line>(\d+)<\/line>/i);
      partDetails.push({
        partId: part.partId,
        keyFifths: fifthsMatch ? Number(fifthsMatch[1]) : null,
        timeSignature: beatsMatch && beatTypeMatch ? `${beatsMatch[1]}/${beatTypeMatch[1]}` : null,
        clef: clefSignMatch && clefLineMatch ? { sign: clefSignMatch[1], line: clefLineMatch[1] } : null,
      });
    }
  }

  return {
    parts: partNames,
    measureCountEstimate: (xml.match(/<measure\b/gi) || []).length,
    keyFifths: firstFifths === null ? null : Number(firstFifths),
    timeSignature: firstTime,
    ...(partDetails.length ? { partDetails } : {}),
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

    if (op.target === 'start') {
      // Insert before measure 1: shift all existing measures up, insert at index 0
      const shiftedMeasures = measures.map((measure) => {
        if (measure.number !== null) {
          return {
            ...measure,
            full: replaceMeasureNumber(measure.full, measure.number + op.count),
            number: measure.number + op.count,
          };
        }
        return measure;
      });

      const inserted: MeasureBlock[] = Array.from({ length: op.count }).map((_, idx) => {
        const number = idx + 1;
        return {
          full: buildInsertedMeasureXml(number),
          attrs: ` number="${number}"`,
          numberText: String(number),
          number,
        };
      });

      changed = true;
      return [...inserted, ...shiftedMeasures].map((m) => m.full).join('\n');
    }

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

function pickupRestType(numerator: number, denominator: number): string {
  const denomTypes: Record<number, string> = {
    1: 'whole', 2: 'half', 4: 'quarter', 8: 'eighth', 16: '16th', 32: '32nd',
  };
  if (numerator === 1) return denomTypes[denominator] || 'quarter';
  if (numerator === 3) {
    const dottedDenom = denominator / 2;
    if (denomTypes[dottedDenom]) return denomTypes[dottedDenom];
  }
  return denomTypes[denominator] || 'quarter';
}

function applyAddPickup(xml: string, op: Extract<ScoreOp, { op: 'add_pickup' }>) {
  let changed = false;
  const nextXml = replacePartContents(xml, (part) => {
    const measures = parseMeasureBlocks(part.content);
    if (!measures.length) {
      return part.content;
    }

    // Check if measure 0 already exists (pickup already present)
    if (measures[0]?.number === 0) {
      return part.content;
    }

    // Extract full <attributes> from measure 1 — move them to the pickup measure
    const firstMeasure = measures[0];
    const attrsMatch = firstMeasure.full.match(/<attributes>([\s\S]*?)<\/attributes>/);
    const divisionsMatch = attrsMatch?.[1]?.match(/<divisions>(\d+)<\/divisions>/);
    const divisions = divisionsMatch ? Number.parseInt(divisionsMatch[1], 10) : 16;

    // Compute pickup rest duration
    const pickupDuration = Math.round((divisions * 4 * op.numerator) / op.denominator);
    const restType = pickupRestType(op.numerator, op.denominator);

    // Move full attributes (key, time, clefs) to the pickup measure.
    // Remove the attributes block from measure 1 to avoid duplicate clefs/time sigs.
    const attributesXml = attrsMatch ? attrsMatch[0] : `<attributes><divisions>${divisions}</divisions></attributes>`;
    const strippedFirstMeasure = attrsMatch
      ? firstMeasure.full.replace(attrsMatch[0], '')
      : firstMeasure.full;

    // Build pickup measure XML
    const pickupMeasureXml = `<measure number="0" implicit="yes">\n${attributesXml}\n<note><rest/><duration>${pickupDuration}</duration><voice>1</voice><type>${restType}</type></note>\n</measure>`;

    // Replace first measure with stripped version, prepend pickup
    const remainingMeasures = measures.slice(1).map((m) => m.full);
    changed = true;
    return [pickupMeasureXml, strippedFirstMeasure, ...remainingMeasures].join('\n');
  });

  if (!changed) {
    return { error: 'Score already has a pickup measure or no measures found.' } as const;
  }

  return {
    xml: nextXml,
    changed: true,
    summary: `Added pickup measure (${op.numerator}/${op.denominator}).`,
  } as const;
}

function applyAddTempoMarking(xml: string, op: Extract<ScoreOp, { op: 'add_tempo_marking' }>) {
  const targetParts = resolveTargetPartIds(xml, op.scope?.partId);
  if (!targetParts.length) {
    return { error: 'Target part not found.' } as const;
  }
  const tempoDirection = `<direction placement="above"><direction-type><words font-weight="bold">${op.bpm}</words></direction-type><sound tempo="${op.bpm}"/></direction>`;
  let changed = 0;
  const nextXml = replacePartContents(xml, (part) => {
    if (!targetParts.includes(part.partId)) {
      return part.content;
    }
    const updated = updatePartMeasures(part.content, (measure) => {
      if (!measureInScope(measure, op.scope)) {
        return measure;
      }
      const openTagMatch = measure.full.match(/^<measure\b[^>]*>/i);
      if (!openTagMatch) {
        return measure;
      }
      const insertPos = openTagMatch[0].length;
      const nextFull = measure.full.slice(0, insertPos) + tempoDirection + measure.full.slice(insertPos);
      return { ...measure, full: nextFull };
    });
    changed += updated.changedCount;
    return updated.content;
  });
  if (!changed) {
    return { error: 'No matching measures found for add_tempo_marking.' } as const;
  }
  return {
    xml: nextXml,
    changed: true,
    summary: `Added tempo marking (${op.bpm} BPM) to ${changed} measure(s).`,
  } as const;
}

function applyAddDynamic(xml: string, op: Extract<ScoreOp, { op: 'add_dynamic' }>) {
  const targetParts = resolveTargetPartIds(xml, op.scope?.partId);
  if (!targetParts.length) {
    return { error: 'Target part not found.' } as const;
  }
  const dynamicDirection = `<direction placement="below"><direction-type><dynamics><${op.dynamic}/></dynamics></direction-type></direction>`;
  let changed = 0;
  const nextXml = replacePartContents(xml, (part) => {
    if (!targetParts.includes(part.partId)) {
      return part.content;
    }
    const updated = updatePartMeasures(part.content, (measure) => {
      if (!measureInScope(measure, op.scope)) {
        return measure;
      }
      const openTagMatch = measure.full.match(/^<measure\b[^>]*>/i);
      if (!openTagMatch) {
        return measure;
      }
      const insertPos = openTagMatch[0].length;
      const nextFull = measure.full.slice(0, insertPos) + dynamicDirection + measure.full.slice(insertPos);
      return { ...measure, full: nextFull };
    });
    changed += updated.changedCount;
    return updated.content;
  });
  if (!changed) {
    return { error: 'No matching measures found for add_dynamic.' } as const;
  }
  return {
    xml: nextXml,
    changed: true,
    summary: `Added ${op.dynamic} dynamic to ${changed} measure(s).`,
  } as const;
}

function applyInsertText(xml: string, op: Extract<ScoreOp, { op: 'insert_text' }>) {
  const targetParts = resolveTargetPartIds(xml, op.scope?.partId);
  if (!targetParts.length) {
    return { error: 'Target part not found.' } as const;
  }
  // MusicXML text elements go in <direction> for staff/system/expression text
  const escapedText = op.text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const textDirection = `<direction placement="above"><direction-type><words>${escapedText}</words></direction-type></direction>`;
  let changed = 0;
  const nextXml = replacePartContents(xml, (part) => {
    if (!targetParts.includes(part.partId)) {
      return part.content;
    }
    const updated = updatePartMeasures(part.content, (measure) => {
      if (!measureInScope(measure, op.scope)) {
        return measure;
      }
      const openTagMatch = measure.full.match(/^<measure\b[^>]*>/i);
      if (!openTagMatch) {
        return measure;
      }
      const insertPos = openTagMatch[0].length;
      const nextFull = measure.full.slice(0, insertPos) + textDirection + measure.full.slice(insertPos);
      return { ...measure, full: nextFull };
    });
    changed += updated.changedCount;
    return updated.content;
  });
  if (!changed) {
    return { error: 'No matching measures found for insert_text.' } as const;
  }
  return {
    xml: nextXml,
    changed: true,
    summary: `Inserted ${op.kind} text "${op.text}" in ${changed} measure(s).`,
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
    case 'transpose_selection':
      return { error: 'transpose_selection requires WASM executor (pitch arithmetic not supported in XML mode).' };
    case 'add_tempo_marking':
      return toApplyOneOpResult(applyAddTempoMarking(xml, op));
    case 'add_dynamic':
      return toApplyOneOpResult(applyAddDynamic(xml, op));
    case 'select_measure_range':
      return { xml, changed: false, summary: 'Selection ops are WASM-only; skipped in XML mode.' };
    case 'select_all':
      return { xml, changed: false, summary: 'Selection ops are WASM-only; skipped in XML mode.' };
    case 'replace_selected_text':
      return { error: 'replace_selected_text requires WASM executor (needs active text selection).' };
    case 'set_duration':
      return { error: 'set_duration requires WASM executor.' };
    case 'set_voice':
      return { error: 'set_voice requires WASM executor.' };
    case 'set_accidental':
      return { error: 'set_accidental requires WASM executor (needs active note selection).' };
    case 'insert_text':
      return toApplyOneOpResult(applyInsertText(xml, op));
    case 'set_layout_break':
      return { error: 'set_layout_break requires WASM executor.' };
    case 'set_repeat_markers':
      return { error: 'set_repeat_markers requires WASM executor.' };
    case 'history_step':
      return { error: 'history_step requires WASM executor (undo/redo stack is runtime-only).' };
    case 'add_pickup':
      return toApplyOneOpResult(applyAddPickup(xml, op));
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
    case 'add_tempo_marking': {
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
            op: 'insertAfter',
            path: `/score-partwise/part[@id='${partId}']/measure[@number='${measureNo}']/*[1]`,
            value: `<direction placement="above"><direction-type><words font-weight="bold">${op.bpm}</words></direction-type><sound tempo="${op.bpm}"/></direction>`,
          });
        }
      }
      return ops.length ? ops : null;
    }
    case 'add_dynamic': {
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
            op: 'insertAfter',
            path: `/score-partwise/part[@id='${partId}']/measure[@number='${measureNo}']/*[1]`,
            value: `<direction placement="below"><direction-type><dynamics><${op.dynamic}/></dynamics></direction-type></direction>`,
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

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

function normalizeExecutorPreference(
  optionPreference: unknown,
): ScoreOpsExecutorMode {
  if (optionPreference === 'wasm' || optionPreference === 'xml' || optionPreference === 'auto') {
    return optionPreference;
  }
  const fromEnv = (process.env.SCOREOPS_EXECUTOR_PREFERRED || '').trim().toLowerCase();
  if (fromEnv === 'wasm' || fromEnv === 'xml' || fromEnv === 'auto') {
    return fromEnv;
  }
  return 'auto';
}

function shouldAttemptWasmExecutor(preferred: ScoreOpsExecutorMode) {
  if (preferred === 'xml') {
    return false;
  }
  if (process.env.SCOREOPS_ENABLE_WASM === '0') {
    return false;
  }
  if (process.env.NODE_ENV === 'test' && preferred === 'auto') {
    return false;
  }
  return true;
}

function getPartIdToIndex(xml: string) {
  const map = new Map<string, number>();
  const parts = parsePartBlocks(xml);
  parts.forEach((part, index) => {
    if (part.partId && !map.has(part.partId)) {
      map.set(part.partId, index);
    }
  });
  return map;
}

function getScopePartsAndRange(xml: string, scope?: ScoreScope) {
  const partIds = resolveTargetPartIds(xml, scope?.partId);
  const start = scope?.measureStart ?? 1;
  const end = scope?.measureEnd ?? start;
  return {
    partIds,
    start,
    end,
  };
}

type WasmMutationTarget = {
  partId: string;
  measureNumber: number;
};

function enumerateTargetsForScope(xml: string, scope?: ScoreScope): WasmMutationTarget[] {
  const { partIds, start, end } = getScopePartsAndRange(xml, scope);
  const targets: WasmMutationTarget[] = [];
  for (const partId of partIds) {
    for (let measureNumber = start; measureNumber <= end; measureNumber += 1) {
      targets.push({ partId, measureNumber });
    }
  }
  return targets;
}

async function saveXmlFromScore(score: Score): Promise<string | null> {
  if (!score.saveXml) {
    return null;
  }
  const bytes = await score.saveXml();
  return textDecoder.decode(bytes);
}

async function relayoutIfSupported(score: Score) {
  if (typeof score.relayout === 'function') {
    await Promise.resolve(score.relayout());
  }
}

function mapClefToWasmValue(clef: z.infer<typeof CLEF_SCHEMA>) {
  const mapping: Record<z.infer<typeof CLEF_SCHEMA>, number> = {
    treble: 0,
    bass: 20,
    alto: 10,
    tenor: 11,
  };
  return mapping[clef];
}

function mapInsertTarget(target: z.infer<typeof INSERT_TARGET_SCHEMA>) {
  if (target === 'after_measure' || target === 'start') {
    return 0; // InsertMode::BEFORE in MuseScore
  }
  return 3; // InsertMode::APPEND
}

async function selectMeasureOnScore(
  score: Score,
  partIndexById: Map<string, number>,
  partId: string,
  measureNumber: number,
): Promise<{ ok: boolean; reason?: string }> {
  if (!score.selectPartMeasureByIndex) {
    return { ok: false, reason: 'selectPartMeasureByIndex is unavailable in this webmscore runtime.' };
  }
  const partIndex = partIndexById.get(partId);
  if (partIndex === undefined) {
    return { ok: false, reason: `Part not found: ${partId}` };
  }
  if (measureNumber < 1) {
    return { ok: false, reason: `Invalid measure number: ${measureNumber}` };
  }
  await Promise.resolve(score.selectPartMeasureByIndex(partIndex, measureNumber - 1));
  return { ok: true };
}

type WasmExecutionResult =
  | {
    ok: true;
    xml: string;
    applied: OpApplyResult[];
    summaries: string[];
    exports?: Record<string, string>;
  }
  | {
    ok: false;
    fallbackReason: string;
  };

async function executeOpsWithWasm(
  beforeXml: string,
  ops: ScoreOp[],
): Promise<WasmExecutionResult> {
  let score: Score | null = null;
  try {
    const webMscore = await loadWebMscoreInProcess();
    score = await webMscore.load('musicxml', textEncoder.encode(beforeXml));
    if (!score.saveXml) {
      return { ok: false, fallbackReason: 'saveXml is unavailable in current webmscore runtime.' };
    }

    let currentXml = beforeXml;
    const applied: OpApplyResult[] = [];
    const summaries: string[] = [];
    const exports: Record<string, string> = {};

    for (let index = 0; index < ops.length; index += 1) {
      const op = ops[index];
      const partIndexById = getPartIdToIndex(currentXml);
      const targets = enumerateTargetsForScope(currentXml, (op as { scope?: ScoreScope }).scope);

      if (!partIndexById.size) {
        return { ok: false, fallbackReason: 'No parts found in score for wasm execution.' };
      }

      if (op.op === 'delete_text_by_content') {
        return { ok: false, fallbackReason: 'delete_text_by_content is not supported by wasm executor.' };
      }

      if (op.op === 'export_score') {
        for (const format of op.formats) {
          if (format === 'musicxml') {
            if (score.saveMxl) {
              const bytes = await score.saveMxl();
              exports[format] = Buffer.from(bytes).toString('base64');
            } else if (score.saveXml) {
              const xml = await score.saveXml();
              exports[format] = Buffer.from(xml).toString('base64');
            }
          } else if (format === 'midi' && score.saveMidi) {
            const bytes = await score.saveMidi(true, true);
            exports[format] = Buffer.from(bytes).toString('base64');
          } else if (format === 'pdf' && score.savePdf) {
            const bytes = await score.savePdf();
            exports[format] = Buffer.from(bytes).toString('base64');
          }
        }
        const exportedFormats = Object.keys(exports);
        applied.push({
          index,
          op: 'export_score',
          ok: exportedFormats.length > 0,
          message: exportedFormats.length > 0
            ? `Exported: ${exportedFormats.join(', ')}`
            : 'No formats could be exported.',
        });
        if (exportedFormats.length > 0) {
          summaries.push(`Exported score in ${exportedFormats.join(', ')} format(s).`);
        }
        continue;
      } else if (op.op === 'set_metadata_text') {
        const methodMap = {
          title: score.setTitleText,
          subtitle: score.setSubtitleText,
          composer: score.setComposerText,
          lyricist: score.setLyricistText,
        } as const;
        const setter = methodMap[op.field];
        if (typeof setter !== 'function') {
          return { ok: false, fallbackReason: `Missing wasm setter for metadata field: ${op.field}` };
        }
        await Promise.resolve(setter(op.value));
      } else if (op.op === 'set_key_signature') {
        if (typeof score.setKeySignature !== 'function') {
          return { ok: false, fallbackReason: 'setKeySignature is unavailable in current webmscore runtime.' };
        }
        for (const target of targets) {
          const selected = await selectMeasureOnScore(score, partIndexById, target.partId, target.measureNumber);
          if (!selected.ok) {
            return { ok: false, fallbackReason: selected.reason || 'Failed to select target measure.' };
          }
          await Promise.resolve(score.setKeySignature(op.fifths));
        }
      } else if (op.op === 'set_time_signature') {
        if (typeof score.setTimeSignature !== 'function') {
          return { ok: false, fallbackReason: 'setTimeSignature is unavailable in current webmscore runtime.' };
        }
        for (const target of targets) {
          const selected = await selectMeasureOnScore(score, partIndexById, target.partId, target.measureNumber);
          if (!selected.ok) {
            return { ok: false, fallbackReason: selected.reason || 'Failed to select target measure.' };
          }
          await Promise.resolve(score.setTimeSignature(op.numerator, op.denominator));
        }
      } else if (op.op === 'set_clef') {
        if (typeof score.setClef !== 'function') {
          return { ok: false, fallbackReason: 'setClef is unavailable in current webmscore runtime.' };
        }
        const clefValue = mapClefToWasmValue(op.clef);
        for (const target of targets) {
          const selected = await selectMeasureOnScore(score, partIndexById, target.partId, target.measureNumber);
          if (!selected.ok) {
            return { ok: false, fallbackReason: selected.reason || 'Failed to select target measure.' };
          }
          await Promise.resolve(score.setClef(clefValue));
        }
      } else if (op.op === 'insert_measures') {
        if (typeof score.insertMeasures !== 'function') {
          return { ok: false, fallbackReason: 'insertMeasures is unavailable in current webmscore runtime.' };
        }
        if (op.target === 'after_measure') {
          const partId = op.partId || Array.from(partIndexById.keys())[0];
          const afterMeasure = op.afterMeasure || 1;
          const selected = await selectMeasureOnScore(score, partIndexById, partId, afterMeasure);
          if (!selected.ok) {
            return { ok: false, fallbackReason: selected.reason || 'Failed to select insert anchor.' };
          }
        }
        await Promise.resolve(score.insertMeasures(op.count, mapInsertTarget(op.target)));
      } else if (op.op === 'add_pickup') {
        if (typeof score.addPickupMeasure !== 'function') {
          return { ok: false, fallbackReason: 'addPickupMeasure is unavailable in current webmscore runtime.' };
        }
        await Promise.resolve(score.addPickupMeasure(op.numerator, op.denominator));
      } else if (op.op === 'remove_measures' || op.op === 'delete_selection') {
        if (typeof score.removeSelectedMeasures !== 'function') {
          return { ok: false, fallbackReason: 'removeSelectedMeasures is unavailable in current webmscore runtime.' };
        }
        const scope = op.scope;
        if (!scope.measureStart) {
          return { ok: false, fallbackReason: `${op.op} requires scope.measureStart.` };
        }
        const end = scope.measureEnd ?? scope.measureStart;
        const partIds = resolveTargetPartIds(currentXml, scope.partId);
        for (const partId of partIds) {
          const deleteCount = Math.max(0, end - scope.measureStart + 1);
          for (let i = 0; i < deleteCount; i += 1) {
            const selected = await selectMeasureOnScore(score, partIndexById, partId, scope.measureStart);
            if (!selected.ok) {
              return { ok: false, fallbackReason: selected.reason || 'Failed to select measure for deletion.' };
            }
            await Promise.resolve(score.removeSelectedMeasures());
          }
        }
      } else if (op.op === 'transpose_selection') {
        if (typeof score.transpose !== 'function') {
          return { ok: false, fallbackReason: 'transpose is unavailable in current webmscore runtime.' };
        }
        for (const target of targets) {
          const selected = await selectMeasureOnScore(score, partIndexById, target.partId, target.measureNumber);
          if (!selected.ok) {
            return { ok: false, fallbackReason: selected.reason || 'Failed to select target measure.' };
          }
          await Promise.resolve(score.transpose(op.semitones));
        }
      } else if (op.op === 'add_tempo_marking') {
        if (typeof score.addTempoText !== 'function') {
          return { ok: false, fallbackReason: 'addTempoText is unavailable in current webmscore runtime.' };
        }
        if (targets.length) {
          const selected = await selectMeasureOnScore(score, partIndexById, targets[0].partId, targets[0].measureNumber);
          if (!selected.ok) {
            return { ok: false, fallbackReason: selected.reason || 'Failed to select target measure.' };
          }
        }
        await Promise.resolve(score.addTempoText(op.bpm));
      } else if (op.op === 'add_dynamic') {
        if (typeof score.addDynamic !== 'function') {
          return { ok: false, fallbackReason: 'addDynamic is unavailable in current webmscore runtime.' };
        }
        // Maps to engraving::DynamicType enum in libmscore (types.h)
        const dynamicTypeMap: Record<string, number> = {
          pppppp: 1, ppppp: 2, pppp: 3, ppp: 4, pp: 5, p: 6, mp: 7, mf: 8,
          f: 9, ff: 10, fff: 11, ffff: 12, fffff: 13, ffffff: 14,
          fp: 15, pf: 16, sf: 17, sfz: 18, sff: 19, sffz: 20,
          sfp: 21, sfpp: 22, rfz: 23, rf: 24, fz: 25,
        };
        const dynamicTypeCode = dynamicTypeMap[op.dynamic] ?? 8;
        if (targets.length) {
          const selected = await selectMeasureOnScore(score, partIndexById, targets[0].partId, targets[0].measureNumber);
          if (!selected.ok) {
            return { ok: false, fallbackReason: selected.reason || 'Failed to select target measure.' };
          }
        }
        await Promise.resolve(score.addDynamic(dynamicTypeCode));
      } else if (op.op === 'select_measure_range') {
        const scope = op.scope;
        if (!scope.measureStart) {
          return { ok: false, fallbackReason: 'select_measure_range requires scope.measureStart.' };
        }
        const rangeTargets = enumerateTargetsForScope(currentXml, scope);
        for (const target of rangeTargets) {
          const selected = await selectMeasureOnScore(score, partIndexById, target.partId, target.measureNumber);
          if (!selected.ok) {
            return { ok: false, fallbackReason: selected.reason || 'Failed to select measure range.' };
          }
        }
      } else if (op.op === 'replace_selected_text') {
        if (typeof score.setSelectedText !== 'function') {
          return { ok: false, fallbackReason: 'setSelectedText is unavailable in current webmscore runtime.' };
        }
        if (targets.length) {
          const selected = await selectMeasureOnScore(score, partIndexById, targets[0].partId, targets[0].measureNumber);
          if (!selected.ok) {
            return { ok: false, fallbackReason: selected.reason || 'Failed to select target measure.' };
          }
        }
        await Promise.resolve(score.setSelectedText(op.value));
      } else if (op.op === 'set_duration') {
        if (typeof score.setDurationType !== 'function') {
          return { ok: false, fallbackReason: 'setDurationType is unavailable in current webmscore runtime.' };
        }
        // Maps to engraving::DurationType enum in libmscore (types.h)
        const durationTypeMap: Record<string, number> = {
          long: 0, breve: 1, whole: 2, half: 3, quarter: 4, eighth: 5,
          '16th': 6, '32nd': 7, '64th': 8, '128th': 9, '256th': 10, '512th': 11, '1024th': 12,
        };
        const durationCode = durationTypeMap[op.durationType] ?? 4;
        for (const target of targets) {
          const selected = await selectMeasureOnScore(score, partIndexById, target.partId, target.measureNumber);
          if (!selected.ok) {
            return { ok: false, fallbackReason: selected.reason || 'Failed to select target measure.' };
          }
          await Promise.resolve(score.setDurationType(durationCode));
        }
      } else if (op.op === 'set_voice') {
        const voiceMethod = score.changeSelectedElementsVoice || score.setVoice;
        if (typeof voiceMethod !== 'function') {
          return { ok: false, fallbackReason: 'setVoice/changeSelectedElementsVoice is unavailable in current webmscore runtime.' };
        }
        const voiceIndex = op.voice - 1; // API uses 0-based, schema uses 1-based
        for (const target of targets) {
          const selected = await selectMeasureOnScore(score, partIndexById, target.partId, target.measureNumber);
          if (!selected.ok) {
            return { ok: false, fallbackReason: selected.reason || 'Failed to select target measure.' };
          }
          await Promise.resolve(voiceMethod(voiceIndex));
        }
      } else if (op.op === 'select_all') {
        const allParts = Array.from(partIndexById.keys());
        if (allParts.length) {
          const partId = allParts[0];
          const partData = buildPartMeasureIndex(currentXml).get(partId);
          const lastMeasure = partData?.numbers.length ? Math.max(...partData.numbers) : 1;
          for (let m = 1; m <= lastMeasure; m += 1) {
            const selected = await selectMeasureOnScore(score, partIndexById, partId, m);
            if (!selected.ok) {
              return { ok: false, fallbackReason: selected.reason || 'Failed to select all measures.' };
            }
          }
        }
      } else if (op.op === 'set_accidental') {
        if (typeof score.setAccidental !== 'function') {
          return { ok: false, fallbackReason: 'setAccidental is unavailable in current webmscore runtime.' };
        }
        // Maps to engraving::AccidentalType enum
        const accidentalTypeMap: Record<string, number> = {
          'natural': 0, 'sharp': 1, 'flat': 2, 'double-sharp': 3, 'double-flat': 4,
        };
        const accidentalCode = accidentalTypeMap[op.accidental] ?? 0;
        for (const target of targets) {
          const selected = await selectMeasureOnScore(score, partIndexById, target.partId, target.measureNumber);
          if (!selected.ok) {
            return { ok: false, fallbackReason: selected.reason || 'Failed to select target measure.' };
          }
          await Promise.resolve(score.setAccidental(accidentalCode));
        }
      } else if (op.op === 'insert_text') {
        const textMethodMap: Record<string, ((text: string) => Promise<unknown> | unknown) | undefined> = {
          staff: score.addStaffText,
          system: score.addSystemText,
          expression: score.addExpressionText,
          lyric: score.addLyricText,
        };
        const textMethod = textMethodMap[op.kind];
        if (op.kind === 'harmony') {
          if (typeof score.addHarmonyText !== 'function') {
            return { ok: false, fallbackReason: 'addHarmonyText is unavailable in current webmscore runtime.' };
          }
          if (targets.length) {
            const selected = await selectMeasureOnScore(score, partIndexById, targets[0].partId, targets[0].measureNumber);
            if (!selected.ok) {
              return { ok: false, fallbackReason: selected.reason || 'Failed to select target measure.' };
            }
          }
          await Promise.resolve(score.addHarmonyText(0, op.text));
        } else if (typeof textMethod === 'function') {
          if (targets.length) {
            const selected = await selectMeasureOnScore(score, partIndexById, targets[0].partId, targets[0].measureNumber);
            if (!selected.ok) {
              return { ok: false, fallbackReason: selected.reason || 'Failed to select target measure.' };
            }
          }
          await Promise.resolve(textMethod(op.text));
        } else {
          return { ok: false, fallbackReason: `Text method for kind "${op.kind}" is unavailable in current webmscore runtime.` };
        }
      } else if (op.op === 'set_layout_break') {
        const breakMethod = op.breakType === 'line' ? score.toggleLineBreak : score.togglePageBreak;
        if (typeof breakMethod !== 'function') {
          return { ok: false, fallbackReason: `toggle${op.breakType === 'line' ? 'Line' : 'Page'}Break is unavailable in current webmscore runtime.` };
        }
        for (const target of targets) {
          const selected = await selectMeasureOnScore(score, partIndexById, target.partId, target.measureNumber);
          if (!selected.ok) {
            return { ok: false, fallbackReason: selected.reason || 'Failed to select target measure.' };
          }
          await Promise.resolve(breakMethod());
        }
      } else if (op.op === 'set_repeat_markers') {
        if (op.start !== undefined) {
          if (typeof score.toggleRepeatStart !== 'function') {
            return { ok: false, fallbackReason: 'toggleRepeatStart is unavailable in current webmscore runtime.' };
          }
          for (const target of targets) {
            const selected = await selectMeasureOnScore(score, partIndexById, target.partId, target.measureNumber);
            if (!selected.ok) {
              return { ok: false, fallbackReason: selected.reason || 'Failed to select target measure.' };
            }
            await Promise.resolve(score.toggleRepeatStart());
          }
        }
        if (op.end !== undefined) {
          if (typeof score.toggleRepeatEnd !== 'function') {
            return { ok: false, fallbackReason: 'toggleRepeatEnd is unavailable in current webmscore runtime.' };
          }
          for (const target of targets) {
            const selected = await selectMeasureOnScore(score, partIndexById, target.partId, target.measureNumber);
            if (!selected.ok) {
              return { ok: false, fallbackReason: selected.reason || 'Failed to select target measure.' };
            }
            await Promise.resolve(score.toggleRepeatEnd());
          }
        }
        if (op.count !== undefined && typeof score.setRepeatCount === 'function') {
          await Promise.resolve(score.setRepeatCount(op.count));
        }
        if (op.barline !== undefined && typeof score.setBarLineType === 'function') {
          const barlineTypeMap: Record<string, number> = {
            normal: 1, double: 2, end: 3, 'start-repeat': 4, 'end-repeat': 5, 'end-start-repeat': 6,
          };
          const barlineCode = barlineTypeMap[op.barline] ?? 1;
          for (const target of targets) {
            const selected = await selectMeasureOnScore(score, partIndexById, target.partId, target.measureNumber);
            if (!selected.ok) {
              return { ok: false, fallbackReason: selected.reason || 'Failed to select target measure.' };
            }
            await Promise.resolve(score.setBarLineType(barlineCode));
          }
        }
      } else if (op.op === 'history_step') {
        const historyMethod = op.direction === 'undo' ? score.undo : score.redo;
        if (typeof historyMethod !== 'function') {
          return { ok: false, fallbackReason: `${op.direction} is unavailable in current webmscore runtime.` };
        }
        for (let i = 0; i < op.steps; i += 1) {
          await Promise.resolve(historyMethod());
        }
      } else {
        return { ok: false, fallbackReason: `Unsupported wasm operation: ${(op as { op: string }).op}` };
      }

      await relayoutIfSupported(score);
      const saved = await saveXmlFromScore(score);
      if (!saved) {
        return { ok: false, fallbackReason: 'Unable to serialize MusicXML after wasm operation.' };
      }
      currentXml = saved;
      const summary = `Applied ${op.op} via wasm.`;
      summaries.push(summary);
      applied.push({
        index,
        op: op.op,
        ok: true,
        message: summary,
      });
    }

    return {
      ok: true,
      xml: currentXml,
      applied,
      summaries,
      exports,
    };
  } catch (error) {
    return {
      ok: false,
      fallbackReason: error instanceof Error
        ? `WASM execution failed: ${error.message}`
        : 'WASM execution failed.',
    };
  } finally {
    if (score) {
      try {
        score.destroy(true);
      } catch {
        // best-effort cleanup
      }
    }
  }
}

type ScoreOpsWasmProbe = {
  available: boolean;
  wasmMethods: string[];
  error?: string;
};

type ScoreOpsCapabilitySnapshot = {
  ops: string[];
  mutationOps: ScoreOpsMutationOpSupport;
  runtime: {
    executor: 'musicxml-string';
    supportsAtomicRollback: true;
    wasmAvailable: boolean;
    wasmMethods: string[];
    wasmProbeError: string | null;
  };
};

let wasmProbePromise: Promise<ScoreOpsWasmProbe> | null = null;
let wasmProbeCache: ScoreOpsWasmProbe | null = null;

function buildDefaultMutationSupport(): ScoreOpsMutationOpSupport {
  return {
    set_metadata_text: { xml: true, wasm: false },
    set_key_signature: { xml: true, wasm: false },
    set_time_signature: { xml: true, wasm: false },
    set_clef: { xml: true, wasm: false },
    delete_selection: { xml: true, wasm: false },
    insert_measures: { xml: true, wasm: false },
    remove_measures: { xml: true, wasm: false },
    delete_text_by_content: { xml: true, wasm: false },
    transpose_selection: { xml: false, wasm: false },
    add_tempo_marking: { xml: true, wasm: false },
    add_dynamic: { xml: true, wasm: false },
    select_measure_range: { xml: false, wasm: false },
    select_all: { xml: false, wasm: false },
    replace_selected_text: { xml: false, wasm: false },
    set_duration: { xml: false, wasm: false },
    set_voice: { xml: false, wasm: false },
    set_accidental: { xml: false, wasm: false },
    insert_text: { xml: true, wasm: false },
    set_layout_break: { xml: false, wasm: false },
    set_repeat_markers: { xml: false, wasm: false },
    history_step: { xml: false, wasm: false },
    add_pickup: { xml: true, wasm: false },
    export_score: { xml: true, wasm: false },
  };
}

function evaluateWasmMutationSupport(wasmMethods: Set<string>) {
  const has = (name: string) => wasmMethods.has(name);
  const requiresSelectionOps = has('saveXml') && has('selectPartMeasureByIndex');
  const hasAnyMetadataSetter = has('setTitleText')
    || has('setSubtitleText')
    || has('setComposerText')
    || has('setLyricistText');
  return {
    set_metadata_text: has('saveXml') && hasAnyMetadataSetter,
    set_key_signature: requiresSelectionOps && has('setKeySignature'),
    set_time_signature: requiresSelectionOps && has('setTimeSignature'),
    set_clef: requiresSelectionOps && has('setClef'),
    delete_selection: requiresSelectionOps && has('removeSelectedMeasures'),
    insert_measures: has('saveXml') && has('insertMeasures'),
    remove_measures: requiresSelectionOps && has('removeSelectedMeasures'),
    delete_text_by_content: false,
    transpose_selection: requiresSelectionOps && has('transpose'),
    add_tempo_marking: requiresSelectionOps && has('addTempoText'),
    add_dynamic: requiresSelectionOps && has('addDynamic'),
    select_measure_range: requiresSelectionOps,
    select_all: requiresSelectionOps,
    replace_selected_text: requiresSelectionOps && has('setSelectedText'),
    set_duration: requiresSelectionOps && has('setDurationType'),
    set_voice: requiresSelectionOps && (has('changeSelectedElementsVoice') || has('setVoice')),
    set_accidental: requiresSelectionOps && has('setAccidental'),
    insert_text: requiresSelectionOps && (has('addStaffText') || has('addSystemText') || has('addExpressionText') || has('addLyricText') || has('addHarmonyText')),
    set_layout_break: requiresSelectionOps && (has('toggleLineBreak') || has('togglePageBreak')),
    set_repeat_markers: requiresSelectionOps && (has('toggleRepeatStart') || has('toggleRepeatEnd') || has('setBarLineType')),
    history_step: has('saveXml') && (has('undo') || has('redo')),
    add_pickup: has('addPickupMeasure') || has('saveXml'),
    export_score: has('saveMxl') || has('saveMidi') || has('savePdf'),
  } satisfies Record<ScoreOpName, boolean>;
}

async function probeWasmCapabilities(): Promise<ScoreOpsWasmProbe> {
  if (wasmProbeCache) {
    return wasmProbeCache;
  }
  if (wasmProbePromise) {
    return wasmProbePromise;
  }

  wasmProbePromise = (async () => {
    let score: Score | null = null;
    try {
      const webMscore = await loadWebMscoreInProcess();
      score = await webMscore.load('musicxml', textEncoder.encode(SCOREOPS_CAPABILITY_PROBE_XML));
      const detected = SCOREOPS_WASM_METHOD_KEYS.filter((name) => typeof score?.[name] === 'function');
      wasmProbeCache = {
        available: true,
        wasmMethods: detected,
      };
      return wasmProbeCache;
    } catch (error) {
      wasmProbeCache = {
        available: false,
        wasmMethods: [],
        error: error instanceof Error ? error.message : 'WASM capability probe failed.',
      };
      return wasmProbeCache;
    } finally {
      if (score) {
        try {
          score.destroy(true);
        } catch {
          // best-effort cleanup
        }
      }
    }
  })();

  try {
    return await wasmProbePromise;
  } finally {
    wasmProbePromise = null;
  }
}

async function buildCapabilities(): Promise<ScoreOpsCapabilitySnapshot> {
  const mutationOps = buildDefaultMutationSupport();
  const wasmProbe = await probeWasmCapabilities();

  if (wasmProbe.available) {
    const supportByOp = evaluateWasmMutationSupport(new Set(wasmProbe.wasmMethods));
    for (const op of SCOREOPS_MUTATION_OPS) {
      mutationOps[op].wasm = supportByOp[op];
    }
  }

  return {
    ops: [
      ...SCOREOPS_INSPECT_OPS,
      ...SCOREOPS_MUTATION_OPS,
      ...SCOREOPS_SELECTION_OPS,
    ],
    mutationOps,
    runtime: {
      executor: 'musicxml-string',
      supportsAtomicRollback: true,
      wasmAvailable: wasmProbe.available,
      wasmMethods: wasmProbe.wasmMethods,
      wasmProbeError: wasmProbe.error || null,
    },
  };
}

async function resolveSourceMusicXml(data: {
  initialArtifactId?: string;
  initial_artifact_id?: string;
  inputArtifactId?: string;
  input_artifact_id?: string;
  scoreSessionId?: string;
  score_session_id?: string;
  content?: string;
  text?: string;
}): Promise<{ xml: string; artifact: ScoreArtifact | null; session: ScoreOpsSessionState | null; error?: ScoreOpsServiceResult }> {
  const resolution = await resolveScoreContent(data);
  return {
    xml: resolution.xml,
    artifact: resolution.artifact,
    session: resolution.session,
    error: resolution.error,
  };
}

async function openSession(payload: z.infer<typeof OPEN_REQUEST_SCHEMA>): Promise<ScoreOpsServiceResult> {
  const resolved = await resolveSourceMusicXml(payload);
  if (resolved.error) {
    return resolved.error;
  }
  const sessionMetadata = buildSessionMetadata(payload);

  const initialArtifact = resolved.artifact || await createScoreArtifact({
    format: 'musicxml',
    content: resolved.xml,
    label: 'scoreops-open',
    metadata: {
      origin: 'api/music/scoreops/session/open',
      scoreMeta: payload.scoreMeta || payload.score_meta || null,
      launchContext: sessionMetadata?.launchContext || null,
    },
  });

  const session = createScoreOpsSession({
    content: resolved.xml,
    artifactId: initialArtifact.id,
    revision: 0,
    metadata: sessionMetadata,
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
      metadata: session.metadata,
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
    body.capabilities = await buildCapabilities();
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
    const signatures = (Array.from(session.content.matchAll(/<time\b[^>]*>[\s\S]*?<beats>(\d+)<\/beats>[\s\S]*?<beat-type>(\d+)<\/beat-type>[\s\S]*?<\/time>/gi)) as RegExpMatchArray[])
      .slice(0, 24)
      .map((match) => `${match[1]}/${match[2]}`);
    body.measureSignatures = signatures;

    if (payload.scope?.partId) {
      const parts = parsePartBlocks(session.content);
      const targetPart = parts.find((p) => p.partId === payload.scope?.partId);
      if (targetPart) {
        const measures = parseMeasureBlocks(targetPart.content);
        const scopeStart = payload.scope.measureStart ?? 1;
        const scopeEnd = payload.scope.measureEnd ?? scopeStart;
        const partSigs: Array<{ measure: number; key: string | null; time: string | null; clef: string | null }> = [];
        for (const measure of measures) {
          if (measure.number === null) continue;
          if (measure.number < scopeStart || measure.number > scopeEnd) continue;
          const fifths = measure.full.match(/<key\b[^>]*>[\s\S]*?<fifths>(-?\d+)<\/fifths>/i)?.[1] ?? null;
          const beats = measure.full.match(/<time\b[^>]*>[\s\S]*?<beats>(\d+)<\/beats>/i)?.[1];
          const beatType = measure.full.match(/<time\b[^>]*>[\s\S]*?<beat-type>(\d+)<\/beat-type>/i)?.[1];
          const clefSign = measure.full.match(/<clef\b[^>]*>[\s\S]*?<sign>([A-Z])<\/sign>/i)?.[1];
          partSigs.push({
            measure: measure.number,
            key: fifths !== null ? `fifths:${fifths}` : null,
            time: beats && beatType ? `${beats}/${beatType}` : null,
            clef: clefSign || null,
          });
        }
        body.partSignatures = partSigs;
      }
    }
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
  scoreMeta?: Record<string, unknown>;
  score_meta?: Record<string, unknown>;
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
    metadata: buildSessionMetadata(payload),
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
  const preferredExecutor = normalizeExecutorPreference(payload.options?.preferredExecutor);
  const tryWasm = shouldAttemptWasmExecutor(preferredExecutor);

  const beforeXml = session.content;
  let workingXml = beforeXml;
  let selectedExecutor: 'wasm' | 'xml' = 'xml';
  let fallbackReason: string | null = null;
  let applied: OpApplyResult[] = [];
  let summaries: string[] = [];
  let wasmExports: Record<string, string> | undefined;
  let xmlModeExports: Record<string, string> | undefined;

  if (tryWasm) {
    const unsupportedForWasm = payload.ops.filter((op) => !SCOREOPS_WASM_ELIGIBLE_OPS.has(op.op));
    if (unsupportedForWasm.length) {
      fallbackReason = `WASM executor skipped: unsupported op(s): ${unsupportedForWasm.map((op) => op.op).join(', ')}`;
    } else {
      const wasmResult = await executeOpsWithWasm(beforeXml, payload.ops);
      if (wasmResult.ok) {
        selectedExecutor = 'wasm';
        workingXml = wasmResult.xml;
        applied = wasmResult.applied;
        summaries = wasmResult.summaries;
        wasmExports = wasmResult.exports;
      } else {
        fallbackReason = wasmResult.fallbackReason;
      }
    }
  }

  if (selectedExecutor === 'xml') {
    for (let index = 0; index < payload.ops.length; index += 1) {
      const op = payload.ops[index];
      if (op.op === 'select_measure_range' || op.op === 'select_all') {
        applied.push({
          index,
          op: op.op,
          ok: true,
          message: 'Selection ops are WASM-only; skipped in XML mode.',
        });
        continue;
      }
      if (op.op === 'export_score') {
        const exportResult: Record<string, string> = {};
        const unsupported: string[] = [];
        for (const format of op.formats) {
          if (format === 'musicxml') {
            exportResult[format] = Buffer.from(workingXml, 'utf-8').toString('base64');
          } else {
            unsupported.push(format);
          }
        }
        const exportedFormats = Object.keys(exportResult);
        applied.push({
          index,
          op: 'export_score',
          ok: exportedFormats.length > 0,
          message: exportedFormats.length > 0
            ? `Exported: ${exportedFormats.join(', ')}${unsupported.length ? ` (${unsupported.join(', ')} require WASM)` : ''}`
            : `${unsupported.join(', ')} export requires WASM executor.`,
        });
        if (exportedFormats.length > 0) {
          summaries.push(`Exported score as ${exportedFormats.join(', ')}.`);
          xmlModeExports = { ...xmlModeExports, ...exportResult };
        }
        continue;
      }
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
                  ...(fallbackReason ? { fallbackReason } : {}),
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
                  ...(fallbackReason ? { fallbackReason } : {}),
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
  }

  const pendingExports = wasmExports ?? xmlModeExports;
  const hasExports = pendingExports && Object.keys(pendingExports).length > 0;

  if (workingXml === beforeXml) {
    if (hasExports) {
      // Export-only request — no score mutation, skip artifact/revision bump
      return {
        status: 200,
        body: {
          ok: true,
          scoreSessionId: session.scoreSessionId,
          baseRevision: session.revision,
          newRevision: session.revision,
          applied,
          changes: {
            summary: summaries.join(' '),
            count: applied.filter((entry) => entry.ok).length,
          },
          executor: {
            preferred: preferredExecutor,
            selected: selectedExecutor,
            usedFallback: selectedExecutor === 'xml' && Boolean(fallbackReason),
            ...(fallbackReason ? { fallbackReason } : {}),
          },
          exports: pendingExports,
        },
      };
    }
    return errorResult(422, 'execution_failure', 'No operations were applied.', {
      applied,
      atomic,
      selectedExecutor,
      preferredExecutor,
      ...(fallbackReason ? { fallbackReason } : {}),
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
    executor: {
      preferred: preferredExecutor,
      selected: selectedExecutor,
      usedFallback: selectedExecutor === 'xml' && Boolean(fallbackReason),
      ...(fallbackReason ? { fallbackReason } : {}),
    },
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

  const finalExports = wasmExports ?? xmlModeExports;
  if (finalExports && Object.keys(finalExports).length > 0) {
    responseBody.exports = finalExports;
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
  const nextMetadata = buildSessionMetadata(payload, session.metadata);

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
      scoreMeta: payload.scoreMeta || payload.score_meta || null,
      launchContext: nextMetadata?.launchContext || null,
    },
  });

  const updated = updateScoreOpsSession(session.scoreSessionId, {
    content: resolved.xml,
    artifactId: artifact.id,
    metadata: nextMetadata,
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
      metadata: updated.metadata,
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

type ParsedPromptStep = {
  index: number;
  text: string;
  parsedOps: ScoreOp[];
  unsupportedReasons: string[];
};

type ParsedPromptPlan = {
  ops: ScoreOp[];
  unsupportedHints: string[];
  steps: ParsedPromptStep[];
  supportedSteps: Array<{ index: number; text: string; opCount: number }>;
  unsupportedSteps: Array<{ index: number; text: string; reason: string }>;
};

function splitPromptIntoSteps(prompt: string): string[] {
  const normalized = prompt
    .replace(/\r/g, '\n')
    .replace(/,\s*(\d+[\).])/g, '\n$1')
    .replace(/;\s*/g, '\n')
    .replace(/\n\s*(\d+[\).])/g, '\n$1')
    .replace(/\s+\band then\b\s+/gi, '\n')
    .replace(/\s+\bthen\b\s+/gi, '\n')
    .replace(/\s+\bwhile also\b\s+/gi, '\n')
    .replace(/\s+\bbut also\b\s+/gi, '\n')
    .replace(/,?\s+\bplus\b\s+/gi, '\n')
    .replace(/,?\s+\bas well as\b\s+/gi, '\n');

  const rough = normalized
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (rough.length > 1) {
    // Don't propagate scope for numbered/multi-line lists — each step is independent
    return rough.map((line, index) => {
      let cleaned = line.replace(/^\d+[\).]\s*/, '').trim();
      if (index === 0) {
        cleaned = cleaned.replace(/^please[:,]?\s*/i, '').trim();
      }
      return cleaned;
    }).filter(Boolean);
  }

  const single = (rough[0] || prompt).trim();
  // Don't split on "and" inside quoted phrases or known compound names
  const splitOnConjunction = splitOnSafeConjunction(single)
    .map((part, index) => (index === 0 ? part.replace(/^please[:,]?\s*/i, '') : part).trim())
    .filter(Boolean);
  if (splitOnConjunction.length > 1) {
    return propagateScopeToSubSteps(splitOnConjunction);
  }
  return [single.replace(/^please[:,]?\s*/i, '').trim()];
}

/**
 * Split on "and" / "also" only when they appear as step separators,
 * not inside compound names like "Rock and Roll" or "salt and pepper".
 * A safe split point is "and" preceded by a completed action phrase.
 */
function splitOnSafeConjunction(text: string): string[] {
  // Protect quoted strings by replacing them temporarily
  const quotes: string[] = [];
  const withPlaceholders = text.replace(/[""\u201C]([^""\u201D]*?)[""\u201D]/g, (_m, content) => {
    quotes.push(content);
    return `__QUOTE${quotes.length - 1}__`;
  });

  // Split on "and" / "also" only when they follow what looks like a complete action
  const parts = withPlaceholders.split(/\s+(?:and|also)\s+/i);

  // Restore quotes
  return parts.map((part) =>
    part.replace(/__QUOTE(\d+)__/g, (_m, idx) => `"${quotes[Number(idx)]}"`)
  );
}

/**
 * When a trailing scope phrase (e.g., "in measures 5-8") appears on the last step,
 * propagate it to earlier steps that don't have their own scope.
 */
function propagateScopeToSubSteps(steps: string[]): string[] {
  if (steps.length <= 1) return steps;

  // Check if the last step has a trailing scope phrase
  const scopePattern = /\b(?:in|for|at)\s+(?:measure|bar)s?\s+\d+(?:\s*(?:-|to|through)\s*\d+)?$/i;
  const lastStep = steps[steps.length - 1];
  const scopeMatch = lastStep.match(scopePattern);
  if (!scopeMatch) return steps;

  const scopePhrase = scopeMatch[0];
  const hasMeasureScope = /(?:measure|bar)s?\s+\d+/i;

  return steps.map((step, index) => {
    if (index === steps.length - 1) return step;
    // Only append scope if this step doesn't already have a measure reference
    if (!hasMeasureScope.test(step)) {
      return `${step} ${scopePhrase}`;
    }
    return step;
  });
}

function parseMeasureScopeFromText(text: string): ScoreScope | undefined {
  const rangeMatch = text.match(/(?:measure|bar)s?\s+(\d+)\s*(?:-|to|through)\s*(\d+)/i);
  if (rangeMatch) {
    return {
      measureStart: Number(rangeMatch[1]),
      measureEnd: Number(rangeMatch[2]),
    };
  }
  // "first N measures/bars"
  const firstNMatch = text.match(/first\s+(\d+)\s+(?:measure|bar)s?/i);
  if (firstNMatch) {
    return {
      measureStart: 1,
      measureEnd: Number(firstNMatch[1]),
    };
  }
  // "last N measures/bars" — can't resolve without knowing total measures, flag handled elsewhere
  const singleMeasureMatch = text.match(/(?:measure|bar)\s+(\d+)/i);
  if (singleMeasureMatch) {
    const measure = Number(singleMeasureMatch[1]);
    return {
      measureStart: measure,
      measureEnd: measure,
    };
  }
  return undefined;
}

function parsePromptStep(stepText: string): { ops: ScoreOp[]; unsupportedReasons: string[] } {
  const ops: ScoreOp[] = [];
  const unsupportedReasons: string[] = [];
  const stepScope = parseMeasureScopeFromText(stepText);

  const keyRegex = /(?:(?:set|change|correct|fix)\s+(?:the\s+)?)?key(?:\s+signature)?\s+(?:to|as)\s+([A-Ga-g][#b♯♭]?)(?:\s+(major|minor))?/gi;
  for (const keyMatch of stepText.matchAll(keyRegex)) {
    const tonic = normalizeKeyName(keyMatch[1]);
    const mode = (keyMatch[2] || 'major').toLowerCase();
    const table = mode === 'minor' ? MINOR_KEY_TO_FIFTHS : MAJOR_KEY_TO_FIFTHS;
    const fifths = table[`${tonic[0]?.toUpperCase() || ''}${tonic.slice(1)}`];
    if (typeof fifths === 'number') {
      ops.push({
        op: 'set_key_signature',
        fifths,
        ...(stepScope ? { scope: stepScope } : {}),
      });
    } else {
      unsupportedReasons.push(`Unable to map key signature target: ${keyMatch[0]}`);
    }
  }

  const timeRegex = /time signature\s+(?:to|as)\s+(\d+)\s*\/\s*(\d+)/gi;
  for (const timeMatch of stepText.matchAll(timeRegex)) {
    const numerator = Number(timeMatch[1]);
    const denominator = Number(timeMatch[2]);
    if ([1, 2, 4, 8, 16, 32].includes(denominator)) {
      ops.push({
        op: 'set_time_signature',
        numerator,
        denominator: denominator as 1 | 2 | 4 | 8 | 16 | 32,
        ...(stepScope ? { scope: stepScope } : {}),
      });
    } else {
      unsupportedReasons.push(`Unsupported denominator for time signature: ${denominator}`);
    }
  }

  const metadataRegex = /(?:set|change|update)\s+(title|subtitle|composer|lyricist)\s+(?:to|as)\s+["“]?([^"”,\n]+)["”]?/gi;
  for (const metadataMatch of stepText.matchAll(metadataRegex)) {
    const field = metadataMatch[1].toLowerCase() as z.infer<typeof METADATA_FIELD_SCHEMA>;
    const value = metadataMatch[2].trim();
    if (value) {
      ops.push({
        op: 'set_metadata_text',
        field,
        value,
      });
    }
  }

  const clefRegex = /(?:set|change|move)[^.!?\n]*?(treble|bass|alto|tenor)\s+clef/gi;
  for (const clefMatch of stepText.matchAll(clefRegex)) {
    const clef = clefMatch[1].toLowerCase() as z.infer<typeof CLEF_SCHEMA>;
    if (/last\s+\d+\s+(?:measure|bar)s?/i.test(stepText) && !stepScope) {
      unsupportedReasons.push('Clef change references "last N bars/measures", which needs explicit measure numbers.');
      continue;
    }
    ops.push({
      op: 'set_clef',
      clef,
      ...(stepScope ? { scope: stepScope } : {}),
    });
  }

  const removeQuotedTextRegex = /(?:remove|delete)\s+(?:the\s+)?text\s+[""\u201C\u201D]([^""\u201C\u201D]+)[""\u201C\u201D]/gi;
  const removeQuotedReverseRegex = /(?:remove|delete)\s+(?:the\s+)?[""\u201C\u201D]([^""\u201C\u201D]+)[""\u201C\u201D]\s+text/gi;
  for (const removeTextMatch of stepText.matchAll(removeQuotedTextRegex)) {
    const text = removeTextMatch[1].trim();
    if (text) {
      ops.push({
        op: 'delete_text_by_content',
        text,
        maxDeletes: 20,
      });
    }
  }
  for (const removeTextMatch of stepText.matchAll(removeQuotedReverseRegex)) {
    const text = removeTextMatch[1].trim();
    if (text && !ops.some((op) => op.op === 'delete_text_by_content' && (op as { text: string }).text === text)) {
      ops.push({
        op: 'delete_text_by_content',
        text,
        maxDeletes: 20,
      });
    }
  }

  if (!ops.some((op) => op.op === 'delete_text_by_content')) {
    const removeUnquotedTextMatch = stepText.match(/(?:remove|delete)\s+(?:the\s+)?text\s+([A-Z][A-Z0-9 _-]{2,80})/i);
    const removeUnquotedReverseMatch = stepText.match(/(?:remove|delete)\s+(?:the\s+)?([A-Z][A-Z0-9 _-]{2,80})\s+text/i);
    if (removeUnquotedTextMatch) {
      ops.push({
        op: 'delete_text_by_content',
        text: removeUnquotedTextMatch[1].trim(),
        maxDeletes: 20,
      });
    } else if (removeUnquotedReverseMatch) {
      ops.push({
        op: 'delete_text_by_content',
        text: removeUnquotedReverseMatch[1].trim(),
        maxDeletes: 20,
      });
    }
  }

  const removeMeasuresRegex = /remove\s+(?:measure|bar)s?\s+(\d+)\s*(?:-|to|through)\s*(\d+)/gi;
  for (const removeMeasuresMatch of stepText.matchAll(removeMeasuresRegex)) {
    ops.push({
      op: 'remove_measures',
      scope: {
        measureStart: Number(removeMeasuresMatch[1]),
        measureEnd: Number(removeMeasuresMatch[2]),
      },
    });
  }

  const deleteSelectionRegex = /(?:delete|clear|erase)\s+(?:measure|bar)s?\s+(\d+)\s*(?:-|to|through)\s*(\d+)/gi;
  for (const deleteMatch of stepText.matchAll(deleteSelectionRegex)) {
    if (!ops.some((op) => op.op === 'remove_measures'
      && (op as Extract<ScoreOp, { op: 'remove_measures' }>).scope.measureStart === Number(deleteMatch[1]))) {
      ops.push({
        op: 'delete_selection',
        scope: {
          measureStart: Number(deleteMatch[1]),
          measureEnd: Number(deleteMatch[2]),
        },
      });
    }
  }

  const deleteSingleMeasureRegex = /(?:delete|clear|erase)\s+(?:measure|bar)\s+(\d+)(?!\s*(?:-|to|through))/gi;
  for (const deleteMatch of stepText.matchAll(deleteSingleMeasureRegex)) {
    const measure = Number(deleteMatch[1]);
    ops.push({
      op: 'delete_selection',
      scope: {
        measureStart: measure,
        measureEnd: measure,
      },
    });
  }

  const insertMeasuresRegex = /insert\s+(\d+)\s+(?:measure|bar)s?(?:\s+(?:after\s+(?:measure|bar)\s+(\d+)|at\s+the\s+(beginning|start|end)))?/gi;
  for (const insertMeasuresMatch of stepText.matchAll(insertMeasuresRegex)) {
    const count = Number(insertMeasuresMatch[1]);
    const afterMeasure = insertMeasuresMatch[2] ? Number(insertMeasuresMatch[2]) : undefined;
    const position = insertMeasuresMatch[3]?.toLowerCase();
    let target: 'start' | 'end' | 'after_measure' = 'end';
    if (afterMeasure) {
      target = 'after_measure';
    } else if (position === 'beginning' || position === 'start') {
      target = 'start';
    }
    ops.push({
      op: 'insert_measures',
      count,
      target,
      ...(afterMeasure ? { afterMeasure } : {}),
    });
  }

  const transposeRegex = /transpos(?:e|ing)\s+(up|down)?\s*(\d+)\s*(?:semi-?tone|half[\s-]?step|step)s?/gi;
  for (const transposeMatch of stepText.matchAll(transposeRegex)) {
    const direction = (transposeMatch[1] || '').toLowerCase();
    let semitones = Number(transposeMatch[2]);
    if (direction === 'down') {
      semitones = -semitones;
    }
    if (semitones >= -24 && semitones <= 24) {
      ops.push({
        op: 'transpose_selection',
        semitones,
        ...(stepScope ? { scope: stepScope } : {}),
      });
    }
  }

  const tempoRegex = /(?:set(?:ting)?|add(?:ing)?|chang(?:e|ing))\s+tempo\s+(?:to|as|marking)?\s*(\d+)\s*(?:bpm)?/gi;
  for (const tempoMatch of stepText.matchAll(tempoRegex)) {
    const bpm = Number(tempoMatch[1]);
    if (bpm >= 20 && bpm <= 400) {
      ops.push({
        op: 'add_tempo_marking',
        bpm,
        ...(stepScope ? { scope: stepScope } : {}),
      });
    }
  }

  const dynamicRegex = /(?:add(?:ing)?|set(?:ting)?|insert(?:ing)?)\s+(?:a\s+)?(pppppp|ppppp|pppp|ppp|pp|p|mp|mf|ffffff|fffff|ffff|fff|ff|f|fp|pf|sfz|sffz|sff|sfpp|sfp|sf|rfz|rf|fz)\s+(?:dynamic|marking)?/gi;
  for (const dynamicMatch of stepText.matchAll(dynamicRegex)) {
    const dynamic = dynamicMatch[1].toLowerCase() as z.infer<typeof DYNAMIC_SCHEMA>;
    ops.push({
      op: 'add_dynamic',
      dynamic,
      ...(stepScope ? { scope: stepScope } : {}),
    });
  }

  const selectRangeMatch = stepText.match(/select\s+(?:measure|bar)s?\s+(\d+)\s*(?:-|to|through)\s*(\d+)/i);
  if (selectRangeMatch) {
    ops.push({
      op: 'select_measure_range',
      scope: {
        measureStart: Number(selectRangeMatch[1]),
        measureEnd: Number(selectRangeMatch[2]),
      },
    });
  }

  if (/select\s+all/i.test(stepText) && !selectRangeMatch) {
    ops.push({ op: 'select_all' });
  }

  const durationRegex = /(?:set|change)\s+(?:note\s+)?duration\s+(?:to\s+)?(long|breve|whole|half|quarter|eighth|16th|32nd|64th|128th|256th|512th|1024th)(?:\s+note)?/gi;
  for (const durationMatch of stepText.matchAll(durationRegex)) {
    const durationType = durationMatch[1].toLowerCase() as z.infer<typeof DURATION_TYPE_SCHEMA>;
    ops.push({
      op: 'set_duration',
      durationType,
      ...(stepScope ? { scope: stepScope } : {}),
    });
  }

  const voiceRegex = /(?:set|change|move\s+to)\s+voice\s+([1-4])/gi;
  for (const voiceMatch of stepText.matchAll(voiceRegex)) {
    const voice = Number(voiceMatch[1]) as 1 | 2 | 3 | 4;
    ops.push({
      op: 'set_voice',
      voice,
      ...(stepScope ? { scope: stepScope } : {}),
    });
  }

  const replaceTextRegex = /(?:replace|change)\s+(?:selected\s+)?text\s+(?:to|with)\s+[""\u201C]?([^""\u201D\n]+)[""\u201D]?/gi;
  for (const replaceMatch of stepText.matchAll(replaceTextRegex)) {
    const value = replaceMatch[1].trim();
    if (value) {
      ops.push({
        op: 'replace_selected_text',
        value,
        ...(stepScope ? { scope: stepScope } : {}),
      });
    }
  }

  const accidentalRegex = /(?:set|add|change)\s+(?:accidental\s+(?:to\s+)?)?(sharp|flat|natural|double[- ]sharp|double[- ]flat)(?:\s+accidental)?/gi;
  for (const accMatch of stepText.matchAll(accidentalRegex)) {
    const accidental = accMatch[1].toLowerCase().replace(' ', '-') as z.infer<typeof ACCIDENTAL_SCHEMA>;
    ops.push({
      op: 'set_accidental',
      accidental,
      ...(stepScope ? { scope: stepScope } : {}),
    });
  }

  const insertTextRegex = /(?:add|insert)\s+(?:(staff|system|expression|lyric|harmony|fingering|instrument[_ ]change|sticking)\s+)?text\s+[""\u201C]([^""\u201D]+)[""\u201D]/gi;
  for (const textMatch of stepText.matchAll(insertTextRegex)) {
    const rawKind = (textMatch[1] || 'staff').toLowerCase().replace(' ', '_');
    const kind = TEXT_KIND_SCHEMA.safeParse(rawKind);
    if (kind.success) {
      ops.push({
        op: 'insert_text',
        kind: kind.data,
        text: textMatch[2].trim(),
        ...(stepScope ? { scope: stepScope } : {}),
      });
    }
  }

  const layoutBreakRegex = /(?:add|set|toggle|insert)\s+(?:a\s+)?(line|page)\s+break/gi;
  for (const breakMatch of stepText.matchAll(layoutBreakRegex)) {
    const breakType = breakMatch[1].toLowerCase() as z.infer<typeof BREAK_TYPE_SCHEMA>;
    ops.push({
      op: 'set_layout_break',
      breakType,
      enabled: true,
      ...(stepScope ? { scope: stepScope } : {}),
    });
  }

  const repeatStartMatch = stepText.match(/(?:add|set|toggle)\s+repeat\s+(?:start|begin)/i);
  const repeatEndMatch = stepText.match(/(?:add|set|toggle)\s+repeat\s+end/i);
  if (repeatStartMatch || repeatEndMatch) {
    ops.push({
      op: 'set_repeat_markers',
      ...(repeatStartMatch ? { start: true } : {}),
      ...(repeatEndMatch ? { end: true } : {}),
      ...(stepScope ? { scope: stepScope } : {}),
    });
  }

  const undoMatch = stepText.match(/\bundo\s*(\d+)?\s*(?:step|time|change)?s?/i);
  if (undoMatch) {
    ops.push({
      op: 'history_step',
      direction: 'undo',
      steps: undoMatch[1] ? Number(undoMatch[1]) : 1,
    });
  }

  const redoMatch = stepText.match(/\bredo\s*(\d+)?\s*(?:step|time|change)?s?/i);
  if (redoMatch && !undoMatch) {
    ops.push({
      op: 'history_step',
      direction: 'redo',
      steps: redoMatch[1] ? Number(redoMatch[1]) : 1,
    });
  }

  if (/beam|beaming|re-beam|rebeam|remove\s+rests?|rest\s+cleanup/i.test(stepText)) {
    unsupportedReasons.push('Beaming/rest cleanup is not implemented in ScoreOps yet.');
  }

  if (!ops.length && /(?:change|set|move|remove|delete|insert|fix|cleanup|transpose|rewrite|edit|select|replace|undo|redo|toggle|add)\b/i.test(stepText)) {
    unsupportedReasons.push('No supported ScoreOps mapping found for this step.');
  }

  return { ops, unsupportedReasons };
}

function parsePromptToOps(prompt: string): ParsedPromptPlan {
  const steps = splitPromptIntoSteps(prompt);
  const parsedSteps: ParsedPromptStep[] = [];
  const ops: ScoreOp[] = [];
  const unsupportedHints: string[] = [];
  const unsupportedSteps: Array<{ index: number; text: string; reason: string }> = [];
  const supportedSteps: Array<{ index: number; text: string; opCount: number }> = [];

  steps.forEach((stepText, index) => {
    const parsed = parsePromptStep(stepText);
    const step: ParsedPromptStep = {
      index,
      text: stepText,
      parsedOps: parsed.ops,
      unsupportedReasons: parsed.unsupportedReasons,
    };
    parsedSteps.push(step);
    if (parsed.ops.length) {
      supportedSteps.push({
        index,
        text: stepText,
        opCount: parsed.ops.length,
      });
      ops.push(...parsed.ops);
    }
    parsed.unsupportedReasons.forEach((reason) => {
      unsupportedHints.push(`${stepText}: ${reason}`);
      unsupportedSteps.push({
        index,
        text: stepText,
        reason,
      });
    });
  });

  return {
    ops,
    unsupportedHints,
    steps: parsedSteps,
    supportedSteps,
    unsupportedSteps,
  };
}

function applyCapabilityGatingToPromptPlan(
  plan: ParsedPromptPlan,
  capabilities: ScoreOpsCapabilitySnapshot,
): ParsedPromptPlan {
  const nextOps: ScoreOp[] = [];
  const nextUnsupportedHints = [...plan.unsupportedHints];
  const nextUnsupportedSteps = [...plan.unsupportedSteps];
  const nextSupportedSteps: Array<{ index: number; text: string; opCount: number }> = [];

  plan.steps.forEach((step) => {
    const executableOps = step.parsedOps.filter((op) => {
      const support = capabilities.mutationOps[op.op];
      return Boolean(support?.xml || support?.wasm);
    });
    const blockedOps = step.parsedOps.filter((op) => !executableOps.includes(op));
    if (blockedOps.length) {
      const blockedNames = blockedOps.map((op) => op.op).join(', ');
      const reason = `Runtime does not support requested operation(s): ${blockedNames}.`;
      nextUnsupportedHints.push(`${step.text}: ${reason}`);
      nextUnsupportedSteps.push({
        index: step.index,
        text: step.text,
        reason,
      });
    }
    if (executableOps.length) {
      nextSupportedSteps.push({
        index: step.index,
        text: step.text,
        opCount: executableOps.length,
      });
      nextOps.push(...executableOps);
    }
  });

  return {
    ops: nextOps,
    unsupportedHints: nextUnsupportedHints,
    steps: plan.steps,
    supportedSteps: nextSupportedSteps,
    unsupportedSteps: nextUnsupportedSteps,
  };
}

export async function runMusicScoreOpsPromptService(body: unknown): Promise<ScoreOpsServiceResult> {
  const data = (body && typeof body === 'object') ? (body as Record<string, unknown>) : {};
  const prompt = typeof data.prompt === 'string' ? data.prompt.trim() : '';
  if (!prompt) {
    return errorResult(400, 'invalid_request', 'Missing prompt for scoreops planning.');
  }

  const parsed = parsePromptToOps(prompt);
  const capabilities = await buildCapabilities();
  const capabilityGated = applyCapabilityGatingToPromptPlan(parsed, capabilities);
  const plannerSummary = {
    mode: 'heuristic-v2',
    prompt,
    parsedOps: capabilityGated.ops,
    steps: capabilityGated.steps,
    supportedSteps: capabilityGated.supportedSteps,
    unsupportedSteps: capabilityGated.unsupportedSteps,
    unsupportedHints: capabilityGated.unsupportedHints,
    capabilities: {
      runtime: capabilities.runtime,
      mutationOps: capabilities.mutationOps,
    },
  };

  if (!capabilityGated.ops.length) {
    return errorResult(422, 'unsupported_op', 'Prompt could not be mapped to supported ScoreOps MVP operations.', {
      planner: plannerSummary,
    });
  }

  const applyBody: Record<string, unknown> = {
    action: 'apply',
    scoreSessionId: typeof data.scoreSessionId === 'string' ? data.scoreSessionId : undefined,
    baseRevision: typeof data.baseRevision === 'number' ? data.baseRevision : undefined,
    inputArtifactId: typeof data.inputArtifactId === 'string' ? data.inputArtifactId : (typeof data.input_artifact_id === 'string' ? data.input_artifact_id : undefined),
    content: typeof data.content === 'string' ? data.content : (typeof data.text === 'string' ? data.text : undefined),
    ops: capabilityGated.ops,
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
        planner: plannerSummary,
      },
    };
  }

  return {
    status: 200,
    body: {
      ok: true,
      mode: 'scoreops-heuristic',
      planner: plannerSummary,
      execution: applied.body,
    },
  };
}

export const __scoreOpsTestOnly = {
  clearSessions: () => {
    clearScoreOpsSessions();
    wasmProbeCache = null;
    wasmProbePromise = null;
  },
  parsePromptToOps,
};
