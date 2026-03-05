import { buildStarterTemplateFromXml, runMmaCompile, validateMmaScript } from '../music-mma';
import { convertMusicNotation } from '../music-conversion';
import { createScoreArtifact, summarizeScoreArtifact } from '../score-artifacts';
import { type TraceContext } from '../trace-http';
import { asRecord, readBoolean, readContent, resolveScoreContent } from './common';

type MmaServiceResult = {
  status: number;
  body: Record<string, unknown>;
};

type MmaServiceOptions = {
  traceContext?: TraceContext;
};

const DEFAULT_MAX_TEMPLATE_MEASURES = 16;
const MAX_TEMPLATE_MEASURES = 2500;

const readBoundedInt = (value: unknown, fallback: number, min: number, max: number) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  const intValue = Math.trunc(parsed);
  if (intValue < min) {
    return min;
  }
  if (intValue > max) {
    return max;
  }
  return intValue;
};

const logMmaServiceEvent = (
  level: 'info' | 'warn' | 'error',
  event: string,
  traceContext: TraceContext | undefined,
  extra?: Record<string, unknown>,
) => {
  const line = JSON.stringify({
    event,
    requestId: traceContext?.requestId || null,
    traceId: traceContext?.traceId || null,
    sessionId: traceContext?.sessionId || null,
    clientSessionId: traceContext?.clientSessionId || null,
    ...(extra || {}),
  });
  if (level === 'error') {
    console.error(line);
    return;
  }
  if (level === 'warn') {
    console.warn(line);
    return;
  }
  console.info(line);
};

function readScript(data: Record<string, unknown> | null): string {
  if (typeof data?.script === 'string' && data.script.trim()) {
    return data.script;
  }
  return readContent(data);
}

export async function runMmaTemplateService(body: unknown, options?: MmaServiceOptions): Promise<MmaServiceResult> {
  const traceContext = options?.traceContext;
  const data = asRecord(body);

  const resolution = await resolveScoreContent(body);
  if (resolution.error) {
    return resolution.error as MmaServiceResult;
  }

  const maxMeasures = readBoundedInt(
    data?.maxMeasures ?? data?.max_measures,
    DEFAULT_MAX_TEMPLATE_MEASURES,
    1,
    MAX_TEMPLATE_MEASURES,
  );

  const defaultGroove = typeof data?.defaultGroove === 'string'
    ? data.defaultGroove.trim()
    : (typeof data?.default_groove === 'string' ? data.default_groove.trim() : '');

  const startedAt = Date.now();
  const result = buildStarterTemplateFromXml(resolution.xml, {
    maxMeasures,
    defaultGroove: defaultGroove || undefined,
  });

  logMmaServiceEvent('info', 'music.mma.template.result', traceContext, {
    durationMs: Date.now() - startedAt,
    measureCount: result.analysis.measureCount,
    harmonyCoverage: result.analysis.harmonyCoverage,
    warningsCount: result.warnings.length,
    sessionId: resolution.session?.scoreSessionId || null,
    sourceArtifactId: resolution.artifact?.id || null,
  });

  return {
    status: 200,
    body: {
      template: result.template,
      analysis: result.analysis,
      warnings: result.warnings,
      scoreSessionId: resolution.session?.scoreSessionId ?? null,
      revision: resolution.session?.revision ?? null,
      sourceArtifactId: resolution.artifact?.id ?? null,
    },
  };
}

export async function runMmaRenderService(body: unknown, options?: MmaServiceOptions): Promise<MmaServiceResult> {
  const traceContext = options?.traceContext;
  const data = asRecord(body);
  const script = readScript(data);
  const filename = typeof data?.filename === 'string' && data.filename.trim()
    ? data.filename.trim()
    : 'accompaniment.mma';
  const includeMidi = readBoolean(data?.includeMidi, data?.include_midi, true);
  const includeMusicXml = readBoolean(data?.includeMusicXml, data?.include_music_xml, false);
  const persistArtifacts = readBoolean(data?.persistArtifacts, data?.persist_artifacts, true);
  const validate = readBoolean(data?.validate, undefined, true);
  const deepValidate = readBoolean(data?.deepValidate, data?.deep_validate, true);
  const timeoutValue = Number(data?.timeoutMs ?? data?.timeout_ms);
  const timeoutMs = Number.isFinite(timeoutValue) && timeoutValue > 0 ? Math.trunc(timeoutValue) : undefined;

  if (!includeMidi && !includeMusicXml) {
    return {
      status: 400,
      body: {
        ok: false,
        error: {
          code: 'invalid_request',
          message: 'At least one output must be requested (includeMidi or includeMusicXml).',
        },
      },
    };
  }

  const scriptValidation = validateMmaScript(script);
  if (!scriptValidation.ok) {
    return {
      status: 400,
      body: {
        ok: false,
        error: {
          code: 'invalid_request',
          message: scriptValidation.error || 'Invalid MMA script.',
          bytes: scriptValidation.bytes,
        },
      },
    };
  }

  logMmaServiceEvent('info', 'music.mma.render.request', traceContext, {
    includeMidi,
    includeMusicXml,
    persistArtifacts,
    timeoutMs: timeoutMs ?? null,
    scriptBytes: scriptValidation.bytes,
  });

  const compileStartedAt = Date.now();
  let compileResult;
  try {
    compileResult = await runMmaCompile({ script, timeoutMs, traceContext });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'MMA compilation failed.';
    logMmaServiceEvent('error', 'music.mma.render.compile_result', traceContext, {
      ok: false,
      durationMs: Date.now() - compileStartedAt,
      error: message,
    });
    return {
      status: 400,
      body: {
        ok: false,
        error: {
          code: 'bad_request',
          message,
        },
      },
    };
  }

  logMmaServiceEvent('info', 'music.mma.render.compile_result', traceContext, {
    ok: true,
    durationMs: Date.now() - compileStartedAt,
    midiBytes: compileResult.midiBytes,
    command: compileResult.command,
  });

  const warnings: string[] = [];
  let musicXmlContent = '';
  let musicXmlConversion: Awaited<ReturnType<typeof convertMusicNotation>> | null = null;

  if (includeMusicXml) {
    const convertStartedAt = Date.now();
    try {
      musicXmlConversion = await convertMusicNotation({
        inputFormat: 'midi',
        outputFormat: 'musicxml',
        content: compileResult.midiBase64,
        contentEncoding: 'base64',
        filename: filename.replace(/\.[^.]+$/i, '.musicxml'),
        validate,
        deepValidate,
        timeoutMs,
        traceContext,
      });
      musicXmlContent = musicXmlConversion.content;
      if (musicXmlConversion.validation.summary.warning > 0) {
        warnings.push(`MIDI -> MusicXML conversion returned ${musicXmlConversion.validation.summary.warning} warning(s).`);
      }
      logMmaServiceEvent('info', 'music.mma.render.convert_result', traceContext, {
        ok: true,
        durationMs: Date.now() - convertStartedAt,
        warningCount: musicXmlConversion.validation.summary.warning,
        errorCount: musicXmlConversion.validation.summary.error,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'MIDI to MusicXML conversion failed.';
      logMmaServiceEvent('error', 'music.mma.render.convert_result', traceContext, {
        ok: false,
        durationMs: Date.now() - convertStartedAt,
        error: message,
      });
      return {
        status: 400,
        body: {
          ok: false,
          error: {
            code: 'bad_request',
            message,
          },
        },
      };
    }
  }

  let scriptArtifact: Awaited<ReturnType<typeof createScoreArtifact>> | null = null;
  let midiArtifact: Awaited<ReturnType<typeof createScoreArtifact>> | null = null;
  let musicXmlArtifact: Awaited<ReturnType<typeof createScoreArtifact>> | null = null;

  if (persistArtifacts) {
    scriptArtifact = await createScoreArtifact({
      format: 'mma',
      content: script,
      encoding: 'utf8',
      mimeType: 'text/plain; charset=utf-8',
      filename,
      label: 'mma-script-input',
      metadata: {
        origin: 'api/music/mma/render',
      },
    });

    midiArtifact = await createScoreArtifact({
      format: 'midi',
      content: compileResult.midiBase64,
      encoding: 'base64',
      mimeType: 'audio/midi',
      filename: filename.replace(/\.[^.]+$/i, '.mid'),
      label: 'mma-midi-output',
      parentArtifactId: scriptArtifact.id,
      sourceArtifactId: scriptArtifact.id,
      metadata: {
        origin: 'api/music/mma/render',
      },
    });

    if (includeMusicXml && musicXmlConversion) {
      musicXmlArtifact = await createScoreArtifact({
        format: 'musicxml',
        content: musicXmlConversion.content,
        encoding: 'utf8',
        mimeType: 'application/vnd.recordare.musicxml+xml',
        filename: filename.replace(/\.[^.]+$/i, '.musicxml'),
        label: 'mma-musicxml-output',
        parentArtifactId: midiArtifact.id,
        sourceArtifactId: midiArtifact.id,
        validation: musicXmlConversion.validation,
        provenance: musicXmlConversion.provenance,
        metadata: {
          origin: 'api/music/mma/render',
          conversion: {
            inputFormat: 'midi',
            outputFormat: 'musicxml',
            normalization: musicXmlConversion.normalization,
          },
        },
      });
    }
  }

  const statusBody: Record<string, unknown> = {
    ok: true,
    warnings,
    midiBase64: includeMidi ? compileResult.midiBase64 : undefined,
    musicxml: includeMusicXml ? musicXmlContent : undefined,
    artifacts: {
      input: scriptArtifact ? summarizeScoreArtifact(scriptArtifact) : null,
      midi: midiArtifact ? summarizeScoreArtifact(midiArtifact) : null,
      musicxml: musicXmlArtifact ? summarizeScoreArtifact(musicXmlArtifact) : null,
    },
    validation: {
      midi: {
        ok: true,
        checks: [
          {
            id: 'mma-midi-header',
            ok: true,
            message: 'Generated MIDI includes MThd header.',
          },
          {
            id: 'mma-midi-non-empty',
            ok: true,
            message: `Generated MIDI size: ${compileResult.midiBytes} bytes.`,
          },
        ],
      },
      conversion: musicXmlConversion ? {
        normalization: musicXmlConversion.normalization,
        validation: musicXmlConversion.validation,
      } : null,
    },
    provenance: {
      engine: 'mma',
      command: compileResult.command,
      args: compileResult.args,
      durationMs: compileResult.durationMs,
      stderr: compileResult.stderr,
    },
  };

  logMmaServiceEvent('info', 'music.mma.render.summary', traceContext, {
    includeMidi,
    includeMusicXml,
    persistArtifacts,
    warningsCount: warnings.length,
    durationMs: Date.now() - compileStartedAt,
    scriptArtifactId: scriptArtifact?.id || null,
    midiArtifactId: midiArtifact?.id || null,
    musicXmlArtifactId: musicXmlArtifact?.id || null,
  });

  return {
    status: 200,
    body: statusBody,
  };
}
