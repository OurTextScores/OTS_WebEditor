import { spawn } from 'node:child_process';
import { access, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export type MusicFormat = 'abc' | 'musicxml';

export type MusicConversionRequest = {
    inputFormat: MusicFormat;
    outputFormat: MusicFormat;
    content: string;
    filename?: string;
    validate?: boolean;
    deepValidate?: boolean;
    timeoutMs?: number;
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
        'musescore',
        'musescore3',
        'mscore',
        'MuseScore4',
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

function normalizeTextForFormat(format: MusicFormat, text: string) {
    return format === 'abc' ? normalizeAbcTextWithReport(text) : normalizeMusicXmlTextWithReport(text);
}

type InvariantSnapshot = {
    estimatedMeasures?: number;
    meter?: string;
    key?: string;
    partCount?: number;
};

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
        };
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

    compare('roundtrip-invariant-meter', 'Meter', original.meter, roundtripped.meter);
    compare('roundtrip-invariant-key', 'Key', original.key, roundtripped.key);
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
            ...byExact(['non-empty-output']),
            ...byPrefix(['abc-header-', 'musicxml-root', 'xml-declaration']),
        ]),
        roundtrip: buildValidationStageStatus(byPrefix(['roundtrip-'])),
        render: buildValidationStageStatus(byPrefix(['render-smoke-musescore'])),
        playback: buildValidationStageStatus(byPrefix(['render-smoke-abc2midi'])),
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
    } else {
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

    const oppositeFormat: MusicFormat = outputFormat === 'abc' ? 'musicxml' : 'abc';
    const roundtripStepTimeoutMs = Math.max(5_000, Math.floor(timeoutMs / 2));

    try {
        const firstStep = outputFormat === 'abc'
            ? await convertAbcToXml({
                config,
                content: outputContent,
                timeoutMs: roundtripStepTimeoutMs,
                filename: filename ? `${stripExtension(filename)}.abc` : 'roundtrip.abc',
            })
            : await convertXmlToAbc({
                config,
                content: outputContent,
                timeoutMs: roundtripStepTimeoutMs,
                filename: filename ? `${stripExtension(filename)}.musicxml` : 'roundtrip.musicxml',
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

        const secondStep = oppositeFormat === 'abc'
            ? await convertAbcToXml({
                config,
                content: firstStep.output,
                timeoutMs: roundtripStepTimeoutMs,
                filename: filename ? `${stripExtension(filename)}.abc` : 'roundtrip-return.abc',
            })
            : await convertXmlToAbc({
                config,
                content: firstStep.output,
                timeoutMs: roundtripStepTimeoutMs,
                filename: filename ? `${stripExtension(filename)}.musicxml` : 'roundtrip-return.musicxml',
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
    cwd: string;
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
}): Promise<ValidationCheck[]> {
    const { outputFormat, outputContent, timeoutMs, config } = args;
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

    const tempDir = await mkdtemp(join(tmpdir(), 'ots-music-render-smoke-'));
    try {
        const xmlPath = join(tempDir, 'smoke.musicxml');
        const pdfPath = join(tempDir, 'smoke.pdf');
        await writeFile(xmlPath, normalizeTextForFormat('musicxml', outputContent).content, 'utf8');
        try {
            const xvfbRunPath = !process.env.DISPLAY
                ? (await fileExists('/usr/bin/xvfb-run') ? '/usr/bin/xvfb-run' : (await fileExists('/bin/xvfb-run') ? '/bin/xvfb-run' : null))
                : null;
            const { command, result } = await runCommandWithCandidates({
                candidates: config.musescoreBins,
                argv: ['-o', pdfPath, xmlPath],
                cwd: tempDir,
                timeoutMs,
                wrapperCommand: xvfbRunPath || undefined,
                wrapperArgvPrefix: xvfbRunPath ? ['-a'] : undefined,
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

function stripExtension(filename: string) {
    const lastDot = filename.lastIndexOf('.');
    return lastDot > 0 ? filename.slice(0, lastDot) : filename;
}

function sanitizeFilename(filename: string, fallbackFormat: MusicFormat) {
    const safe = filename.replace(/[^a-zA-Z0-9._-]+/g, '_').replace(/^_+|_+$/g, '') || 'input';
    if (fallbackFormat === 'abc') {
        return safe.endsWith('.abc') ? safe : `${stripExtension(safe)}.abc`;
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

        const xvfbRunPath = !process.env.DISPLAY
            ? (await fileExists('/usr/bin/xvfb-run') ? '/usr/bin/xvfb-run' : (await fileExists('/bin/xvfb-run') ? '/bin/xvfb-run' : null))
            : null;

        const argv = ['-f', '-o', outputPath];
        if (request.dpi && format === 'png') {
            argv.push('-r', String(request.dpi));
        }
        argv.push(xmlPath);

        const { result } = await runCommandWithCandidates({
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

        if (!(await fileExists(outputPath))) {
            throw new Error(`MuseScore exited successfully but ${outputPath} was not found.`);
        }

        const buffer = await readFile(outputPath);
        return { buffer, mimeType };
    } finally {
        await rm(tempDir, { recursive: true, force: true });
    }
}

export async function convertMusicNotation(request: MusicConversionRequest): Promise<MusicConversionResult> {
    const startedAt = Date.now();
    const { inputFormat, outputFormat, content } = request;
    if (inputFormat === outputFormat) {
        const normalized = normalizeTextForFormat(outputFormat, content);
        const checks = await buildValidationChecks({
            inputFormat,
            inputContent: content,
            outputFormat,
            outputContent: normalized.content,
            validate: request.validate !== false,
            deepValidate: request.deepValidate !== false,
            timeoutMs: DEFAULT_TIMEOUT_MS,
            filename: request.filename,
        });
        return {
            inputFormat,
            outputFormat,
            content: normalized.content,
            normalization: normalized.report,
            validation: buildValidationReport(checks),
            provenance: {
                engine: 'notagen',
                pythonCommand: getMusicConversionToolConfig().pythonCommand,
                scripts: {
                    xml2abc: getMusicConversionToolConfig().xml2abcScript,
                    abc2xml: getMusicConversionToolConfig().abc2xmlScript,
                },
                durationMs: Date.now() - startedAt,
            },
        };
    }

    const tools = await ensureMusicConversionToolsAvailable();
    if (!tools.ok) {
        throw new Error(`Music conversion tools unavailable: ${tools.missing.join(' | ')}`);
    }

    const timeoutMs = Number.isFinite(request.timeoutMs) && (request.timeoutMs || 0) > 0
        ? Number(request.timeoutMs)
        : tools.config.defaultTimeoutMs;

    let converted: { output: string; stderr: string };
    if (inputFormat === 'musicxml' && outputFormat === 'abc') {
        converted = await convertXmlToAbc({
            config: tools.config,
            content,
            timeoutMs,
            filename: request.filename,
        });
    } else if (inputFormat === 'abc' && outputFormat === 'musicxml') {
        converted = await convertAbcToXml({
            config: tools.config,
            content,
            timeoutMs,
            filename: request.filename,
        });
    } else {
        throw new Error(`Unsupported conversion: ${inputFormat} -> ${outputFormat}`);
    }

    const validationChecks = await buildValidationChecks({
        inputFormat,
        inputContent: content,
        outputFormat,
        outputContent: converted.output,
        validate: request.validate !== false,
        deepValidate: request.deepValidate !== false,
        timeoutMs,
        filename: request.filename,
        config: tools.config,
    });
    const normalizedOutput = normalizeTextForFormat(outputFormat, converted.output);

    return {
        inputFormat,
        outputFormat,
        content: normalizedOutput.content,
        normalization: normalizedOutput.report,
        validation: buildValidationReport(validationChecks),
        provenance: {
            engine: 'notagen',
            pythonCommand: tools.config.pythonCommand,
            scripts: {
                xml2abc: tools.config.xml2abcScript,
                abc2xml: tools.config.abc2xmlScript,
            },
            durationMs: Date.now() - startedAt,
            stderr: converted.stderr || undefined,
        },
    };
}
