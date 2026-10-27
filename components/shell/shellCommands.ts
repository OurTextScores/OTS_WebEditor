import { defaultCommandRegistry } from '../../lib/commands/registry';
import { defineCommand, defineFamily, type AnyCommand } from '../../lib/commands/types';
import {
  getHiddenSections,
  toggleSectionHidden,
  writeHiddenSections,
} from './toolbar/strip/stripPersistence';
import { STRIP_SECTIONS } from './toolbar/strip/stripSections';
import {
  getClickPreferences,
  setCountIn,
  setMetronome,
} from '../../lib/playback/click-preferences';
import {
  getFollowState,
  requestReveal,
  resumeFollowing,
  setFollowEnabled,
} from '../../lib/playback/score-following';
import { announce } from './announcer';
import {
  getPlaybackOptionPreferences,
  getPlaybackOptionsStatus,
  resetTempo,
  setPlayRepeats,
  setTempoPercent,
  stepTempo,
  TEMPO_PRESETS,
} from '../../lib/playback/playback-options-preferences';
import { closeTopEscapeLayer, hasEscapeLayer } from './keyboard/escapeLayers';
import {
  closePalette,
  getShellUiState,
  openPalette,
  setEmbedOpen,
  setShortcutsOpen,
  setStatusBarPinned,
} from './shellStore';

/**
 * The commands the shell itself owns: they open shell UI and need nothing from the
 * editor. Everything else is registered by the ribbon adapters (`editorCommands.ts`) or
 * `ScoreEditor`'s bindings (`shellCommands.ts` under `score-editor/`).
 */
export function buildShellOwnCommands(): AnyCommand[] {
  return [
    defineCommand({
      id: 'shell.palette',
      label: 'Command Palette',
      keywords: ['search', 'commands', 'find'],
      run: () => {
        // The same key closes it, as in VS Code.
        if (getShellUiState().palette.open) closePalette();
        else openPalette('commands');
      },
    }),
    defineCommand({
      id: 'view.goto.prompt',
      label: 'Bar or Rehearsal Mark',
      opensDialog: true,
      keywords: ['go to', 'jump', 'bar', 'measure', 'rehearsal', 'page'],
      run: () => openPalette('goto'),
    }),
    defineCommand({
      // Escape: close the innermost open thing; with nothing open, clear the selection.
      id: 'shell.escape',
      label: 'Cancel',
      visible: () => false,
      // In a compare session Escape belongs to the pane (it leaves the pane's note input).
      enabled: (ctx) => hasEscapeLayer() || (ctx.mode !== 'compare' && ctx.selection !== 'none'),
      run: async () => {
        if (closeTopEscapeLayer()) return;
        await defaultCommandRegistry.run('edit.deselect');
      },
    }),
    defineFamily<string>({
      id: 'view.toolbar.section',
      label: 'Toolbar Section',
      variants: STRIP_SECTIONS.map((section) => ({ arg: section.id, label: section.label })),
      checked: (_ctx, id) => !getHiddenSections().includes(id),
      run: (_ctx, id) => toggleSectionHidden(id),
    }),
    defineCommand({
      id: 'view.toolbar.showAll',
      label: 'Show All Toolbar Sections',
      keywords: ['toolbar', 'reset', 'tools', 'ribbon'],
      enabled: () => getHiddenSections().length > 0,
      run: () => writeHiddenSections([]),
    }),
    defineCommand({
      id: 'playback.metronome',
      label: 'Metronome',
      keywords: ['click', 'beat', 'tempo'],
      checked: () => getClickPreferences().enabled,
      run: () => setMetronome(!getClickPreferences().enabled),
    }),
    defineCommand({
      id: 'playback.countIn',
      label: 'Count-in',
      keywords: ['metronome', 'click', 'lead in', 'measure'],
      enabled: () => getClickPreferences().enabled,
      checked: () => getClickPreferences().countIn,
      run: () => setCountIn(!getClickPreferences().countIn),
    }),
    defineFamily<number>({
      id: 'playback.tempo',
      label: 'Playback Speed',
      variants: TEMPO_PRESETS.map((preset) => ({ arg: preset, label: `${preset}%` })),
      enabled: () => optionsAvailable(),
      checked: (_ctx, preset) => getPlaybackOptionPreferences().tempoPercent === preset,
      run: (_ctx, preset) => {
        setTempoPercent(preset);
        announce(`Playback speed ${preset}%`);
      },
    }),
    defineCommand({
      id: 'playback.tempo.slower',
      label: 'Slower Playback',
      keywords: ['tempo', 'speed'],
      enabled: () => optionsAvailable(),
      run: () => {
        stepTempo(-1);
        announce(`Playback speed ${getPlaybackOptionPreferences().tempoPercent}%`);
      },
    }),
    defineCommand({
      id: 'playback.tempo.faster',
      label: 'Faster Playback',
      keywords: ['tempo', 'speed'],
      enabled: () => optionsAvailable(),
      run: () => {
        stepTempo(1);
        announce(`Playback speed ${getPlaybackOptionPreferences().tempoPercent}%`);
      },
    }),
    defineCommand({
      id: 'playback.tempo.reset',
      label: 'Reset Playback Speed',
      keywords: ['tempo', 'speed', '100%'],
      enabled: () => optionsAvailable() && getPlaybackOptionPreferences().tempoPercent !== 100,
      run: () => {
        resetTempo();
        announce('Playback speed 100%');
      },
    }),
    defineCommand({
      id: 'playback.playRepeats',
      label: 'Play Repeats',
      keywords: ['repeat', 'volta', 'ending', 'da capo', 'dal segno', 'coda'],
      enabled: () => optionsAvailable(),
      checked: () => getPlaybackOptionPreferences().playRepeats,
      run: () => {
        const next = !getPlaybackOptionPreferences().playRepeats;
        setPlayRepeats(next);
        announce(next ? 'Playing repeats' : 'Playing each measure once');
      },
    }),
    defineCommand({
      id: 'playback.follow',
      label: 'Follow Playback',
      keywords: ['cursor', 'page turn', 'scroll', 'track'],
      checked: () => getFollowState().followEnabled,
      run: () => {
        const enabled = !getFollowState().followEnabled;
        setFollowEnabled(enabled);
        announce(enabled ? 'Following playback' : 'Not following playback');
      },
    }),
    defineCommand({
      id: 'playback.jumpToPlayback',
      label: 'Jump to Playback',
      keywords: ['cursor', 'reveal', 'where', 'page'],
      enabled: () => getFollowState().active,
      run: () => requestReveal(),
    }),
    defineCommand({
      id: 'playback.resumeFollowing',
      label: 'Resume Following',
      keywords: ['follow', 'cursor', 'page turn'],
      enabled: () => getFollowState().active && getFollowState().suspended,
      run: () => {
        resumeFollowing();
        announce('Following playback');
      },
    }),
    defineCommand({
      id: 'file.embed',
      label: 'Embed on a Website',
      opensDialog: true,
      keywords: ['embed', 'iframe', 'html', 'website', 'share', 'player'],
      run: () => setEmbedOpen(true),
    }),
    defineCommand({
      id: 'help.shortcuts',
      label: 'Keyboard Shortcuts',
      keywords: ['keys', 'hotkeys', 'help'],
      run: () => setShortcutsOpen(true),
    }),
  ];
}

/** The engine plays tempo/repeat options; unknown (no score asked yet) still lets the preference be set. */
const optionsAvailable = () => getPlaybackOptionsStatus().capability !== 'unavailable';

/** Registered by the status bar itself, which is the only thing that can pin or unpin it. */
export function buildStatusBarCommands(): AnyCommand[] {
  return [
    defineCommand({
      id: 'view.statusBar',
      label: 'Status Bar',
      keywords: ['page', 'zoom', 'show', 'hide'],
      checked: () => getShellUiState().statusBarPinned,
      run: () => setStatusBarPinned(!getShellUiState().statusBarPinned),
    }),
  ];
}
