import { notifyError } from '../../shell/notices';
import { withFullScore } from '../parts';
import type { EditorCore } from '../core';
import { performHref } from '../../performer/platform/performPath';
import {
  deviceScoreStore,
  newLocalKey,
  type ScoreStore,
} from '../../performer/platform/scoreStore';

/**
 * File ▸ Perform (performer mode, plan §8 / Phase 5.5): hands the current score, with its unsaved edits and all its
 * parts, to the perform page. It is kept on this device (the perform library lists it under "From the editor") and
 * opened in a new tab at `/perform?score=local:<id>`. The tab is opened at once, on the click: Safari blocks a
 * window.open made after an await.
 */
export async function performScore(
  core: EditorCore,
  store: ScoreStore = deviceScoreStore(),
  open: (url: string) => Window | null = (url) => window.open(url, '_blank'),
) {
  const { score, runSerializedScoreOperation } = core;
  if (!score || !score.saveMsc) {
    notifyError('Perform is not available in this build.');
    return;
  }
  const tab = open('about:blank');
  try {
    const bytes = await withFullScore(score, runSerializedScoreOperation, () =>
      score.saveMsc!('mscz'),
    );
    const metadata = await runSerializedScoreOperation(
      () => Promise.resolve(score.metadata?.() ?? {}),
      'metadata(perform)',
    ).catch(() => ({}) as Record<string, unknown>);
    const title =
      typeof metadata.title === 'string' && metadata.title.trim()
        ? metadata.title.trim()
        : 'Untitled score';
    const key = newLocalKey();
    await store.put({ key, name: title, format: 'mscz', bytes, savedAt: Date.now() });
    const href = performHref({ score: key });
    if (tab) tab.location.href = href;
    else
      notifyError(`Allow pop-ups to open the perform page, or open it from the perform library.`);
  } catch (err) {
    tab?.close();
    console.error('Failed to hand the score to the perform page', err);
    notifyError('Unable to open the score for performing. See console for details.');
  }
}
