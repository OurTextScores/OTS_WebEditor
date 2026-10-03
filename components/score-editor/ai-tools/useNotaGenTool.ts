import { asRecord } from '../../../lib/as-record';
import { resolveScoreEditorApiPath } from '../../../lib/score-editor-api-client';
import { notifyError, notifyWarning } from '../../shell/notices';
import { type NotaGenSpaceCombinations } from '../ai-assistant-types';
import { toSafeFilename } from '../checkpoint-labels';
import { errorMessage } from '../error-messages';
import {
  MUSIC_SPECIALISTS_DEFAULT_NOTAGEN_BACKEND,
  MUSIC_SPECIALISTS_DEFAULT_NOTAGEN_MODEL,
  MUSIC_SPECIALISTS_DEFAULT_NOTAGEN_REVISION,
  MUSIC_SPECIALISTS_DEFAULT_NOTAGEN_SPACE_COMPOSER,
  MUSIC_SPECIALISTS_DEFAULT_NOTAGEN_SPACE_ID,
  MUSIC_SPECIALISTS_DEFAULT_NOTAGEN_SPACE_INSTRUMENTATION,
  MUSIC_SPECIALISTS_DEFAULT_NOTAGEN_SPACE_PERIOD,
  MUSIC_SPECIALISTS_NOTAGEN_BACKEND_STORAGE_KEY,
  MUSIC_SPECIALISTS_NOTAGEN_MODEL_STORAGE_KEY,
  MUSIC_SPECIALISTS_NOTAGEN_REVISION_STORAGE_KEY,
  MUSIC_SPECIALISTS_NOTAGEN_SPACE_COMPOSER_STORAGE_KEY,
  MUSIC_SPECIALISTS_NOTAGEN_SPACE_ID_STORAGE_KEY,
  MUSIC_SPECIALISTS_NOTAGEN_SPACE_INSTRUMENTATION_STORAGE_KEY,
  MUSIC_SPECIALISTS_NOTAGEN_SPACE_PERIOD_STORAGE_KEY,
} from '../music-specialists-constants';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { NotaGenPanelProps } from './NotaGenPanel';
import type { TraceContext } from '../../../lib/editor-analytics';
import type { Score } from '../../../lib/webmscore-loader';
import type { CodeEditorThemeMode } from '../../CodeMirrorEditor';
import type { ApplyXmlToScore, EditorTelemetryCounters, HandleFileUpload } from '../editor-types';
import type { AiToolsTab } from './aiToolsTab';
import type React from 'react';

export type NotaGenToolContext = {
  postScoreEditorJson: (
    path: string,
    body: Record<string, unknown>,
  ) => Promise<Record<string, unknown>>;
  telemetryCountersRef: React.RefObject<EditorTelemetryCounters>;
  captureApiTraceContext: (headers: Headers | null | undefined) => TraceContext;
  emitEditorTelemetry: (
    eventName: string,
    properties?: Record<string, string | number | boolean | null | undefined>,
    options?: { beacon?: boolean },
  ) => void;
  setXmlLoading: React.Dispatch<React.SetStateAction<boolean>>;
  setXmlError: React.Dispatch<React.SetStateAction<string | null>>;
  score: Score | null;
  handleFileUpload: HandleFileUpload;
  applyXmlToScore: ApplyXmlToScore;
  revealScoreSource: () => void;
  aiEnabled: boolean;
  xmlSidebarTab: AiToolsTab;
  codeEditorTheme: CodeEditorThemeMode;
};

/**
 * NotaGen: the music-specialists generation tool. Owns its form state (space period, composer, instrumentation), the run/apply handlers, and the persistence effects, and returns the model the panel renders.
 */
export function useNotaGenTool(ctx: NotaGenToolContext) {
  const {
    postScoreEditorJson,
    telemetryCountersRef,
    captureApiTraceContext,
    emitEditorTelemetry,
    setXmlLoading,
    setXmlError,
    score,
    handleFileUpload,
    applyXmlToScore,
    revealScoreSource,
    aiEnabled,
    xmlSidebarTab,
    codeEditorTheme,
  } = ctx;

  const musicNotaGenProgressPreRef = useRef<HTMLPreElement | null>(null);

  const [musicNotaGenBackend, setMusicNotaGenBackend] = useState<
    'huggingface' | 'huggingface-space'
  >(MUSIC_SPECIALISTS_DEFAULT_NOTAGEN_BACKEND);

  const [musicNotaGenModelId, setMusicNotaGenModelId] = useState(
    MUSIC_SPECIALISTS_DEFAULT_NOTAGEN_MODEL,
  );

  const [musicNotaGenRevision, setMusicNotaGenRevision] = useState(
    MUSIC_SPECIALISTS_DEFAULT_NOTAGEN_REVISION,
  );

  const [musicNotaGenSpaceId, setMusicNotaGenSpaceId] = useState(
    MUSIC_SPECIALISTS_DEFAULT_NOTAGEN_SPACE_ID,
  );

  const [musicNotaGenSpacePeriod, setMusicNotaGenSpacePeriod] = useState(
    MUSIC_SPECIALISTS_DEFAULT_NOTAGEN_SPACE_PERIOD,
  );

  const [musicNotaGenSpaceComposer, setMusicNotaGenSpaceComposer] = useState(
    MUSIC_SPECIALISTS_DEFAULT_NOTAGEN_SPACE_COMPOSER,
  );

  const [musicNotaGenSpaceInstrumentation, setMusicNotaGenSpaceInstrumentation] = useState(
    MUSIC_SPECIALISTS_DEFAULT_NOTAGEN_SPACE_INSTRUMENTATION,
  );

  const [musicNotaGenDryRun] = useState(false);

  const [musicNotaGenBusy, setMusicNotaGenBusy] = useState(false);

  const [musicNotaGenError, setMusicNotaGenError] = useState<string | null>(null);

  const [musicNotaGenResult, setMusicNotaGenResult] = useState<Record<string, unknown> | null>(
    null,
  );

  const [musicNotaGenGeneratedXml, setMusicNotaGenGeneratedXml] = useState('');

  const [musicNotaGenGeneratedAbc, setMusicNotaGenGeneratedAbc] = useState('');

  const [musicNotaGenProgressLog, setMusicNotaGenProgressLog] = useState('');

  const [musicNotaGenStatusText, setMusicNotaGenStatusText] = useState('');

  const [musicNotaGenSpaceCombinations, setMusicNotaGenSpaceCombinations] =
    useState<NotaGenSpaceCombinations | null>(null);

  const [musicNotaGenSpaceOptionsLoading, setMusicNotaGenSpaceOptionsLoading] = useState(false);

  const [musicNotaGenSpaceOptionsError, setMusicNotaGenSpaceOptionsError] = useState<string | null>(
    null,
  );

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    if (!aiEnabled) {
      return;
    }
    setMusicNotaGenBackend(
      window.localStorage.getItem(MUSIC_SPECIALISTS_NOTAGEN_BACKEND_STORAGE_KEY) ===
        'huggingface-space'
        ? 'huggingface-space'
        : 'huggingface',
    );
    setMusicNotaGenModelId(
      window.localStorage.getItem(MUSIC_SPECIALISTS_NOTAGEN_MODEL_STORAGE_KEY) ??
        MUSIC_SPECIALISTS_DEFAULT_NOTAGEN_MODEL,
    );
    setMusicNotaGenRevision(
      window.localStorage.getItem(MUSIC_SPECIALISTS_NOTAGEN_REVISION_STORAGE_KEY) ??
        MUSIC_SPECIALISTS_DEFAULT_NOTAGEN_REVISION,
    );
    setMusicNotaGenSpaceId(
      window.localStorage.getItem(MUSIC_SPECIALISTS_NOTAGEN_SPACE_ID_STORAGE_KEY) ??
        MUSIC_SPECIALISTS_DEFAULT_NOTAGEN_SPACE_ID,
    );
    setMusicNotaGenSpacePeriod(
      window.localStorage.getItem(MUSIC_SPECIALISTS_NOTAGEN_SPACE_PERIOD_STORAGE_KEY) ??
        MUSIC_SPECIALISTS_DEFAULT_NOTAGEN_SPACE_PERIOD,
    );
    setMusicNotaGenSpaceComposer(
      window.localStorage.getItem(MUSIC_SPECIALISTS_NOTAGEN_SPACE_COMPOSER_STORAGE_KEY) ??
        MUSIC_SPECIALISTS_DEFAULT_NOTAGEN_SPACE_COMPOSER,
    );
    setMusicNotaGenSpaceInstrumentation(
      window.localStorage.getItem(MUSIC_SPECIALISTS_NOTAGEN_SPACE_INSTRUMENTATION_STORAGE_KEY) ??
        MUSIC_SPECIALISTS_DEFAULT_NOTAGEN_SPACE_INSTRUMENTATION,
    );
  }, [aiEnabled]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    if (!aiEnabled) {
      return;
    }
    const persistValue = (key: string, value: string) => {
      if (value.trim()) {
        window.localStorage.setItem(key, value);
      } else {
        window.localStorage.removeItem(key);
      }
    };
    persistValue(MUSIC_SPECIALISTS_NOTAGEN_BACKEND_STORAGE_KEY, musicNotaGenBackend);
    persistValue(MUSIC_SPECIALISTS_NOTAGEN_MODEL_STORAGE_KEY, musicNotaGenModelId);
    persistValue(MUSIC_SPECIALISTS_NOTAGEN_REVISION_STORAGE_KEY, musicNotaGenRevision);
    persistValue(MUSIC_SPECIALISTS_NOTAGEN_SPACE_ID_STORAGE_KEY, musicNotaGenSpaceId);
    persistValue(MUSIC_SPECIALISTS_NOTAGEN_SPACE_PERIOD_STORAGE_KEY, musicNotaGenSpacePeriod);
    persistValue(MUSIC_SPECIALISTS_NOTAGEN_SPACE_COMPOSER_STORAGE_KEY, musicNotaGenSpaceComposer);
    persistValue(
      MUSIC_SPECIALISTS_NOTAGEN_SPACE_INSTRUMENTATION_STORAGE_KEY,
      musicNotaGenSpaceInstrumentation,
    );
  }, [
    aiEnabled,
    musicNotaGenBackend,
    musicNotaGenModelId,
    musicNotaGenRevision,
    musicNotaGenSpaceId,
    musicNotaGenSpacePeriod,
    musicNotaGenSpaceComposer,
    musicNotaGenSpaceInstrumentation,
  ]);

  const musicNotaGenSpacePeriods = useMemo(
    () => (musicNotaGenSpaceCombinations ? Object.keys(musicNotaGenSpaceCombinations).sort() : []),
    [musicNotaGenSpaceCombinations],
  );

  const musicNotaGenSpaceComposers = useMemo(
    () =>
      Object.keys(
        (musicNotaGenSpaceCombinations && musicNotaGenSpaceCombinations[musicNotaGenSpacePeriod]) ||
          {},
      ).sort(),
    [musicNotaGenSpaceCombinations, musicNotaGenSpacePeriod],
  );

  const musicNotaGenSpaceInstrumentations = useMemo(
    () =>
      musicNotaGenSpaceCombinations &&
      musicNotaGenSpaceCombinations[musicNotaGenSpacePeriod] &&
      musicNotaGenSpaceCombinations[musicNotaGenSpacePeriod][musicNotaGenSpaceComposer]
        ? [
            ...musicNotaGenSpaceCombinations[musicNotaGenSpacePeriod][musicNotaGenSpaceComposer],
          ].sort()
        : [],
    [musicNotaGenSpaceCombinations, musicNotaGenSpacePeriod, musicNotaGenSpaceComposer],
  );

  useEffect(() => {
    if (musicNotaGenSpaceComposers.length === 0) {
      return;
    }
    if (!musicNotaGenSpaceComposers.includes(musicNotaGenSpaceComposer)) {
      setMusicNotaGenSpaceComposer(musicNotaGenSpaceComposers[0] || '');
    }
  }, [musicNotaGenSpaceComposers, musicNotaGenSpaceComposer]);

  useEffect(() => {
    if (musicNotaGenSpaceInstrumentations.length === 0) {
      return;
    }
    if (!musicNotaGenSpaceInstrumentations.includes(musicNotaGenSpaceInstrumentation)) {
      setMusicNotaGenSpaceInstrumentation(musicNotaGenSpaceInstrumentations[0] || '');
    }
  }, [musicNotaGenSpaceInstrumentations, musicNotaGenSpaceInstrumentation]);

  useEffect(() => {
    const el = musicNotaGenProgressPreRef.current;
    if (!el) {
      return;
    }
    el.scrollTop = el.scrollHeight;
  }, [musicNotaGenProgressLog, musicNotaGenStatusText]);

  const loadNotaGenSpaceOptions = useCallback(
    async (spaceIdOverride?: string) => {
      const targetSpaceId =
        (spaceIdOverride ?? musicNotaGenSpaceId).trim() || 'ElectricAlexis/NotaGen';
      setMusicNotaGenSpaceOptionsLoading(true);
      setMusicNotaGenSpaceOptionsError(null);
      try {
        const parsed = await postScoreEditorJson('/api/music/notagen-space/options', {
          spaceId: targetSpaceId,
        });
        const combinations = asRecord(parsed?.combinations) as NotaGenSpaceCombinations | null;
        setMusicNotaGenSpaceCombinations(combinations);

        const periods = Array.isArray(parsed?.periods)
          ? parsed?.periods.filter((value): value is string => typeof value === 'string')
          : [];
        const nextPeriod = periods.includes(musicNotaGenSpacePeriod)
          ? musicNotaGenSpacePeriod
          : periods[0] || musicNotaGenSpacePeriod;
        if (nextPeriod !== musicNotaGenSpacePeriod) {
          setMusicNotaGenSpacePeriod(nextPeriod);
        }

        const composersForPeriod = Object.keys(
          (combinations && combinations[nextPeriod]) || {},
        ).sort();
        const nextComposer = composersForPeriod.includes(musicNotaGenSpaceComposer)
          ? musicNotaGenSpaceComposer
          : composersForPeriod[0] || musicNotaGenSpaceComposer;
        if (nextComposer !== musicNotaGenSpaceComposer) {
          setMusicNotaGenSpaceComposer(nextComposer);
        }

        const instrumentsForComposer = (
          (combinations && combinations[nextPeriod] && combinations[nextPeriod][nextComposer]) ||
          []
        )
          .slice()
          .sort();
        const nextInstrumentation = instrumentsForComposer.includes(
          musicNotaGenSpaceInstrumentation,
        )
          ? musicNotaGenSpaceInstrumentation
          : instrumentsForComposer[0] || musicNotaGenSpaceInstrumentation;
        if (nextInstrumentation !== musicNotaGenSpaceInstrumentation) {
          setMusicNotaGenSpaceInstrumentation(nextInstrumentation);
        }
      } catch (err) {
        console.error('Failed to load NotaGen Space options', err);
        setMusicNotaGenSpaceOptionsError(
          errorMessage(err) || 'Failed to load NotaGen Space options.',
        );
      } finally {
        setMusicNotaGenSpaceOptionsLoading(false);
      }
    },
    [
      musicNotaGenSpaceComposer,
      musicNotaGenSpaceId,
      musicNotaGenSpaceInstrumentation,
      musicNotaGenSpacePeriod,
      postScoreEditorJson,
    ],
  );

  useEffect(() => {
    if (!aiEnabled || xmlSidebarTab !== 'notagen') {
      return;
    }
    if (musicNotaGenSpaceCombinations || musicNotaGenSpaceOptionsLoading) {
      return;
    }
    void loadNotaGenSpaceOptions();
  }, [
    aiEnabled,
    loadNotaGenSpaceOptions,
    musicNotaGenSpaceCombinations,
    musicNotaGenSpaceOptionsLoading,
    xmlSidebarTab,
  ]);

  const handleMusicNotaGenRun = async () => {
    if (
      !musicNotaGenSpacePeriod.trim() ||
      !musicNotaGenSpaceComposer.trim() ||
      !musicNotaGenSpaceInstrumentation.trim()
    ) {
      notifyWarning('Enter a period, composer, and instrumentation for the NotaGen Space.');
      return;
    }
    setMusicNotaGenBusy(true);
    setMusicNotaGenError(null);
    setMusicNotaGenResult(null);
    setMusicNotaGenGeneratedXml('');
    setMusicNotaGenGeneratedAbc('');
    setMusicNotaGenProgressLog('');
    setMusicNotaGenStatusText('');
    const requestStartedAt = Date.now();
    let requestIssued = false;
    let outcome: 'success' | 'failure' = 'failure';
    let failureReason = '';
    try {
      if (!musicNotaGenDryRun) {
        requestIssued = true;
        telemetryCountersRef.current.aiRequests += 1;
        const response = await fetch(resolveScoreEditorApiPath('/api/music/generate/stream'), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            backend: 'huggingface-space',
            spaceId: musicNotaGenSpaceId || undefined,
            period: musicNotaGenSpacePeriod,
            composer: musicNotaGenSpaceComposer,
            instrumentation: musicNotaGenSpaceInstrumentation,
            timeoutMs: 300000,
            includeAbc: true,
            includeContent: true,
          }),
        });
        captureApiTraceContext(response.headers);
        if (!response.ok || !response.body) {
          const payload = await response.json().catch(() => ({}));
          const message =
            typeof asRecord(payload)?.error === 'string'
              ? String(asRecord(payload)?.error)
              : `Request failed: ${response.status}`;
          failureReason = message;
          throw new Error(message);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let finalResult: Record<string, unknown> | null = null;
        let streamError: string | null = null;

        const handleSseEvent = (eventName: string, payloadText: string) => {
          let payloadValue: unknown = null;
          try {
            payloadValue = payloadText ? JSON.parse(payloadText) : null;
          } catch {
            payloadValue = { raw: payloadText };
          }
          const payload = asRecord(payloadValue);
          if (eventName === 'status') {
            const stage = typeof payload?.stage === 'string' ? payload.stage : '';
            const message = typeof payload?.message === 'string' ? payload.message : '';
            setMusicNotaGenStatusText(
              [stage, message].filter(Boolean).join(': ') || stage || message,
            );
            return;
          }
          if (eventName === 'log') {
            const message = typeof payload?.message === 'string' ? payload.message : '';
            if (message) {
              setMusicNotaGenProgressLog((prev) => {
                const next = prev ? `${prev}\n${message}` : message;
                return next.slice(-20000);
              });
            }
            return;
          }
          if (eventName === 'progress') {
            if (typeof payload?.processOutput === 'string') {
              setMusicNotaGenProgressLog(payload.processOutput.slice(-20000));
            }
            if (typeof payload?.abc === 'string') {
              setMusicNotaGenGeneratedAbc(payload.abc);
            }
            return;
          }
          if (eventName === 'result') {
            finalResult = asRecord(payload);
            streamError = null;
            return;
          }
          if (eventName === 'error') {
            if (!finalResult) {
              streamError =
                typeof payload?.error === 'string'
                  ? payload.error
                  : 'NotaGen Space streaming request failed.';
            }
          }
        };

        while (true) {
          const { value, done } = await reader.read();
          buffer += decoder.decode(value || new Uint8Array(), { stream: !done });

          let sepIndex = buffer.indexOf('\n\n');
          while (sepIndex >= 0) {
            const block = buffer.slice(0, sepIndex);
            buffer = buffer.slice(sepIndex + 2);

            let eventName = 'message';
            const dataLines: string[] = [];
            for (const line of block.split('\n')) {
              if (line.startsWith('event:')) {
                eventName = line.slice(6).trim();
              } else if (line.startsWith('data:')) {
                dataLines.push(line.slice(5).trimStart());
              }
            }
            if (dataLines.length > 0) {
              handleSseEvent(eventName, dataLines.join('\n'));
            }
            if (streamError && !finalResult) {
              failureReason = streamError;
              throw new Error(streamError);
            }
            sepIndex = buffer.indexOf('\n\n');
          }

          if (done) {
            break;
          }
        }

        if (!finalResult) {
          failureReason = streamError || 'NotaGen Space stream ended without a final result.';
          throw new Error(failureReason);
        }

        const resultRecord = finalResult as Record<string, unknown>;
        setMusicNotaGenResult(resultRecord);
        const content = asRecord(resultRecord.content);
        const abc =
          typeof resultRecord.abc === 'string'
            ? resultRecord.abc
            : typeof content?.abc === 'string'
              ? content.abc
              : '';
        const musicxml = typeof content?.musicxml === 'string' ? content.musicxml : '';
        setMusicNotaGenGeneratedAbc(abc);
        setMusicNotaGenGeneratedXml(musicxml);
        outcome = 'success';
        return;
      }

      requestIssued = true;
      telemetryCountersRef.current.aiRequests += 1;
      const payload = await postScoreEditorJson('/api/music/generate', {
        backend: 'huggingface-space',
        spaceId: musicNotaGenSpaceId || undefined,
        period: musicNotaGenSpacePeriod,
        composer: musicNotaGenSpaceComposer,
        instrumentation: musicNotaGenSpaceInstrumentation,
        dryRun: musicNotaGenDryRun,
        timeoutMs: 300000,
        includePrompt: true,
        includeAbc: true,
        includeContent: true,
      });
      setMusicNotaGenResult(payload);
      const content = asRecord(payload.content);
      const abc =
        typeof payload.abc === 'string'
          ? payload.abc
          : typeof content?.abc === 'string'
            ? content.abc
            : '';
      const musicxml = typeof content?.musicxml === 'string' ? content.musicxml : '';
      setMusicNotaGenGeneratedAbc(abc);
      setMusicNotaGenGeneratedXml(musicxml);
      outcome = 'success';
    } catch (err) {
      console.error('NotaGen request failed', err);
      failureReason = errorMessage(err) || 'NotaGen request failed.';
      setMusicNotaGenError(failureReason);
    } finally {
      setMusicNotaGenBusy(false);
      if (requestIssued) {
        if (outcome === 'failure') {
          telemetryCountersRef.current.aiFailures += 1;
        }
        emitEditorTelemetry('score_editor_ai_request', {
          channel: 'notagen',
          backend: 'huggingface-space',
          model: musicNotaGenModelId.trim() || undefined,
          space_id: musicNotaGenSpaceId.trim() || undefined,
          period: musicNotaGenSpacePeriod,
          composer: musicNotaGenSpaceComposer,
          instrumentation: musicNotaGenSpaceInstrumentation,
          outcome,
          duration_ms: Math.max(0, Date.now() - requestStartedAt),
          error: outcome === 'failure' ? failureReason || undefined : undefined,
        });
      }
    }
  };

  const handleNotaGenPeriodChange = useCallback(
    (nextPeriod: string) => {
      setMusicNotaGenSpacePeriod(nextPeriod);
      const composerMap =
        (musicNotaGenSpaceCombinations && musicNotaGenSpaceCombinations[nextPeriod]) || {};
      const composers = Object.keys(composerMap).sort();
      const nextComposer = composers.includes(musicNotaGenSpaceComposer)
        ? musicNotaGenSpaceComposer
        : composers[0] || '';
      setMusicNotaGenSpaceComposer(nextComposer);

      const instruments = nextComposer ? [...(composerMap[nextComposer] || [])].sort() : [];
      const nextInstrumentation = instruments.includes(musicNotaGenSpaceInstrumentation)
        ? musicNotaGenSpaceInstrumentation
        : instruments[0] || '';
      setMusicNotaGenSpaceInstrumentation(nextInstrumentation);
    },
    [musicNotaGenSpaceCombinations, musicNotaGenSpaceComposer, musicNotaGenSpaceInstrumentation],
  );

  const handleNotaGenComposerChange = useCallback(
    (nextComposer: string) => {
      setMusicNotaGenSpaceComposer(nextComposer);
      const instruments =
        musicNotaGenSpaceCombinations &&
        musicNotaGenSpaceCombinations[musicNotaGenSpacePeriod] &&
        musicNotaGenSpaceCombinations[musicNotaGenSpacePeriod][nextComposer]
          ? [...musicNotaGenSpaceCombinations[musicNotaGenSpacePeriod][nextComposer]].sort()
          : [];
      const nextInstrumentation = instruments.includes(musicNotaGenSpaceInstrumentation)
        ? musicNotaGenSpaceInstrumentation
        : instruments[0] || '';
      setMusicNotaGenSpaceInstrumentation(nextInstrumentation);
    },
    [musicNotaGenSpaceCombinations, musicNotaGenSpacePeriod, musicNotaGenSpaceInstrumentation],
  );

  const handleApplyMusicNotaGenOutput = async () => {
    if (!musicNotaGenGeneratedXml.trim()) {
      notifyWarning('No generated MusicXML is available yet.');
      return;
    }
    setXmlLoading(true);
    setXmlError(null);
    try {
      if (!score) {
        const encoder = new TextEncoder();
        const encoded = encoder.encode(musicNotaGenGeneratedXml);
        const filenameBase = musicNotaGenSpaceComposer
          ? `notagen-${toSafeFilename(musicNotaGenSpaceComposer)}`
          : 'notagen-output';
        const file = new File([encoded], `${filenameBase}.musicxml`, { type: 'application/xml' });
        await handleFileUpload(file, {
          preserveScoreId: false,
          updateUrl: false,
          telemetrySource: 'notagen_output',
        });
      } else {
        await applyXmlToScore(musicNotaGenGeneratedXml, { telemetrySource: 'notagen_output' });
      }
      revealScoreSource();
    } catch (err) {
      console.error('Failed to apply NotaGen output XML', err);
      notifyError('Failed to apply generated MusicXML. See console for details.');
    } finally {
      setXmlLoading(false);
    }
  };

  return {
    panel: {
      space: {
        period: musicNotaGenSpacePeriod,
        composer: musicNotaGenSpaceComposer,
        instrumentation: musicNotaGenSpaceInstrumentation,
        periods: musicNotaGenSpacePeriods,
        composers: musicNotaGenSpaceComposers,
        instrumentations: musicNotaGenSpaceInstrumentations,
        optionsError: musicNotaGenSpaceOptionsError,
        setPeriod: handleNotaGenPeriodChange,
        setComposer: handleNotaGenComposerChange,
        setInstrumentation: setMusicNotaGenSpaceInstrumentation,
      },
      status: {
        busy: musicNotaGenBusy,
        statusText: musicNotaGenStatusText,
        error: musicNotaGenError,
        progressLog: musicNotaGenProgressLog,
      },
      result: {
        generatedAbc: musicNotaGenGeneratedAbc,
        generatedXml: musicNotaGenGeneratedXml,
        payload: musicNotaGenResult,
        setGeneratedXml: setMusicNotaGenGeneratedXml,
      },
      actions: {
        run: () => void handleMusicNotaGenRun(),
        applyOutput: () => void handleApplyMusicNotaGenOutput(),
      },
      progressRef: musicNotaGenProgressPreRef,
      editorTheme: codeEditorTheme,
    } satisfies NotaGenPanelProps,
  };
}
