'use client';

import { useEffect, useRef, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Minus,
  Pause,
  Play,
  Plus,
  RotateCcw,
  ScanLine,
  Volume2,
} from 'lucide-react';
import { formatPlaybackTime } from '@/lib/playback/timeline';

type Props = {
  state: 'idle' | 'preparing' | 'playing' | 'paused' | 'ended' | 'unavailable';
  disabled?: boolean;
  positionMs: number;
  startPositionMs?: number;
  durationMs: number;
  currentMeasureNumber?: number;
  volume: number;
  currentPage: number;
  pageCount: number;
  hasMorePages?: boolean;
  follow: boolean;
  highlightMode: 'measure' | 'note';
  highlightBusy?: boolean;
  clickEnabled: boolean;
  countInEnabled: boolean;
  onTogglePlayPause: () => void;
  onStop: () => void;
  onSeek: (positionMs: number) => void;
  onVolume: (volume: number) => void;
  onPreviousPage: () => void;
  onNextPage: () => void;
  onZoomOut: () => void;
  onFitWidth: () => void;
  onZoomIn: () => void;
  onToggleFollow: () => void;
  onToggleHighlight: () => void;
  onToggleClick: () => void;
  onToggleCountIn: () => void;
};

const controlClass =
  'inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[var(--player-border)] bg-[var(--player-control)] text-[var(--player-text)] transition hover:bg-[var(--player-control-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 disabled:cursor-not-allowed disabled:opacity-40';

/** One labelled on/off control of the transport bar. */
function PlayerToggle({
  label,
  title,
  ariaLabel,
  pressed,
  busy,
  disabled,
  compact,
  onToggle,
}: {
  label: string;
  title: string;
  ariaLabel: string;
  pressed: boolean;
  busy?: boolean;
  disabled?: boolean;
  compact?: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      className={`${controlClass} ${pressed ? '!border-cyan-500 !text-cyan-600' : ''}`}
      onClick={onToggle}
      disabled={Boolean(disabled)}
      title={title}
      aria-label={ariaLabel}
      aria-pressed={pressed}
    >
      <span className={compact ? 'text-caption font-semibold' : 'font-semibold'}>
        {busy && pressed ? '…' : label}
      </span>
    </button>
  );
}

/** The note-highlight, click and count-in toggles (in the bar and in the small-screen menu). */
function PlayerToggles({ compact, ...props }: Props & { compact?: boolean }) {
  const noteMode = props.highlightMode === 'note';
  return (
    <>
      <PlayerToggle
        label="Note"
        title={noteMode ? 'Highlight measures' : 'Highlight notes'}
        ariaLabel="Note highlighting"
        pressed={noteMode}
        busy={props.highlightBusy}
        disabled={props.disabled}
        compact={compact}
        onToggle={props.onToggleHighlight}
      />
      <PlayerToggle
        label="Click"
        title={props.clickEnabled ? 'Turn the metronome off' : 'Turn the metronome on'}
        ariaLabel="Metronome"
        pressed={props.clickEnabled}
        disabled={props.disabled}
        compact={compact}
        onToggle={props.onToggleClick}
      />
      <PlayerToggle
        label="Count"
        title={props.countInEnabled ? 'No count-in' : 'Count in one measure before playing'}
        ariaLabel="Count-in"
        pressed={props.countInEnabled}
        disabled={props.disabled || !props.clickEnabled}
        compact={compact}
        onToggle={props.onToggleCountIn}
      />
    </>
  );
}

export default function PlayerControls(props: Props) {
  const [scrubbing, setScrubbing] = useState(false);
  const [draftPosition, setDraftPosition] = useState(props.positionMs);
  const scrubbingRef = useRef(false);
  const keyboardSeekTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const commitSeek = (position = draftPosition) => {
    if (!scrubbingRef.current) return;
    scrubbingRef.current = false;
    setScrubbing(false);
    setDraftPosition(position);
    props.onSeek(position);
  };
  const scheduleKeyboardSeek = (position: number) => {
    if (keyboardSeekTimerRef.current) clearTimeout(keyboardSeekTimerRef.current);
    keyboardSeekTimerRef.current = setTimeout(() => {
      keyboardSeekTimerRef.current = null;
      props.onSeek(position);
    }, 180);
  };
  useEffect(
    () => () => {
      if (keyboardSeekTimerRef.current) clearTimeout(keyboardSeekTimerRef.current);
    },
    [],
  );
  const showPause = props.state === 'playing';
  const playLabel =
    props.state === 'ended'
      ? 'Replay'
      : props.state === 'unavailable'
        ? 'Retry playback'
        : showPause
          ? 'Pause'
          : 'Play';
  const transportDisabled = Boolean(props.disabled) || props.state === 'preparing';
  const displayedPosition = scrubbing ? draftPosition : props.positionMs;

  return (
    <div className="sticky bottom-0 z-20 border-t border-[var(--player-border)] bg-[var(--player-panel)] px-3 py-3 shadow-[0_-8px_24px_rgba(15,23,42,0.08)] backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center gap-2">
        <button
          type="button"
          className={controlClass}
          onClick={props.onStop}
          disabled={transportDisabled || props.positionMs <= (props.startPositionMs ?? 0)}
          title="Stop and rewind"
          aria-label="Stop and rewind"
        >
          <RotateCcw size={18} aria-hidden="true" />
        </button>
        <button
          type="button"
          data-testid="player-play"
          className={`${controlClass} !border-cyan-600 !bg-cyan-600 !text-white hover:!bg-cyan-700`}
          onClick={props.onTogglePlayPause}
          disabled={transportDisabled}
          title={playLabel}
          aria-label={playLabel}
        >
          {showPause ? (
            <Pause size={20} aria-hidden="true" />
          ) : (
            <Play size={20} aria-hidden="true" />
          )}
        </button>
        <span className="w-12 shrink-0 text-right font-mono text-xs tabular-nums text-[var(--player-muted)]">
          {formatPlaybackTime(displayedPosition)}
        </span>
        <input
          data-testid="player-seek"
          className="min-w-0 flex-1 accent-cyan-600"
          type="range"
          min={0}
          max={Math.max(0, props.durationMs)}
          step={100}
          value={Math.min(displayedPosition, Math.max(0, props.durationMs))}
          disabled={Boolean(props.disabled) || props.durationMs <= 0 || props.state === 'preparing'}
          aria-label="Playback position"
          aria-valuetext={`${formatPlaybackTime(displayedPosition)} of ${formatPlaybackTime(props.durationMs)}${props.currentMeasureNumber ? `, measure ${props.currentMeasureNumber}` : ''}`}
          onPointerDown={(event) => {
            if (keyboardSeekTimerRef.current) clearTimeout(keyboardSeekTimerRef.current);
            scrubbingRef.current = true;
            setDraftPosition(props.positionMs);
            setScrubbing(true);
            event.currentTarget.setPointerCapture?.(event.pointerId);
          }}
          onChange={(event) => {
            const value = Number(event.currentTarget.value);
            setDraftPosition(value);
            if (!scrubbingRef.current) scheduleKeyboardSeek(value);
          }}
          onPointerUp={(event) => commitSeek(Number(event.currentTarget.value))}
          onPointerCancel={(event) => commitSeek(Number(event.currentTarget.value))}
          onLostPointerCapture={(event) => commitSeek(Number(event.currentTarget.value))}
        />
        <span className="w-12 shrink-0 font-mono text-xs tabular-nums text-[var(--player-muted)]">
          {formatPlaybackTime(props.durationMs)}
        </span>
        <label
          className="hidden items-center gap-1 text-[var(--player-muted)] sm:flex"
          title="Volume"
        >
          <Volume2 size={17} aria-hidden="true" />
          <input
            aria-label="Volume"
            className="w-20 accent-cyan-600"
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={props.volume}
            onChange={(event) => props.onVolume(Number(event.currentTarget.value))}
          />
        </label>
      </div>

      <div className="mx-auto mt-2 flex max-w-6xl items-center justify-between gap-2 text-xs text-[var(--player-muted)]">
        <div className="flex items-center gap-1">
          <button
            type="button"
            className={controlClass}
            onClick={props.onPreviousPage}
            disabled={props.currentPage <= 0}
            title="Previous page"
            aria-label="Previous page"
          >
            <ChevronLeft size={18} aria-hidden="true" />
          </button>
          <span className="min-w-20 text-center tabular-nums" aria-live="polite">
            Page {props.currentPage + 1} of {props.pageCount}
            {props.hasMorePages ? '+' : ''}
          </span>
          <button
            type="button"
            className={controlClass}
            onClick={props.onNextPage}
            disabled={props.currentPage >= props.pageCount - 1 && !props.hasMorePages}
            title="Next page"
            aria-label="Next page"
          >
            <ChevronRight size={18} aria-hidden="true" />
          </button>
        </div>
        <div className="hidden items-center gap-1 sm:flex">
          <button
            type="button"
            className={controlClass}
            onClick={props.onZoomOut}
            title="Zoom out"
            aria-label="Zoom out"
          >
            <Minus size={17} aria-hidden="true" />
          </button>
          <button
            type="button"
            className={controlClass}
            onClick={props.onFitWidth}
            title="Fit width"
            aria-label="Fit width"
          >
            <ScanLine size={17} aria-hidden="true" />
          </button>
          <button
            type="button"
            className={controlClass}
            onClick={props.onZoomIn}
            title="Zoom in"
            aria-label="Zoom in"
          >
            <Plus size={17} aria-hidden="true" />
          </button>
          <button
            type="button"
            className={`${controlClass} ${props.follow ? '!border-cyan-500 !text-cyan-600' : ''}`}
            onClick={props.onToggleFollow}
            title={`Follow score ${props.follow ? 'on' : 'off'}`}
            aria-label="Follow score"
            aria-pressed={props.follow}
          >
            <span className="font-semibold">Follow</span>
          </button>
          <PlayerToggles {...props} />
        </div>
        <details className="group relative sm:hidden">
          <summary
            className={`${controlClass} cursor-pointer list-none [&::-webkit-details-marker]:hidden`}
            aria-label="More player controls"
          >
            <span className="text-xs font-semibold">More</span>
          </summary>
          <div className="absolute bottom-12 right-0 z-30 flex w-64 flex-col gap-3 rounded-lg border border-[var(--player-border)] bg-[var(--player-panel)] p-3 text-[var(--player-text)] shadow-raised">
            <label className="flex min-h-11 items-center gap-2" title="Volume">
              <Volume2 size={18} aria-hidden="true" />
              <span>Volume</span>
              <input
                aria-label="Volume"
                className="min-w-0 flex-1 accent-cyan-600"
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={props.volume}
                onChange={(event) => props.onVolume(Number(event.currentTarget.value))}
              />
            </label>
            <div className="flex items-center justify-between gap-1">
              <button
                type="button"
                className={controlClass}
                onClick={props.onZoomOut}
                title="Zoom out"
                aria-label="Zoom out"
              >
                <Minus size={17} aria-hidden="true" />
              </button>
              <button
                type="button"
                className={controlClass}
                onClick={props.onFitWidth}
                title="Fit width"
                aria-label="Fit width"
              >
                <ScanLine size={17} aria-hidden="true" />
              </button>
              <button
                type="button"
                className={controlClass}
                onClick={props.onZoomIn}
                title="Zoom in"
                aria-label="Zoom in"
              >
                <Plus size={17} aria-hidden="true" />
              </button>
              <button
                type="button"
                className={`${controlClass} ${props.follow ? '!border-cyan-500 !text-cyan-600' : ''}`}
                onClick={props.onToggleFollow}
                title={`Follow score ${props.follow ? 'on' : 'off'}`}
                aria-label="Follow score"
                aria-pressed={props.follow}
              >
                <span className="text-caption font-semibold">Follow</span>
              </button>
              <PlayerToggles {...props} compact />
            </div>
          </div>
        </details>
      </div>
    </div>
  );
}
