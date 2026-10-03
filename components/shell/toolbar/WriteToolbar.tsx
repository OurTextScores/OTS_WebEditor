'use client';

import { Hash, PenLine, Redo2, Undo2 } from 'lucide-react';
import React, { useRef, useState } from 'react';
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
import { Popover, PopoverAnchor, PopoverContent, PopoverPortal } from '../../ui/Popover';
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

/**
 * Height of each glyph's ink centre above its baseline, in em, read from Leland's outlines
 * (see WriteToolbar.module.css). The glyph is moved down by this much to centre it.
 */
const GLYPH_LIFT: Record<string, number> = {
  '\uE1D2': 0, // whole
  '\uE1D3': 0.372, // half
  '\uE1D5': 0.372, // quarter
  '\uE1D7': 0.378, // eighth
  '\uE1D9': 0.377, // 16th
  '\uE1DB': 0.466, // 32nd
  '\uE260': 0.139, // flat
  '\uE261': 0, // natural
  '\uE262': 0, // sharp
};

const glyphStyle = (glyph: string): React.CSSProperties =>
  ({ '--lift': GLYPH_LIFT[glyph] ?? 0 }) as React.CSSProperties;

const QUARTER = '\uE1D5';
const AUGMENTATION_DOT = '\uE1E7';
const LONG_PRESS_MS = 450;

// The three accidentals worth a button; the rest (double, clear) stay in the dropdown.
const QUICK_ACCIDENTALS = [1, 2, 3] as const;

/** Space between wrapped lines of buttons. */
const ROW_GAP = 8;

const divider = <span aria-hidden="true" className="mx-1 h-4 w-px shrink-0 bg-slate-200" />;

const NOTE_INPUT_METHOD_LABELS: Record<number, string> = {
  2: 'Repitch',
  3: 'Rhythm',
  6: 'Timewise',
};

/**
 * The Write quick controls (SHELL_REDESIGN_DESIGN §8.2): note input, durations, accidentals,
 * ties and slurs, voices, undo and redo. About twenty controls, the first group of the Write toolbar
 * (`ToolStrip` wraps it with the rest and the collapse toggle). It owns no behaviour; every control runs a command.
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
      role="group"
      aria-label="Write"
      data-testid="write-toolbar"
      style={{ rowGap: ROW_GAP }}
      className="flex min-w-0 flex-wrap items-center gap-1"
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
          className={styles.glyphButton}
          aria-label={option.label}
          title={`${option.label} (${option.shortcut})`}
          disabled={!enabled('edit.duration.set')}
          onClick={run('edit.duration.set', option.value)}
        >
          <span
            data-testid={`duration-symbol-${option.value}`}
            className={styles.glyph}
            style={glyphStyle(DURATION_GLYPHS[option.value])}
            aria-hidden="true"
          >
            {DURATION_GLYPHS[option.value]}
          </span>
        </Button>
      ))}
      <DotButton
        enabled={{
          single: enabled('edit.duration.dot'),
          double: enabled('edit.duration.doubleDot'),
        }}
        run={{ single: run('edit.duration.dot'), double: run('edit.duration.doubleDot') }}
      />
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
            className={styles.glyphButton}
            aria-label={option.name}
            title={option.name}
            disabled={!enabled('add.accidental') || !hasTarget}
            onClick={run('add.accidental', value)}
          >
            <span
              data-testid={`acc-symbol-${value}`}
              className={styles.glyph}
              style={glyphStyle(option.symbol)}
              aria-hidden="true"
            >
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
                  <span
                    className={styles.glyph}
                    style={glyphStyle(option.symbol)}
                    aria-hidden="true"
                  >
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

/**
 * The augmentation dot, after Viritura's: a quarter note with its dots, so the button shows
 * what it adds. A click applies the chosen number of dots (toggling, as the commands do); a
 * right-click or a long press chooses between one and two dots, and the glyph follows.
 * `btn-dot` and `btn-double-dot` stay the test ids of the two choices.
 */
function DotButton({
  enabled,
  run,
}: {
  enabled: { single: boolean; double: boolean };
  run: { single: () => void; double: () => void };
}) {
  const [dots, setDots] = useState<1 | 2>(1);
  const [open, setOpen] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  const pressed = useRef(false);
  const cancelPress = () => window.clearTimeout(timer.current);
  const current = dots === 1 ? 'single' : 'double';
  const choose = (count: 1 | 2) => {
    setDots(count);
    setOpen(false);
    (count === 1 ? run.single : run.double)();
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <span className="inline-flex">
          <Button
            data-testid="toolbar-dot"
            variant="outline"
            size="xs"
            className={styles.glyphButton}
            aria-label={dots === 1 ? 'Dot' : 'Double dot'}
            aria-haspopup="menu"
            title={`${dots === 1 ? 'Dot' : 'Double dot'}: click to apply, right-click or hold for more`}
            disabled={!enabled[current]}
            onPointerDown={() => {
              pressed.current = false;
              timer.current = window.setTimeout(() => {
                pressed.current = true;
                setOpen(true);
              }, LONG_PRESS_MS);
            }}
            onPointerUp={cancelPress}
            onPointerLeave={cancelPress}
            onContextMenu={(event) => {
              event.preventDefault();
              cancelPress();
              setOpen(true);
            }}
            onClick={() => {
              // The long press that opened the menu must not also apply a dot.
              if (pressed.current) return;
              run[current]();
            }}
          >
            <span className={styles.glyph} style={glyphStyle(QUARTER)} aria-hidden="true">
              {QUARTER}
              <span className={styles.dots}>{AUGMENTATION_DOT.repeat(dots)}</span>
            </span>
          </Button>
        </span>
      </PopoverAnchor>
      <PopoverPortal>
        <PopoverContent
          role="menu"
          align="start"
          className="relative z-menu flex w-40 flex-col gap-0.5 p-1"
        >
          {(
            [
              [1, 'btn-dot', 'Dot', 'single'],
              [2, 'btn-double-dot', 'Double dot', 'double'],
            ] as const
          ).map(([count, testId, label, key]) => (
            <button
              key={testId}
              type="button"
              role="menuitem"
              data-testid={testId}
              disabled={!enabled[key]}
              onClick={() => choose(count)}
              className="flex items-center gap-2 rounded px-2 py-1.5 text-left text-xs text-slate-800 hover:bg-slate-100 disabled:opacity-40"
            >
              <span
                className={`${styles.glyph} ${styles.menuGlyph}`}
                style={glyphStyle(QUARTER)}
                aria-hidden="true"
              >
                {QUARTER}
                <span className={styles.dots}>{AUGMENTATION_DOT.repeat(count)}</span>
              </span>
              {label}
            </button>
          ))}
        </PopoverContent>
      </PopoverPortal>
    </Popover>
  );
}
