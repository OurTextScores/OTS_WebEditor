'use client';

import React from 'react';
import { Button } from '../../ui/Button';
import type { TurnEvent } from '../turning/turnMachine';

/** "Next: <piece>" at the end of a piece in a setlist: the same pedal again goes there. */
export function SetlistCard({
  card,
  onGo,
  onStay,
}: {
  card: { event: TurnEvent; index: number; name: string };
  onGo: () => void;
  onStay: () => void;
}) {
  return (
    <div
      role="status"
      data-testid="setlist-card"
      data-performer-controls
      className="absolute bottom-8 left-1/2 z-10 flex -translate-x-1/2 items-center gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3 text-slate-800 shadow-lg"
      onPointerDown={(event) => event.stopPropagation()}
    >
      <span>
        {card.event === 'next' ? 'Next' : 'Previous'}: <strong>{card.name}</strong>
        <span className="ml-2 text-sm text-slate-500">turn again to go</span>
      </span>
      <Button type="button" size="sm" onClick={onStay}>
        Stay
      </Button>
      <Button type="button" size="sm" variant="primary" data-testid="setlist-go" onClick={onGo}>
        Go
      </Button>
    </div>
  );
}
