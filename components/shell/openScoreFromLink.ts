import { confirmDialog, notifyError, promptDialog } from './notices';
import { getShellUiState } from './shellStore';

/**
 * The editor's address for a score at `link`: this page with only `score` set. The editor loads `?score=` itself
 * (the same path a shared link takes, Google Drive links included), and the previous score's parameters
 * (`scoreId`, `launchContext`) belong to that score, so they are dropped. Null when `link` is not a web address.
 */
export function editorUrlForScoreLink(pageHref: string, link: string): string | null {
  let score: URL;
  try {
    score = new URL(link.trim());
  } catch {
    return null;
  }
  if (score.protocol !== 'https:' && score.protocol !== 'http:') return null;
  const page = new URL(pageHref);
  const url = new URL(page.pathname, page.origin);
  url.searchParams.set('score', score.href);
  return url.href;
}

/**
 * File ▸ Open Score from Link: asks for the address, confirms before unsaved changes are replaced, then points the
 * editor at it. A history entry, not a replacement, so Back returns to the score that was open.
 */
export async function openScoreFromLink(): Promise<void> {
  const link = await promptDialog({
    title: 'Open score from link',
    label: 'Web address of a MusicXML, MuseScore or MIDI file, or a Google Drive share link',
    confirmLabel: 'Open',
  });
  if (link === null || !link.trim()) return;
  const next = editorUrlForScoreLink(window.location.href, link);
  if (!next) {
    notifyError('That is not a web address. Paste a link that starts with https://');
    return;
  }
  if (
    getShellUiState().view.dirty &&
    !(await confirmDialog({
      title: 'Open another score?',
      message: 'Changes since your last checkpoint will be lost.',
      confirmLabel: 'Open',
      destructive: true,
    }))
  ) {
    return;
  }
  window.history.pushState(null, '', next);
}
