// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EmbedDialog } from '../../components/shell/EmbedDialog';
import { buildShellOwnCommands } from '../../components/shell/shellCommands';
import {
  EMPTY_SHELL_VIEW,
  getShellUiState,
  resetShellUiForTests,
  setShellView,
} from '../../components/shell/shellStore';

const SCORE = 'https://www.ourtextscores.com/api/works/1/sources/a/canonical.xml';
const DRIVE = 'https://drive.google.com/file/d/abc123/view?usp=sharing';

beforeEach(() => {
  resetShellUiForTests();
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok: true, status: 200 }) as Response),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.history.replaceState(null, '', '/');
});

/** Opens the dialog the way File ▸ Embed on a Website does. */
function openEmbed({ score, dirty = false }: { score?: string; dirty?: boolean }) {
  window.history.replaceState(
    null,
    '',
    score ? `/score-editor/index.html?${new URLSearchParams({ score, launchContext: '{}' })}` : '/',
  );
  setShellView({ ...EMPTY_SHELL_VIEW, hasScore: true, dirty });
  render(<EmbedDialog title="Quartet" />);
  const command = buildShellOwnCommands().find((candidate) => candidate.id === 'file.embed')!;
  act(() => void command.run({} as never, undefined as never));
}
const src = () => {
  const html = (screen.getByTestId('embed-snippet') as HTMLTextAreaElement).value;
  return new URL(/src="([^"]+)"/.exec(html)![1].replace(/&amp;/g, '&'));
};

describe('File ▸ Embed on a Website', () => {
  it("embeds the player for the editor's score, without the editor's own parameters", () => {
    openEmbed({ score: SCORE });
    expect(getShellUiState().embedOpen).toBe(true);
    expect(src().pathname).toBe('/score-editor/index.html');
    expect(src().searchParams.get('score')).toBe(SCORE);
    expect(src().searchParams.get('embed')).toBe('player');
    expect(src().searchParams.get('launchContext')).toBeNull();
    expect(screen.getByTestId('embed-saved-note')).toHaveTextContent(
      'The player loads the score from its web address.',
    );
  });

  it('says unsaved changes will not be in the embedded score', () => {
    openEmbed({ score: SCORE, dirty: true });
    expect(screen.getByTestId('embed-saved-note')).toHaveTextContent(
      'will not be in it until they are saved there',
    );
  });

  it('asks for a Google Drive link for a score opened from this computer', () => {
    openEmbed({});
    expect(screen.queryByTestId('embed-snippet')).toBeNull();
    fireEvent.change(screen.getByTestId('embed-drive-url'), {
      target: { value: 'https://drive.google.com/drive/folders/xyz' },
    });
    expect(screen.getByText(/not a folder link/)).toBeInTheDocument();
    expect(screen.queryByTestId('embed-snippet')).toBeNull();
    fireEvent.change(screen.getByTestId('embed-drive-url'), { target: { value: DRIVE } });
    expect(src().searchParams.get('score')).toBe(DRIVE);
  });

  it('has nothing to embed with no score open', () => {
    window.history.replaceState(null, '', '/');
    render(<EmbedDialog title="" />);
    act(
      () =>
        void buildShellOwnCommands()
          .find((c) => c.id === 'file.embed')!
          .run({} as never, undefined as never),
    );
    expect(screen.getByTestId('embed-unavailable')).toHaveTextContent('Open a score first.');
  });
});
