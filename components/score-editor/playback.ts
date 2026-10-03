import { DEFAULT_RENDER_WINDOW } from '../../lib/playback-window';
import { notifyError } from '../shell/notices';
import { toOwnedBytes } from './byte-encoding';
import { type SynthBatchIterator } from './editor-types';
import {
  PREVIEW_DURATION_MS,
  PREVIEW_SYNTH_BATCH_SIZE,
  SELECTION_STREAM_MIN_STARTUP_BATCHES,
  SELECTION_STREAM_STARTUP_BUFFER_SECONDS,
  SELECTION_SYNTH_BATCH_SIZE,
  SELECTION_SYNTH_START_PREROLL_SECONDS,
  SYNTH_START_PREROLL_SECONDS,
  TRANSPORT_SYNTH_BATCH_SIZE,
} from './playback-constants';
import type { RenderWindow } from '../../lib/playback-window';
import type { Score, SynthAudioBatchIterator } from '../../lib/webmscore-loader';
import type { EnsureSoundFontLoaded } from './editor-types';
import type React from 'react';

export type PlayTransportAudioContext = {
  score: Score | null;
  setAudioBusy: React.Dispatch<React.SetStateAction<boolean>>;
  ensureSoundFontLoaded: EnsureSoundFontLoaded;
  stopAudio: (options?: { awaitCancel?: boolean }) => Promise<void>;
  playSynthBatchStream: (
    batchFn: SynthBatchIterator,
    options: {
      sourcesRef: React.MutableRefObject<AudioBufferSourceNode[]>;
      iteratorRef: React.MutableRefObject<SynthBatchIterator | null>;
      generationRef: React.MutableRefObject<number>;
      maxDurationSeconds?: number;
      trackTransportState: boolean;
      debugLabel: string;
      prerollSeconds?: number;
      startupBufferSeconds?: number;
      minStartupBatches?: number;
      mergeWindowSeconds?: number;
      renderWindow?: RenderWindow | null;
      stateSetters?: {
        setIsPlaying: (value: boolean) => void;
        setIsPaused: (value: boolean) => void;
      };
    },
  ) => Promise<void>;
  audioSourcesRef: React.RefObject<AudioBufferSourceNode[]>;
  streamIteratorRef: React.RefObject<SynthAudioBatchIterator | null>;
  transportPlaybackGenerationRef: React.RefObject<number>;
  audioUrlRef: React.RefObject<string | null>;
  playFromUrl: (url: string, options?: { revokeOnEnded?: boolean }) => Promise<void>;
};

export type PlaySelectionPreviewContext = {
  scoreRef: React.RefObject<Score | null>;
  score: Score | null;
  interactionReady: boolean;
  isPlaying: boolean;
  audioBusy: boolean;
  selectedPointRef: React.RefObject<{ page: number; x: number; y: number } | null>;
  containerRef: React.RefObject<HTMLDivElement | null>;
  clientToEngravingPoint: (
    clientX: number,
    clientY: number,
    target?: Element | null,
  ) => { x: number; y: number } | null;
  zoom: number;
  ensureSoundFontLoaded: EnsureSoundFontLoaded;
  stopPreviewAudio: (options?: { awaitCancel?: boolean }) => Promise<void>;
  playSynthBatchStream: (
    batchFn: SynthBatchIterator,
    options: {
      sourcesRef: React.MutableRefObject<AudioBufferSourceNode[]>;
      iteratorRef: React.MutableRefObject<SynthBatchIterator | null>;
      generationRef: React.MutableRefObject<number>;
      maxDurationSeconds?: number;
      trackTransportState: boolean;
      debugLabel: string;
      prerollSeconds?: number;
      startupBufferSeconds?: number;
      minStartupBatches?: number;
      mergeWindowSeconds?: number;
      renderWindow?: RenderWindow | null;
      stateSetters?: {
        setIsPlaying: (value: boolean) => void;
        setIsPaused: (value: boolean) => void;
      };
    },
  ) => Promise<void>;
  previewAudioSourcesRef: React.RefObject<AudioBufferSourceNode[]>;
  previewStreamIteratorRef: React.RefObject<SynthAudioBatchIterator | null>;
  previewPlaybackGenerationRef: React.RefObject<number>;
};

export async function playTransportAudioImpl(
  ctx: PlayTransportAudioContext,
  fromSelection: boolean,
) {
  const {
    score,
    setAudioBusy,
    ensureSoundFontLoaded,
    stopAudio,
    playSynthBatchStream,
    audioSourcesRef,
    streamIteratorRef,
    transportPlaybackGenerationRef,
    audioUrlRef,
    playFromUrl,
  } = ctx;
  if (!score || !score.saveAudio) {
    notifyError('Audio playback is not available in this build.');
    return;
  }
  try {
    setAudioBusy(true);
    const ok = await ensureSoundFontLoaded(undefined, { forceRetry: true });
    if (!ok) {
      notifyError(
        'No default soundfont found. Configure NEXT_PUBLIC_SOUNDFONT_CDN_URL or provide /public/soundfonts/default.sf3 (or .sf2).',
      );
      return;
    }
    await stopAudio({ awaitCancel: true });

    const useSelectionStreaming =
      fromSelection && typeof score.synthAudioBatchFromSelection === 'function';
    const useStreaming = fromSelection
      ? useSelectionStreaming
      : typeof score.synthAudioBatch === 'function';
    let streamed = false;
    let streamFailure: unknown = null;
    if (useStreaming) {
      try {
        const batchFn = useSelectionStreaming
          ? ((await score.synthAudioBatchFromSelection!(
              SELECTION_SYNTH_BATCH_SIZE,
            )) as SynthBatchIterator)
          : ((await score.synthAudioBatch!(0, TRANSPORT_SYNTH_BATCH_SIZE)) as SynthBatchIterator);

        await playSynthBatchStream(batchFn, {
          sourcesRef: audioSourcesRef,
          iteratorRef: streamIteratorRef,
          generationRef: transportPlaybackGenerationRef,
          trackTransportState: true,
          debugLabel: useSelectionStreaming ? 'selection-transport' : 'transport',
          prerollSeconds: useSelectionStreaming
            ? SELECTION_SYNTH_START_PREROLL_SECONDS
            : SYNTH_START_PREROLL_SECONDS,
          startupBufferSeconds: useSelectionStreaming ? SELECTION_STREAM_STARTUP_BUFFER_SECONDS : 0,
          minStartupBatches: useSelectionStreaming ? SELECTION_STREAM_MIN_STARTUP_BATCHES : 1,
          mergeWindowSeconds: useSelectionStreaming ? 0.5 : 0,
          // Transport can run the length of the score, so it is the
          // path that must stay bounded.
          renderWindow: DEFAULT_RENDER_WINDOW,
        });
        streamed = true;
      } catch (streamErr) {
        console.warn('Streaming playback failed; falling back to WAV', streamErr);
        streamFailure = streamErr;
        await stopAudio({ awaitCancel: true });
      }
    }
    if (!streamed) {
      if (fromSelection) {
        const hasSelectionStreamingApi = typeof score.synthAudioBatchFromSelection === 'function';
        if (!hasSelectionStreamingApi) {
          notifyError(
            'Play from selection is not available in this running build. Rebuild webmscore JS glue (`cd webmscore-fork/web-public && npm run bundle`) and restart `npm run dev`.',
          );
        } else if (streamFailure) {
          const streamMessage =
            streamFailure instanceof Error ? streamFailure.message : String(streamFailure);
          notifyError(`Play from selection failed: ${streamMessage}`);
        } else {
          notifyError('Play from selection is not available in this build.');
        }
        return;
      }
      if (audioUrlRef.current) {
        await playFromUrl(audioUrlRef.current);
      } else {
        const wav = await score.saveAudio('wav');
        const blob = new Blob([toOwnedBytes(wav)], { type: 'audio/wav' });
        const url = URL.createObjectURL(blob);
        audioUrlRef.current = url;
        await playFromUrl(url);
      }
    }
  } catch (err) {
    console.error('Failed to play audio', err);
    // Say what went wrong here rather than deferring to a console the
    // reader may not be able to open: in an embed this runs inside an
    // iframe, where the browser can refuse DevTools outright.
    notifyError(`Unable to play audio: ${err instanceof Error ? err.message : String(err)}`);
    await stopAudio({ awaitCancel: true });
  } finally {
    setAudioBusy(false);
  }
}

export async function playSelectionPreviewImpl(
  ctx: PlaySelectionPreviewContext,
  trigger: string = 'unknown',
  selectionPoint?: { page: number; x: number; y: number },
  options?: { reselect?: boolean },
) {
  const {
    scoreRef,
    score,
    interactionReady,
    isPlaying,
    audioBusy,
    selectedPointRef,
    containerRef,
    clientToEngravingPoint,
    zoom,
    ensureSoundFontLoaded,
    stopPreviewAudio,
    playSynthBatchStream,
    previewAudioSourcesRef,
    previewStreamIteratorRef,
    previewPlaybackGenerationRef,
  } = ctx;
  const activeScore = scoreRef.current ?? score;
  if (
    !interactionReady ||
    !activeScore ||
    !activeScore.synthSelectionPreviewBatch ||
    isPlaying ||
    audioBusy
  ) {
    return;
  }

  const shouldReselectForPreview = options?.reselect ?? trigger.startsWith('mutation:');
  const previewPoint = selectionPoint ?? selectedPointRef.current;
  if (shouldReselectForPreview && previewPoint && activeScore.selectElementAtPoint) {
    try {
      const containerRect = containerRef.current?.getBoundingClientRect();
      const engravingPoint = containerRect
        ? clientToEngravingPoint(
            containerRect.left + previewPoint.x * zoom,
            containerRect.top + previewPoint.y * zoom,
          )
        : null;
      await activeScore.selectElementAtPoint(
        previewPoint.page,
        engravingPoint?.x ?? previewPoint.x,
        engravingPoint?.y ?? previewPoint.y,
      );
    } catch (err) {
      console.warn('[AUDITION] preview reselection failed', { trigger, err });
    }
  }

  const ok = await ensureSoundFontLoaded(activeScore, { forceRetry: true });
  if (!ok) {
    console.warn('[AUDITION] skipped preview: soundfont unavailable', { trigger });
    return;
  }

  await stopPreviewAudio({ awaitCancel: true });
  try {
    const batchFn = (await activeScore.synthSelectionPreviewBatch(
      PREVIEW_SYNTH_BATCH_SIZE,
      PREVIEW_DURATION_MS,
    )) as SynthBatchIterator;
    await playSynthBatchStream(batchFn, {
      sourcesRef: previewAudioSourcesRef,
      iteratorRef: previewStreamIteratorRef,
      generationRef: previewPlaybackGenerationRef,
      maxDurationSeconds: 0.6,
      trackTransportState: false,
      debugLabel: `preview:${trigger}`,
      // A 0.6s audition is already bounded by maxDurationSeconds; throttling
      // it would only add latency to the interaction it exists to make feel
      // immediate.
      renderWindow: null,
    });
  } catch (err) {
    console.warn('[AUDITION] selection preview playback failed', { trigger, err });
    await stopPreviewAudio({ awaitCancel: true });
  }
}
