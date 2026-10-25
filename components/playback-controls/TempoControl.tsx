'use client';

import React, { useState } from 'react';
import { Gauge } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/Popover';
import { Button, type ButtonVariant } from '../ui/Button';
import {
  MAX_TEMPO_PERCENT,
  MIN_TEMPO_PERCENT,
  TEMPO_PRESETS,
  TEMPO_STEP,
  resetTempo,
  setTempoPercent,
} from '../../lib/playback/playback-options-preferences';
import {
  usePlaybackOptionPreferences,
  usePlaybackOptionsStatus,
} from '../../lib/playback/use-playback-options';
import { useTempoDraft } from './useTempoDraft';

const SLIDER_KEYS = new Set([
  'ArrowLeft',
  'ArrowRight',
  'ArrowUp',
  'ArrowDown',
  'PageUp',
  'PageDown',
  'Home',
  'End',
]);

type Props = {
  /** The trigger's look, so the editor header and the player bar can each keep their own. */
  variant?: ButtonVariant;
  triggerClassName?: string;
  testIdPrefix: string;
};

/**
 * Playback speed: a compact "100%" trigger opening a slider, a number field, presets and Reset. It changes how fast
 * the score plays, keeping pitch and every written tempo relationship; it never edits tempo markings.
 */
export function TempoControl({ variant = 'outline', triggerClassName, testIdPrefix }: Props) {
  const { tempoPercent } = usePlaybackOptionPreferences();
  const status = usePlaybackOptionsStatus();
  const draft = useTempoDraft(tempoPercent);
  const [text, setText] = useState<string | null>(null);
  const unavailable = status.capability === 'unavailable';
  const commitText = () => {
    if (text === null) return;
    const value = Number(text);
    setText(null);
    if (text.trim() !== '' && Number.isFinite(value)) setTempoPercent(value);
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          size="sm"
          variant={variant}
          data-testid={`${testIdPrefix}-tempo`}
          className={`gap-1 ${triggerClassName ?? ''}`}
          disabled={unavailable}
          title={
            unavailable ? 'Playback speed is not available with this engine' : 'Playback speed'
          }
          aria-label={`Playback speed ${draft.value}%`}
        >
          <Gauge size={14} aria-hidden="true" />
          <span className="tabular-nums">{draft.value}%</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-64 space-y-3 text-sm"
        data-testid={`${testIdPrefix}-tempo-panel`}
      >
        <div className="flex items-baseline justify-between">
          <span className="font-semibold text-ink">Playback speed</span>
          <span className="tabular-nums text-slate-600">{draft.value}%</span>
        </div>
        <input
          type="range"
          data-testid={`${testIdPrefix}-tempo-slider`}
          className="w-full accent-[var(--color-accent,currentColor)]"
          min={MIN_TEMPO_PERCENT}
          max={MAX_TEMPO_PERCENT}
          step={TEMPO_STEP}
          value={draft.value}
          aria-label="Playback speed"
          aria-valuetext={`${draft.value} percent`}
          onChange={(event) => draft.preview(Number(event.currentTarget.value))}
          onPointerUp={(event) => draft.commit(Number(event.currentTarget.value))}
          onKeyUp={(event) => {
            if (SLIDER_KEYS.has(event.key)) draft.commitSoon(Number(event.currentTarget.value));
          }}
          onBlur={() => draft.commit()}
        />
        <label className="flex items-center gap-2 text-slate-700">
          <span>Percent</span>
          <input
            type="number"
            data-testid={`${testIdPrefix}-tempo-input`}
            className="w-20 rounded border border-line-control bg-surface px-2 py-1 tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            min={MIN_TEMPO_PERCENT}
            max={MAX_TEMPO_PERCENT}
            step={1}
            value={text ?? String(tempoPercent)}
            onChange={(event) => setText(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') commitText();
              if (event.key === 'Escape') setText(null);
            }}
            onBlur={commitText}
          />
        </label>
        <div className="flex flex-wrap gap-1" role="group" aria-label="Speed presets">
          {TEMPO_PRESETS.map((preset) => (
            <Button
              key={preset}
              size="xs"
              variant={preset === tempoPercent ? 'primary' : 'outline'}
              aria-pressed={preset === tempoPercent}
              data-testid={`${testIdPrefix}-tempo-preset-${preset}`}
              onClick={() => setTempoPercent(preset)}
            >
              {preset}%
            </Button>
          ))}
        </div>
        <div className="flex items-center justify-between gap-2">
          <Button
            size="xs"
            variant="neutral"
            data-testid={`${testIdPrefix}-tempo-reset`}
            disabled={tempoPercent === 100}
            onClick={resetTempo}
          >
            Reset
          </Button>
          <span className="text-caption text-slate-500" role="status">
            {status.error ?? (status.applying ? 'Applying…' : '')}
          </span>
        </div>
        <p className="text-caption text-slate-500">
          Changes playback speed only; pitch and written tempo markings stay as they are.
        </p>
      </PopoverContent>
    </Popover>
  );
}
