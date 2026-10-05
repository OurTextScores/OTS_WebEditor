import type { PlaybackTimeline } from '../webmscore-loader';
import { releaseScheduledSource } from '../playback-window';
import type { TransportClockAnchor } from './transport-clock';

/**
 * A metronome for the transport (docs/private/MUSE_SOUNDS_INTEGRATION_ROADMAP.md, Appendix C.4.2). The beat times come
 * from the engine's playback timeline, so repeats, jumps, pickups and tempo changes are already in them; the clicks are
 * scheduled on the same Web Audio clock as the music, from the same anchor, so they cannot drift against it.
 */
export interface Click {
  /** Score time in milliseconds; negative for a count-in before the music. */
  timeMs: number;
  /** A measure's first beat. */
  accent: boolean;
}

/** Every beat of the performance, in order. Empty when the engine gave no beats (an older build). */
export function clicksFromTimeline(timeline: PlaybackTimeline | null): Click[] {
  const clicks: Click[] = [];
  for (const occurrence of timeline?.occurrences ?? []) {
    (occurrence.beatsMs ?? []).forEach((timeMs, index) => {
      clicks.push({ timeMs, accent: index === 0 && occurrence.downbeat !== false });
    });
  }
  return clicks.sort((left, right) => left.timeMs - right.timeMs);
}

const FALLBACK_BEATS = 4;
const FALLBACK_BEAT_MS = 500;

/**
 * The count-in before starting at `startMs`: one measure of the meter and tempo there, clicks ending a beat before the
 * music. The beat length is that of the beat the music starts in (the next beat's spacing), so a ritardando or a fast
 * section is counted at its own pace.
 */
export function countInClicks(timeline: PlaybackTimeline | null, startMs: number): Click[] {
  const occurrences = timeline?.occurrences ?? [];
  const containing =
    occurrences.find((occurrence) => occurrence.startMs <= startMs && startMs < occurrence.endMs) ??
    occurrences.find((occurrence) => occurrence.startMs >= startMs) ??
    null;
  // The spacing of the beat the music starts on, taken across the whole performance: a one-beat pickup has no
  // neighbour of its own, but the beat after it (in the next measure) says what the tempo is.
  const all = clicksFromTimeline(timeline);
  const upcoming = all.findIndex((click) => click.timeMs >= startMs);
  const spacing =
    upcoming >= 0 && all[upcoming + 1] !== undefined
      ? all[upcoming + 1].timeMs - all[upcoming].timeMs
      : all.length > 1
        ? all[all.length - 1].timeMs - all[all.length - 2].timeMs
        : FALLBACK_BEAT_MS;
  const count = containing?.beatsPerMeasure ?? FALLBACK_BEATS;
  const interval = spacing > 0 ? spacing : FALLBACK_BEAT_MS;
  return Array.from({ length: count }, (_, index) => ({
    timeMs: startMs - (count - index) * interval,
    accent: index === 0,
  }));
}

/** The length of a count-in in seconds (what the music is delayed by). */
export function countInSeconds(clicks: readonly Click[], startMs: number): number {
  return clicks.length ? Math.max(0, startMs - clicks[0].timeMs) / 1000 : 0;
}

/** A short decaying sine: the click's sound. Created once per context. */
function clickBuffer(context: AudioContext, frequency: number): AudioBuffer {
  const frames = Math.max(1, Math.round(context.sampleRate * 0.03));
  const buffer = context.createBuffer(1, frames, context.sampleRate);
  const data = new Float32Array(frames);
  for (let frame = 0; frame < frames; frame += 1) {
    data[frame] =
      Math.sin((2 * Math.PI * frequency * frame) / context.sampleRate) *
      Math.exp((-frame / frames) * 7);
  }
  buffer.copyToChannel(data, 0);
  return buffer;
}

export interface ClickSchedulerOptions {
  /** Where clicks go (the master gain, so the volume control applies to them). */
  destination?: AudioNode;
  /** 0 to 1. */
  level?: number;
  /** How far ahead of the clock clicks are scheduled. Long enough to survive a throttled background-tab timer. */
  aheadSeconds?: number;
  tickMs?: number;
}

/**
 * Schedules clicks into the Web Audio timeline with a look-ahead loop (the pattern Viritura's note scheduler uses): each
 * tick schedules every click that falls within `aheadSeconds` of the audio clock. Starting needs the clock anchor the
 * music stream reports, so the clicks and the music share one timeline; stopping cancels what is scheduled.
 */
export class ClickScheduler {
  private clicks: readonly Click[] = [];
  private next = 0;
  private anchor: TransportClockAnchor | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private readonly sources: AudioBufferSourceNode[] = [];
  private buffers: { accent: AudioBuffer; beat: AudioBuffer } | null = null;
  private gain: GainNode | null = null;

  constructor(
    private readonly context: AudioContext,
    private readonly options: ClickSchedulerOptions = {},
  ) {}

  get running(): boolean {
    return this.anchor !== null;
  }

  /** Begin from `fromMs`: clicks earlier than that are skipped unless they are part of the count-in (`includeFromMs`). */
  start(anchor: TransportClockAnchor, clicks: readonly Click[], includeFromMs: number): void {
    this.stop();
    this.anchor = anchor;
    this.clicks = clicks;
    this.next = clicks.findIndex((click) => click.timeMs >= includeFromMs);
    if (this.next < 0) this.next = clicks.length;
    this.buffers ??= {
      accent: clickBuffer(this.context, 1_400),
      beat: clickBuffer(this.context, 1_000),
    };
    if (!this.gain) {
      this.gain = this.context.createGain();
      this.gain.connect(this.options.destination ?? this.context.destination);
    }
    this.gain.gain.value = this.options.level ?? 0.5;
    this.tick();
  }

  setLevel(level: number): void {
    if (this.gain) this.gain.gain.value = level;
  }

  /** Cancels every scheduled click and the loop. */
  stop(): void {
    this.anchor = null;
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
    for (const source of this.sources.splice(0)) {
      try {
        source.stop();
      } catch {
        // Already ended.
      }
      try {
        source.disconnect();
      } catch {
        // Already disconnected.
      }
    }
  }

  private tick = (): void => {
    const anchor = this.anchor;
    if (!anchor || !this.buffers || !this.gain) return;
    const horizon = this.context.currentTime + (this.options.aheadSeconds ?? 1.5);
    while (this.next < this.clicks.length) {
      const click = this.clicks[this.next];
      const at = anchor.contextTime + (click.timeMs / 1000 - anchor.scoreTimeSeconds);
      if (at > horizon) break;
      this.next += 1;
      // A click already in the past (a seek into the middle of a beat) is dropped, not played late.
      if (at < this.context.currentTime) continue;
      const source = this.context.createBufferSource();
      source.buffer = click.accent ? this.buffers.accent : this.buffers.beat;
      source.connect(this.gain);
      source.onended = () => releaseScheduledSource(this.sources, source);
      source.start(at);
      this.sources.push(source);
    }
    if (this.next < this.clicks.length) {
      this.timer = setTimeout(this.tick, this.options.tickMs ?? 100);
    }
  };
}

/** What to schedule for one start of playback. */
export interface ClickPlan {
  /** The count-in followed by the beats from `startMs` on, in order. */
  clicks: Click[];
  /** Where the scheduler begins: the count-in's first click, else the start. */
  fromMs: number;
  /** How long the music is delayed by the count-in. */
  leadInSeconds: number;
}

/**
 * The clicks for a performance started at `startMs`, or null when the metronome is off or the engine gave no beats.
 * The beats before the start are not played; a count-in, when asked for, comes before it.
 */
export function planClicks(
  timeline: PlaybackTimeline | null,
  startMs: number,
  options: { enabled: boolean; countIn: boolean },
): ClickPlan | null {
  if (!options.enabled) return null;
  const all = clicksFromTimeline(timeline);
  if (all.length === 0) return null;
  const countIn = options.countIn ? countInClicks(timeline, startMs) : [];
  return {
    clicks: [...countIn, ...all.filter((click) => click.timeMs >= startMs)],
    fromMs: countIn[0]?.timeMs ?? startMs,
    leadInSeconds: countInSeconds(countIn, startMs),
  };
}
