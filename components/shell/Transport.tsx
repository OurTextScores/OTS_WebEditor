'use client';

import { LocateFixed, Metronome, Pause, Play, Square } from 'lucide-react';
import React, { useSyncExternalStore } from 'react';
import { defaultCommandRegistry, type CommandRegistry } from '../../lib/commands/registry';
import { useCommandContext } from '../../lib/commands/useRegisterCommands';
import { useClickPreferences } from '../../lib/playback/use-click-preferences';
import { useFollowState } from '../../lib/playback/use-follow-state';
import { Button } from '../ui/Button';
import { invokeCommand } from './invokeCommand';
import { getShellUiState, subscribeToShellUi } from './shellStore';

/**
 * Play, stop and play-from-selection in the header (SHELL_REDESIGN_DESIGN §4.1). Behaviour
 * and availability come from the `playback.*` commands, so this matches the ribbon section
 * it replaces: the toggle reads Play, Pause or Resume from the transport state.
 */
export function Transport({ registry = defaultCommandRegistry }: { registry?: CommandRegistry }) {
  const { view } = useSyncExternalStore(subscribeToShellUi, getShellUiState, getShellUiState);
  const ctx = useCommandContext(registry);
  const click = useClickPreferences();
  const follow = useFollowState();
  const offPage = follow.active && follow.playbackPage !== null;
  const showPause = view.isPlaying && !view.isPaused;
  const label = showPause ? 'Pause' : view.isPaused ? 'Resume' : 'Play';
  const run = (id: string) => () => void invokeCommand(id, undefined, registry);

  return (
    <div role="group" aria-label="Playback" className="flex items-center gap-1">
      <Button
        data-testid="btn-play"
        variant="primary"
        size="sm"
        title={label}
        aria-label={label}
        // `audioBusy` is not in the command context, so the header watches it itself.
        disabled={
          !registry.isEnabled('playback.playPause', ctx) ||
          (view.audioBusy && !view.isPlaying && !view.isPaused)
        }
        onClick={run('playback.playPause')}
      >
        {showPause ? <Pause size={14} aria-hidden="true" /> : <Play size={14} aria-hidden="true" />}
      </Button>
      <Button
        data-testid="btn-stop"
        variant="outline"
        size="sm"
        title="Stop and rewind"
        aria-label="Stop"
        disabled={!registry.isEnabled('playback.stop', ctx)}
        onClick={run('playback.stop')}
      >
        <Square size={14} aria-hidden="true" />
      </Button>
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
      <Button
        data-testid="btn-follow-playback"
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
      {showPause && follow.tracking !== null && (
        <span
          data-testid="playback-tracking-hint"
          className="hidden text-caption text-slate-500 xl:inline"
        >
          {follow.tracking === 'unavailable' ? 'Tracking unavailable' : 'Click a note to seek'}
        </span>
      )}
    </div>
  );
}
