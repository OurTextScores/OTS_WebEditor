import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TempoControl } from '@/components/playback-controls';
import { Transport } from '@/components/shell/Transport';
import {
  EMPTY_SHELL_VIEW,
  resetShellUiForTests,
  setShellView,
} from '@/components/shell/shellStore';
import { CommandRegistry, DEFAULT_COMMAND_CONTEXT } from '@/lib/commands/registry';
import { defineCommand } from '@/lib/commands/types';
import {
  getPlaybackOptionPreferences,
  getPlaybackOptionsStatus,
  optionsMatch,
  resetPlaybackOptionPreferencesForTests,
  setPlayRepeats,
  setTempoPercent,
  stepTempo,
  updatePlaybackOptionsStatus,
} from '@/lib/playback/playback-options-preferences';
import { usePlaybackOptionsSync } from '@/lib/playback/use-playback-options';
import type { PlaybackOptionsChange } from '@/lib/playback/options-transaction';
import type { PlaybackOptions, Score } from '@/lib/webmscore-loader';

beforeEach(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  window.localStorage.clear();
  resetPlaybackOptionPreferencesForTests();
  resetShellUiForTests();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const accepted = (tempoMultiplier: number, playRepeats = true, revision = 1): PlaybackOptions => ({
  schemaVersion: 1,
  tempoMultiplier,
  playRepeats,
  revision,
});

describe('speed and repeat preferences', () => {
  it('clamps to 25–200%, steps by 5, persists, and survives a reload', () => {
    setTempoPercent(1000);
    expect(getPlaybackOptionPreferences().tempoPercent).toBe(200);
    setTempoPercent(3);
    expect(getPlaybackOptionPreferences().tempoPercent).toBe(25);
    setTempoPercent(72.4);
    stepTempo(1);
    setPlayRepeats(false);
    resetPlaybackOptionPreferencesForTests();
    expect(getPlaybackOptionPreferences()).toEqual({ tempoPercent: 77, playRepeats: false });
  });

  it('compares with what the engine plays, treating no options as the defaults', () => {
    expect(optionsMatch(null, { tempoPercent: 100, playRepeats: true })).toBe(true);
    expect(optionsMatch(accepted(0.5), { tempoPercent: 50, playRepeats: true })).toBe(true);
    expect(optionsMatch(accepted(0.5), { tempoPercent: 50, playRepeats: false })).toBe(false);
  });
});

describe('applying preferences to a transport', () => {
  const change = (over: Partial<PlaybackOptionsChange>): PlaybackOptionsChange => ({
    status: 'applied',
    accepted: accepted(0.5),
    timeline: null,
    fromMs: 0,
    toMs: 0,
    mapped: null,
    ...over,
  });
  const score = (supported: boolean) =>
    ({
      playbackCapabilities: vi.fn(async () =>
        supported
          ? { schemaVersion: 1, playbackOptions: { schemaVersion: 1 } }
          : { schemaVersion: 1 },
      ),
    }) as unknown as Score;

  it('applies non-default preferences once the engine reports support, and again on each change', async () => {
    setTempoPercent(50);
    const setPlaybackOptions = vi.fn(async () => change({}));
    const target = score(true);
    const hook = renderHook(
      ({ options }: { options: PlaybackOptions | null }) =>
        usePlaybackOptionsSync({
          score: target,
          transport: { playbackOptions: options, setPlaybackOptions },
        }),
      { initialProps: { options: null as PlaybackOptions | null } },
    );
    await waitFor(() =>
      expect(setPlaybackOptions).toHaveBeenCalledWith({ tempoMultiplier: 0.5, playRepeats: true }),
    );
    expect(getPlaybackOptionsStatus().capability).toBe('available');
    hook.rerender({ options: accepted(0.5) });
    act(() => setPlayRepeats(false));
    await waitFor(() =>
      expect(setPlaybackOptions).toHaveBeenLastCalledWith({
        tempoMultiplier: 0.5,
        playRepeats: false,
      }),
    );
    expect(setPlaybackOptions).toHaveBeenCalledTimes(2);
  });

  it('leaves an engine without options alone and marks the controls unavailable', async () => {
    setTempoPercent(50);
    const setPlaybackOptions = vi.fn();
    const old = score(false);
    renderHook(() =>
      usePlaybackOptionsSync({
        score: old,
        transport: { playbackOptions: null, setPlaybackOptions },
      }),
    );
    await waitFor(() => expect(getPlaybackOptionsStatus().capability).toBe('unavailable'));
    expect(setPlaybackOptions).not.toHaveBeenCalled();
  });

  it('reverts the controls to what the engine still plays when a change fails', async () => {
    setTempoPercent(50);
    const setPlaybackOptions = vi.fn(async () =>
      change({ status: 'failed', accepted: accepted(1, true, 0) }),
    );
    const failing = score(true);
    renderHook(() =>
      usePlaybackOptionsSync({
        score: failing,
        transport: { playbackOptions: null, setPlaybackOptions },
      }),
    );
    await waitFor(() => expect(getPlaybackOptionsStatus().error).toMatch(/could not be changed/));
    expect(getPlaybackOptionPreferences().tempoPercent).toBe(100);
    expect(getPlaybackOptionsStatus().applying).toBe(false);
  });
});

describe('speed control', () => {
  it('previews while dragging and applies once, on release', async () => {
    const user = userEvent.setup();
    render(<TempoControl testIdPrefix="t" />);
    await user.click(screen.getByTestId('t-tempo'));
    const slider = screen.getByTestId('t-tempo-slider');
    fireEvent.change(slider, { target: { value: '60' } });
    fireEvent.change(slider, { target: { value: '55' } });
    expect(getPlaybackOptionPreferences().tempoPercent).toBe(100);
    expect(screen.getByTestId('t-tempo')).toHaveTextContent('55%');
    fireEvent.pointerUp(slider, { target: { value: '55' } });
    expect(getPlaybackOptionPreferences().tempoPercent).toBe(55);
  });

  it('applies keyboard steps after they settle, so held keys make one change', () => {
    vi.useFakeTimers();
    render(<TempoControl testIdPrefix="t" />);
    fireEvent.click(screen.getByTestId('t-tempo'));
    const slider = screen.getByTestId('t-tempo-slider');
    for (const value of ['105', '110', '115']) {
      fireEvent.change(slider, { target: { value } });
      fireEvent.keyUp(slider, { key: 'ArrowRight', target: { value } });
    }
    expect(getPlaybackOptionPreferences().tempoPercent).toBe(100);
    act(() => vi.advanceTimersByTime(300));
    expect(getPlaybackOptionPreferences().tempoPercent).toBe(115);
  });

  it('takes a typed value on Enter, presets and Reset, and says when it cannot apply', async () => {
    const user = userEvent.setup();
    render(<TempoControl testIdPrefix="t" />);
    await user.click(screen.getByTestId('t-tempo'));
    const input = screen.getByTestId('t-tempo-input');
    await user.clear(input);
    await user.type(input, '80{Enter}');
    expect(getPlaybackOptionPreferences().tempoPercent).toBe(80);
    await user.click(screen.getByTestId('t-tempo-preset-150'));
    expect(getPlaybackOptionPreferences().tempoPercent).toBe(150);
    await user.click(screen.getByTestId('t-tempo-reset'));
    expect(getPlaybackOptionPreferences().tempoPercent).toBe(100);
    act(() =>
      updatePlaybackOptionsStatus({ error: 'Playback speed or repeats could not be changed.' }),
    );
    expect(screen.getByRole('status')).toHaveTextContent('could not be changed');
    act(() => updatePlaybackOptionsStatus({ capability: 'unavailable' }));
    expect(screen.getByTestId('t-tempo')).toBeDisabled();
  });
});

describe('header transport preparation feedback', () => {
  function setup() {
    const registry = new CommandRegistry();
    registry.setContextSource(() => ({ ...DEFAULT_COMMAND_CONTEXT, hasScore: true }));
    const play = vi.fn();
    for (const id of ['playback.playPause', 'playback.stop', 'playback.playFromSelection'])
      registry.register('global', [
        defineCommand({ id, label: id, run: id === 'playback.playPause' ? play : vi.fn() }),
      ]);
    render(<Transport registry={registry} />);
    return { play };
  }

  it('acknowledges Play at once, says "Preparing audio…" only after a delay, and keeps Stop as Cancel', () => {
    vi.useFakeTimers();
    act(() => setShellView({ ...EMPTY_SHELL_VIEW, hasScore: true }));
    const { play } = setup();
    fireEvent.click(screen.getByTestId('btn-play'));
    expect(play).toHaveBeenCalledOnce();
    expect(screen.getByTestId('btn-play')).toHaveAttribute('aria-busy', 'true');
    act(() =>
      setShellView({ ...EMPTY_SHELL_VIEW, hasScore: true, audioPreparing: true, audioBusy: true }),
    );
    expect(screen.getByTestId('btn-play')).toHaveAttribute('aria-label', 'Preparing audio');
    expect(screen.getByTestId('btn-stop')).toHaveAttribute('aria-label', 'Cancel');
    expect(screen.queryByTestId('playback-preparing')).toBeNull();
    act(() => vi.advanceTimersByTime(250));
    expect(screen.getByTestId('playback-preparing')).toHaveTextContent('Preparing audio…');
    act(() =>
      setShellView({ ...EMPTY_SHELL_VIEW, hasScore: true, isPlaying: true, audioBusy: true }),
    );
    expect(screen.queryByTestId('playback-preparing')).toBeNull();
    expect(screen.getByTestId('btn-play')).toHaveAttribute('aria-label', 'Pause');
    // Back to idle: the earlier press does not come back as a stale acknowledgement.
    act(() => setShellView({ ...EMPTY_SHELL_VIEW, hasScore: true }));
    expect(screen.getByTestId('btn-play')).toHaveAttribute('aria-label', 'Play');
  });
});
