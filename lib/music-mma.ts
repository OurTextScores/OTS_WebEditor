import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type TraceContext } from './trace-http';

export type MmaTemplateBuildOptions = {
  maxMeasures?: number;
  defaultGroove?: string;
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
      stdio: ['ignore', 'ignore', 'pipe'],
    });

    let stderr = '';
    let finished = false;
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, args.timeoutMs);

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
      resolve({ exitCode, signal, stderr });
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

const extractMeasureCount = (xml: string) => {
  const measureMatches = [...xml.matchAll(/<measure\b[^>]*\bnumber="([^"]+)"[^>]*>/gi)];
  if (!measureMatches.length) {
    return 0;
  }
  const numeric = measureMatches
    .map((match) => Number(match[1]))
    .filter((value) => Number.isFinite(value) && value > 0)
    .map((value) => Math.trunc(value));
  if (!numeric.length) {
    return measureMatches.length;
  }
  return Math.max(...numeric);
};

const extractHarmonyByMeasure = (xml: string, maxMeasures: number) => {
  const measureRegex = /<measure\b[^>]*\bnumber="([^"]+)"[^>]*>([\s\S]*?)<\/measure>/gi;
  const harmonyByMeasure = new Map<number, string>();
  let match: RegExpExecArray | null;

  while ((match = measureRegex.exec(xml)) !== null) {
    const measureNumber = Number(match[1]);
    if (!Number.isFinite(measureNumber) || measureNumber < 1) {
      continue;
    }
    const bar = Math.trunc(measureNumber);
    if (bar > maxMeasures || harmonyByMeasure.has(bar)) {
      continue;
    }

    const measureXml = match[2] || '';
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

  const beats = xml.match(/<beats>\s*(\d+)\s*<\/beats>/i)?.[1] || DEFAULT_METER.split('/')[0]!;
  const beatType = xml.match(/<beat-type>\s*(\d+)\s*<\/beat-type>/i)?.[1] || DEFAULT_METER.split('/')[1]!;
  const meter = `${beats}/${beatType}`;

  const tempoRaw = Number(xml.match(/<sound\b[^>]*\btempo="([0-9.]+)"/i)?.[1] || '');
  const tempo = Number.isFinite(tempoRaw) && tempoRaw > 0 ? Math.round(tempoRaw) : DEFAULT_TEMPO;

  const fifthsRaw = Number(xml.match(/<fifths>\s*([-+]?\d+)\s*<\/fifths>/i)?.[1] || '0');
  const key = FIFTHS_MAJOR_KEY_MAP[Math.max(-7, Math.min(7, Math.trunc(fifthsRaw)))] || DEFAULT_KEY;

  const measureCountEstimate = extractMeasureCount(xml);
  const measureCount = Math.max(1, Math.min(maxMeasures, measureCountEstimate || maxMeasures));

  const harmonyByMeasure = extractHarmonyByMeasure(xml, measureCount);
  if (harmonyByMeasure.size === 0) {
    warnings.push('No <harmony> tags found in source MusicXML; using placeholder C chords.');
  }

  const chords: string[] = [];
  for (let bar = 1; bar <= measureCount; bar += 1) {
    chords.push(harmonyByMeasure.get(bar) || 'C');
  }

  const groups: string[] = [];
  for (let offset = 0; offset < chords.length; offset += 4) {
    groups.push(chords.slice(offset, offset + 4).join(' | '));
  }

  const body = groups
    .map((group, index) => `${(index * 4) + 1}  ${group} |`)
    .join('\n');

  const headerLines = [
    '; Generated by OTS MMA template',
    `Tempo ${tempo}`,
    `TimeSig ${beats} ${beatType}`,
    `KeySig ${key}`,
    `Groove ${groove}`,
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
      harmonyMeasureCount: harmonyByMeasure.size,
      harmonyCoverage: measureCount > 0 ? Number((harmonyByMeasure.size / measureCount).toFixed(3)) : 0,
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

    const stderr = sanitizeStderr(commandResult.stderr, config.maxStderrChars);
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
