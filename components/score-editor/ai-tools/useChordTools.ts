import { asRecord } from '../../../lib/as-record';
import { DEFAULT_MMA_GROOVE } from '../../../lib/music-mma-grooves';
import { type MmaArrangementPreset } from '../../../lib/music-mma-presets';
import { appendMusicXmlParts } from '../../../lib/musicxml-append-parts';
import { notifyError, notifyWarning } from '../../shell/notices';
import { MMA_BLUES_DEMO_TEMPLATE, MMA_TEMPLATE_MAX_MEASURES } from '../ai-constants';
import { decodeBase64ToBytes } from '../byte-encoding';
import { toSafeFilename } from '../checkpoint-labels';
import { downloadBlob } from '../download-blob';
import { errorMessage } from '../error-messages';
import { estimateHarmonyTimeoutMs, estimateMusicXmlMeasureCount } from '../harmony-estimates';
import { type HarmonyRhythmMode } from './HarmonyPanel';
import { type MmaStarterPreset } from './MmaPanel';
import { useCallback, useState } from 'react';
import type { MmaPanelProps } from './MmaPanel';
import type { HarmonyPanelProps } from './HarmonyPanel';
import type { FunctionalHarmonyPanelProps } from './FunctionalHarmonyPanel';
import type { Score } from '../../../lib/webmscore-loader';
import type { CodeEditorThemeMode } from '../../CodeMirrorEditor';
import type { ApplyXmlToScore, HandleFileUpload } from '../editor-types';
import type { AiToolsTab } from './aiToolsTab';
import type React from 'react';

export type ChordToolsContext = {
  postScoreEditorJson: (
    path: string,
    body: Record<string, unknown>,
  ) => Promise<Record<string, unknown>>;
  setXmlSidebarTab: React.Dispatch<React.SetStateAction<AiToolsTab>>;
  resolveXmlContext: () => Promise<string>;
  setXmlLoading: React.Dispatch<React.SetStateAction<boolean>>;
  setXmlError: React.Dispatch<React.SetStateAction<string | null>>;
  score: Score | null;
  scoreTitle: string;
  handleFileUpload: HandleFileUpload;
  applyXmlToScore: ApplyXmlToScore;
  revealScoreSource: () => void;
  codeEditorTheme: CodeEditorThemeMode;
};

/**
 * The chord and arrangement tools: MMA accompaniment, chord analysis (Chordify) and functional harmony. They are one hook because they call each other (Chordify can generate an MMA template; the MMA panel starts a Chordify run and shows its busy state).
 */
export function useChordTools(ctx: ChordToolsContext) {
  const {
    postScoreEditorJson,
    setXmlSidebarTab,
    resolveXmlContext,
    setXmlLoading,
    setXmlError,
    score,
    scoreTitle,
    handleFileUpload,
    applyXmlToScore,
    revealScoreSource,
    codeEditorTheme,
  } = ctx;

  const [mmaStarterPreset, setMmaStarterPreset] = useState<MmaStarterPreset>('lead-sheet');

  const [mmaArrangementPreset, setMmaArrangementPreset] =
    useState<MmaArrangementPreset>('full-groove');

  const [mmaGroove, setMmaGroove] = useState(DEFAULT_MMA_GROOVE);

  const [mmaScript, setMmaScript] = useState('');

  const [mmaBusy, setMmaBusy] = useState(false);

  const [mmaError, setMmaError] = useState<string | null>(null);

  const [mmaWarnings, setMmaWarnings] = useState<string[]>([]);

  const [mmaSanitizedStderr, setMmaSanitizedStderr] = useState('');

  const [mmaMidiBase64, setMmaMidiBase64] = useState('');

  const [mmaGeneratedXml, setMmaGeneratedXml] = useState('');

  const [mmaResultPayload, setMmaResultPayload] = useState<Record<string, unknown> | null>(null);

  const [harmonyBusy, setHarmonyBusy] = useState(false);

  const [harmonyError, setHarmonyError] = useState<string | null>(null);

  const [harmonyWarnings, setHarmonyWarnings] = useState<string[]>([]);

  const [harmonyGeneratedXml, setHarmonyGeneratedXml] = useState('');

  const [harmonyResultPayload, setHarmonyResultPayload] = useState<Record<string, unknown> | null>(
    null,
  );

  const [harmonyRhythmMode, setHarmonyRhythmMode] = useState<HarmonyRhythmMode>('auto');

  const [harmonyMaxChangesPerMeasure, setHarmonyMaxChangesPerMeasure] = useState(2);

  const [functionalHarmonyBusy, setFunctionalHarmonyBusy] = useState(false);

  const [functionalHarmonyError, setFunctionalHarmonyError] = useState<string | null>(null);

  const [functionalHarmonyWarnings, setFunctionalHarmonyWarnings] = useState<string[]>([]);

  const [functionalHarmonyResult, setFunctionalHarmonyResult] = useState<Record<
    string,
    unknown
  > | null>(null);

  const [functionalHarmonySegments, setFunctionalHarmonySegments] = useState<
    Record<string, unknown>[]
  >([]);

  const [functionalHarmonyAnnotatedXml, setFunctionalHarmonyAnnotatedXml] = useState('');

  const [functionalHarmonyJsonExport, setFunctionalHarmonyJsonExport] = useState('');

  const [functionalHarmonyRntxtExport, setFunctionalHarmonyRntxtExport] = useState('');

  const handleMmaStarterPresetChange = useCallback((preset: MmaStarterPreset) => {
    setMmaStarterPreset(preset);
    setMmaError(null);
    if (preset === 'blank') {
      setMmaScript('');
      setMmaWarnings([]);
      setMmaSanitizedStderr('');
      setMmaResultPayload(null);
      return;
    }
    if (preset === 'blues') {
      setMmaScript(MMA_BLUES_DEMO_TEMPLATE);
      setMmaWarnings([]);
      setMmaSanitizedStderr('');
      setMmaResultPayload(null);
    }
  }, []);

  const generateMmaTemplateFromXml = useCallback(
    async (xml: string, options?: { switchToMmaTab?: boolean }) => {
      const estimatedMeasures = estimateMusicXmlMeasureCount(xml);
      const payload = await postScoreEditorJson('/api/music/mma/template', {
        content: xml,
        maxMeasures: Math.min(
          MMA_TEMPLATE_MAX_MEASURES,
          Math.max(1, estimatedMeasures || MMA_TEMPLATE_MAX_MEASURES),
        ),
        arrangementPreset: mmaArrangementPreset,
        defaultGroove: mmaGroove,
      });
      const template = typeof payload.template === 'string' ? payload.template : '';
      if (!template.trim()) {
        throw new Error('MMA template response did not include a script.');
      }
      setMmaScript(template);
      setMmaStarterPreset('lead-sheet');
      const warnings = Array.isArray(payload.warnings)
        ? payload.warnings.filter(
            (value): value is string => typeof value === 'string' && value.trim().length > 0,
          )
        : [];
      setMmaWarnings(warnings);
      setMmaSanitizedStderr('');
      setMmaResultPayload(payload);
      if (options?.switchToMmaTab) {
        setXmlSidebarTab('mma');
      }
      return payload;
    },
    [mmaArrangementPreset, mmaGroove, postScoreEditorJson, setXmlSidebarTab],
  );

  const handleMmaGenerateTemplate = async () => {
    setMmaBusy(true);
    setMmaError(null);
    try {
      const xml = await resolveXmlContext();
      if (!xml.trim()) {
        notifyWarning('Load a score before generating an MMA starter from MusicXML.');
        return;
      }
      await generateMmaTemplateFromXml(xml);
    } catch (err) {
      console.error('Failed to generate MMA template', err);
      setMmaError(errorMessage(err) || 'Failed to generate MMA starter template.');
    } finally {
      setMmaBusy(false);
    }
  };

  const handleMmaRender = async (includeMusicXml: boolean) => {
    const script = mmaScript.trim();
    if (!script) {
      notifyWarning('Enter an MMA script before rendering.');
      return;
    }
    setMmaBusy(true);
    setMmaError(null);
    try {
      const payload = await postScoreEditorJson('/api/music/mma/render', {
        script: mmaScript,
        includeMidi: true,
        includeMusicXml,
        persistArtifacts: true,
      });
      const midiBase64 = typeof payload.midiBase64 === 'string' ? payload.midiBase64 : '';
      const musicxml = typeof payload.musicxml === 'string' ? payload.musicxml : '';
      const warnings = Array.isArray(payload.warnings)
        ? payload.warnings.filter(
            (value): value is string => typeof value === 'string' && value.trim().length > 0,
          )
        : [];
      const provenance = asRecord(payload.provenance);
      const stderr = typeof provenance?.stderr === 'string' ? provenance.stderr : '';

      setMmaWarnings(warnings);
      setMmaSanitizedStderr(stderr);
      setMmaMidiBase64(midiBase64);
      if (includeMusicXml) {
        setMmaGeneratedXml(musicxml);
      }
      setMmaResultPayload(payload);
    } catch (err) {
      console.error('Failed to render MMA script', err);
      setMmaError(errorMessage(err) || 'Failed to render MMA script.');
    } finally {
      setMmaBusy(false);
    }
  };

  const handleMmaDownload = (format: 'mma' | 'midi' | 'musicxml') => {
    if (format === 'mma') {
      if (!mmaScript.trim()) {
        notifyWarning('No MMA script is available to download.');
        return;
      }
      downloadBlob(`${mmaScript.trimEnd()}\n`, 'accompaniment.mma', 'text/plain;charset=utf-8');
      return;
    }

    if (format === 'midi') {
      if (!mmaMidiBase64.trim()) {
        notifyWarning('No rendered MIDI output is available yet.');
        return;
      }
      try {
        const midiBytes = decodeBase64ToBytes(mmaMidiBase64);
        if (!midiBytes.length) {
          throw new Error('Rendered MIDI payload was empty.');
        }
        downloadBlob(midiBytes, 'accompaniment.mid', 'audio/midi');
      } catch (err) {
        console.error('Failed to decode/render MIDI download payload', err);
        notifyError('Unable to decode rendered MIDI for download.');
      }
      return;
    }

    if (!mmaGeneratedXml.trim()) {
      notifyWarning('No generated MusicXML is available to download.');
      return;
    }
    downloadBlob(
      mmaGeneratedXml,
      'accompaniment.musicxml',
      'application/vnd.recordare.musicxml+xml',
    );
  };

  const handleApplyMmaOutput = async () => {
    if (!mmaGeneratedXml.trim()) {
      notifyWarning('No generated MusicXML is available yet.');
      return;
    }
    setXmlLoading(true);
    setXmlError(null);
    try {
      if (!score) {
        const encoder = new TextEncoder();
        const encoded = encoder.encode(mmaGeneratedXml);
        const filenameBase = scoreTitle ? `mma-${toSafeFilename(scoreTitle)}` : 'mma-output';
        const file = new File([encoded], `${filenameBase}.musicxml`, { type: 'application/xml' });
        await handleFileUpload(file, {
          preserveScoreId: false,
          updateUrl: false,
          telemetrySource: 'mma_output',
        });
      } else {
        const currentXml = await resolveXmlContext();
        if (!currentXml.trim()) {
          throw new Error('Unable to load current score MusicXML for MMA part append.');
        }
        const appendResult = appendMusicXmlParts(currentXml, mmaGeneratedXml);
        if (appendResult.appendedPartCount <= 0) {
          throw new Error('Generated MMA MusicXML did not contain appendable parts.');
        }
        setMmaWarnings((prev) => {
          const next = [...prev];
          next.push(`Appended ${appendResult.appendedPartCount} part(s) into the current score.`);
          appendResult.warnings.forEach((warning) => next.push(warning));
          return Array.from(new Set(next));
        });
        await applyXmlToScore(appendResult.xml, {
          telemetrySource: 'mma_output_append',
          inputFormat: 'musicxml',
        });
      }
      revealScoreSource();
    } catch (err) {
      console.error('Failed to apply MMA output MusicXML', err);
      notifyError('Failed to apply generated MMA MusicXML. See console for details.');
    } finally {
      setXmlLoading(false);
    }
  };

  const handleHarmonyAnalyze = async (options?: {
    applyImmediately?: boolean;
    persistArtifacts?: boolean;
    generateMmaTemplate?: boolean;
  }) => {
    setHarmonyBusy(true);
    setHarmonyError(null);
    try {
      const xml = await resolveXmlContext();
      if (!xml.trim()) {
        notifyWarning('Load a score before running harmony analysis.');
        return;
      }
      const payload = await postScoreEditorJson('/api/music/harmony/analyze', {
        content: xml,
        insertHarmony: true,
        includeContent: true,
        persistArtifacts: options?.persistArtifacts ?? true,
        preferLocalKey: true,
        includeRomanNumerals: false,
        simplifyForMma: true,
        existingHarmonyMode: 'fill-missing',
        harmonicRhythm: harmonyRhythmMode,
        maxChangesPerMeasure: Math.min(
          8,
          Math.max(1, Math.trunc(harmonyMaxChangesPerMeasure || 1)),
        ),
        timeoutMs: estimateHarmonyTimeoutMs(xml),
      });
      const warnings = Array.isArray(payload.warnings)
        ? payload.warnings.filter(
            (value): value is string => typeof value === 'string' && value.trim().length > 0,
          )
        : [];
      const content = asRecord(payload.content);
      const musicxml = typeof content?.musicxml === 'string' ? content.musicxml : '';
      if (!musicxml.trim()) {
        throw new Error('Harmony analysis did not return tagged MusicXML.');
      }
      setHarmonyWarnings(warnings);
      setHarmonyGeneratedXml(musicxml);
      setHarmonyResultPayload(payload);

      if (options?.generateMmaTemplate) {
        setMmaBusy(true);
        setMmaError(null);
        try {
          await generateMmaTemplateFromXml(musicxml, { switchToMmaTab: true });
        } finally {
          setMmaBusy(false);
        }
      }

      if (options?.applyImmediately) {
        setXmlLoading(true);
        try {
          await applyXmlToScore(musicxml, {
            telemetrySource: 'harmony_analysis_apply',
            inputFormat: 'musicxml',
            enforceJazzHarmonyStyle: true,
          });
          revealScoreSource();
        } finally {
          setXmlLoading(false);
        }
      }
    } catch (err) {
      console.error('Failed to analyze harmony', err);
      setHarmonyError(errorMessage(err) || 'Failed to analyze harmony.');
    } finally {
      setHarmonyBusy(false);
    }
  };

  const handleApplyHarmonyOutput = async () => {
    if (!harmonyGeneratedXml.trim()) {
      notifyWarning('No tagged MusicXML is available yet.');
      return;
    }
    setXmlLoading(true);
    setXmlError(null);
    try {
      await applyXmlToScore(harmonyGeneratedXml, {
        telemetrySource: 'harmony_analysis_apply',
        inputFormat: 'musicxml',
        enforceJazzHarmonyStyle: true,
      });
      revealScoreSource();
    } catch (err) {
      console.error('Failed to apply harmony-tagged MusicXML', err);
      notifyError('Failed to apply harmony-tagged MusicXML. See console for details.');
    } finally {
      setXmlLoading(false);
    }
  };

  const handleDownloadHarmonyXml = () => {
    if (!harmonyGeneratedXml.trim()) {
      notifyWarning('No tagged MusicXML is available to download.');
      return;
    }
    const filenameBase = scoreTitle ? `harmony-${toSafeFilename(scoreTitle)}` : 'harmony-tagged';
    downloadBlob(
      harmonyGeneratedXml,
      `${filenameBase}.musicxml`,
      'application/vnd.recordare.musicxml+xml',
    );
  };

  const handleFunctionalHarmonyAnalyze = async () => {
    setFunctionalHarmonyBusy(true);
    setFunctionalHarmonyError(null);
    try {
      const xml = await resolveXmlContext();
      if (!xml.trim()) {
        notifyWarning('Load a score before running harmony analysis.');
        return;
      }
      const payload = await postScoreEditorJson('/api/music/functional-harmony/analyze', {
        content: xml,
        backend: 'music21-roman',
        includeSegments: true,
        includeTextExport: true,
        includeAnnotatedContent: true,
        persistArtifacts: true,
      });
      setFunctionalHarmonyResult(payload);
      setFunctionalHarmonyWarnings(
        Array.isArray(payload.warnings)
          ? payload.warnings.filter(
              (value): value is string => typeof value === 'string' && value.trim().length > 0,
            )
          : [],
      );
      setFunctionalHarmonySegments(
        Array.isArray(payload.segments)
          ? payload.segments.filter((value): value is Record<string, unknown> =>
              Boolean(asRecord(value)),
            )
          : [],
      );
      const exportsRecord = asRecord(payload.exports);
      setFunctionalHarmonyAnnotatedXml(
        typeof payload.annotatedXml === 'string' ? payload.annotatedXml : '',
      );
      setFunctionalHarmonyJsonExport(
        typeof exportsRecord?.json === 'string' ? exportsRecord.json : '',
      );
      setFunctionalHarmonyRntxtExport(
        typeof exportsRecord?.rntxt === 'string' ? exportsRecord.rntxt : '',
      );
    } catch (err) {
      console.error('Failed to analyze harmony', err);
      setFunctionalHarmonyError(errorMessage(err) || 'Failed to analyze harmony.');
    } finally {
      setFunctionalHarmonyBusy(false);
    }
  };

  const handleDownloadFunctionalHarmony = (format: 'json' | 'rntxt') => {
    if (format === 'json') {
      if (!functionalHarmonyJsonExport.trim()) {
        notifyWarning('No harmony JSON export is available yet.');
        return;
      }
      const filenameBase = scoreTitle
        ? `functional-harmony-${toSafeFilename(scoreTitle)}`
        : 'functional-harmony';
      downloadBlob(functionalHarmonyJsonExport, `${filenameBase}.json`, 'application/json');
      return;
    }
    if (!functionalHarmonyRntxtExport.trim()) {
      notifyWarning('No harmony text export is available yet.');
      return;
    }
    const filenameBase = scoreTitle
      ? `functional-harmony-${toSafeFilename(scoreTitle)}`
      : 'functional-harmony';
    downloadBlob(functionalHarmonyRntxtExport, `${filenameBase}.rntxt`, 'text/plain;charset=utf-8');
  };

  const handleDownloadFunctionalHarmonyXml = () => {
    if (!functionalHarmonyAnnotatedXml.trim()) {
      notifyWarning('No annotated harmony MusicXML is available yet.');
      return;
    }
    const filenameBase = scoreTitle
      ? `functional-harmony-${toSafeFilename(scoreTitle)}`
      : 'functional-harmony';
    downloadBlob(
      functionalHarmonyAnnotatedXml,
      `${filenameBase}.musicxml`,
      'application/vnd.recordare.musicxml+xml',
    );
  };

  const handleApplyFunctionalHarmonyOutput = async () => {
    if (!functionalHarmonyAnnotatedXml.trim()) {
      notifyWarning('No annotated harmony MusicXML is available yet.');
      return;
    }
    setXmlLoading(true);
    setXmlError(null);
    try {
      await applyXmlToScore(functionalHarmonyAnnotatedXml, {
        telemetrySource: 'functional_harmony_apply',
        inputFormat: 'musicxml',
      });
      revealScoreSource();
    } catch (err) {
      console.error('Failed to apply harmony-annotated MusicXML', err);
      notifyError('Failed to apply harmony-annotated MusicXML. See console for details.');
    } finally {
      setXmlLoading(false);
    }
  };

  return {
    mmaPanel: {
      config: {
        starterPreset: mmaStarterPreset,
        arrangementPreset: mmaArrangementPreset,
        groove: mmaGroove,
        script: mmaScript,
        setStarterPreset: handleMmaStarterPresetChange,
        setArrangementPreset: setMmaArrangementPreset,
        setGroove: setMmaGroove,
        setScript: setMmaScript,
        editorTheme: codeEditorTheme,
      },
      status: {
        busy: mmaBusy,
        harmonyBusy,
        error: mmaError,
      },
      result: {
        generatedXml: mmaGeneratedXml,
        midiBase64: mmaMidiBase64,
        warnings: mmaWarnings,
        sanitizedStderr: mmaSanitizedStderr,
        payload: mmaResultPayload,
        setGeneratedXml: setMmaGeneratedXml,
      },
      actions: {
        generateTemplate: handleMmaGenerateTemplate,
        chordifyAndGenerate: () =>
          void handleHarmonyAnalyze({
            applyImmediately: false,
            persistArtifacts: true,
            generateMmaTemplate: true,
          }),
        render: (includeMusicXml) => void handleMmaRender(includeMusicXml),
        download: handleMmaDownload,
        applyOutput: handleApplyMmaOutput,
        openChordify: () => setXmlSidebarTab('harmony'),
      },
    } satisfies MmaPanelProps,
    harmonyPanel: {
      config: {
        rhythmMode: harmonyRhythmMode,
        maxChangesPerMeasure: harmonyMaxChangesPerMeasure,
        setRhythmMode: setHarmonyRhythmMode,
        setMaxChangesPerMeasure: setHarmonyMaxChangesPerMeasure,
      },
      status: {
        busy: harmonyBusy,
        mmaBusy,
        error: harmonyError,
      },
      result: {
        generatedXml: harmonyGeneratedXml,
        warnings: harmonyWarnings,
        payload: harmonyResultPayload,
        setGeneratedXml: setHarmonyGeneratedXml,
      },
      actions: {
        analyze: () =>
          void handleHarmonyAnalyze({
            applyImmediately: false,
            persistArtifacts: true,
          }),
        analyzeAndApply: () =>
          void handleHarmonyAnalyze({
            applyImmediately: true,
            persistArtifacts: true,
          }),
        analyzeAndGenerateMma: () =>
          void handleHarmonyAnalyze({
            applyImmediately: false,
            persistArtifacts: true,
            generateMmaTemplate: true,
          }),
        applyOutput: () => void handleApplyHarmonyOutput(),
        downloadXml: handleDownloadHarmonyXml,
      },
      editorTheme: codeEditorTheme,
    } satisfies HarmonyPanelProps,
    functionalHarmonyPanel: {
      status: {
        busy: functionalHarmonyBusy,
        error: functionalHarmonyError,
      },
      result: {
        payload: functionalHarmonyResult,
        segments: functionalHarmonySegments,
        warnings: functionalHarmonyWarnings,
        annotatedXml: functionalHarmonyAnnotatedXml,
        jsonExport: functionalHarmonyJsonExport,
        rntxtExport: functionalHarmonyRntxtExport,
        setAnnotatedXml: setFunctionalHarmonyAnnotatedXml,
        setRntxtExport: setFunctionalHarmonyRntxtExport,
      },
      actions: {
        analyze: () => void handleFunctionalHarmonyAnalyze(),
        applyOutput: () => void handleApplyFunctionalHarmonyOutput(),
        download: handleDownloadFunctionalHarmony,
        downloadXml: handleDownloadFunctionalHarmonyXml,
      },
      editorTheme: codeEditorTheme,
    } satisfies FunctionalHarmonyPanelProps,
  };
}
