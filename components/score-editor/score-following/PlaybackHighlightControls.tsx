'use client';
import { useSyncExternalStore } from 'react';
import {
  getEditorHighlights,
  getEditorHighlightsOnServer,
  subscribeEditorHighlights,
  setEditorHighlight,
} from '../../../lib/playback/score-following';
import { Button } from '../../ui/Button';

export function PlaybackHighlightControls() {
  const preferences = useSyncExternalStore(
    subscribeEditorHighlights,
    getEditorHighlights,
    getEditorHighlightsOnServer,
  );
  return (
    <div className="space-y-1">
      {(['measure', 'noteheads'] as const).map((kind) => (
        <Button
          key={kind}
          data-testid={`settings-highlight-${kind}`}
          size="sm"
          variant={preferences[kind] ? 'primary' : 'outline'}
          className="w-full justify-start"
          aria-pressed={preferences[kind]}
          onClick={() => setEditorHighlight(kind, !preferences[kind])}
        >
          {kind === 'measure' ? 'Measure highlighting' : 'Notehead highlighting'}
        </Button>
      ))}
    </div>
  );
}
