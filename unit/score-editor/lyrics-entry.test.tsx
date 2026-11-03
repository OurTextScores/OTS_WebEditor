import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi, type Mock } from 'vitest';
import {
  LYRICS_ACTIONS,
  LyricsEntryEditor,
  lyricsKeyAction,
  lyricsLiteral,
  type LyricsAction,
} from '../../components/score-editor/lyrics';

const key = (
  k: string,
  mods: Partial<Record<'shiftKey' | 'ctrlKey' | 'metaKey' | 'altKey', boolean>> = {},
) => ({
  key: k,
  shiftKey: false,
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  ...mods,
});

describe('lyric entry keys (MuseScore’s)', () => {
  it('moves on with Space, Shift+Space, "-", "_", Enter and the arrows; Escape stops', () => {
    expect(lyricsKeyAction(key(' '))).toBe(LYRICS_ACTIONS.next);
    expect(lyricsKeyAction(key(' ', { shiftKey: true }))).toBe(LYRICS_ACTIONS.previous);
    expect(lyricsKeyAction(key('-'))).toBe(LYRICS_ACTIONS.syllable);
    expect(lyricsKeyAction(key('_', { shiftKey: true }))).toBe(LYRICS_ACTIONS.melisma);
    expect(lyricsKeyAction(key('Enter'))).toBe(LYRICS_ACTIONS.newVerse);
    expect(lyricsKeyAction(key('ArrowUp'))).toBe(LYRICS_ACTIONS.verseUp);
    expect(lyricsKeyAction(key('ArrowDown'))).toBe(LYRICS_ACTIONS.verseDown);
    expect(lyricsKeyAction(key('Escape'))).toBe(LYRICS_ACTIONS.end);
    expect(lyricsKeyAction(key('a'))).toBeNull();
  });

  it('types a space or a hyphen in the syllable with Ctrl (Option on a Mac), instead of moving on', () => {
    expect(lyricsKeyAction(key(' ', { ctrlKey: true }))).toBeNull();
    expect(lyricsLiteral(key(' ', { ctrlKey: true }))).toBe(' ');
    expect(lyricsLiteral(key('-', { altKey: true }))).toBe('-');
    expect(lyricsLiteral(key('-'))).toBeNull();
  });
});

describe('LyricsEntryEditor', () => {
  const entry = { page: 0, x: 10, y: 20, w: 40, h: 12, text: 'la', verse: 1 };
  type Commit = (text: string, action: LyricsAction) => Promise<void>;
  const renderEditor = (onCommit: Mock<Commit> = vi.fn<Commit>(async () => {})) => {
    render(
      <LyricsEntryEditor
        model={{ entry, commit: onCommit }}
        currentPage={0}
        zoom={1}
        engravingToOverlayPoint={(x, y) => ({ x, y })}
      />,
    );
    return onCommit;
  };

  it('shows the syllable there, named by its verse, focused', () => {
    renderEditor();
    const input = screen.getByTestId('lyrics-entry');
    expect(input).toHaveValue('la');
    expect(input).toHaveAccessibleName('Lyrics, verse 2');
    expect(input).toHaveFocus();
  });

  it('commits each syllable with its key, in order, and what is typed meanwhile belongs to the next', async () => {
    let release!: () => void;
    const slow = new Promise<void>((resolve) => (release = resolve));
    const onCommit = vi.fn<Commit>(async (text) => {
      if (text === 'lo') await slow;
    });
    renderEditor(onCommit);
    const input = screen.getByTestId('lyrics-entry') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'lo' } });
    fireEvent.keyDown(input, { key: '-' });
    // The box empties at once; typing goes on while "lo" is still being written.
    expect(input.value).toBe('');
    fireEvent.change(input, { target: { value: 've' } });
    fireEvent.keyDown(input, { key: ' ' });
    release();
    await waitFor(() => expect(onCommit).toHaveBeenCalledTimes(2));
    expect(onCommit.mock.calls).toEqual([
      ['lo', LYRICS_ACTIONS.syllable],
      ['ve', LYRICS_ACTIONS.next],
    ]);
  });

  it('keeps the syllable and stops when the box is left (Escape too), once', async () => {
    const onCommit = renderEditor();
    const input = screen.getByTestId('lyrics-entry');
    fireEvent.change(input, { target: { value: 'end' } });
    fireEvent.keyDown(input, { key: 'Escape' });
    fireEvent.blur(input);
    await waitFor(() => expect(onCommit).toHaveBeenCalledTimes(1));
    expect(onCommit).toHaveBeenCalledWith('end', LYRICS_ACTIONS.end);
  });

  it('types Ctrl+Space into the syllable', () => {
    const onCommit = renderEditor();
    const input = screen.getByTestId('lyrics-entry') as HTMLInputElement;
    input.setSelectionRange(2, 2);
    fireEvent.keyDown(input, { key: ' ', ctrlKey: true });
    expect(input.value).toBe('la ');
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('shows nothing without an entry', () => {
    render(
      <LyricsEntryEditor
        model={{ entry: null, commit: vi.fn() }}
        currentPage={0}
        zoom={1}
        engravingToOverlayPoint={(x, y) => ({ x, y })}
      />,
    );
    expect(screen.queryByTestId('lyrics-entry')).toBeNull();
  });

  it('is not shown on another page', () => {
    render(
      <LyricsEntryEditor
        model={{ entry, commit: vi.fn() }}
        currentPage={1}
        zoom={1}
        engravingToOverlayPoint={(x, y) => ({ x, y })}
      />,
    );
    expect(screen.queryByTestId('lyrics-entry')).toBeNull();
  });
});
