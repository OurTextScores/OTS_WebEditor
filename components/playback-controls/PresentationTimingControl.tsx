'use client';
import { SlidersHorizontal } from 'lucide-react';
import { usePresentationPreferences } from '../../lib/playback/use-presentation-preferences';
import { setPresentationLead } from '../../lib/playback/presentation-preferences';
import { Button, type ButtonVariant } from '../ui/Button';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/Popover';

/** Independent live-playback visual offsets; audio, notation and exported video stay on their own timeline. */
export function PresentationTimingControl({
  variant = 'outline',
  triggerClassName,
  testIdPrefix,
}: {
  variant?: ButtonVariant;
  triggerClassName?: string;
  testIdPrefix: string;
}) {
  const preferences = usePresentationPreferences();
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          size="sm"
          variant={variant}
          className={triggerClassName}
          aria-label="Playback visual timing"
          title="Playback visual timing"
          data-testid={`${testIdPrefix}-visual-timing`}
        >
          <SlidersHorizontal size={14} aria-hidden="true" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 space-y-3 text-sm">
        <p className="font-semibold">Visual timing</p>
        <p className="text-caption">
          Audio output delay is compensated automatically. Positive values show visuals earlier;
          negative values show them later.
        </p>
        {(['measure', 'cursor'] as const).map((kind) => (
          <label key={kind} className="block space-y-1">
            <span className="flex justify-between">
              <span>{kind === 'measure' ? 'Measure highlight' : 'Tracking cursor'}</span>
              <span>{preferences[kind]} ms</span>
            </span>
            <input
              type="range"
              min={-500}
              max={500}
              step={5}
              value={preferences[kind]}
              aria-label={`${kind === 'measure' ? 'Measure' : 'Cursor'} lead (ms)`}
              aria-valuetext={`${preferences[kind]} milliseconds`}
              className="w-full accent-cyan-600"
              onChange={(event) => setPresentationLead(kind, Number(event.target.value))}
            />
          </label>
        ))}
        <Button
          size="sm"
          onClick={() => {
            setPresentationLead('measure', 0);
            setPresentationLead('cursor', 0);
          }}
        >
          Reset visual timing
        </Button>
        <p className="text-caption">Applies to live playback in the editor and player.</p>
      </PopoverContent>
    </Popover>
  );
}
