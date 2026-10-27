// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const dialogs = vi.hoisted(() => ({
  prompt: vi.fn<() => Promise<string | null>>(),
  confirm: vi.fn<() => Promise<boolean>>(),
  error: vi.fn(),
}));
vi.mock('../../components/shell/notices', () => ({
  promptDialog: dialogs.prompt,
  confirmDialog: dialogs.confirm,
  notifyError: dialogs.error,
}));

import { editorUrlForScoreLink, openScoreFromLink } from '../../components/shell/openScoreFromLink';
import {
  EMPTY_SHELL_VIEW,
  resetShellUiForTests,
  setShellView,
} from '../../components/shell/shellStore';

const PAGE =
  'https://www.ourtextscores.com/score-editor/index.html?scoreId=ots%3A1%3Aa&launchContext=%7B%7D';
const LINK = 'https://example.org/scores/quartet.mxl';

describe('editorUrlForScoreLink', () => {
  it("opens the link in this editor, without the previous score's parameters", () => {
    const url = new URL(editorUrlForScoreLink(PAGE, `  ${LINK} `)!);
    expect(url.origin + url.pathname).toBe('https://www.ourtextscores.com/score-editor/index.html');
    expect(Object.fromEntries(url.searchParams)).toEqual({ score: LINK });
  });

  it('takes only web addresses', () => {
    for (const link of ['quartet.mxl', 'javascript:alert(1)', 'file:///home/me/a.mscz', ''])
      expect(editorUrlForScoreLink(PAGE, link), link).toBeNull();
  });
});

describe('openScoreFromLink', () => {
  beforeEach(() => {
    resetShellUiForTests();
    window.history.replaceState(null, '', '/?scoreId=local%3A1');
    vi.spyOn(window.history, 'pushState');
  });
  afterEach(() => vi.restoreAllMocks());

  it('points the editor at the link as a new history entry', async () => {
    dialogs.prompt.mockResolvedValue(LINK);
    await openScoreFromLink();
    expect(window.history.pushState).toHaveBeenCalledTimes(1);
    expect(new URL(window.location.href).searchParams.get('score')).toBe(LINK);
    expect(new URL(window.location.href).searchParams.get('scoreId')).toBeNull();
    expect(dialogs.confirm).not.toHaveBeenCalled();
  });

  it('does nothing when cancelled, and says why for something that is not a link', async () => {
    dialogs.prompt.mockResolvedValue(null);
    await openScoreFromLink();
    dialogs.prompt.mockResolvedValue('not a link');
    await openScoreFromLink();
    expect(window.history.pushState).not.toHaveBeenCalled();
    expect(dialogs.error).toHaveBeenCalledTimes(1);
  });

  it('asks before replacing unsaved changes, and keeps them when told no', async () => {
    setShellView({ ...EMPTY_SHELL_VIEW, hasScore: true, dirty: true });
    dialogs.prompt.mockResolvedValue(LINK);
    dialogs.confirm.mockResolvedValue(false);
    await openScoreFromLink();
    expect(dialogs.confirm).toHaveBeenCalledTimes(1);
    expect(window.history.pushState).not.toHaveBeenCalled();
    dialogs.confirm.mockResolvedValue(true);
    await openScoreFromLink();
    expect(window.history.pushState).toHaveBeenCalledTimes(1);
  });
});
