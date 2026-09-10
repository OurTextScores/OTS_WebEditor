import React from 'react';
import { Button } from '../../ui/Button';
import {
  DropdownMenuItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
  DropdownMenu,
  DropdownMenuLabel,
} from '../../ui/DropdownMenu';
import { ToolbarSectionProps } from '../types';
import { durationOptions, tupletOptions } from '../constants';
import { ArrowLeftToLine, ArrowRightToLine, Timer } from 'lucide-react';
import styles from './DurationSection.module.css';

// SMuFL metronome note glyphs keyed by DurationType value.
const durationGlyphs: Record<number, string> = {
  2: String.fromCharCode(0xe1d2), // whole
  3: String.fromCharCode(0xe1d3), // half
  4: String.fromCharCode(0xe1d5), // quarter
  5: String.fromCharCode(0xe1d7), // eighth
  6: String.fromCharCode(0xe1d9), // 16th
  7: String.fromCharCode(0xe1db), // 32nd
};

export const DurationSection: React.FC<ToolbarSectionProps> = ({
  onDurationShorter,
  onDurationLonger,
  onSetDurationType,
  onToggleDot,
  onToggleDoubleDot,
  onAddTuplet,
  mutationsEnabled,
  selectionActive,
  noteInputActive,
}) => {
  const mutationDisabled = !mutationsEnabled;
  const durationControlDisabled = mutationDisabled || (!noteInputActive && !selectionActive);

  return (
    <>
      <Button
        data-testid="btn-duration-shorter"
        onClick={onDurationShorter}
        disabled={mutationDisabled || !onDurationShorter || !selectionActive || noteInputActive}
        variant="outline"
        size="xs"
        className="shadow-sm"
        title="Shorter"
        aria-label="Shorter"
      >
        <ArrowLeftToLine size={14} />
      </Button>
      <Button
        data-testid="btn-duration-longer"
        onClick={onDurationLonger}
        disabled={mutationDisabled || !onDurationLonger || !selectionActive || noteInputActive}
        variant="outline"
        size="xs"
        className="shadow-sm"
        title="Longer"
        aria-label="Longer"
      >
        <ArrowRightToLine size={14} />
      </Button>
      <div className="h-3 w-px bg-slate-200"></div>
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button
            data-testid="dropdown-rhythm"
            variant="outline"
            size="sm"
            disabled={mutationDisabled}
            className="shadow-sm"
          >
            <Timer size={14} className="mr-2" />
            Rhythm
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuLabel>Duration</DropdownMenuLabel>
          {durationOptions.map((opt) => (
            <DropdownMenuItem
              key={opt.value}
              data-testid={opt.testId}
              className="min-h-10 gap-3"
              disabled={durationControlDisabled || !onSetDurationType}
              title={`Shortcut: press ${opt.shortcut} for ${opt.label}`}
              onSelect={() => onSetDurationType?.(opt.value)}
            >
              <span
                data-testid={`duration-symbol-${opt.value}`}
                className={styles.durationSymbol}
                aria-hidden="true"
              >
                {durationGlyphs[opt.value]}
              </span>
              <span>{opt.label}</span>
            </DropdownMenuItem>
          ))}
          <DropdownMenuLabel>Dots</DropdownMenuLabel>
          <DropdownMenuItem
            data-testid="btn-dot"
            disabled={durationControlDisabled || !onToggleDot}
            onSelect={() => onToggleDot?.()}
          >
            Dot
          </DropdownMenuItem>
          <DropdownMenuItem
            data-testid="btn-double-dot"
            disabled={mutationDisabled || !selectionActive || !onToggleDoubleDot || noteInputActive}
            onSelect={() => onToggleDoubleDot?.()}
          >
            Double Dot
          </DropdownMenuItem>
          <DropdownMenuLabel>Tuplets</DropdownMenuLabel>
          {tupletOptions.map((opt) => (
            <DropdownMenuItem
              key={opt.count}
              data-testid={`btn-tuplet-${opt.count}`}
              disabled={mutationDisabled || !selectionActive || !onAddTuplet}
              onSelect={() => onAddTuplet?.(opt.count)}
            >
              {opt.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
};
