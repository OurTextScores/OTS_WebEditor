'use client';

import React, { useEffect, useState } from 'react';
import { Button } from '../../ui/Button';
import { DEFAULT_PEDALS, keyLabel, teach, type PedalMapping } from './pedalMapping';
import type { TurnEvent } from './turnMachine';

/**
 * Teaching each pedal its key (performer mode, Phase 2): "press your next-page pedal" records the key it sends. Shows
 * the keys each turn accepts, and resets to the defaults. If nothing arrives on an iPad, Full Keyboard Access
 * (Settings ▸ Accessibility ▸ Keyboards) may be taking the pedal's keys.
 */
export function PedalSetup({
  mapping,
  onChange,
  onClose,
}: {
  mapping: PedalMapping;
  onChange: (mapping: PedalMapping) => void;
  onClose: () => void;
}) {
  const [listening, setListening] = useState<TurnEvent | null>(null);
  useEffect(() => {
    if (!listening) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setListening(null);
        return;
      }
      event.preventDefault();
      event.stopImmediatePropagation();
      onChange(teach(mapping, listening, event.key));
      setListening(null);
    };
    // Capture: before the view's own page-turn listener
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [listening, mapping, onChange]);

  const row = (turn: TurnEvent, label: string) => (
    <div className="flex items-center gap-2">
      <span className="w-28 font-medium">{label}</span>
      <span className="min-w-0 flex-1 truncate text-slate-600" data-testid={`pedal-keys-${turn}`}>
        {mapping[turn].map(keyLabel).join(', ') || '—'}
      </span>
      <Button
        type="button"
        size="sm"
        data-testid={`pedal-set-${turn}`}
        onClick={() => setListening(turn)}
      >
        {listening === turn ? 'Press the pedal…' : 'Set'}
      </Button>
    </div>
  );

  return (
    <div
      role="dialog"
      aria-label="Pedals"
      data-testid="pedal-setup"
      data-performer-controls
      className="absolute inset-x-4 top-16 z-20 mx-auto max-w-md space-y-3 rounded border border-slate-200 bg-white p-4 text-sm text-slate-800 shadow-modal"
    >
      <div className="font-semibold">Pedals</div>
      {row('next', 'Next page')}
      {row('previous', 'Previous page')}
      <p className="text-xs text-slate-500">
        Nothing happens when you press a pedal? On iPad, turn off Full Keyboard Access (Settings ▸
        Accessibility ▸ Keyboards).
      </p>
      <div className="flex justify-end gap-2">
        <Button type="button" size="sm" variant="quiet" onClick={() => onChange(DEFAULT_PEDALS)}>
          Reset
        </Button>
        <Button
          type="button"
          size="sm"
          variant="primary"
          data-testid="pedal-done"
          onClick={onClose}
        >
          Done
        </Button>
      </div>
    </div>
  );
}
