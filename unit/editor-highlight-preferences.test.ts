import { afterEach, expect, it } from 'vitest';
import {
  getEditorHighlights,
  getEditorHighlightsOnServer,
  resetEditorHighlightsForTests,
  setEditorHighlight,
  subscribeEditorHighlights,
} from '../lib/playback/score-following';

afterEach(() => {
  window.localStorage.clear();
  resetEditorHighlightsForTests();
});

it('defaults to measure shading and keeps notehead colouring independent', () => {
  expect(getEditorHighlights()).toEqual({ measure: true, noteheads: false });
  setEditorHighlight('noteheads', true);
  setEditorHighlight('measure', false);
  expect(getEditorHighlights()).toEqual({ measure: false, noteheads: true });
  resetEditorHighlightsForTests();
  expect(getEditorHighlights()).toEqual({ measure: false, noteheads: true });
  expect(getEditorHighlightsOnServer()).toEqual({ measure: true, noteheads: false });
});

it('notifies subscribers only for changes and stops after unsubscribe', () => {
  let notifications = 0;
  const unsubscribe = subscribeEditorHighlights(() => {
    notifications += 1;
  });
  setEditorHighlight('measure', true);
  setEditorHighlight('noteheads', true);
  expect(notifications).toBe(1);
  unsubscribe();
  setEditorHighlight('measure', false);
  expect(notifications).toBe(1);
});
