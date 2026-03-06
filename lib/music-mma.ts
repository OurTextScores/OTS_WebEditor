import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getMmaArrangementDirectives, type MmaArrangementPreset } from './music-mma-presets';
import { type TraceContext } from './trace-http';

export type MmaTemplateBuildOptions = {
  maxMeasures?: number;
  defaultGroove?: string;
  arrangementPreset?: MmaArrangementPreset;
};

export type MmaTemplateBuildResult = {
  template: string;
  warnings: string[];
  analysis: {
    meter: string;
    key: string;
    tempo: number;
    measureCount: number;
    harmonyMeasureCount: number;
    harmonyCoverage: number;
  };
};

export type MmaScriptValidation = {
  ok: boolean;
  bytes: number;
  error?: string;
};

export type MmaCompileResult = {
  midiBase64: string;
  midiBytes: number;
  command: string;
  args: string[];
  durationMs: number;
  stderr: string;
};

type MmaToolConfig = {
  bins: string[];
  defaultTimeoutMs: number;
  maxScriptBytes: number;
  maxStderrChars: number;
};

type RunResult = {
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
};

const DEFAULT_MMA_TIMEOUT_MS = 60_000;
const DEFAULT_MMA_MAX_SCRIPT_BYTES = 256 * 1024;
const DEFAULT_MMA_MAX_STDERR_CHARS = 8_000;
const DEFAULT_GROOVE = 'Swing';
const DEFAULT_TEMPO = 108;
const DEFAULT_METER = '4/4';
const DEFAULT_KEY = 'C';

const FIFTHS_MAJOR_KEY_MAP: Record<number, string> = {
  [-7]: 'Cb',
  [-6]: 'Gb',
  [-5]: 'Db',
  [-4]: 'Ab',
  [-3]: 'Eb',
  [-2]: 'Bb',
  [-1]: 'F',
  [0]: 'C',
  [1]: 'G',
  [2]: 'D',
  [3]: 'A',
  [4]: 'E',
  [5]: 'B',
  [6]: 'F#',
  [7]: 'C#',
};

const KIND_SUFFIX_MAP: Record<string, string> = {
  major: '',
  minor: 'm',
  augmented: '+',
  diminished: 'dim',
  dominant: '7',
  'major-seventh': 'maj7',
  'minor-seventh': 'm7',
  'diminished-seventh': 'dim7',
  'half-diminished': 'm7b5',
  'suspended-fourth': 'sus4',
  'suspended-second': 'sus2',
  'power': '5',
};

const STEP_TO_PITCH_CLASS: Record<string, number> = {
  C: 0,
  D: 2,
  E: 4,
  F: 5,
  G: 7,
  A: 9,
  B: 11,
};

const SHARP_PITCH_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const;
const FLAT_PITCH_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'] as const;

type ChordCandidate = {
  suffix: string;
  intervals: number[];
  minCoverage: number;
  minPresentIntervals: number;
  priority: number;
};

const INFERRED_CHORD_CANDIDATES: ChordCandidate[] = [
  { suffix: 'maj7', intervals: [0, 4, 7, 11], minCoverage: 0.58, minPresentIntervals: 4, priority: 8 },
  { suffix: 'm7', intervals: [0, 3, 7, 10], minCoverage: 0.58, minPresentIntervals: 4, priority: 8 },
  { suffix: '7', intervals: [0, 4, 7, 10], minCoverage: 0.58, minPresentIntervals: 4, priority: 8 },
  { suffix: '', intervals: [0, 4, 7], minCoverage: 0.55, minPresentIntervals: 3, priority: 6 },
  { suffix: 'm', intervals: [0, 3, 7], minCoverage: 0.55, minPresentIntervals: 3, priority: 6 },
  { suffix: 'dim', intervals: [0, 3, 6], minCoverage: 0.55, minPresentIntervals: 3, priority: 5 },
  { suffix: 'sus4', intervals: [0, 5, 7], minCoverage: 0.55, minPresentIntervals: 3, priority: 5 },
];

const parseCommandCandidates = (csv: string | undefined, defaults: Array<string | undefined>) => {
  const values = [
    ...(csv ? csv.split(',') : []),
    ...defaults,
  ]
    .map((value) => String(value || '').trim())
    .filter(Boolean);
  return [...new Set(values)];
};

const parsePositiveIntegerEnv = (value: string | undefined, fallback: number) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return Math.floor(parsed);
};

export function getMmaToolConfig(): MmaToolConfig {
  const bins = parseCommandCandidates(process.env.MUSIC_MMA_BIN_CANDIDATES, [
    process.env.MUSIC_MMA_BIN,
    'mma',
  ]);
  return {
    bins,
    defaultTimeoutMs: parsePositiveIntegerEnv(process.env.MUSIC_MMA_TIMEOUT_MS, DEFAULT_MMA_TIMEOUT_MS),
    maxScriptBytes: parsePositiveIntegerEnv(process.env.MUSIC_MMA_MAX_SCRIPT_BYTES, DEFAULT_MMA_MAX_SCRIPT_BYTES),
    maxStderrChars: parsePositiveIntegerEnv(process.env.MUSIC_MMA_MAX_STDERR_CHARS, DEFAULT_MMA_MAX_STDERR_CHARS),
  };
}

const sanitizeStderr = (stderr: string, maxChars: number) => {
  const trimmed = stderr
    .replace(/\x1b\[[0-9;]*m/g, '')
    .replace(/\/tmp\/ots-mma-[^\s:]+/g, '<tmp-path>')
    .replace(/[\t ]+/g, ' ')
    .trim();
  if (trimmed.length <= maxChars) {
    return trimmed;
  }
  return `${trimmed.slice(0, maxChars)}…`;
};

const splitCommandCandidate = (candidate: string) => {
  const parts = candidate.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) {
    return null;
  }
  return {
    command: parts[0]!,
    prefixArgs: parts.slice(1),
  };
};

const runCommand = async (args: {
  command: string;
  argv: string[];
  timeoutMs: number;
}): Promise<RunResult> => {
  return await new Promise<RunResult>((resolve, reject) => {
    const child = spawn(args.command, args.argv, {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    let finished = false;
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, args.timeoutMs);

    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      stdout += chunk;
    });

    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk: string) => {
      stderr += chunk;
    });

    child.on('error', (error) => {
      clearTimeout(timer);
      if (finished) {
        return;
      }
      finished = true;
      reject(error);
    });

    child.on('close', (exitCode, signal) => {
      clearTimeout(timer);
      if (finished) {
        return;
      }
      finished = true;
      if (timedOut) {
        reject(new Error(`MMA command timed out after ${args.timeoutMs}ms.`));
        return;
      }
      resolve({ exitCode, signal, stdout, stderr });
    });
  });
};

const runCommandWithCandidates = async (args: {
  candidates: string[];
  argv: string[];
  timeoutMs: number;
}) => {
  const attempts: string[] = [];
  let lastError: unknown = null;

  for (const candidate of args.candidates) {
    const parsed = splitCommandCandidate(candidate);
    if (!parsed) {
      continue;
    }
    attempts.push(candidate);
    try {
      const result = await runCommand({
        command: parsed.command,
        argv: [...parsed.prefixArgs, ...args.argv],
        timeoutMs: args.timeoutMs,
      });
      return {
        ...result,
        command: parsed.command,
        args: [...parsed.prefixArgs, ...args.argv],
      };
    } catch (error) {
      const code = typeof error === 'object' && error && 'code' in error ? String((error as { code?: string }).code || '') : '';
      if (code === 'ENOENT') {
        lastError = error;
        continue;
      }
      throw error;
    }
  }

  if (!attempts.length) {
    throw new Error('No MMA command candidates configured.');
  }

  const reason = lastError instanceof Error ? lastError.message : 'All MMA command candidates failed.';
  throw new Error(`MMA tool unavailable. Tried: ${attempts.join(', ')}. Last error: ${reason}`);
};

const normalizeRoot = (step: string, alterRaw: string | null) => {
  const stepUpper = step.toUpperCase();
  const alter = alterRaw === null ? 0 : Number(alterRaw);
  if (!Number.isFinite(alter) || alter === 0) {
    return stepUpper;
  }
  if (alter > 0) {
    return `${stepUpper}${'#'.repeat(Math.min(2, Math.trunc(alter)))}`;
  }
  return `${stepUpper}${'b'.repeat(Math.min(2, Math.abs(Math.trunc(alter))))}`;
};

const parseHarmonyKind = (kindTag: string) => {
  const textAttrMatch = kindTag.match(/\btext="([^"]+)"/i);
  if (textAttrMatch?.[1]?.trim()) {
    return textAttrMatch[1].trim();
  }
  const rawKind = kindTag
    .replace(/<\/?.*?>/g, '')
    .trim()
    .toLowerCase();
  if (!rawKind) {
    return '';
  }
  return KIND_SUFFIX_MAP[rawKind] ?? rawKind;
};

const mod12 = (value: number) => ((value % 12) + 12) % 12;

const prefersSharpsFromFifths = (fifths: number) => fifths >= 0;

const pitchClassToName = (pitchClass: number, keyFifths: number) => {
  const normalized = mod12(pitchClass);
  return prefersSharpsFromFifths(keyFifths)
    ? SHARP_PITCH_NAMES[normalized]!
    : FLAT_PITCH_NAMES[normalized]!;
};

type PartMeasureEntry = {
  number: number | null;
  xml: string;
};

const extractPartXmls = (xml: string) => {
  const partRegex = /<part\b[^>]*\bid="[^"]+"[^>]*>([\s\S]*?)<\/part>/gi;
  const parts: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = partRegex.exec(xml)) !== null) {
    parts.push(match[1] || '');
  }
  return parts;
};

const extractMeasuresFromPart = (partXml: string) => {
  const measureRegex = /(<measure\b[^>]*\/>)|(<measure\b[^>]*>)([\s\S]*?)<\/measure>/gi;
  const measures: PartMeasureEntry[] = [];
  let match: RegExpExecArray | null;
  while ((match = measureRegex.exec(partXml)) !== null) {
    const measureTag = match[1] || match[2] || match[0];
    const numberRaw = measureTag.match(/\bnumber="([^"]+)"/i)?.[1] ?? null;
    const parsed = numberRaw === null ? Number.NaN : Number(numberRaw);
    measures.push({
      number: Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : null,
      xml: match[3] || '',
    });
  }
  return measures;
};

const extractPrimaryPartMeasures = (xml: string) => {
  const [primaryPartXml = ''] = extractPartXmls(xml);
  return extractMeasuresFromPart(primaryPartXml);
};

const extractMeasureCount = (xml: string) => {
  return extractPrimaryPartMeasures(xml).length;
};

const extractHarmonyByMeasure = (xml: string, maxMeasures: number) => {
  const primaryMeasures = extractPrimaryPartMeasures(xml);
  const harmonyByMeasure = new Map<number, string>();
  for (let index = 0; index < Math.min(primaryMeasures.length, maxMeasures); index += 1) {
    const bar = index + 1;
    const measureXml = primaryMeasures[index]?.xml || '';
    const harmonyMatch = measureXml.match(/<harmony\b[\s\S]*?<\/harmony>/i);
    if (!harmonyMatch) {
      continue;
    }

    const rootStep = harmonyMatch[0].match(/<root-step>\s*([A-Ga-g])\s*<\/root-step>/)?.[1] || '';
    if (!rootStep) {
      continue;
    }
    const rootAlter = harmonyMatch[0].match(/<root-alter>\s*([-+]?\d+)\s*<\/root-alter>/)?.[1] ?? null;
    const kindMatch = harmonyMatch[0].match(/<kind\b[^>]*>[\s\S]*?<\/kind>/i)?.[0] || '';
    const root = normalizeRoot(rootStep, rootAlter);
    const suffix = kindMatch ? parseHarmonyKind(kindMatch) : '';
    harmonyByMeasure.set(bar, `${root}${suffix}`.trim());
  }

  return harmonyByMeasure;
};

const extractPitchClassWeightsByMeasure = (xml: string, maxMeasures: number) => {
  const weightsByMeasure = new Map<number, Map<number, number>>();
  const partXmls = extractPartXmls(xml);
  for (const partXml of partXmls) {
    const measures = extractMeasuresFromPart(partXml);
    for (let index = 0; index < Math.min(measures.length, maxMeasures); index += 1) {
      const bar = index + 1;
      const measureXml = measures[index]?.xml || '';
    const noteRegex = /<note\b[\s\S]*?<\/note>/gi;
    let noteMatch: RegExpExecArray | null;
    while ((noteMatch = noteRegex.exec(measureXml)) !== null) {
      const noteXml = noteMatch[0];
      if (/<rest\b/i.test(noteXml) || /<unpitched\b/i.test(noteXml) || /<grace\b/i.test(noteXml)) {
        continue;
      }

      const step = noteXml.match(/<step>\s*([A-Ga-g])\s*<\/step>/i)?.[1]?.toUpperCase() || '';
      if (!step) {
        continue;
      }
      const basePitch = STEP_TO_PITCH_CLASS[step];
      if (typeof basePitch !== 'number') {
        continue;
      }

      const alterRaw = Number(noteXml.match(/<alter>\s*([-+]?\d+)\s*<\/alter>/i)?.[1] ?? '0');
      const alter = Number.isFinite(alterRaw) ? Math.trunc(alterRaw) : 0;
      const pitchClass = mod12(basePitch + alter);

      const durationRaw = Number(noteXml.match(/<duration>\s*([-+]?\d+)\s*<\/duration>/i)?.[1] ?? '1');
      const durationWeight = Number.isFinite(durationRaw) && durationRaw > 0 ? Math.trunc(durationRaw) : 1;

      const measureWeights = weightsByMeasure.get(bar) ?? new Map<number, number>();
      weightsByMeasure.set(bar, measureWeights);
      measureWeights.set(pitchClass, (measureWeights.get(pitchClass) || 0) + durationWeight);
    }
    }
  }

  return weightsByMeasure;
};

const inferChordFromPitchClassWeights = (weights: Map<number, number>, keyFifths: number): string | null => {
  let totalWeight = 0;
  for (const value of weights.values()) {
    totalWeight += value;
  }
  if (totalWeight <= 0) {
    return null;
  }

  let best: { score: number; coverage: number; root: number; candidate: ChordCandidate } | null = null;

  for (let root = 0; root < 12; root += 1) {
    for (const candidate of INFERRED_CHORD_CANDIDATES) {
      const intervalSet = new Set<number>(candidate.intervals);
      let matchedWeight = 0;
      let unmatchedWeight = 0;
      let presentRequiredIntervals = 0;
      for (const [pitchClass, weight] of weights.entries()) {
        const interval = mod12(pitchClass - root);
        if (intervalSet.has(interval)) {
          matchedWeight += weight;
        } else {
          unmatchedWeight += weight;
        }
      }

      for (const interval of candidate.intervals) {
        const intervalPitchClass = mod12(root + interval);
        if ((weights.get(intervalPitchClass) || 0) > 0) {
          presentRequiredIntervals += 1;
        }
      }

      const coverage = matchedWeight / totalWeight;
      if (coverage < candidate.minCoverage) {
        continue;
      }
      if (presentRequiredIntervals < candidate.minPresentIntervals) {
        continue;
      }

      const rootWeight = weights.get(root) || 0;
      const thirdInterval = candidate.intervals.includes(4) ? 4 : (candidate.intervals.includes(3) ? 3 : null);
      const thirdWeight = thirdInterval === null ? 0 : (weights.get(mod12(root + thirdInterval)) || 0);
      const fifthWeight = weights.get(mod12(root + 7)) || 0;
      const seventhWeight = candidate.intervals.includes(10)
        ? (weights.get(mod12(root + 10)) || 0)
        : (candidate.intervals.includes(11) ? (weights.get(mod12(root + 11)) || 0) : 0);

      let score = 0;
      score += matchedWeight * 2.35;
      score -= unmatchedWeight * 1.75;
      score += rootWeight * 1.65;
      score += thirdWeight * 1.1;
      score += fifthWeight * 0.55;
      score += seventhWeight * 0.45;
      score += presentRequiredIntervals * 0.35;
      score += candidate.priority * 0.05;
      if (rootWeight === 0) {
        score -= totalWeight * 0.25;
      }

      if (!best || score > best.score || (score === best.score && coverage > best.coverage)) {
        best = { score, coverage, root, candidate };
      }
    }
  }

  if (!best || best.score <= 0) {
    return null;
  }
  return `${pitchClassToName(best.root, keyFifths)}${best.candidate.suffix}`;
};

const inferHarmonyByMeasure = (xml: string, maxMeasures: number, keyFifths: number) => {
  const inferred = new Map<number, string>();
  const weightsByMeasure = extractPitchClassWeightsByMeasure(xml, maxMeasures);

  for (let bar = 1; bar <= maxMeasures; bar += 1) {
    const weights = weightsByMeasure.get(bar);
    if (!weights || weights.size === 0) {
      continue;
    }
    const chord = inferChordFromPitchClassWeights(weights, keyFifths);
    if (chord) {
      inferred.set(bar, chord);
    }
  }

  return inferred;
};

export function validateMmaScript(script: string): MmaScriptValidation {
  const config = getMmaToolConfig();
  const trimmed = script.trim();
  const bytes = Buffer.byteLength(script, 'utf8');

  if (!trimmed) {
    return {
      ok: false,
      bytes,
      error: 'MMA script is empty.',
    };
  }

  if (bytes > config.maxScriptBytes) {
    return {
      ok: false,
      bytes,
      error: `MMA script exceeds size limit (${bytes} bytes > ${config.maxScriptBytes}).`,
    };
  }

  return {
    ok: true,
    bytes,
  };
}

export function buildStarterTemplateFromXml(xml: string, options?: MmaTemplateBuildOptions): MmaTemplateBuildResult {
  const warnings: string[] = [];
  const maxMeasures = Math.max(1, Math.floor(options?.maxMeasures || 16));
  const groove = (options?.defaultGroove || DEFAULT_GROOVE).trim() || DEFAULT_GROOVE;
  const arrangementDirectives = options?.arrangementPreset
    ? getMmaArrangementDirectives(options.arrangementPreset)
    : [];

  const beats = xml.match(/<beats>\s*(\d+)\s*<\/beats>/i)?.[1] || DEFAULT_METER.split('/')[0]!;
  const beatType = xml.match(/<beat-type>\s*(\d+)\s*<\/beat-type>/i)?.[1] || DEFAULT_METER.split('/')[1]!;
  const meter = `${beats}/${beatType}`;

  const tempoRaw = Number(xml.match(/<sound\b[^>]*\btempo="([0-9.]+)"/i)?.[1] || '');
  const tempo = Number.isFinite(tempoRaw) && tempoRaw > 0 ? Math.round(tempoRaw) : DEFAULT_TEMPO;

  const fifthsRaw = Number(xml.match(/<fifths>\s*([-+]?\d+)\s*<\/fifths>/i)?.[1] || '0');
  const keyFifths = Math.max(-7, Math.min(7, Math.trunc(fifthsRaw)));
  const key = FIFTHS_MAJOR_KEY_MAP[keyFifths] || DEFAULT_KEY;

  const measureCountEstimate = extractMeasureCount(xml);
  const measureCount = Math.max(1, Math.min(maxMeasures, measureCountEstimate || maxMeasures));

  const explicitHarmonyByMeasure = extractHarmonyByMeasure(xml, measureCount);
  const inferredHarmonyByMeasure = inferHarmonyByMeasure(xml, measureCount, keyFifths);

  const chords: string[] = [];
  let explicitCount = 0;
  let inferredCount = 0;
  let fallbackCount = 0;
  for (let bar = 1; bar <= measureCount; bar += 1) {
    const explicit = explicitHarmonyByMeasure.get(bar);
    if (explicit) {
      chords.push(explicit);
      explicitCount += 1;
      continue;
    }
    const inferred = inferredHarmonyByMeasure.get(bar);
    if (inferred) {
      chords.push(inferred);
      inferredCount += 1;
      continue;
    }
    chords.push(key);
    fallbackCount += 1;
  }

  if (explicitCount === 0) {
    if (inferredCount > 0) {
      warnings.push(`No <harmony> tags found in source MusicXML; inferred chord symbols from note content for ${inferredCount}/${measureCount} measure(s).`);
    } else {
      warnings.push(`No <harmony> tags found and note-based inference was unavailable; using fallback ${key} chords.`);
    }
  } else if (inferredCount > 0) {
    warnings.push(`Filled ${inferredCount} measure(s) without <harmony> tags using note-based chord inference.`);
  }

  if (fallbackCount > 0) {
    warnings.push(`Could not derive harmony for ${fallbackCount}/${measureCount} measure(s); using fallback ${key} chords.`);
  }

  const body = chords
    .map((chord, index) => `${index + 1}  ${chord}`)
    .join('\n');

  const headerLines = [
    `Tempo ${tempo}`,
    `TimeSig ${beats} ${beatType}`,
    `KeySig ${key}`,
    `Groove ${groove}`,
    ...arrangementDirectives,
    '',
  ];

  return {
    template: `${headerLines.join('\n')}${body}\n`,
    warnings,
    analysis: {
      meter,
      key,
      tempo,
      measureCount,
      harmonyMeasureCount: explicitCount + inferredCount,
      harmonyCoverage: measureCount > 0 ? Number(((explicitCount + inferredCount) / measureCount).toFixed(3)) : 0,
    },
  };
}

const ensureMidiHeader = (bytes: Buffer) => {
  return bytes.length >= 14 && bytes.subarray(0, 4).toString('ascii') === 'MThd';
};

const logMmaEvent = (args: {
  event: string;
  traceContext?: TraceContext;
  extra?: Record<string, unknown>;
}) => {
  console.info(JSON.stringify({
    event: args.event,
    requestId: args.traceContext?.requestId || null,
    traceId: args.traceContext?.traceId || null,
    sessionId: args.traceContext?.sessionId || null,
    clientSessionId: args.traceContext?.clientSessionId || null,
    ...(args.extra || {}),
  }));
};

export async function runMmaCompile(args: {
  script: string;
  timeoutMs?: number;
  traceContext?: TraceContext;
}) {
  const config = getMmaToolConfig();
  const timeoutMs = args.timeoutMs && args.timeoutMs > 0 ? Math.floor(args.timeoutMs) : config.defaultTimeoutMs;

  const scriptValidation = validateMmaScript(args.script);
  if (!scriptValidation.ok) {
    throw new Error(scriptValidation.error || 'Invalid MMA script.');
  }

  const tempDir = await mkdtemp(join(tmpdir(), 'ots-mma-'));
  const inputPath = join(tempDir, 'input.mma');
  const outputPath = join(tempDir, 'output.mid');
  const startedAt = Date.now();

  try {
    await writeFile(inputPath, args.script, 'utf8');

    const commandResult = await runCommandWithCandidates({
      candidates: config.bins,
      argv: ['-f', outputPath, inputPath],
      timeoutMs,
    });

    const stderr = sanitizeStderr(
      [commandResult.stderr, commandResult.stdout].filter((value) => Boolean(value && value.trim())).join('\n'),
      config.maxStderrChars,
    );
    if (commandResult.exitCode !== 0) {
      throw new Error(stderr || `MMA command failed with exit code ${String(commandResult.exitCode)}.`);
    }

    const midiBytes = await readFile(outputPath);
    if (!midiBytes.length) {
      throw new Error('MMA did not generate MIDI output.');
    }
    if (!ensureMidiHeader(midiBytes)) {
      throw new Error('MMA output is not valid MIDI (MThd header missing).');
    }

    const durationMs = Math.max(0, Date.now() - startedAt);
    logMmaEvent({
      event: 'music.mma.compile',
      traceContext: args.traceContext,
      extra: {
        ok: true,
        durationMs,
        command: commandResult.command,
      },
    });

    return {
      midiBase64: midiBytes.toString('base64'),
      midiBytes: midiBytes.length,
      command: commandResult.command,
      args: commandResult.args,
      durationMs,
      stderr,
    } as MmaCompileResult;
  } finally {
    await rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
  }
}
