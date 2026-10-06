import type { AudioBlock } from './audioFeed';
import type { Compositor } from './compositor';
import type { FramePlan, FrameState } from './framePlan';
import type { VideoSink } from './sink';

/** Makes pages available to the compositor, and lets go of the ones no longer needed. */
export interface PageProvider {
  /** Resolves when `page` can be read by the compositor. */
  ensure(page: number): Promise<void>;
  /** Starts producing `page` without waiting for it, so the next page turn does not stall the frame loop. */
  prefetch(page: number): void;
  /** Frees every page not in `keep`. */
  release(keep: readonly number[]): void;
}

export interface ExportProgress {
  readonly framesDone: number;
  readonly frameCount: number;
}

export interface ExportJob {
  readonly plan: FramePlan;
  readonly compositor: Compositor;
  readonly pages: PageProvider;
  readonly sink: VideoSink;
  /** The score's audio, if the video has a sound track. */
  readonly audio?: AsyncGenerator<AudioBlock>;
  /** Added to every audio timestamp: the silent lead-in the plan already includes. */
  readonly leadInSeconds?: number;
  readonly signal?: AbortSignal;
  readonly onProgress?: (progress: ExportProgress) => void;
}

export class ExportCancelled extends Error {
  constructor() {
    super('Export cancelled');
    this.name = 'ExportCancelled';
  }
}

/** What a frame looks like, as a string: equal keys mean identical pictures (most frames of a score repeat the last). */
export const frameKey = (state: FrameState): string =>
  [
    state.page,
    state.scrollY,
    state.turn ? `${state.turn.fromPage}:${state.turn.fromScrollY}:${state.turn.progress}` : '-',
    state.active ? `${state.active.id}:${state.active.page}:${state.activeIsNote}` : '-',
  ].join('|');

/** How far ahead of the picture the audio is kept, in seconds, so the muxer never waits on a track. */
const AUDIO_LEAD_SECONDS = 1;
const PROGRESS_EVERY_FRAMES = 10;

/**
 * Runs the export: every frame in time order (frame i is time i / fps), then the audio alongside it, then the file.
 * Frames come from the plan, so nothing depends on how fast the machine is; cancelling (the signal) or any failure
 * abandons the file and releases the encoders.
 */
export async function exportVideo(job: ExportJob): Promise<Blob | null> {
  const { plan, compositor, pages, sink, audio, signal, onProgress } = job;
  const lead = job.leadInSeconds ?? 0;
  let audioEnd = 0;
  let previousKey: string | null = null;
  let audioDone = !audio;

  const pumpAudio = async (untilSeconds: number) => {
    while (audio && !audioDone && audioEnd < untilSeconds) {
      const next = await audio.next();
      if (next.done) {
        audioDone = true;
        return;
      }
      await sink.addAudio(next.value, lead);
      audioEnd = next.value.startSeconds + next.value.frames / next.value.sampleRate + lead;
    }
  };

  try {
    const frameSeconds = 1 / plan.fps;
    for (let index = 0; index < plan.frameCount; index += 1) {
      if (signal?.aborted) throw new ExportCancelled();
      const state = plan.at(index * frameSeconds * 1000);
      const needed = [state.page, ...(state.turn ? [state.turn.fromPage] : [])];
      for (const page of needed) await pages.ensure(page);
      const upcoming = plan.pagesInOrder[plan.pagesInOrder.indexOf(state.page) + 1];
      if (upcoming !== undefined) pages.prefetch(upcoming);
      pages.release(upcoming !== undefined ? [...needed, upcoming] : needed);

      // A frame the same as the last needs no repainting, and a sink that reads pixels back can reuse them.
      const key = frameKey(state);
      const unchanged = key === previousKey;
      if (!unchanged) compositor.draw(state);
      previousKey = key;
      await sink.addFrame(index * frameSeconds, frameSeconds, unchanged);
      await pumpAudio(index * frameSeconds + AUDIO_LEAD_SECONDS);
      if ((index + 1) % PROGRESS_EVERY_FRAMES === 0 || index + 1 === plan.frameCount) {
        onProgress?.({ framesDone: index + 1, frameCount: plan.frameCount });
      }
    }
    await pumpAudio(Infinity);
    if (signal?.aborted) throw new ExportCancelled();
    return await sink.finish();
  } catch (error) {
    await sink.cancel().catch(() => undefined);
    await audio?.return(undefined).catch(() => undefined);
    throw error;
  }
}
