import { asRecord } from '../../../lib/as-record';
import { appendMusicXmlMeasures } from '../../../lib/musicxml-append-parts';
import { notifyError, notifyWarning } from '../../shell/notices';
import { downloadBlob } from '../download-blob';
import { errorMessage } from '../error-messages';
import { fileToBase64 } from '../file-base64';
import {
  MUSIC_SPECIALISTS_DEFAULT_TRANSCODA_MODEL,
  MUSIC_SPECIALISTS_DEFAULT_TRANSCODA_REVISION,
  MUSIC_SPECIALISTS_DEFAULT_TRANSCODA_SPACE_ID,
} from '../music-specialists-constants';
import { ChangeEvent, useEffect, useRef, useState } from 'react';
import type { TranscodaPanelProps } from './TranscodaPanel';
import type { Score } from '../../../lib/webmscore-loader';
import type { ApplyXmlToScore, HandleFileUpload } from '../editor-types';
import type React from 'react';

export type TranscodaToolContext = {
  postScoreEditorJson: (
    path: string,
    body: Record<string, unknown>,
  ) => Promise<Record<string, unknown>>;
  emitEditorTelemetry: (
    eventName: string,
    properties?: Record<string, string | number | boolean | null | undefined>,
    options?: { beacon?: boolean },
  ) => void;
  score: Score | null;
  setXmlLoading: React.Dispatch<React.SetStateAction<boolean>>;
  setXmlError: React.Dispatch<React.SetStateAction<string | null>>;
  handleFileUpload: HandleFileUpload;
  applyXmlToScore: ApplyXmlToScore;
  resolveXmlContext: () => Promise<string>;
  revealScoreSource: () => void;
  xmlLoading: boolean;
};

/**
 * Transcoda: image-to-score transcription. Owns the image, decoding options and phase/elapsed state, the transcribe and apply handlers, and returns the model the panel renders.
 */
export function useTranscodaTool(ctx: TranscodaToolContext) {
  const {
    postScoreEditorJson,
    emitEditorTelemetry,
    score,
    setXmlLoading,
    setXmlError,
    handleFileUpload,
    applyXmlToScore,
    resolveXmlContext,
    revealScoreSource,
    xmlLoading,
  } = ctx;

  const [musicTranscodaBusy, setMusicTranscodaBusy] = useState(false);

  const [musicTranscodaError, setMusicTranscodaError] = useState<string | null>(null);

  const [musicTranscodaWarning, setMusicTranscodaWarning] = useState<string | null>(null);

  const [musicTranscodaResult, setMusicTranscodaResult] = useState<Record<string, unknown> | null>(
    null,
  );

  const [musicTranscodaGeneratedKern, setMusicTranscodaGeneratedKern] = useState('');

  const [musicTranscodaGeneratedXml, setMusicTranscodaGeneratedXml] = useState('');

  const [musicTranscodaImageFile, setMusicTranscodaImageFile] = useState<File | null>(null);

  const [musicTranscodaElapsedMs, setMusicTranscodaElapsedMs] = useState(0);

  const [musicTranscodaPhase, setMusicTranscodaPhase] = useState<
    'idle' | 'uploading' | 'transcribing'
  >('idle');

  const musicTranscodaStartedAtRef = useRef<number | null>(null);

  const [musicTranscodaDecoding, setMusicTranscodaDecoding] = useState<'greedy' | 'beam'>('greedy');

  const [musicTranscodaMaxLength, setMusicTranscodaMaxLength] = useState(2048);

  const [musicTranscodaNumBeams, setMusicTranscodaNumBeams] = useState(3);

  const [musicTranscodaRepetitionPenalty, setMusicTranscodaRepetitionPenalty] = useState(1.1);

  const handleTranscodaImageUpload = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] || null;
    setMusicTranscodaImageFile(file);
    setMusicTranscodaError(null);
    setMusicTranscodaWarning(null);
    setMusicTranscodaResult(null);
    setMusicTranscodaGeneratedKern('');
    setMusicTranscodaGeneratedXml('');
  };

  useEffect(() => {
    if (musicTranscodaPhase === 'idle') {
      musicTranscodaStartedAtRef.current = null;
      setMusicTranscodaElapsedMs(0);
      return;
    }
    if (musicTranscodaStartedAtRef.current === null) {
      musicTranscodaStartedAtRef.current = Date.now();
    }
    const timer = window.setInterval(() => {
      const startedAt = musicTranscodaStartedAtRef.current || Date.now();
      setMusicTranscodaElapsedMs(Math.max(0, Date.now() - startedAt));
    }, 250);
    return () => window.clearInterval(timer);
  }, [musicTranscodaPhase]);

  const handleTranscodaTranscribeImage = async () => {
    if (!musicTranscodaImageFile) {
      notifyWarning('Choose a page image before running Transcoda.');
      return;
    }
    setMusicTranscodaPhase('uploading');
    musicTranscodaStartedAtRef.current = null;
    setMusicTranscodaBusy(true);
    setMusicTranscodaError(null);
    setMusicTranscodaWarning(null);
    setMusicTranscodaResult(null);
    setMusicTranscodaGeneratedKern('');
    setMusicTranscodaGeneratedXml('');
    const requestStartedAt = Date.now();
    let outcome: 'success' | 'failure' = 'failure';
    let failureReason = '';
    try {
      const imageDataUrl = await fileToBase64(musicTranscodaImageFile);
      setMusicTranscodaPhase('transcribing');
      musicTranscodaStartedAtRef.current = null;
      const payload = await postScoreEditorJson('/api/music/omr/transcribe', {
        imageDataUrl,
        mimeType: musicTranscodaImageFile.type || 'image/png',
        spaceId: MUSIC_SPECIALISTS_DEFAULT_TRANSCODA_SPACE_ID,
        decoding: musicTranscodaDecoding,
        maxLength: musicTranscodaMaxLength,
        numBeams: musicTranscodaNumBeams,
        repetitionPenalty: musicTranscodaRepetitionPenalty,
        convertToMusicXml: true,
        includeContent: true,
        timeoutMs: 300000,
      });
      setMusicTranscodaResult(payload);
      const content = asRecord(payload.content);
      const kern = typeof content?.kern === 'string' ? content.kern : '';
      const musicxml = typeof content?.musicxml === 'string' ? content.musicxml : '';
      setMusicTranscodaGeneratedKern(kern);
      setMusicTranscodaGeneratedXml(musicxml);
      const conversionError = asRecord(payload.conversionError);
      const conversionErrorMessage =
        typeof conversionError?.message === 'string' ? conversionError.message : '';
      if (!musicxml.trim() && conversionErrorMessage.trim()) {
        setMusicTranscodaWarning(
          `Transcoda returned kern text, but MusicXML conversion failed: ${conversionErrorMessage}`,
        );
      }
      outcome = 'success';
    } catch (err) {
      console.error('Transcoda request failed', err);
      failureReason = errorMessage(err) || 'Transcoda request failed.';
      setMusicTranscodaError(failureReason);
    } finally {
      setMusicTranscodaPhase('idle');
      setMusicTranscodaBusy(false);
      emitEditorTelemetry('score_editor_ai_request', {
        channel: 'transcoda',
        backend: 'huggingface-space',
        model: MUSIC_SPECIALISTS_DEFAULT_TRANSCODA_MODEL,
        space_id: MUSIC_SPECIALISTS_DEFAULT_TRANSCODA_SPACE_ID,
        image_name: musicTranscodaImageFile.name,
        outcome,
        duration_ms: Math.max(0, Date.now() - requestStartedAt),
        error: outcome === 'failure' ? failureReason || undefined : undefined,
      });
    }
  };

  const handleApplyTranscodaOutput = async (mode: 'overwrite' | 'append') => {
    if (!musicTranscodaGeneratedXml.trim()) {
      notifyWarning('No Transcoda MusicXML is available yet.');
      return;
    }
    if (mode === 'append' && !score) {
      notifyWarning('Load a target score before appending Transcoda output.');
      return;
    }
    setXmlLoading(true);
    setXmlError(null);
    try {
      if (!score || mode === 'overwrite') {
        const encoder = new TextEncoder();
        const encoded = encoder.encode(musicTranscodaGeneratedXml);
        const file = new File([encoded], 'transcoda-output.musicxml', { type: 'application/xml' });
        if (!score) {
          await handleFileUpload(file, {
            preserveScoreId: false,
            updateUrl: false,
            telemetrySource: 'transcoda_output',
          });
        } else {
          await applyXmlToScore(musicTranscodaGeneratedXml, {
            telemetrySource: 'transcoda_output_overwrite',
          });
        }
      } else {
        const currentXml = await resolveXmlContext();
        if (!currentXml.trim()) {
          throw new Error('Unable to load current score MusicXML for Transcoda append.');
        }
        const appendResult = appendMusicXmlMeasures(currentXml, musicTranscodaGeneratedXml);
        if (appendResult.appendedMeasureCount <= 0) {
          throw new Error('Transcoda MusicXML did not contain appendable measures.');
        }
        await applyXmlToScore(appendResult.xml, {
          telemetrySource: 'transcoda_output_append',
          inputFormat: 'musicxml',
        });
      }
      revealScoreSource();
    } catch (err) {
      console.error('Failed to apply Transcoda output XML', err);
      notifyError('Failed to apply Transcoda MusicXML. See console for details.');
    } finally {
      setXmlLoading(false);
    }
  };

  return {
    panel: {
      input: {
        imageFile: musicTranscodaImageFile,
        onImageUpload: handleTranscodaImageUpload,
      },
      decoding: {
        mode: musicTranscodaDecoding,
        numBeams: musicTranscodaNumBeams,
        maxLength: musicTranscodaMaxLength,
        repetitionPenalty: musicTranscodaRepetitionPenalty,
        setMode: setMusicTranscodaDecoding,
        setNumBeams: setMusicTranscodaNumBeams,
        setMaxLength: setMusicTranscodaMaxLength,
        setRepetitionPenalty: setMusicTranscodaRepetitionPenalty,
      },
      status: {
        busy: musicTranscodaBusy,
        phase: musicTranscodaPhase,
        elapsedMs: musicTranscodaElapsedMs,
        error: musicTranscodaError,
        warning: musicTranscodaWarning,
      },
      result: {
        generatedXml: musicTranscodaGeneratedXml,
        generatedKern: musicTranscodaGeneratedKern,
        payload: musicTranscodaResult,
      },
      actions: {
        transcribe: () => void handleTranscodaTranscribeImage(),
        applyOutput: (mode) => void handleApplyTranscodaOutput(mode),
        downloadXml: () =>
          downloadBlob(
            musicTranscodaGeneratedXml,
            'transcoda-output.musicxml',
            'application/vnd.recordare.musicxml+xml',
          ),
      },
      service: {
        spaceId: MUSIC_SPECIALISTS_DEFAULT_TRANSCODA_SPACE_ID,
        model: MUSIC_SPECIALISTS_DEFAULT_TRANSCODA_MODEL,
        revision: MUSIC_SPECIALISTS_DEFAULT_TRANSCODA_REVISION,
      },
      apply: {
        busy: xmlLoading,
        canAppend: Boolean(score),
      },
    } satisfies TranscodaPanelProps,
  };
}
