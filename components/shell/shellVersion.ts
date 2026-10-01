/**
 * The `?shell=v2|legacy` flag (SHELL_REDESIGN_DESIGN §10). It exists only so the redesign
 * can land phase by phase while the ribbon still does its old jobs: `legacy` restores the
 * ribbon's File, View, Playback, Tempo and Help sections and the canvas page controls, and
 * drops the status bar and header transport. Remembered for the tab in sessionStorage, so
 * a spec can open `/?shell=legacy` and keep it across reloads. Deleted in Phase 5.
 */
export type ShellVersion = 'v2' | 'legacy';

const KEY = 'ots.shell.version';

const parse = (value: string | null | undefined): ShellVersion | null =>
  value === 'v2' || value === 'legacy' ? value : null;

/** The URL wins and is remembered; otherwise the tab's last choice; otherwise v2. */
export function resolveShellVersion(search: string): ShellVersion {
  const fromUrl = parse(new URLSearchParams(search).get('shell'));
  try {
    if (fromUrl) {
      window.sessionStorage.setItem(KEY, fromUrl);
      return fromUrl;
    }
    return parse(window.sessionStorage.getItem(KEY)) ?? 'v2';
  } catch {
    return fromUrl ?? 'v2';
  }
}

/** Ribbon sections the v2 shell takes over (§10 Phase 2). */
export const V2_HIDDEN_RIBBON_SECTIONS = ['file', 'view', 'playback', 'tempo', 'help'] as const;
