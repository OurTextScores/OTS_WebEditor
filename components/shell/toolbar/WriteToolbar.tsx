'use client';

import { Hash, PenLine, Redo2, Undo2 } from 'lucide-react';
import React from 'react';
import { defaultCommandRegistry, type CommandRegistry } from '../../../lib/commands/registry';
import { Button } from '../../ui/Button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '../../ui/DropdownMenu';
import {
  accidentalOptions,
  durationOptions,
  noteInputMethodOptions,
  tupletOptions,
} from '../../toolbar/constants';
import styles from './WriteToolbar.module.css';
import { useToolbarCommands } from './useToolbarCommands';

// SMuFL metronome note glyphs keyed by DurationType value.
const DURATION_GLYPHS: Record<number, string> = {
  2: '', // whole
  3: '', // half
  4: '', // quarter
  5: '', // eighth
  6: '', // 16th
  7: '', // 32nd
};

// The three accidentals worth a button; the rest (double, clear) stay in the dropdown.
const QUICK_ACCIDENTALS = [1, 2, 3] as const;

const divider = <span aria-hidden="true" className="mx-1 h-4 w-px shrink-0 bg-slate-200" />;

const NOTE_INPUT_METHOD_LABELS: Record<number, string> = {
  2: 'Repitch',
  3: 'Rhythm',
  6: 'Timewise',
};

/**
 * The Write mode toolbar (SHELL_REDESIGN_DESIGN §8.2): note input, durations, accidentals,
 * ties and slurs, voices, undo and redo. About twenty controls, in one row that scrolls
 * sideways when the window is narrow. It owns no behaviour; every control runs a command.
 */
export function WriteToolbar({
  noteInputMethod,
  registry = defaultCommandRegistry,
}: {
  noteInputMethod?: number;
  registry?: CommandRegistry;
}) {
  const { ctx, enabled, checked, run } = useToolbarCommands(registry);
  const noteInputOn = checked('add.noteInput');
  const hasTarget = ctx.isMutable && (ctx.noteInput || ctx.selection !== 'none');

  return (
    <div
      role="toolbar"
      aria-label="Write"
      data-testid="write-toolbar"
      className="flex shrink-0 items-center gap-1 overflow-x-auto border-b border-slate-200 bg-white px-3 py-1"
    >
      <Button
        data-testid="btn-note-input"
        variant={noteInputOn ? 'primary' : 'outline'}
        size="sm"
        aria-pressed={noteInputOn}
        aria-label="Toggle note input mode"
        title="Note input mode (N): click in the staff to place notes"
        disabled={!enabled('add.noteInput')}
        onClick={run('add.noteInput')}
      >
        <PenLine size={14} className="mr-1.5" aria-hidden="true" />
        {noteInputOn ? 'Stop input' : 'Input'}
      </Button>
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button
            data-testid="dropdown-note-input-method"
            variant="outline"
            size="sm"
            title="How note input changes the score"
            disabled={!enabled('add.inputMethod')}
          >
            {NOTE_INPUT_METHOD_LABELS[noteInputMethod ?? 1] ?? 'Step-time'}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          {noteInputMethodOptions.map((option) => (
            <DropdownMenuItem
              key={option.value}
              data-testid={`btn-note-input-method-${option.value}`}
              onSelect={run('add.inputMethod', option.value)}
            >
              {option.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      {divider}

      {[...durationOptions].reverse().map((option) => (
        <Button
          key={option.value}
          data-testid={option.testId}
          variant="outline"
          size="xs"
          aria-label={option.label}
          title={`${option.label} (${option.shortcut})`}
          disabled={!enabled('edit.duration.set')}
          onClick={run('edit.duration.set', option.value)}
        >
          <span
            data-testid={`duration-symbol-${option.value}`}
            className={styles.glyph}
            aria-hidden="true"
          >
            {DURATION_GLYPHS[option.value]}
          </span>
        </Button>
      ))}
      <Button
        data-testid="btn-dot"
        variant="outline"
        size="xs"
        aria-label="Dot"
        title="Dot"
        disabled={!enabled('edit.duration.dot')}
        onClick={run('edit.duration.dot')}
      >
        ·
      </Button>
      <Button
        data-testid="btn-double-dot"
        variant="outline"
        size="xs"
        aria-label="Double dot"
        title="Double dot"
        disabled={!enabled('edit.duration.doubleDot')}
        onClick={run('edit.duration.doubleDot')}
      >
        ··
      </Button>
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button
            data-testid="dropdown-tuplet"
            variant="outline"
            size="xs"
            title="Tuplet"
            disabled={!enabled('add.tuplet')}
          >
            (3)
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuLabel>Tuplets</DropdownMenuLabel>
          {tupletOptions.map((option) => (
            <DropdownMenuItem
              key={option.count}
              data-testid={`btn-tuplet-${option.count}`}
              onSelect={run('add.tuplet', option.count)}
            >
              {option.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      {divider}

      {QUICK_ACCIDENTALS.map((value) => {
        const option = accidentalOptions.find((o) => o.value === value)!;
        return (
          <Button
            key={value}
            data-testid={`btn-acc-${value}`}
            variant="outline"
            size="xs"
            aria-label={option.name}
            title={option.name}
            disabled={!enabled('add.accidental') || !hasTarget}
            onClick={run('add.accidental', value)}
          >
            <span data-testid={`acc-symbol-${value}`} className={styles.glyph} aria-hidden="true">
              {option.symbol}
            </span>
          </Button>
        );
      })}
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button
            data-testid="dropdown-accidental"
            variant="outline"
            size="xs"
            aria-label="More accidentals"
            title="More accidentals"
            disabled={!enabled('add.accidental') || !hasTarget}
          >
            <Hash size={13} aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          {accidentalOptions
            .filter((option) => !(QUICK_ACCIDENTALS as readonly number[]).includes(option.value))
            .map((option) => (
              <DropdownMenuItem
                key={option.value}
                data-testid={`btn-acc-${option.value}`}
                className="min-h-9 gap-3"
                onSelect={run('add.accidental', option.value)}
              >
                {option.symbol ? (
                  <span className={styles.glyph} aria-hidden="true">
                    {option.symbol}
                  </span>
                ) : (
                  <span className="inline-flex min-w-[1.25rem]" aria-hidden="true" />
                )}
                <span>{option.name}</span>
              </DropdownMenuItem>
            ))}
        </DropdownMenuContent>
      </DropdownMenu>

      {divider}

      <Button
        data-testid="btn-tie"
        variant="outline"
        size="xs"
        title="Tie"
        disabled={!enabled('add.line.tie')}
        onClick={run('add.line.tie')}
      >
        Tie
      </Button>
      <Button
        data-testid="btn-slur"
        variant="outline"
        size="xs"
        title="Slur (S)"
        disabled={!enabled('add.line.slur')}
        onClick={run('add.line.slur')}
      >
        Slur
      </Button>

      {divider}

      {[1, 2, 3, 4].map((voice) => (
        <Button
          key={voice}
          data-testid={`btn-voice-${voice}`}
          variant="outline"
          size="xs"
          title={`Move to voice ${voice}`}
          disabled={!enabled('tools.voice')}
          onClick={run('tools.voice', voice - 1)}
        >
          V{voice}
        </Button>
      ))}

      {divider}

      <Button
        data-testid="btn-undo"
        variant="outline"
        size="xs"
        aria-label="Undo"
        title="Undo (Ctrl/Cmd + Z)"
        disabled={!enabled('edit.undo')}
        onClick={run('edit.undo')}
      >
        <Undo2 size={14} aria-hidden="true" />
      </Button>
      <Button
        data-testid="btn-redo"
        variant="outline"
        size="xs"
        aria-label="Redo"
        title="Redo (Ctrl + Y, Cmd + Shift + Z)"
        disabled={!enabled('edit.redo')}
        onClick={run('edit.redo')}
      >
        <Redo2 size={14} aria-hidden="true" />
      </Button>
    </div>
  );
}
