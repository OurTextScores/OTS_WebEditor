import { scoreTimeAt, type TransportClockAnchor } from './transport-clock';
import type { SynthAudioBatchIterator } from '../webmscore-loader';

export type TransportPhase =
  | 'idle'
  | 'preparing'
  | 'count-in'
  | 'playing'
  | 'paused'
  | 'buffering'
  | 'draining'
  | 'ended'
  | 'cancelling'
  | 'unavailable';

/** Shared ownership before native preparation exists and after PCM has been scheduled. */
export class PlaybackSessionOwner {
  readonly sourcesRef = { current: [] as AudioBufferSourceNode[] };
  readonly iteratorRef = { current: null as SynthAudioBatchIterator | null };
  readonly generationRef = { current: 0 };
  readonly attemptRef = { current: 0 };
  readonly clockRef = { current: null as TransportClockAnchor | null };
  readonly positionRef = { current: 0 };
  readonly phaseRef = { current: 'idle' as TransportPhase };
  underflows = 0;
  private pending = new Set<Promise<unknown>>();

  begin() {
    this.clockRef.current = null;
    return ++this.attemptRef.current;
  }

  isCurrent(attempt: number) {
    return attempt === this.attemptRef.current;
  }

  /** Tracks work that could still touch a score. Retirement drains it before destruction/edit. */
  track<T>(operation: Promise<T>): Promise<T> {
    this.pending.add(operation);
    void operation.finally(() => this.pending.delete(operation)).catch(() => {});
    return operation;
  }

  prepareIterator(
    create: () => SynthAudioBatchIterator | Promise<SynthAudioBatchIterator>,
    isCurrent: () => boolean,
  ) {
    return this.track(
      (async () => {
        if (!isCurrent()) throw new Error('Playback preparation superseded.');
        const iterator = await create();
        if (!isCurrent()) await iterator(true).catch(() => {});
        return iterator;
      })(),
    );
  }

  setBuffering(buffering: boolean, scoreTimeSeconds: number) {
    this.positionRef.current = scoreTimeSeconds * 1000;
    if (buffering) {
      this.underflows += 1;
      this.clockRef.current = null;
      if (this.phaseRef.current !== 'paused') this.phaseRef.current = 'buffering';
    } else if (this.phaseRef.current !== 'paused') {
      this.phaseRef.current = 'playing';
    }
  }

  presentationSeconds(contextTime: number) {
    return scoreTimeAt(this.clockRef.current, contextTime) ?? this.positionRef.current / 1000;
  }

  diagnostics() {
    return {
      pendingOperations: this.pending.size,
      scheduledSources: this.sourcesRef.current.length,
      activeIterator: this.iteratorRef.current !== null,
      underflows: this.underflows,
    };
  }

  async drain() {
    await Promise.allSettled([...this.pending]);
  }
}
