import { type SynthBatchIterator } from './editor-types';
import {
  PREVIEW_DURATION_MS,
  PREVIEW_SYNTH_BATCH_SIZE,
} from './playback-constants';
import type { RenderWindow } from '../../lib/playback-window';
import type { Score, SynthAudioBatchIterator } from '../../lib/webmscore-loader';
import type { EnsureSoundFontLoaded } from './editor-types';
import type React from 'react';

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

  let attempt = ++previewPlaybackGenerationRef.current;
  const isCurrent = () => attempt === previewPlaybackGenerationRef.current;
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

  if (!isCurrent()) return;
  const ok = await ensureSoundFontLoaded(activeScore, { forceRetry: true });
  if (!isCurrent()) return;
  if (!ok) {
    console.warn('[AUDITION] skipped preview: soundfont unavailable', { trigger });
    return;
  }

  const stopping = stopPreviewAudio({ awaitCancel: true });
  attempt = previewPlaybackGenerationRef.current;
  await stopping;
  if (!isCurrent()) return;
  try {
    const batchFn = (await activeScore.synthSelectionPreviewBatch(
      PREVIEW_SYNTH_BATCH_SIZE,
      PREVIEW_DURATION_MS,
    )) as SynthBatchIterator;
    if (!isCurrent()) {
      await batchFn(true).catch(() => {});
      return;
    }
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
    if (previewPlaybackGenerationRef.current !== attempt && previewPlaybackGenerationRef.current !== attempt + 1) return;
    console.warn('[AUDITION] selection preview playback failed', { trigger, err });
    await stopPreviewAudio({ awaitCancel: true });
  }
}
