import { spawn } from 'node:child_process';
import { access, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type TraceContext } from './trace-http';

export type MusicFormat = 'abc' | 'musicxml' | 'midi';
export type MusicContentEncoding = 'utf8' | 'base64';

export type MusicConversionRequest = {
    inputFormat: MusicFormat;
    outputFormat: MusicFormat;
    content: string;
    contentEncoding?: MusicContentEncoding;
    filename?: string;
    validate?: boolean;
    deepValidate?: boolean;
    timeoutMs?: number;
    traceContext?: TraceContext;
};

export type ValidationSeverity = 'info' | 'warning' | 'error';

export type ValidationCheck = {
    id: string;
    ok: boolean;
    severity: ValidationSeverity;
    message: string;
};

export type ValidationStageStatus = {
    ok: boolean;
    checks: string[];
    warnings: number;
    errors: number;
};

export type ValidationSummary = {
    info: number;
    warning: number;
    error: number;
};

export type ValidationReport = {
    schemaVersion: 'music-validation@1';
    ok: boolean;
    checks: ValidationCheck[];
    summary: ValidationSummary;
    stages: {
        outputShape: ValidationStageStatus;
        roundtrip: ValidationStageStatus;
        render: ValidationStageStatus;
        playback: ValidationStageStatus;
        invariants: ValidationStageStatus;
    };
};

export type NormalizationAction = {
    id: string;
    applied: boolean;
    message: string;
};

export type NormalizationReport = {
    schemaVersion: 'music-normalization@1';
    format: MusicFormat;
    changed: boolean;
    inputBytes: number;
    outputBytes: number;
    actions: NormalizationAction[];
};

export type MusicConversionResult = {
    inputFormat: MusicFormat;
    outputFormat: MusicFormat;
    content: string;
    contentEncoding: MusicContentEncoding;
    normalization: NormalizationReport;
    validation: ValidationReport;
    provenance: {
        engine: 'notagen';
        pythonCommand: string;
        scripts: {
            xml2abc: string;
            abc2xml: string;
        };
        durationMs: number;
        stderr?: string;
    };
};

type ConversionToolConfig = {
    pythonCommand: string;
    xml2abcScript: string;
    abc2xmlScript: string;
    defaultTimeoutMs: number;
    musescoreBins: string[];
    abc2midiBins: string[];
    renderSmokeTimeoutMs: number;
};

type RunCommandResult = {
    stdout: string;
    stderr: string;
    exitCode: number | null;
    signal: NodeJS.Signals | null;
};

const DEFAULT_XML2ABC_SCRIPT = '/home/jhlusko/workspace/NotaGen/data/xml2abc.py';
const DEFAULT_ABC2XML_SCRIPT = '/home/jhlusko/workspace/NotaGen/data/abc2xml.py';
const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_RENDER_SMOKE_TIMEOUT_MS = 20_000;

const XML2ABC_ARGS = ['-d', '8', '-c', '6', '-x'];

export function normalizeMusicFormat(value: unknown): MusicFormat | null {
    const raw = String(value || '').trim().toLowerCase();
    if (!raw) {
        return null;
    }
    if (raw === 'abc') {
        return 'abc';
    }
    if (raw === 'xml' || raw === 'musicxml' || raw === 'mxl') {
        return 'musicxml';
    }
    if (raw === 'midi' || raw === 'mid') {
        return 'midi';
    }
    return null;
}

export function getMusicConversionToolConfig(): ConversionToolConfig {
    const pythonCommand = (process.env.MUSIC_CONVERT_PYTHON || 'python3').trim() || 'python3';
    const xml2abcScript = (process.env.MUSIC_XML2ABC_SCRIPT || DEFAULT_XML2ABC_SCRIPT).trim();
    const abc2xmlScript = (process.env.MUSIC_ABC2XML_SCRIPT || DEFAULT_ABC2XML_SCRIPT).trim();
    const timeoutValue = Number(process.env.MUSIC_CONVERT_TIMEOUT_MS);
    const defaultTimeoutMs = Number.isFinite(timeoutValue) && timeoutValue > 0 ? timeoutValue : DEFAULT_TIMEOUT_MS;
    const renderTimeoutValue = Number(process.env.MUSIC_RENDER_SMOKE_TIMEOUT_MS);
    const renderSmokeTimeoutMs = Number.isFinite(renderTimeoutValue) && renderTimeoutValue > 0
        ? renderTimeoutValue
        : DEFAULT_RENDER_SMOKE_TIMEOUT_MS;
    const musescoreBins = parseCommandCandidates(process.env.MUSIC_MUSESCORE_BIN_CANDIDATES, [
        process.env.MUSIC_MUSESCORE_BIN,
        'musescore4',
        'mscore4portable',
        'MuseScore4',
        'musescore3',
        'mscore',
        'musescore',
        'MuseScore3',
    ]);
    const abc2midiBins = parseCommandCandidates(process.env.MUSIC_ABC2MIDI_BIN_CANDIDATES, [
        process.env.MUSIC_ABC2MIDI_BIN,
        'abc2midi',
    ]);
    return {
        pythonCommand,
        xml2abcScript,
        abc2xmlScript,
        defaultTimeoutMs,
        musescoreBins,
        abc2midiBins,
        renderSmokeTimeoutMs,
    };
}

function parseCommandCandidates(csv: string | undefined, defaults: Array<string | undefined>) {
    const values = [
        ...(csv ? csv.split(',') : []),
        ...defaults,
    ]
        .map((value) => String(value || '').trim())
        .filter(Boolean);
    return [...new Set(values)];
}

function parseBooleanEnv(name: string): boolean | undefined {
    const raw = (process.env[name] || '').trim().toLowerCase();
    if (!raw) {
        return undefined;
    }
    if (raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on') {
        return true;
    }
    if (raw === '0' || raw === 'false' || raw === 'no' || raw === 'off') {
        return false;
    }
    return undefined;
}

const logMusicConvertEvent = (args: {
    level?: 'info' | 'warn' | 'error';
    event: string;
    traceContext?: TraceContext;
    extra?: Record<string, unknown>;
}) => {
    const line = JSON.stringify({
        event: args.event,
        requestId: args.traceContext?.requestId || null,
        traceId: args.traceContext?.traceId || null,
        sessionId: args.traceContext?.sessionId || null,
        clientSessionId: args.traceContext?.clientSessionId || null,
        ...(args.extra || {}),
    });
    if (args.level === 'error') {
        console.error(line);
        return;
    }
    if (args.level === 'warn') {
        console.warn(line);
        return;
    }
    console.info(line);
};

export async function ensureMusicConversionToolsAvailable(): Promise<{
    ok: boolean;
    missing: string[];
    config: ConversionToolConfig;
}> {
    const config = getMusicConversionToolConfig();
    const checks = await Promise.all([
        fileExists(config.xml2abcScript),
        fileExists(config.abc2xmlScript),
    ]);
    const missing: string[] = [];
    if (!checks[0]) {
        missing.push(`xml2abc script not found: ${config.xml2abcScript}`);
    }
    if (!checks[1]) {
        missing.push(`abc2xml script not found: ${config.abc2xmlScript}`);
    }
    return { ok: missing.length === 0, missing, config };
}

async function fileExists(pathname: string) {
    try {
        await access(pathname, fsConstants.R_OK);
        return true;
    } catch {
        return false;
    }
}

async function runCommand(args: {
    command: string;
    argv: string[];
    cwd?: string;
    timeoutMs: number;
}): Promise<RunCommandResult> {
    const { command, argv, cwd, timeoutMs } = args;
    return await new Promise<RunCommandResult>((resolve, reject) => {
        const child = spawn(command, argv, {
            cwd,
            stdio: ['ignore', 'pipe', 'pipe'],
        });

        let stdout = '';
        let stderr = '';
        let finished = false;
        let timedOut = false;

        const timer = setTimeout(() => {
            timedOut = true;
            child.kill('SIGKILL');
        }, timeoutMs);

        child.stdout.setEncoding('utf8');
        child.stderr.setEncoding('utf8');

        child.stdout.on('data', (chunk: string) => {
            stdout += chunk;
        });
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
                reject(new Error(`Converter command timed out after ${timeoutMs}ms.`));
                return;
            }
            resolve({ stdout, stderr, exitCode, signal });
        });
    });
}

const trimUtf8Bom = (text: string) => text.replace(/^\uFEFF/, '');

function normalizeCommonText(text: string) {
    return trimUtf8Bom(text)
        .replace(/\r\n/g, '\n')
        .replace(/\r/g, '\n')
        .replace(/[ \t]+\n/g, '\n');
}

function hasAbcHeader(text: string, header: string) {
    const pattern = new RegExp(`(^|\\n)${header}:`, 'm');
    return pattern.test(text);
}

function normalizeAbcTextWithReport(text: string): { content: string; report: NormalizationReport } {
    const actions: NormalizationAction[] = [];
    const inputBytes = Buffer.byteLength(text, 'utf8');
    let normalized = normalizeCommonText(text);

    const trimmed = normalized.trim();
    if (normalized !== text) {
        actions.push({
            id: 'line-endings-and-whitespace',
            applied: true,
            message: 'Normalized line endings and trimmed trailing line whitespace.',
        });
    } else {
        actions.push({
            id: 'line-endings-and-whitespace',
            applied: false,
            message: 'No line-ending or trailing whitespace normalization was needed.',
        });
    }

    normalized = trimmed;
    let prefixedHeaders = '';
    if (normalized && !hasAbcHeader(normalized, 'X')) {
        prefixedHeaders += 'X:1\n';
        actions.push({
            id: 'ensure-abc-x-header',
            applied: true,
            message: 'Prepended missing X: header (`X:1`) for downstream tool compatibility.',
        });
    } else {
        actions.push({
            id: 'ensure-abc-x-header',
            applied: false,
            message: 'ABC already includes an X: header.',
        });
    }
    if (normalized && !hasAbcHeader(normalized, 'T')) {
        prefixedHeaders += 'T:Converted Score\n';
        actions.push({
            id: 'ensure-abc-t-header',
            applied: true,
            message: 'Prepended missing T: header (`T:Converted Score`) for clearer artifact metadata.',
        });
    } else {
        actions.push({
            id: 'ensure-abc-t-header',
            applied: false,
            message: 'ABC already includes a T: header.',
        });
    }
    normalized = normalized ? `${prefixedHeaders}${normalized}` : '';
    normalized = normalized ? `${normalized}\n` : '';

    const outputBytes = Buffer.byteLength(normalized, 'utf8');
    return {
        content: normalized,
        report: {
            schemaVersion: 'music-normalization@1',
            format: 'abc',
            changed: normalized !== text,
            inputBytes,
            outputBytes,
            actions,
        },
    };
}

function normalizeMusicXmlTextWithReport(text: string): { content: string; report: NormalizationReport } {
    const actions: NormalizationAction[] = [];
    const inputBytes = Buffer.byteLength(text, 'utf8');
    const normalizedBase = normalizeCommonText(text);
    const normalized = normalizedBase.trim() ? `${normalizedBase.trim()}\n` : '';

    actions.push({
        id: 'line-endings-and-whitespace',
        applied: normalized !== text,
        message: normalized !== text
            ? 'Normalized XML line endings/whitespace and ensured trailing newline.'
            : 'No XML normalization changes were needed.',
    });

    return {
        content: normalized,
        report: {
            schemaVersion: 'music-normalization@1',
            format: 'musicxml',
            changed: normalized !== text,
            inputBytes,
            outputBytes: Buffer.byteLength(normalized, 'utf8'),
            actions,
        },
    };
}

function decodeMidiBase64(value: string): Buffer | null {
    const compact = value.replace(/\s+/g, '');
    if (!compact) {
        return null;
    }
    try {
        const bytes = Buffer.from(compact, 'base64');
        if (bytes.length === 0) {
            return null;
        }
        const reencoded = bytes.toString('base64').replace(/=+$/, '');
        const normalizedInput = compact.replace(/=+$/, '');
        if (reencoded !== normalizedInput) {
            return null;
        }
        return bytes;
    } catch {
        return null;
    }
}

function normalizeMidiTextWithReport(text: string): { content: string; report: NormalizationReport } {
    const actions: NormalizationAction[] = [];
    const inputBytes = Buffer.byteLength(text, 'utf8');
    const compact = text.replace(/\s+/g, '');

    actions.push({
        id: 'strip-base64-whitespace',
        applied: compact !== text,
        message: compact !== text
            ? 'Removed whitespace from base64 MIDI payload.'
            : 'No base64 whitespace normalization was needed.',
    });

    const outputBytes = Buffer.byteLength(compact, 'utf8');
    return {
        content: compact,
        report: {
            schemaVersion: 'music-normalization@1',
            format: 'midi',
            changed: compact !== text,
            inputBytes,
            outputBytes,
            actions,
        },
    };
}

function normalizeTextForFormat(format: MusicFormat, text: string) {
    if (format === 'abc') {
        return normalizeAbcTextWithReport(text);
    }
    if (format === 'midi') {
        return normalizeMidiTextWithReport(text);
    }
    return normalizeMusicXmlTextWithReport(text);
}

type InvariantSnapshot = {
    estimatedMeasures?: number;
    meter?: string;
    key?: string;
    partCount?: number;
    noteCount?: number;
    trackCount?: number;
};

function countMusicXmlNotes(text: string): number | undefined {
    const noteBlocks = text.match(/<note\b[\s\S]*?<\/note>/g) || [];
    if (!noteBlocks.length) {
        return undefined;
    }
    const pitched = noteBlocks.filter((block) => !/<rest\b/.test(block));
    return pitched.length || undefined;
}

function countAbcNotes(text: string): number | undefined {
    const body = text
        .split('\n')
        .filter((line) => {
            const trimmed = line.trim();
            if (!trimmed) {
                return true;
            }
            if (trimmed.startsWith('%')) {
                return false;
            }
            return !/^[A-Za-z]:/.test(trimmed);
        })
        .join('\n')
        // Strip quoted annotations / lyrics in body lines.
        .replace(/"[^"\n]*"/g, ' ')
        // Strip inline field blocks like [K:C], [M:3/4], etc.
        .replace(/\[[A-Za-z]:[^\]]*]/g, ' ');

    const matches = body.match(/(?:\^{1,2}|_{1,2}|=)?[A-Ga-g][,']*(?=\d|\/|\s|[|()[\]{}<>.-]|$)/g) || [];
    return matches.length || undefined;
}

function readVarLen(bytes: Buffer, offset: number): { value: number; nextOffset: number } {
    let value = 0;
    let cursor = offset;
    for (let i = 0; i < 4; i += 1) {
        if (cursor >= bytes.length) {
            return { value, nextOffset: bytes.length };
        }
        const byte = bytes[cursor]!;
        cursor += 1;
        value = (value << 7) | (byte & 0x7f);
        if ((byte & 0x80) === 0) {
            return { value, nextOffset: cursor };
        }
    }
    return { value, nextOffset: cursor };
}

function extractMidiInvariantSnapshot(base64Content: string): InvariantSnapshot {
    const bytes = decodeMidiBase64(base64Content);
    if (!bytes || bytes.length < 14) {
        return {};
    }
    if (bytes.subarray(0, 4).toString('ascii') !== 'MThd') {
        return {};
    }

    const headerLength = bytes.readUInt32BE(4);
    if (headerLength < 6 || bytes.length < 8 + headerLength) {
        return {};
    }
    const trackCount = bytes.readUInt16BE(10);
    const division = bytes.readUInt16BE(12);

    let offset = 8 + headerLength;
    let noteCount = 0;
    let maxTick = 0;
    let meter: string | undefined;
    let key: string | undefined;

    for (let t = 0; t < trackCount && offset + 8 <= bytes.length; t += 1) {
        if (bytes.subarray(offset, offset + 4).toString('ascii') !== 'MTrk') {
            break;
        }
        const trackLength = bytes.readUInt32BE(offset + 4);
        let cursor = offset + 8;
        const trackEnd = Math.min(bytes.length, cursor + trackLength);
        let runningStatus = 0;
        let absoluteTick = 0;

        while (cursor < trackEnd) {
            const delta = readVarLen(bytes, cursor);
            absoluteTick += delta.value;
            cursor = delta.nextOffset;
            if (cursor >= trackEnd) {
                break;
            }

            let status = bytes[cursor]!;
            if (status < 0x80) {
                if (!runningStatus) {
                    break;
                }
                status = runningStatus;
            } else {
                cursor += 1;
                runningStatus = status;
            }

            if (status === 0xff) {
                if (cursor >= trackEnd) {
                    break;
                }
                const metaType = bytes[cursor]!;
                cursor += 1;
                const len = readVarLen(bytes, cursor);
                cursor = len.nextOffset;
                const dataEnd = Math.min(trackEnd, cursor + len.value);
                const data = bytes.subarray(cursor, dataEnd);
                cursor = dataEnd;

                if (metaType === 0x58 && data.length >= 2) {
                    const numerator = data[0]!;
                    const denominator = 2 ** data[1]!;
                    meter = `${numerator}/${denominator}`;
                } else if (metaType === 0x59 && data.length >= 1) {
                    const sfRaw = data[0]!;
                    const fifths = sfRaw > 127 ? sfRaw - 256 : sfRaw;
                    key = `fifths:${fifths}`;
                }
                continue;
            }

            if (status === 0xf0 || status === 0xf7) {
                const len = readVarLen(bytes, cursor);
                cursor = Math.min(trackEnd, len.nextOffset + len.value);
                continue;
            }

            const eventType = status & 0xf0;
            const dataLength = (eventType === 0xc0 || eventType === 0xd0) ? 1 : 2;
            const dataStart = cursor;
            cursor = Math.min(trackEnd, cursor + dataLength);

            if (eventType === 0x90 && (dataStart + 1) < trackEnd) {
                const velocity = bytes[dataStart + 1]!;
                if (velocity > 0) {
                    noteCount += 1;
                }
            }
        }

        maxTick = Math.max(maxTick, absoluteTick);
        offset = trackEnd;
    }

    let estimatedMeasures: number | undefined;
    if (division > 0 && meter && maxTick > 0) {
        const [beatsRaw, beatTypeRaw] = meter.split('/');
        const beats = Number(beatsRaw);
        const beatType = Number(beatTypeRaw);
        if (Number.isFinite(beats) && Number.isFinite(beatType) && beats > 0 && beatType > 0) {
            const ticksPerMeasure = beats * ((4 / beatType) * division);
            if (ticksPerMeasure > 0) {
                estimatedMeasures = Math.max(1, Math.round(maxTick / ticksPerMeasure));
            }
        }
    }

    return {
        estimatedMeasures,
        meter,
        key,
        noteCount: noteCount || undefined,
        trackCount: trackCount || undefined,
    };
}

function extractInvariantSnapshot(format: MusicFormat, content: string): InvariantSnapshot {
    const text = content.trim();
    if (!text) {
        return {};
    }

    if (format === 'abc') {
        const bodyLines = text.split('\n').filter((line) => !/^[A-Za-z]:/.test(line.trim()));
        const barMatches = bodyLines.join('\n').match(/\|/g) || [];
        const meter = text.match(/(^|\n)M:\s*([^\n]+)/m)?.[2]?.trim();
        const key = text.match(/(^|\n)K:\s*([^\n]+)/m)?.[2]?.trim();
        return {
            estimatedMeasures: barMatches.length > 0 ? Math.max(1, Math.floor(barMatches.length / 2)) : undefined,
            meter,
            key,
            noteCount: countAbcNotes(text),
        };
    }

    if (format === 'midi') {
        return extractMidiInvariantSnapshot(text);
    }

    const measureCount = (text.match(/<measure\b/g) || []).length || undefined;
    const partCount = (text.match(/<score-part\b/g) || []).length || undefined;
    const beats = text.match(/<beats>\s*([^<]+)\s*<\/beats>/)?.[1]?.trim();
    const beatType = text.match(/<beat-type>\s*([^<]+)\s*<\/beat-type>/)?.[1]?.trim();
    const meter = beats && beatType ? `${beats}/${beatType}` : undefined;
    const fifths = text.match(/<fifths>\s*([-+]?\d+)\s*<\/fifths>/)?.[1]?.trim();
    return {
        estimatedMeasures: measureCount,
        meter,
        key: fifths !== undefined ? `fifths:${fifths}` : undefined,
        partCount,
        noteCount: countMusicXmlNotes(text),
    };
}

function buildInvariantChecks(args: {
    format: MusicFormat;
    content: string;
    prefix?: string;
}): ValidationCheck[] {
    const { format, content, prefix = '' } = args;
    const snapshot = extractInvariantSnapshot(format, content);
    const checks: ValidationCheck[] = [];
    const idPrefix = prefix ? `${prefix}-` : '';

    checks.push({
        id: `${idPrefix}invariant-estimated-measures`,
        ok: typeof snapshot.estimatedMeasures !== 'number' || snapshot.estimatedMeasures > 0,
        severity: 'warning',
        message: typeof snapshot.estimatedMeasures === 'number'
            ? `Estimated measure count: ${snapshot.estimatedMeasures}.`
            : 'Estimated measure count unavailable for this artifact.',
    });

    checks.push({
        id: `${idPrefix}invariant-meter-present`,
        ok: Boolean(snapshot.meter),
        severity: 'warning',
        message: snapshot.meter
            ? `Detected meter: ${snapshot.meter}.`
            : 'Could not detect a meter signature.',
    });

    checks.push({
        id: `${idPrefix}invariant-key-present`,
        ok: Boolean(snapshot.key),
        severity: 'warning',
        message: snapshot.key
            ? `Detected key: ${snapshot.key}.`
            : 'Could not detect a key signature.',
    });

    checks.push({
        id: `${idPrefix}invariant-note-count`,
        ok: typeof snapshot.noteCount !== 'number' || snapshot.noteCount > 0,
        severity: 'warning',
        message: typeof snapshot.noteCount === 'number'
            ? `Detected note count: ${snapshot.noteCount}.`
            : 'Could not detect note count.',
    });

    if (format === 'musicxml') {
        checks.push({
            id: `${idPrefix}invariant-part-count`,
            ok: typeof snapshot.partCount !== 'number' || snapshot.partCount > 0,
            severity: 'warning',
            message: typeof snapshot.partCount === 'number'
                ? `Detected MusicXML part count: ${snapshot.partCount}.`
                : 'Could not detect MusicXML part count.',
        });
    }
    if (format === 'midi') {
        checks.push({
            id: `${idPrefix}invariant-track-count`,
            ok: typeof snapshot.trackCount !== 'number' || snapshot.trackCount > 0,
            severity: 'warning',
            message: typeof snapshot.trackCount === 'number'
                ? `Detected MIDI track count: ${snapshot.trackCount}.`
                : 'Could not detect MIDI track count.',
        });
    }

    return checks;
}

function buildRoundtripInvariantChecks(args: {
    format: MusicFormat;
    original: string;
    roundtripped: string;
}): ValidationCheck[] {
    const original = extractInvariantSnapshot(args.format, args.original);
    const roundtripped = extractInvariantSnapshot(args.format, args.roundtripped);
    const checks: ValidationCheck[] = [];

    const compare = <T extends string | number>(id: string, label: string, expected: T | undefined, actual: T | undefined) => {
        if (expected === undefined || actual === undefined) {
            checks.push({
                id,
                ok: false,
                severity: 'warning',
                message: `${label} roundtrip comparison skipped (missing ${expected === undefined ? 'original' : 'roundtrip'} value).`,
            });
            return;
        }
        checks.push({
            id,
            ok: expected === actual,
            severity: 'warning',
            message: expected === actual
                ? `${label} preserved across roundtrip (${expected}).`
                : `${label} changed across roundtrip (expected ${expected}, got ${actual}).`,
        });
    };

    const compareNoteCount = (expected: number | undefined, actual: number | undefined) => {
        if (expected === undefined || actual === undefined) {
            checks.push({
                id: 'roundtrip-invariant-note-count',
                ok: false,
                severity: 'warning',
                message: `Note count roundtrip comparison skipped (missing ${expected === undefined ? 'original' : 'roundtrip'} value).`,
            });
            return;
        }

        const diff = Math.abs(expected - actual);
        const warnThreshold = Math.max(6, Math.ceil(expected * 0.05));
        const strongThreshold = Math.max(20, Math.ceil(expected * 0.15));
        const ok = diff < warnThreshold;
        checks.push({
            id: 'roundtrip-invariant-note-count',
            ok,
            severity: 'warning',
            message: ok
                ? `Note count preserved within tolerance (${expected} vs ${actual}, diff ${diff}).`
                : `Note count drift (${expected} vs ${actual}, diff ${diff}) exceeds warning threshold ${warnThreshold}.`,
        });
        if (diff >= strongThreshold) {
            checks.push({
                id: 'roundtrip-invariant-note-count-strong-drift',
                ok: false,
                severity: 'warning',
                message: `Significant note-count drift detected (diff ${diff} >= ${strongThreshold}).`,
            });
        }
    };

    compare('roundtrip-invariant-meter', 'Meter', original.meter, roundtripped.meter);
    compare('roundtrip-invariant-key', 'Key', original.key, roundtripped.key);
    compareNoteCount(original.noteCount, roundtripped.noteCount);
    compare(
        'roundtrip-invariant-estimated-measures',
        'Estimated measure count',
        original.estimatedMeasures,
        roundtripped.estimatedMeasures,
    );
    if (args.format === 'musicxml') {
        compare('roundtrip-invariant-part-count', 'Part count', original.partCount, roundtripped.partCount);
    }
    return checks;
}

function buildValidationSummary(checks: ValidationCheck[]): ValidationSummary {
    return checks.reduce<ValidationSummary>((acc, check) => {
        acc[check.severity] += 1;
        return acc;
    }, { info: 0, warning: 0, error: 0 });
}

function buildValidationStageStatus(checks: ValidationCheck[]): ValidationStageStatus {
    const warnings = checks.filter((check) => check.severity === 'warning' && !check.ok).length;
    const errors = checks.filter((check) => check.severity === 'error' && !check.ok).length;
    return {
        ok: errors === 0,
        checks: checks.map((check) => check.id),
        warnings,
        errors,
    };
}

function buildValidationStages(checks: ValidationCheck[]): ValidationReport['stages'] {
    const byPrefix = (prefixes: string[]) => checks.filter((check) => prefixes.some((prefix) => check.id.startsWith(prefix)));
    const byExact = (ids: string[]) => checks.filter((check) => ids.includes(check.id));
    return {
        outputShape: buildValidationStageStatus([
            ...byExact(['non-empty-output', 'midi-header']),
            ...byPrefix(['abc-header-', 'musicxml-root', 'xml-declaration']),
        ]),
        roundtrip: buildValidationStageStatus(byPrefix(['roundtrip-'])),
        render: buildValidationStageStatus(byPrefix(['render-smoke-musescore'])),
        playback: buildValidationStageStatus(byPrefix(['render-smoke-abc2midi', 'render-smoke-midi-'])),
        invariants: buildValidationStageStatus(byPrefix(['invariant-', 'roundtrip-invariant-'])),
    };
}

function buildValidationReport(checks: ValidationCheck[]): ValidationReport {
    return {
        schemaVersion: 'music-validation@1',
        ok: checks.every((check) => check.ok || check.severity !== 'error'),
        checks,
        summary: buildValidationSummary(checks),
        stages: buildValidationStages(checks),
    };
}

const basicValidationChecks = (format: MusicFormat, content: string): ValidationCheck[] => {
    const checks: ValidationCheck[] = [];
    const trimmed = content.trim();
    checks.push({
        id: 'non-empty-output',
        ok: trimmed.length > 0,
        severity: 'error',
        message: trimmed.length > 0 ? 'Converter produced non-empty output.' : 'Converter output was empty.',
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
    } else {
        const midiBytes = decodeMidiBase64(trimmed);
        const hasHeader = Boolean(midiBytes && midiBytes.length >= 4 && midiBytes.subarray(0, 4).toString('ascii') === 'MThd');
        checks.push({
            id: 'midi-header',
            ok: hasHeader,
            severity: 'error',
            message: hasHeader
                ? 'MIDI header detected.'
                : 'MIDI header (MThd) not detected; payload is not valid base64 MIDI.',
        });
    }

    return checks;
};

async function buildValidationChecks(args: {
    inputFormat: MusicFormat;
    inputContent?: string;
    outputFormat: MusicFormat;
    outputContent: string;
    validate: boolean;
    deepValidate: boolean;
    timeoutMs: number;
    filename?: string;
    config?: ConversionToolConfig;
    traceContext?: TraceContext;
}) {
    const {
        inputFormat,
        inputContent,
        outputFormat,
        outputContent,
        validate,
        deepValidate,
        timeoutMs,
        filename,
        config,
        traceContext,
    } = args;
    if (!validate) {
        return [];
    }

    const checks = basicValidationChecks(outputFormat, outputContent);
    checks.push(...buildInvariantChecks({
        format: outputFormat,
        content: outputContent,
    }));
    if (!deepValidate || !outputContent.trim()) {
        return checks;
    }
    if (!config) {
        checks.push({
            id: 'roundtrip-skipped-no-config',
            ok: false,
            severity: 'warning',
            message: 'Roundtrip validation skipped because converter config was unavailable.',
        });
        return checks;
    }

    const oppositeFormat: MusicFormat = outputFormat === 'abc'
        ? 'musicxml'
        : outputFormat === 'midi'
            ? 'musicxml'
            : inputFormat === 'midi'
                ? 'midi'
                : 'abc';
    const roundtripStepTimeoutMs = Math.max(5_000, Math.floor(timeoutMs / 2));

    try {
        const firstStep = await convertBetweenFormats({
            config,
            inputFormat: outputFormat,
            outputFormat: oppositeFormat,
            content: outputContent,
            timeoutMs: roundtripStepTimeoutMs,
            filename: filename ? `${stripExtension(filename)}.${outputFormat}` : `roundtrip.${outputFormat}`,
            traceContext,
        });

        checks.push({
            id: 'roundtrip-step-1-convert',
            ok: Boolean(firstStep.output.trim()),
            severity: 'warning',
            message: firstStep.output.trim()
                ? `Roundtrip step 1 succeeded (${outputFormat} -> ${oppositeFormat}).`
                : `Roundtrip step 1 produced empty output (${outputFormat} -> ${oppositeFormat}).`,
        });

        const firstStepBasicChecks = basicValidationChecks(oppositeFormat, firstStep.output).map((check) => ({
            ...check,
            id: `roundtrip-step-1-${check.id}`,
        }));
        checks.push(...firstStepBasicChecks);

        const secondStep = await convertBetweenFormats({
            config,
            inputFormat: oppositeFormat,
            outputFormat,
            content: firstStep.output,
            timeoutMs: roundtripStepTimeoutMs,
            filename: filename ? `${stripExtension(filename)}.${oppositeFormat}` : `roundtrip-return.${oppositeFormat}`,
            traceContext,
        });

        checks.push({
            id: 'roundtrip-step-2-convert',
            ok: Boolean(secondStep.output.trim()),
            severity: 'warning',
            message: secondStep.output.trim()
                ? `Roundtrip step 2 succeeded (${oppositeFormat} -> ${outputFormat}).`
                : `Roundtrip step 2 produced empty output (${oppositeFormat} -> ${outputFormat}).`,
        });

        const secondStepBasicChecks = basicValidationChecks(outputFormat, secondStep.output).map((check) => ({
            ...check,
            id: `roundtrip-step-2-${check.id}`,
        }));
        checks.push(...secondStepBasicChecks);

        const scopeRoundtripInvariantChecks = (scope: string, roundtripChecks: ValidationCheck[]) => roundtripChecks.map((check) => ({
            ...check,
            id: check.id.replace(/^roundtrip-invariant-/, `roundtrip-invariant-${scope}-`),
        }));

        if (typeof inputContent === 'string' && inputContent.trim() && inputFormat === oppositeFormat) {
            checks.push(...scopeRoundtripInvariantChecks('input-return', buildRoundtripInvariantChecks({
                format: inputFormat,
                original: inputContent,
                roundtripped: firstStep.output,
            })));
        }
        checks.push(...scopeRoundtripInvariantChecks('output-cycle', buildRoundtripInvariantChecks({
            format: outputFormat,
            original: outputContent,
            roundtripped: secondStep.output,
        })));
    } catch (error) {
        checks.push({
            id: 'roundtrip-smoke-test',
            ok: false,
            severity: 'warning',
            message: `Roundtrip validation failed: ${error instanceof Error ? error.message : 'unknown error'}`,
        });
    }

    const renderChecks = await runRenderSmokeChecks({
        outputFormat,
        outputContent,
        timeoutMs: Math.min(timeoutMs, config.renderSmokeTimeoutMs),
        config,
        traceContext,
    });
    checks.push(...renderChecks);

    return checks;
}

function isCommandNotFoundError(error: unknown) {
    return error instanceof Error && (
        (error as NodeJS.ErrnoException).code === 'ENOENT' ||
        /ENOENT|not found/i.test(error.message)
    );
}

async function runCommandWithCandidates(args: {
    candidates: string[];
    argv: string[];
    cwd?: string;
    timeoutMs: number;
    wrapperCommand?: string;
    wrapperArgvPrefix?: string[];
}) {
    const failures: string[] = [];
    for (const candidate of args.candidates) {
        try {
            const wrapperPrefix = args.wrapperArgvPrefix || [];
            const command = args.wrapperCommand || candidate;
            const argv = args.wrapperCommand
                ? [...wrapperPrefix, candidate, ...args.argv]
                : args.argv;
            const result = await runCommand({
                command,
                argv,
                cwd: args.cwd,
                timeoutMs: args.timeoutMs,
            });
            if (
                args.wrapperCommand &&
                (result.exitCode ?? 0) === 127 &&
                /not found/i.test(`${result.stderr}\n${result.stdout}`)
            ) {
                failures.push(`${candidate}: not found (via ${args.wrapperCommand})`);
                continue;
            }
            return {
                command: args.wrapperCommand
                    ? `${args.wrapperCommand} ${[...wrapperPrefix, candidate].join(' ')}`
                    : candidate,
                result,
            };
        } catch (error) {
            if (isCommandNotFoundError(error)) {
                failures.push(`${candidate}: not found`);
                continue;
            }
            throw error;
        }
    }
    throw new Error(failures.join(' | ') || 'No command candidates available.');
}

async function runRenderSmokeChecks(args: {
    outputFormat: MusicFormat;
    outputContent: string;
    timeoutMs: number;
    config: ConversionToolConfig;
    traceContext?: TraceContext;
}): Promise<ValidationCheck[]> {
    const { outputFormat, outputContent, timeoutMs, config, traceContext } = args;
    const checks: ValidationCheck[] = [];
    if (!outputContent.trim()) {
        return checks;
    }

    if (outputFormat === 'abc') {
        const tempDir = await mkdtemp(join(tmpdir(), 'ots-music-render-smoke-'));
        try {
            const abcPath = join(tempDir, 'smoke.abc');
            const midiPath = join(tempDir, 'smoke.mid');
            await writeFile(abcPath, normalizeTextForFormat('abc', outputContent).content, 'utf8');
            try {
                const { command, result } = await runCommandWithCandidates({
                    candidates: config.abc2midiBins,
                    argv: [abcPath, '-o', midiPath],
                    cwd: tempDir,
                    timeoutMs,
                });
                const hasMidi = await fileExists(midiPath);
                checks.push({
                    id: 'render-smoke-abc2midi',
                    ok: (result.exitCode ?? 1) === 0 && hasMidi,
                    severity: 'warning',
                    message: hasMidi
                        ? `abc2midi render smoke succeeded via ${command}.`
                        : `abc2midi exited via ${command}, but no MIDI output file was produced.`,
                });
            } catch (error) {
                checks.push({
                    id: 'render-smoke-abc2midi',
                    ok: false,
                    severity: 'warning',
                    message: `abc2midi render smoke unavailable/failed: ${error instanceof Error ? error.message : 'unknown error'}`,
                });
            }
        } finally {
            await rm(tempDir, { recursive: true, force: true });
        }
        return checks;
    }

    if (outputFormat === 'midi') {
        const tempDir = await mkdtemp(join(tmpdir(), 'ots-music-render-smoke-'));
        try {
            const midiPath = join(tempDir, 'smoke.mid');
            const xmlPath = join(tempDir, 'smoke.musicxml');
            const midiBytes = decodeMidiBase64(outputContent);
            if (!midiBytes) {
                checks.push({
                    id: 'render-smoke-midi-decode',
                    ok: false,
                    severity: 'warning',
                    message: 'MIDI render smoke skipped: output could not be decoded from base64.',
                });
                return checks;
            }
            await writeFile(midiPath, midiBytes);
            try {
                await runMuseScoreConvert({
                    config,
                    inputPath: midiPath,
                    outputPath: xmlPath,
                    timeoutMs,
                    traceContext,
                    stage: 'render-smoke-midi-import',
                    inputFormat: 'midi',
                    outputFormat: 'musicxml',
                });
                const hasXml = await fileExists(xmlPath);
                checks.push({
                    id: 'render-smoke-midi-musescore-import',
                    ok: hasXml,
                    severity: 'warning',
                    message: hasXml
                        ? 'MIDI import smoke succeeded via MuseScore.'
                        : 'MIDI import smoke completed but no MusicXML output was produced.',
                });
            } catch (error) {
                checks.push({
                    id: 'render-smoke-midi-musescore-import',
                    ok: false,
                    severity: 'warning',
                    message: `MIDI import smoke unavailable/failed: ${error instanceof Error ? error.message : 'unknown error'}`,
                });
            }
        } finally {
            await rm(tempDir, { recursive: true, force: true });
        }
        return checks;
    }

    const tempDir = await mkdtemp(join(tmpdir(), 'ots-music-render-smoke-'));
    try {
        const xmlPath = join(tempDir, 'smoke.musicxml');
        const pdfPath = join(tempDir, 'smoke.pdf');
        await writeFile(xmlPath, normalizeTextForFormat('musicxml', outputContent).content, 'utf8');
        try {
            const { command, result } = await runMuseScoreConvert({
                config,
                inputPath: xmlPath,
                outputPath: pdfPath,
                timeoutMs,
                traceContext,
                stage: 'render-smoke-musicxml-pdf',
                inputFormat: 'musicxml',
            });
            const hasPdf = await fileExists(pdfPath);
            checks.push({
                id: 'render-smoke-musescore-pdf',
                ok: (result.exitCode ?? 1) === 0 && hasPdf,
                severity: 'warning',
                message: hasPdf
                    ? `MuseScore PDF render smoke succeeded via ${command}.`
                    : `MuseScore exited via ${command}, but no PDF output file was produced.`,
            });
        } catch (error) {
            checks.push({
                id: 'render-smoke-musescore-pdf',
                ok: false,
                severity: 'warning',
                message: `MuseScore render smoke unavailable/failed: ${error instanceof Error ? error.message : 'unknown error'}`,
            });
        }
    } finally {
        await rm(tempDir, { recursive: true, force: true });
    }
    return checks;
}

function shouldUseXvfbWrapper() {
    const configured = parseBooleanEnv('MUSIC_MUSESCORE_USE_XVFB');
    if (configured !== undefined) {
        return configured;
    }
    return !process.env.DISPLAY;
}

async function resolveXvfbRunPath() {
    if (!shouldUseXvfbWrapper()) {
        return null;
    }
    if (await fileExists('/usr/bin/xvfb-run')) {
        return '/usr/bin/xvfb-run';
    }
    if (await fileExists('/bin/xvfb-run')) {
        return '/bin/xvfb-run';
    }
    return null;
}

async function runMuseScoreConvert(args: {
    config: ConversionToolConfig;
    inputPath: string;
    outputPath: string;
    timeoutMs: number;
    traceContext?: TraceContext;
    stage?: string;
    inputFormat?: MusicFormat;
    outputFormat?: MusicFormat;
}) {
    const {
        config,
        inputPath,
        outputPath,
        timeoutMs,
        traceContext,
        stage = 'convert',
        inputFormat,
        outputFormat,
    } = args;
    const startedAt = Date.now();
    const xvfbRunPath = await resolveXvfbRunPath();
    logMusicConvertEvent({
        event: 'music.convert.musescore.exec.start',
        traceContext,
        extra: {
            stage,
            inputFormat: inputFormat || null,
            outputFormat: outputFormat || null,
            timeoutMs,
            useXvfb: Boolean(xvfbRunPath),
            candidates: config.musescoreBins,
        },
    });
    let command = '';
    let result: RunCommandResult;
    try {
        const run = await runCommandWithCandidates({
            candidates: config.musescoreBins,
            argv: ['-o', outputPath, inputPath],
            cwd: undefined,
            timeoutMs,
            wrapperCommand: xvfbRunPath || undefined,
            wrapperArgvPrefix: xvfbRunPath ? ['-a'] : undefined,
        });
        command = run.command;
        result = run.result;
    } catch (error) {
        const message = error instanceof Error ? error.message : 'unknown error';
        logMusicConvertEvent({
            level: /timed out/i.test(message) ? 'warn' : 'error',
            event: /timed out/i.test(message) ? 'music.convert.timeout' : 'music.convert.musescore.exec.failed',
            traceContext,
            extra: {
                stage,
                inputFormat: inputFormat || null,
                outputFormat: outputFormat || null,
                timeoutMs,
                durationMs: Date.now() - startedAt,
                error: message,
            },
        });
        throw error;
    }
    logMusicConvertEvent({
        event: 'music.convert.musescore.exec.done',
        traceContext,
        extra: {
            stage,
            inputFormat: inputFormat || null,
            outputFormat: outputFormat || null,
            command,
            exitCode: result.exitCode,
            durationMs: Date.now() - startedAt,
        },
    });
    if ((result.exitCode ?? 1) !== 0) {
        throw new Error(result.stderr.trim() || `MuseScore conversion exited with code ${result.exitCode ?? 'unknown'}.`);
    }
    return { command, result };
}

async function convertXmlToAbc(args: {
    config: ConversionToolConfig;
    content: string;
    timeoutMs: number;
    filename?: string;
}) {
    const { config, content, timeoutMs, filename } = args;
    const tempDir = await mkdtemp(join(tmpdir(), 'ots-music-convert-'));
    try {
        const inputPath = join(tempDir, sanitizeFilename(filename || 'input.musicxml', 'musicxml'));
        await writeFile(inputPath, normalizeTextForFormat('musicxml', content).content, 'utf8');
        const result = await runCommand({
            command: config.pythonCommand,
            argv: [config.xml2abcScript, ...XML2ABC_ARGS, inputPath],
            cwd: tempDir,
            timeoutMs,
        });
        if ((result.exitCode ?? 1) !== 0) {
            throw new Error(result.stderr.trim() || `xml2abc exited with code ${result.exitCode ?? 'unknown'}.`);
        }
        const output = normalizeTextForFormat('abc', result.stdout).content;
        return { output, stderr: result.stderr.trim() };
    } finally {
        await rm(tempDir, { recursive: true, force: true });
    }
}

async function convertXmlToMidi(args: {
    config: ConversionToolConfig;
    content: string;
    timeoutMs: number;
    filename?: string;
    traceContext?: TraceContext;
}) {
    const { config, content, timeoutMs, filename, traceContext } = args;
    const tempDir = await mkdtemp(join(tmpdir(), 'ots-music-convert-'));
    try {
        const inputPath = join(tempDir, sanitizeFilename(filename || 'input.musicxml', 'musicxml'));
        const outputPath = join(tempDir, `${stripExtension(inputPath.split('/').pop() || 'output')}.mid`);
        await writeFile(inputPath, normalizeTextForFormat('musicxml', content).content, 'utf8');
        await runMuseScoreConvert({
            config,
            inputPath,
            outputPath,
            timeoutMs,
            traceContext,
            stage: 'musicxml-to-midi',
            inputFormat: 'musicxml',
            outputFormat: 'midi',
        });
        let actualOutputPath = outputPath;
        if (!(await fileExists(actualOutputPath))) {
            const files = await readdir(tempDir);
            const fallback = files.find((file) => file.toLowerCase().endsWith('.mid') || file.toLowerCase().endsWith('.midi'));
            if (fallback) {
                actualOutputPath = join(tempDir, fallback);
            } else {
                throw new Error('MuseScore did not produce a MIDI output file.');
            }
        }
        const midiBytes = await readFile(actualOutputPath);
        return { output: midiBytes.toString('base64'), stderr: '' };
    } finally {
        await rm(tempDir, { recursive: true, force: true });
    }
}

async function convertAbcToXml(args: {
    config: ConversionToolConfig;
    content: string;
    timeoutMs: number;
    filename?: string;
}) {
    const { config, content, timeoutMs, filename } = args;
    const tempDir = await mkdtemp(join(tmpdir(), 'ots-music-convert-'));
    try {
        const inputPath = join(tempDir, sanitizeFilename(filename || 'input.abc', 'abc'));
        await writeFile(inputPath, normalizeTextForFormat('abc', content).content, 'utf8');
        const result = await runCommand({
            command: config.pythonCommand,
            argv: [config.abc2xmlScript, inputPath],
            cwd: tempDir,
            timeoutMs,
        });
        if ((result.exitCode ?? 1) !== 0) {
            throw new Error(result.stderr.trim() || `abc2xml exited with code ${result.exitCode ?? 'unknown'}.`);
        }

        let output = result.stdout;
        if (!output.trim()) {
            const derivedXmlPath = join(tempDir, `${stripExtension(inputPath.split('/').pop() || 'input')}.xml`);
            if (await fileExists(derivedXmlPath)) {
                output = await readFile(derivedXmlPath, 'utf8');
            }
        }
        return { output: normalizeTextForFormat('musicxml', output).content, stderr: result.stderr.trim() };
    } finally {
        await rm(tempDir, { recursive: true, force: true });
    }
}

async function convertMidiToXml(args: {
    config: ConversionToolConfig;
    content: string;
    timeoutMs: number;
    filename?: string;
    traceContext?: TraceContext;
}) {
    const { config, content, timeoutMs, filename, traceContext } = args;
    const tempDir = await mkdtemp(join(tmpdir(), 'ots-music-convert-'));
    try {
        const midiBytes = decodeMidiBase64(content);
        if (!midiBytes) {
            throw new Error('MIDI input could not be decoded from base64.');
        }

        const inputPath = join(tempDir, sanitizeFilename(filename || 'input.mid', 'midi'));
        const outputPath = join(tempDir, `${stripExtension(inputPath.split('/').pop() || 'output')}.musicxml`);
        await writeFile(inputPath, midiBytes);
        await runMuseScoreConvert({
            config,
            inputPath,
            outputPath,
            timeoutMs,
            traceContext,
            stage: 'midi-to-musicxml',
            inputFormat: 'midi',
            outputFormat: 'musicxml',
        });
        let actualOutputPath = outputPath;
        if (!(await fileExists(actualOutputPath))) {
            const files = await readdir(tempDir);
            const fallback = files.find((file) => file.toLowerCase().endsWith('.musicxml') || file.toLowerCase().endsWith('.xml'));
            if (fallback) {
                actualOutputPath = join(tempDir, fallback);
            } else {
                throw new Error('MuseScore did not produce a MusicXML output file.');
            }
        }
        const xml = await readFile(actualOutputPath, 'utf8');
        return { output: normalizeTextForFormat('musicxml', xml).content, stderr: '' };
    } finally {
        await rm(tempDir, { recursive: true, force: true });
    }
}

async function convertBetweenFormats(args: {
    config: ConversionToolConfig;
    inputFormat: MusicFormat;
    outputFormat: MusicFormat;
    content: string;
    timeoutMs: number;
    filename?: string;
    traceContext?: TraceContext;
}): Promise<{ output: string; stderr: string }> {
    const { config, inputFormat, outputFormat, content, timeoutMs, filename, traceContext } = args;

    if (inputFormat === 'musicxml' && outputFormat === 'abc') {
        return convertXmlToAbc({ config, content, timeoutMs, filename });
    }
    if (inputFormat === 'abc' && outputFormat === 'musicxml') {
        return convertAbcToXml({ config, content, timeoutMs, filename });
    }
    if (inputFormat === 'musicxml' && outputFormat === 'midi') {
        return convertXmlToMidi({ config, content, timeoutMs, filename, traceContext });
    }
    if (inputFormat === 'midi' && outputFormat === 'musicxml') {
        return convertMidiToXml({ config, content, timeoutMs, filename, traceContext });
    }
    throw new Error(`Unsupported conversion: ${inputFormat} -> ${outputFormat}`);
}

function stripExtension(filename: string) {
    const lastDot = filename.lastIndexOf('.');
    return lastDot > 0 ? filename.slice(0, lastDot) : filename;
}

function sanitizeFilename(filename: string, fallbackFormat: MusicFormat) {
    const safe = filename.replace(/[^a-zA-Z0-9._-]+/g, '_').replace(/^_+|_+$/g, '') || 'input';
    if (fallbackFormat === 'abc') {
        return safe.endsWith('.abc') ? safe : `${stripExtension(safe)}.abc`;
    }
    if (fallbackFormat === 'midi') {
        return safe.endsWith('.midi') || safe.endsWith('.mid') ? safe : `${stripExtension(safe)}.mid`;
    }
    if (safe.endsWith('.xml') || safe.endsWith('.musicxml') || safe.endsWith('.mxl')) {
        return safe;
    }
    return `${stripExtension(safe)}.musicxml`;
}

export type MusicRenderRequest = {
    content: string;
    format: 'pdf' | 'png';
    timeoutMs?: number;
    dpi?: number;
};

export async function renderMusicSnapshot(request: MusicRenderRequest): Promise<{ buffer: Buffer; mimeType: string }> {
    const config = getMusicConversionToolConfig();
    const timeoutMs = request.timeoutMs || config.renderSmokeTimeoutMs;
    const format = request.format;
    const mimeType = format === 'pdf' ? 'application/pdf' : 'image/png';

    const tempDir = await mkdtemp(join(tmpdir(), 'ots-music-render-'));
    try {
        const xmlPath = join(tempDir, 'input.musicxml');
        const outputPath = join(tempDir, `output.${format}`);
        await writeFile(xmlPath, normalizeMusicXmlTextWithReport(request.content).content, 'utf8');

        const xvfbRunPath = await resolveXvfbRunPath();

        const argv = ['-platform', 'offscreen', '-o', outputPath];
        if (request.dpi && format === 'png') {
            argv.push('-r', String(request.dpi));
        }
        argv.push(xmlPath);

        const { result, command } = await runCommandWithCandidates({
            candidates: config.musescoreBins,
            argv,
            cwd: tempDir,
            timeoutMs,
            wrapperCommand: xvfbRunPath || undefined,
            wrapperArgvPrefix: xvfbRunPath ? ['-a'] : undefined,
        });

        if ((result.exitCode ?? 1) !== 0) {
            throw new Error(`MuseScore render failed with code ${result.exitCode}: ${result.stderr}`);
        }

        let actualPath = outputPath;
        if (!(await fileExists(actualPath))) {
            // MuseScore sometimes appends page numbers, e.g. output-1.png
            const files = await readdir(tempDir);
            const pattern = new RegExp(`^output([-.]\\d+)?\\.${format}$`, 'i');
            const found = files.find(f => pattern.test(f));
            if (found) {
                actualPath = join(tempDir, found);
            } else {
                throw new Error(`MuseScore (${command}) exited successfully but no output file matching ${outputPath} was found.\nSTDOUT: ${result.stdout}\nSTDERR: ${result.stderr}\nFILES: ${files.join(', ')}`);
            }
        }

        const buffer = await readFile(actualPath);
        return { buffer, mimeType };
    } finally {
        await rm(tempDir, { recursive: true, force: true });
    }
}

export async function convertMusicNotation(request: MusicConversionRequest): Promise<MusicConversionResult> {
    const startedAt = Date.now();
    const { inputFormat, outputFormat, content, traceContext } = request;
    const toolConfig = getMusicConversionToolConfig();
    const inputContent = request.contentEncoding === 'base64' || inputFormat === 'midi'
        ? normalizeTextForFormat('midi', content).content
        : content;
    const outputEncoding: MusicContentEncoding = outputFormat === 'midi' ? 'base64' : 'utf8';
    logMusicConvertEvent({
        event: 'music.convert.engine.start',
        traceContext,
        extra: {
            inputFormat,
            outputFormat,
            inputEncoding: request.contentEncoding || (inputFormat === 'midi' ? 'base64' : 'utf8'),
            validate: request.validate !== false,
            deepValidate: request.deepValidate !== false,
            timeoutMs: request.timeoutMs ?? null,
        },
    });

    if (inputFormat === outputFormat) {
        const normalized = normalizeTextForFormat(outputFormat, inputContent);
        const checks = await buildValidationChecks({
            inputFormat,
            inputContent,
            outputFormat,
            outputContent: normalized.content,
            validate: request.validate !== false,
            deepValidate: request.deepValidate !== false,
            timeoutMs: DEFAULT_TIMEOUT_MS,
            filename: request.filename,
            config: toolConfig,
            traceContext,
        });
        const validation = buildValidationReport(checks);
        const durationMs = Date.now() - startedAt;
        logMusicConvertEvent({
            event: 'music.convert.validation',
            traceContext,
            extra: {
                inputFormat,
                outputFormat,
                warningCount: validation.summary.warning,
                errorCount: validation.summary.error,
                ok: validation.ok,
            },
        });
        logMusicConvertEvent({
            event: 'music.convert.engine.done',
            traceContext,
            extra: {
                inputFormat,
                outputFormat,
                durationMs,
                passthrough: true,
            },
        });
        return {
            inputFormat,
            outputFormat,
            content: normalized.content,
            contentEncoding: outputEncoding,
            normalization: normalized.report,
            validation,
            provenance: {
                engine: 'notagen',
                pythonCommand: toolConfig.pythonCommand,
                scripts: {
                    xml2abc: toolConfig.xml2abcScript,
                    abc2xml: toolConfig.abc2xmlScript,
                },
                durationMs: Date.now() - startedAt,
            },
        };
    }

    let config = toolConfig;
    if (inputFormat === 'abc' || outputFormat === 'abc') {
        const tools = await ensureMusicConversionToolsAvailable();
        if (!tools.ok) {
            logMusicConvertEvent({
                level: 'error',
                event: 'music.convert.tools.unavailable',
                traceContext,
                extra: {
                    missing: tools.missing,
                },
            });
            throw new Error(`Music conversion tools unavailable: ${tools.missing.join(' | ')}`);
        }
        config = tools.config;
    }

    const timeoutMs = Number.isFinite(request.timeoutMs) && (request.timeoutMs || 0) > 0
        ? Number(request.timeoutMs)
        : config.defaultTimeoutMs;

    let converted: { output: string; stderr: string };
    try {
        converted = await convertBetweenFormats({
            config,
            inputFormat,
            outputFormat,
            content: inputContent,
            timeoutMs,
            filename: request.filename,
            traceContext,
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'unknown error';
        logMusicConvertEvent({
            level: /timed out/i.test(message) ? 'warn' : 'error',
            event: /timed out/i.test(message) ? 'music.convert.timeout' : 'music.convert.engine.failed',
            traceContext,
            extra: {
                inputFormat,
                outputFormat,
                timeoutMs,
                durationMs: Date.now() - startedAt,
                error: message,
            },
        });
        throw error;
    }

    const validationChecks = await buildValidationChecks({
        inputFormat,
        inputContent,
        outputFormat,
        outputContent: converted.output,
        validate: request.validate !== false,
        deepValidate: request.deepValidate !== false,
        timeoutMs,
        filename: request.filename,
        config,
        traceContext,
    });
    const validation = buildValidationReport(validationChecks);
    const normalizedOutput = normalizeTextForFormat(outputFormat, converted.output);
    const durationMs = Date.now() - startedAt;
    logMusicConvertEvent({
        event: 'music.convert.validation',
        traceContext,
        extra: {
            inputFormat,
            outputFormat,
            warningCount: validation.summary.warning,
            errorCount: validation.summary.error,
            ok: validation.ok,
        },
    });
    logMusicConvertEvent({
        event: 'music.convert.engine.done',
        traceContext,
        extra: {
            inputFormat,
            outputFormat,
            timeoutMs,
            durationMs,
            stderrPresent: Boolean(converted.stderr),
        },
    });

    return {
        inputFormat,
        outputFormat,
        content: normalizedOutput.content,
        contentEncoding: outputEncoding,
        normalization: normalizedOutput.report,
        validation,
        provenance: {
            engine: 'notagen',
            pythonCommand: config.pythonCommand,
            scripts: {
                xml2abc: config.xml2abcScript,
                abc2xml: config.abc2xmlScript,
            },
            durationMs,
            stderr: converted.stderr || undefined,
        },
    };
}
