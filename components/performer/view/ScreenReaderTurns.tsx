'use client';

import React from 'react';
import { Button } from '../../ui/Button';
import type { TurnEvent } from '../turning/turnMachine';

/**
 * For VoiceOver and Full Keyboard Access, which cannot aim a tap at a part of the page: Previous page, Next page and
 * Show controls as real buttons, out of sight but reachable; and the page announced as it turns.
 */
export function ScreenReaderTurns({
  page,
  pageCount,
  onTurn,
  onControls,
}: {
  page: number;
  pageCount: number;
  onTurn: (event: TurnEvent) => void;
  onControls: () => void;
}) {
  return (
    <div className="sr-only" data-testid="performer-sr">
      <Button type="button" onClick={() => onTurn('previous')}>
        Previous page
      </Button>
      <Button type="button" onClick={() => onTurn('next')}>
        Next page
      </Button>
      <Button type="button" onClick={onControls}>
        Show controls
      </Button>
      <p role="status" aria-live="polite" data-testid="performer-page-announce">
        {pageCount ? `Page ${page + 1} of ${pageCount}` : ''}
      </p>
    </div>
  );
}
