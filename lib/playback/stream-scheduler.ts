import type { MutableRefObject } from 'react';
import type { SynthAudioBatchIterator } from '../webmscore-loader';
import { releaseScheduledSource, renderWindowDelayMs, type RenderWindow } from '../playback-window';

export type StreamPlaybackTarget = {
  sourcesRef: MutableRefObject<AudioBufferSourceNode[]>;
  iteratorRef: MutableRefObject<SynthAudioBatchIterator | null>;
  generationRef: MutableRefObject<number>;
};

export type StreamPlaybackOptions = StreamPlaybackTarget & {
  maxDurationSeconds?: number;
  debugLabel: string;
  prerollSeconds?: number;
  startupBufferSeconds?: number;
  minStartupBatches?: number;
  /** Merge adjacent PCM blocks up to this duration. Disabled by default. */
  mergeWindowSeconds?: number;
  /** Bounds render-ahead. null disables throttling for short one-shot clips. */
  renderWindow?: RenderWindow | null;
  onPlayingChange?: (playing: boolean) => void;
  /** Signals a safe render-ahead idle window for lower-priority worker work. */
  onRenderWindowIdleChange?: (idle: boolean) => void;
  /** Called once the Web Audio clock is anchored to the score timeline. */
  onClockAnchor?: (anchor: { contextTime: number; scoreTimeSeconds: number }) => void;
  /** Called after the final scheduled source naturally finishes. */
  onEnded?: () => void;
  /** Optional gain/effects node. Defaults to the AudioContext destination. */
  destination?: AudioNode;
};

export async function stopSynthStream(
  sourcesRef: MutableRefObject<AudioBufferSourceNode[]>,
  iteratorRef: MutableRefObject<SynthAudioBatchIterator | null>,
  options?: { awaitCancel?: boolean },
) {
  sourcesRef.current.forEach((source) => {
    try {
      source.stop();
    } catch {
      // Already ended or stopped.
    }
    try {
      source.disconnect();
    } catch {
      // Already disconnected.
    }
  });
  sourcesRef.current = [];

  const iterator = iteratorRef.current;
  iteratorRef.current = null;
  if (!iterator) return;

  const cancellation = iterator(true).catch(() => {
    /* cancellation is best effort */
  });
  if (options?.awaitCancel) {
    await cancellation;
  }
}

/**
 * Invalidates an active/pending stream before cancellation crosses an async
 * boundary. Consumers should use this for stop, seek, score replacement, and
 * unmount so a late iterator result cannot schedule audio after cancellation.
 */
export async function cancelSynthStream(
  target: StreamPlaybackTarget,
  options?: { awaitCancel?: boolean },
) {
  target.generationRef.current += 1;
  await stopSynthStream(target.sourcesRef, target.iteratorRef, options);
}

/**
 * Pulls de-interleaved Float32 PCM from webmscore and schedules it on one AudioContext.
 *
 * The render window limits production ahead of the playhead; per-source `onended`
 * release limits retention behind it. Neither limit is sufficient on its own.
 */
export async function scheduleSynthBatchStream(
  batchFn: SynthAudioBatchIterator,
  audioContext: AudioContext,
  options: StreamPlaybackOptions,
) {
  const generation = ++options.generationRef.current;
  options.iteratorRef.current = batchFn;
  const prerollSeconds = options.prerollSeconds ?? 0.015;
  const startupBufferSeconds = options.startupBufferSeconds ?? 0;
  const minStartupBatches = options.minStartupBatches ?? 1;
  let baseTime: number | null = null;
  let streamStartTimeSeconds: number | null = null;
  let lastSource: AudioBufferSourceNode | null = null;
  let startedAny = false;
  let batchCount = 0;
  let bufferedUntilSeconds = 0;
  let pendingChunks: { buffer: AudioBuffer; relativeChunkStart: number }[] = [];
  const mergeWindowSeconds = options.mergeWindowSeconds ?? 0;
  const mergeTargetFrames =
    mergeWindowSeconds > 0
      ? Math.max(512, Math.round(audioContext.sampleRate * mergeWindowSeconds))
      : 0;
  const contiguousToleranceSeconds = 1 / audioContext.sampleRate;
  let mergedChunkState: {
    relativeChunkStart: number;
    lastRelativeChunkEnd: number;
    channels: number;
    totalFrames: number;
    channelSlices: Float32Array[][];
  } | null = null;

  const scheduleChunk = (buffer: AudioBuffer, relativeChunkStart: number) => {
    if (options.generationRef.current !== generation) return;
    if (baseTime === null) {
      baseTime = audioContext.currentTime + prerollSeconds;
      options.onClockAnchor?.({
        contextTime: baseTime,
        scoreTimeSeconds: streamStartTimeSeconds ?? 0,
      });
    }
    const source = audioContext.createBufferSource();
    source.buffer = buffer;
    source.connect(options.destination ?? audioContext.destination);
    source.start(baseTime + relativeChunkStart);
    source.onended = () => {
      releaseScheduledSource(options.sourcesRef.current, source);
    };
    options.sourcesRef.current.push(source);
    lastSource = source;
    if (!startedAny) {
      startedAny = true;
      options.onPlayingChange?.(true);
    }
  };

  const flushPendingChunks = () => {
    for (const pending of pendingChunks) {
      scheduleChunk(pending.buffer, pending.relativeChunkStart);
    }
    pendingChunks = [];
  };

  const enqueueBuffer = (
    buffer: AudioBuffer,
    relativeChunkStart: number,
    hitDoneForChunk: boolean,
  ) => {
    if (baseTime === null && batchCount < minStartupBatches && !hitDoneForChunk) {
      pendingChunks.push({ buffer, relativeChunkStart });
    } else if (
      baseTime === null &&
      bufferedUntilSeconds < startupBufferSeconds &&
      !hitDoneForChunk
    ) {
      pendingChunks.push({ buffer, relativeChunkStart });
    } else {
      if (baseTime === null) flushPendingChunks();
      scheduleChunk(buffer, relativeChunkStart);
    }
  };

  const flushMergedChunk = (hitDoneForChunk: boolean) => {
    if (!mergedChunkState) return;
    const { channels, totalFrames, channelSlices, relativeChunkStart } = mergedChunkState;
    const buffer = audioContext.createBuffer(channels, totalFrames, audioContext.sampleRate);
    for (let channel = 0; channel < channels; channel += 1) {
      const merged = new Float32Array(totalFrames);
      let offset = 0;
      for (const slice of channelSlices[channel]) {
        merged.set(slice, offset);
        offset += slice.length;
      }
      buffer.copyToChannel(merged, channel);
    }
    mergedChunkState = null;
    enqueueBuffer(buffer, relativeChunkStart, hitDoneForChunk);
  };

  while (options.generationRef.current === generation) {
    if (options.renderWindow && baseTime !== null) {
      let delayMs = renderWindowDelayMs(
        baseTime + bufferedUntilSeconds - audioContext.currentTime,
        options.renderWindow,
      );
      if (delayMs > 0) options.onRenderWindowIdleChange?.(true);
      while (delayMs > 0 && options.generationRef.current === generation) {
        await new Promise<void>((resolve) => {
          setTimeout(resolve, Math.min(delayMs, 1000));
        });
        const aheadSeconds = baseTime + bufferedUntilSeconds - audioContext.currentTime;
        delayMs = renderWindowDelayMs(aheadSeconds, options.renderWindow, true);
      }
      if (options.generationRef.current !== generation) break;
      options.onRenderWindowIdleChange?.(false);
    }

    const batch = await batchFn(false);
    // Iterator calls cross the cancellation boundary. A superseded run no
    // longer owns any of the shared refs and must not schedule or clean up.
    if (options.generationRef.current !== generation) return;
    batchCount += 1;
    if (!Array.isArray(batch) || batch.length === 0) break;

    let hitDone = false;
    for (const result of batch) {
      if (!result) continue;
      const absoluteChunkStart = Number.isFinite(result.startTime) ? Number(result.startTime) : 0;
      if (streamStartTimeSeconds === null) streamStartTimeSeconds = absoluteChunkStart;
      const relativeChunkStart = Math.max(0, absoluteChunkStart - streamStartTimeSeconds);

      if (result.done) hitDone = true;
      const relativeChunkEnd =
        typeof result.endTime === 'number'
          ? Math.max(0, result.endTime - streamStartTimeSeconds)
          : null;
      if (relativeChunkEnd !== null && relativeChunkEnd > bufferedUntilSeconds) {
        bufferedUntilSeconds = relativeChunkEnd;
      }
      if (
        options.maxDurationSeconds &&
        relativeChunkEnd !== null &&
        relativeChunkEnd >= options.maxDurationSeconds
      ) {
        hitDone = true;
      }

      const floats = new Float32Array(
        result.chunk.buffer,
        result.chunk.byteOffset,
        result.chunk.byteLength / 4,
      );
      const framesPerChannel = 512;
      let channels = Math.floor(floats.length / framesPerChannel);
      if (!Number.isInteger(channels) || channels < 1) channels = 1;
      if (channels > 2) channels = 2;

      const channelSlices: Float32Array[] = [];
      for (let channel = 0; channel < channels; channel += 1) {
        const start = channel * framesPerChannel;
        channelSlices.push(Float32Array.from(floats.subarray(start, start + framesPerChannel)));
      }

      const shouldMerge = mergeTargetFrames > 0 && relativeChunkEnd !== null && !hitDone;
      if (shouldMerge) {
        const canAppend =
          mergedChunkState &&
          mergedChunkState.channels === channels &&
          Math.abs(relativeChunkStart - mergedChunkState.lastRelativeChunkEnd) <=
            contiguousToleranceSeconds &&
          mergedChunkState.totalFrames + framesPerChannel <= mergeTargetFrames;
        if (!canAppend && mergedChunkState) flushMergedChunk(false);
        if (!mergedChunkState) {
          mergedChunkState = {
            relativeChunkStart,
            lastRelativeChunkEnd: relativeChunkEnd,
            channels,
            totalFrames: framesPerChannel,
            channelSlices: channelSlices.map((slice) => [slice]),
          };
        } else {
          mergedChunkState.lastRelativeChunkEnd = relativeChunkEnd;
          mergedChunkState.totalFrames += framesPerChannel;
          for (let channel = 0; channel < channels; channel += 1) {
            mergedChunkState.channelSlices[channel].push(channelSlices[channel]);
          }
        }
        if (mergedChunkState.totalFrames >= mergeTargetFrames) flushMergedChunk(false);
      } else {
        if (mergedChunkState) flushMergedChunk(false);
        const buffer = audioContext.createBuffer(
          channels,
          framesPerChannel,
          audioContext.sampleRate,
        );
        for (let channel = 0; channel < channels; channel += 1) {
          buffer.copyToChannel(new Float32Array(channelSlices[channel]), channel);
        }
        enqueueBuffer(buffer, relativeChunkStart, hitDone);
      }

      if (hitDone) break;
    }

    if (hitDone && mergedChunkState) flushMergedChunk(true);
    if (
      baseTime === null &&
      (hitDone || (batchCount >= minStartupBatches && bufferedUntilSeconds >= startupBufferSeconds))
    ) {
      flushPendingChunks();
    }
    if (hitDone) break;
  }

  if (options.generationRef.current !== generation) return;
  if (mergedChunkState) flushMergedChunk(false);
  if (baseTime === null && pendingChunks.length > 0) flushPendingChunks();

  if (!startedAny) {
    if (options.iteratorRef.current === batchFn) options.iteratorRef.current = null;
    options.onPlayingChange?.(false);
    return;
  }

  const finalSource = lastSource as AudioBufferSourceNode | null;
  if (finalSource) {
    finalSource.onended = () => {
      releaseScheduledSource(options.sourcesRef.current, finalSource);
      if (options.generationRef.current !== generation) return;
      options.sourcesRef.current = [];
      if (options.iteratorRef.current === batchFn) options.iteratorRef.current = null;
      options.onPlayingChange?.(false);
      options.onEnded?.();
    };
  }
}
