'use client';

import { Loader2, LocateFixed, Metronome, Pause, Play, Settings2, Square } from 'lucide-react';
import React, { useEffect, useState, useSyncExternalStore } from 'react';
import { defaultCommandRegistry, type CommandRegistry } from '../../lib/commands/registry';
import { useCommandContext } from '../../lib/commands/useRegisterCommands';
import { useClickPreferences } from '../../lib/playback/use-click-preferences';
import { useFollowState } from '../../lib/playback/use-follow-state';
import { formatPlaybackTime } from '../../lib/playback/timeline';
import {
  getTransportTime,
  getTransportTimeOnServer,
  subscribeTransportTime,
} from '../../lib/playback/transport-time';
import { PlayRepeatsToggle, TempoControl } from '../playback-controls';
import { Button } from '../ui/Button';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/Popover';
import { invokeCommand } from './invokeCommand';
import { getShellUiState, subscribeToShellUi } from './shellStore';

/** Fast starts show no text; only a start that takes longer says so. */
const PREPARING_TEXT_DELAY_MS = 250;

function PlaybackTime() {
  const { positionMs, durationMs } = useSyncExternalStore(
    subscribeTransportTime,
    getTransportTime,
    getTransportTimeOnServer,
  );
  return (
    <span
      data-testid="playback-time"
      className="whitespace-nowrap px-1 font-mono text-caption tabular-nums text-slate-600"
    >
      {formatPlaybackTime(positionMs)}
      {durationMs > 0 && (
        <span className="hidden sm:inline"> / {formatPlaybackTime(durationMs)}</span>
      )}
    </span>
  );
}

/** "Preparing audio…" after a short delay, so a fast start does not flash text. */
function usePreparingText(preparing: boolean) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    if (!preparing) return;
    const timer = setTimeout(() => setShow(true), PREPARING_TEXT_DELAY_MS);
    return () => {
      clearTimeout(timer);
      setShow(false);
    };
  }, [preparing]);
  return show && preparing;
}

type Run = (id: string) => () => void;

function FollowButton({ testId, run }: { testId: string; run: Run }) {
  const follow = useFollowState();
  return (
    <Button
      data-testid={testId}
      variant={follow.followEnabled ? 'primary' : 'outline'}
      size="sm"
      title={
        follow.followEnabled
          ? 'Following playback (click to stop turning pages)'
          : 'Not following playback (click to follow)'
      }
      aria-label="Follow playback"
      aria-pressed={follow.followEnabled}
      onClick={run('playback.follow')}
    >
      <LocateFixed size={14} aria-hidden="true" />
    </Button>
  );
}

/** Count-in and SoundFont always; on narrow screens also everything the bar hides. */
function PlaybackSettings({ registry, run }: { registry: CommandRegistry; run: Run }) {
  const ctx = useCommandContext(registry);
  const click = useClickPreferences();
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          data-testid="btn-playback-settings"
          variant="quiet"
          size="sm"
          title="Playback settings"
          aria-label="Playback settings"
        >
          <Settings2 size={14} aria-hidden="true" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-64 space-y-2 text-sm"
        data-testid="playback-settings"
      >
        <div className="flex flex-wrap items-center gap-1 md:hidden">
          <Button
            data-testid="settings-play-from-selection"
            variant="outline"
            size="sm"
            disabled={!registry.isEnabled('playback.playFromSelection', ctx)}
            onClick={run('playback.playFromSelection')}
          >
            Play from selection
          </Button>
          <TempoControl testIdPrefix="settings" />
          <PlayRepeatsToggle testId="settings-play-repeats" />
          <Button
            data-testid="settings-metronome"
            variant={click.enabled ? 'primary' : 'outline'}
            size="sm"
            aria-label="Metronome"
            aria-pressed={click.enabled}
            onClick={run('playback.metronome')}
          >
            <Metronome size={14} aria-hidden="true" />
          </Button>
          <FollowButton testId="settings-follow-playback" run={run} />
        </div>
        <Button
          data-testid="settings-count-in"
          variant={click.countIn ? 'primary' : 'outline'}
          size="sm"
          className="w-full justify-start"
          aria-pressed={click.countIn}
          disabled={!click.enabled}
          title={
            click.enabled ? 'Count in one measure before playing' : 'Turn the metronome on first'
          }
          onClick={run('playback.countIn')}
        >
          Count-in
        </Button>
        <Button
          data-testid="settings-soundfont"
          variant="neutral"
          size="sm"
          className="w-full justify-start"
          disabled={!registry.isEnabled('playback.soundfont', ctx)}
          onClick={run('playback.soundfont')}
        >
          Load SoundFont…
        </Button>
      </PopoverContent>
    </Popover>
  );
}

/** Resume following, "Playing on page N" and the click-to-seek hint, from the follow store. */
function FollowStatus({ showHint, run }: { showHint: boolean; run: Run }) {
  const follow = useFollowState();
  const offPage = follow.active && follow.playbackPage !== null;
  return (
    <>
      {follow.active && follow.followEnabled && follow.suspended && (
        <Button
          data-testid="btn-resume-following"
          variant="outline"
          size="sm"
          title="Resume following playback"
          onClick={run('playback.resumeFollowing')}
        >
          Resume following
        </Button>
      )}
      {offPage && !(follow.followEnabled && !follow.suspended) && (
        <Button
          data-testid="btn-jump-to-playback"
          variant="ghost"
          size="sm"
          title="Show where playback is"
          onClick={run('playback.jumpToPlayback')}
        >
          Playing on page {follow.playbackPage! + 1}
        </Button>
      )}
      {showHint && follow.tracking !== null && (
        <span
          data-testid="playback-tracking-hint"
          className="hidden text-caption text-slate-500 xl:inline"
        >
          {follow.tracking === 'unavailable' ? 'Tracking unavailable' : 'Click a note to seek'}
        </span>
      )}
    </>
  );
}

/**
 * The header transport (SHELL_REDESIGN_DESIGN §4.1, score-following design §5.3): Play/Pause and Stop with the
 * position, then speed, written repeats and following; secondary settings in a popover. On narrow screens only
 * Play, Stop and the position stay in the bar and the rest moves into the popover. Behaviour and availability come
 * from the `playback.*` commands.
 */
export function Transport({ registry = defaultCommandRegistry }: { registry?: CommandRegistry }) {
  const { view } = useSyncExternalStore(subscribeToShellUi, getShellUiState, getShellUiState);
  const ctx = useCommandContext(registry);
  const click = useClickPreferences();
  const showPause = view.isPlaying && !view.isPaused;
  const preparing = view.audioPreparing;
  const preparingText = usePreparingText(preparing);
  // Acknowledge the press at once; it lapses as soon as the transport publishes any new state.
  const transportKey = `${preparing}:${view.isPlaying}:${view.isPaused}`;
  const [pressedKey, setPressedKey] = useState<string | null>(null);
  const [seenKey, setSeenKey] = useState(transportKey);
  if (seenKey !== transportKey) {
    // React's "adjust state while rendering" pattern: any published change ends the acknowledgement.
    setSeenKey(transportKey);
    setPressedKey(null);
  }
  const pressed = pressedKey === transportKey && seenKey === transportKey;
  const starting = preparing || pressed;
  const label = starting
    ? 'Preparing audio'
    : showPause
      ? 'Pause'
      : view.isPaused
        ? 'Resume'
        : 'Play';
  const run = (id: string) => () => void invokeCommand(id, undefined, registry);
  return (
    <div role="group" aria-label="Playback" className="flex min-w-0 items-center gap-1">
      <Button
        data-testid="btn-play"
        variant="primary"
        size="sm"
        title={label}
        aria-label={label}
        aria-busy={starting}
        // `audioBusy` is not in the command context, so the header watches it itself.
        disabled={
          starting ||
          !registry.isEnabled('playback.playPause', ctx) ||
          (view.audioBusy && !view.isPlaying && !view.isPaused)
        }
        onClick={() => {
          if (!view.isPlaying && !view.isPaused) setPressedKey(transportKey);
          run('playback.playPause')();
        }}
      >
        {starting ? (
          <Loader2 size={14} aria-hidden="true" className="motion-safe:animate-spin" />
        ) : showPause ? (
          <Pause size={14} aria-hidden="true" />
        ) : (
          <Play size={14} aria-hidden="true" />
        )}
      </Button>
      <Button
        data-testid="btn-stop"
        variant="outline"
        size="sm"
        title={preparing ? 'Cancel' : 'Stop and rewind'}
        aria-label={preparing ? 'Cancel' : 'Stop'}
        disabled={!registry.isEnabled('playback.stop', ctx)}
        onClick={run('playback.stop')}
      >
        <Square size={14} aria-hidden="true" />
      </Button>
      <PlaybackTime />
      {preparingText && (
        <span
          data-testid="playback-preparing"
          className="whitespace-nowrap text-caption text-slate-500"
        >
          Preparing audio…
        </span>
      )}
      <div className="hidden items-center gap-1 md:flex">
        <Button
          data-testid="btn-play-from-selection"
          variant="outline"
          size="sm"
          title="Play from selection"
          aria-label="Play from selection"
          disabled={!registry.isEnabled('playback.playFromSelection', ctx)}
          onClick={run('playback.playFromSelection')}
        >
          <Play size={14} aria-hidden="true" />
          <span className="ml-1 hidden text-caption lg:inline">Selection</span>
        </Button>
        <TempoControl testIdPrefix="btn" />
        <PlayRepeatsToggle testId="btn-play-repeats" />
        <Button
          data-testid="btn-metronome"
          variant={click.enabled ? 'primary' : 'outline'}
          size="sm"
          title={
            click.enabled ? 'Metronome on (click to turn off)' : 'Metronome off (click to turn on)'
          }
          aria-label="Metronome"
          aria-pressed={click.enabled}
          onClick={run('playback.metronome')}
        >
          <Metronome size={14} aria-hidden="true" />
        </Button>
        <FollowButton testId="btn-follow-playback" run={run} />
      </div>
      <PlaybackSettings registry={registry} run={run} />
      <FollowStatus showHint={showPause} run={run} />
    </div>
  );
}
