import { act, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, expect, vi, type Mock } from 'vitest';
import { clearNotices, getNoticeSnapshot } from '../../components/shell/notices';
import { defaultCommandRegistry } from '../../lib/commands';
import { resolveCommandReference } from '../../tests/helpers/commands';

/**
 * Shared setup for the ScoreEditor component suites.
 *
 * TD-04. These tests used to live in one 2,000-line file whose setup — global
 * save/restore, the search-param stub, the bounding-rect spy, console suppression —
 * was implicit context you had to read the top of the file to understand. It is
 * explicit here, and each domain file states which parts it uses.
 *
 * Every domain file declares its own `vi.mock` calls: those are hoisted per file and
 * cannot be installed from a helper. It hands the hoisted mocks to
 * `setupScoreEditorTest`, which owns resetting them between tests.
 */
export type ScoreEditorTestGlobals = {
  alert: unknown;
  fetch: unknown;
  URL: {
    createObjectURL: unknown;
    revokeObjectURL: unknown;
  };
  Audio: unknown;
  AudioContext: unknown;
  open: unknown;
};

export const testGlobals = globalThis as unknown as ScoreEditorTestGlobals;

/**
 * Runs an editor command the way a menu or toolbar would, once the editor has made it
 * available. Takes a command id or a legacy ribbon test id (`btn-pitch-up`), like the
 * Playwright helper, so these suites read the same as the specs.
 */
export async function runEditorCommand(idOrLegacyTestId: string, args?: unknown) {
  const { commandId, args: resolved } = resolveCommandReference(idOrLegacyTestId, args);
  // The ribbon waited implicitly: a disabled button could not be clicked. A command runs the
  // instant it is asked, so wait for the editor to enable it first.
  await waitFor(() => expect(defaultCommandRegistry.isEnabled(commandId)).toBe(true));
  await act(async () => {
    await defaultCommandRegistry.run(commandId, resolved);
  });
}

/** What the user was told: the title of each notice, oldest first (replaces `alert` spies). */
export const noticeTitles = () => getNoticeSnapshot().notices.map((notice) => notice.title);

/** Typed against how the harness uses them, not against `any`. */
export type EditorLoaderMocks = {
  loadWebMscore: Mock<() => unknown>;
  loadWebMscoreInProcess: Mock<() => unknown>;
};

export type EditorNavigationMocks = {
  useSearchParams: Mock<() => unknown>;
};

/** Query params the editor reads on mount; mutate between renders. */
export type EditorParams = {
  score: string | null;
  values: Record<string, string>;
};

export const boundingRect: DOMRect = {
  x: 0,
  y: 0,
  width: 100,
  height: 40,
  top: 0,
  left: 0,
  right: 100,
  bottom: 40,
  toJSON: () => ({}),
};

const suppressConsole = () => {
  vi.spyOn(console, 'debug').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
};

/**
 * Installs the lifecycle every ScoreEditor suite needs and returns the handles the
 * tests reach for: the params the component reads on mount, and the bounding-rect spy
 * that a few tests re-point at their own geometry.
 */
export function setupScoreEditorTest(
  mocked: EditorLoaderMocks,
  mockedNavigation: EditorNavigationMocks,
) {
  const params: EditorParams = { score: null, values: {} };
  const rectSpy: { current: ReturnType<typeof vi.spyOn> | undefined } = { current: undefined };

  const searchParams = {
    get: (key: string) => (key === 'score' ? params.score : (params.values[key] ?? null)),
  };

  const originalTestGlobals = {
    alert: testGlobals.alert,
    fetch: testGlobals.fetch,
    createObjectURL: testGlobals.URL.createObjectURL,
    revokeObjectURL: testGlobals.URL.revokeObjectURL,
    Audio: testGlobals.Audio,
    AudioContext: testGlobals.AudioContext,
    open: testGlobals.open,
  };

  beforeAll(() => {
    suppressConsole();
  });

  beforeEach(() => {
    params.score = null;
    params.values = {};
    mocked.loadWebMscore.mockReset();
    mocked.loadWebMscoreInProcess.mockReset();
    mocked.loadWebMscoreInProcess.mockImplementation(() => mocked.loadWebMscore());
    mockedNavigation.useSearchParams.mockReturnValue(searchParams);

    rectSpy.current = vi
      .spyOn(Element.prototype, 'getBoundingClientRect')
      .mockReturnValue(boundingRect);
    testGlobals.alert = vi.fn();
    clearNotices();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    testGlobals.alert = originalTestGlobals.alert;
    testGlobals.fetch = originalTestGlobals.fetch;
    testGlobals.URL.createObjectURL = originalTestGlobals.createObjectURL;
    testGlobals.URL.revokeObjectURL = originalTestGlobals.revokeObjectURL;
    testGlobals.Audio = originalTestGlobals.Audio;
    testGlobals.AudioContext = originalTestGlobals.AudioContext;
    testGlobals.open = originalTestGlobals.open;
    vi.unstubAllEnvs();
    // jsdom keeps sessionStorage across tests, and ScoreEditor consumes an
    // 'openInEditor' handoff on mount -- leaving one behind makes the next test load
    // that score instead of its own fixture.
    sessionStorage.clear();
    suppressConsole();
  });

  return { params, rectSpy };
}
