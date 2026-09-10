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
import { PaletteLink } from '../PaletteLink';
import { BeamIcon } from '../BeamIcon';
import { graceNoteOptions } from '../constants';
import { Music2, PenLine, Speech, Spline, Waves, Layers, FlipVertical2 } from 'lucide-react';
import styles from './NotesSection.module.css';

const graceNoteGlyphs: Record<number, string> = {
  1: '\uE560',
  2: '\uE562',
  8: '\uE1D9',
  16: '\uE1DB',
  32: '\uE1D7',
  64: '\uE1D9',
  128: '\uE1DB',
};

const ottavaOptions = [
  { label: '8va', value: 0, symbol: '\uE511', common: true },
  { label: '8vb', value: 1, symbol: '\uE51C', common: true },
  { label: '15ma', value: 2, symbol: '\uE515', common: true },
  { label: '15mb', value: 3, symbol: '\uE51D', common: true },
  { label: '22ma', value: 4, symbol: '\uE518', common: false },
  { label: '22mb', value: 5, symbol: '\uE51E', common: false },
] as const;

const trillOptions = [
  { label: 'Trill line', value: 0 },
  { label: 'Up-prall line', value: 1 },
  { label: 'Down-prall line', value: 2 },
  { label: 'Prall-prall line', value: 3 },
] as const;

const glissandoOptions = [
  { label: 'Straight glissando', value: 0, symbol: '\uE585' },
  { label: 'Wavy glissando', value: 1, symbol: '\uEAAF' },
] as const;

const arpeggioOptions = [
  { label: 'Arpeggio', value: 0, symbol: '\uE63C' },
  { label: 'Arpeggio up', value: 1, symbol: '\uE634' },
  { label: 'Arpeggio down', value: 2, symbol: '\uE635' },
  { label: 'Arpeggio bracket', value: 3, symbol: '\uE002' },
] as const;

const tremoloOptions = [
  { label: 'Eighth-note tremolo', value: 0, symbol: '\uE220', common: true },
  { label: '16th-note tremolo', value: 1, symbol: '\uE221', common: true },
  { label: '32nd-note tremolo', value: 2, symbol: '\uE222', common: true },
  { label: '64th-note tremolo', value: 3, symbol: '\uE223', common: false },
  { label: 'Buzz roll', value: 4, symbol: '\uE22A', common: false },
  { label: 'Two-note eighth tremolo', value: 5, symbol: '\uE220', common: false },
  { label: 'Two-note 16th tremolo', value: 6, symbol: '\uE221', common: false },
  { label: 'Two-note 32nd tremolo', value: 7, symbol: '\uE222', common: false },
  { label: 'Two-note 64th tremolo', value: 8, symbol: '\uE223', common: false },
] as const;

const beamOptions = [
  { label: 'Auto beam', value: 0 },
  { label: 'Begin beam / break left', value: 2 },
  { label: 'Join beams', value: 6 },
  { label: 'No beam', value: 1 },
  { label: 'Break secondary beam at eighth', value: 3 },
  { label: 'Break secondary beam at 16th', value: 4 },
] as const;

const fretDiagramOptions = [
  { label: 'Blank', pattern: '......' },
  { label: 'C', pattern: 'X32010' },
  { label: 'G', pattern: '320003' },
  { label: 'D', pattern: 'XX0232' },
  { label: 'A', pattern: 'X02220' },
  { label: 'E', pattern: '022100' },
  { label: 'Am', pattern: 'X02210' },
  { label: 'Em', pattern: '022000' },
  { label: 'Dm', pattern: 'XX0231' },
] as const;

export const NotesSection: React.FC<ToolbarSectionProps> = ({
  onAddGraceNote,
  onSetVoice,
  onAddSlur,
  onAddTie,
  onFlipStem,
  onAddOttava,
  onAddTrill,
  onAddGlissando,
  onAddArpeggio,
  onAddTremolo,
  onOpenPalette,
  onSetBeamMode,
  onAddFretDiagram,
  onToggleNoteInput,
  noteInputActive,
  noteInputMethod,
  onSetNoteInputMethod,
  mutationsEnabled,
  selectionActive,
}) => {
  const mutationDisabled = !mutationsEnabled;

  return (
    <>
      <Button
        data-testid="btn-note-input"
        onClick={onToggleNoteInput}
        disabled={mutationDisabled || !onToggleNoteInput}
        variant={noteInputActive ? 'primary' : 'outline'}
        size="sm"
        className="shadow-sm"
        title="Note input mode (N) — click in the staff to place notes"
        aria-label="Toggle note input mode"
        aria-pressed={Boolean(noteInputActive)}
      >
        <PenLine size={14} className="mr-2" />
        {noteInputActive ? 'Stop input' : 'Input'}
      </Button>

      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button
            data-testid="dropdown-note-input-method"
            variant="outline"
            size="sm"
            disabled={mutationDisabled || !noteInputActive || !onSetNoteInputMethod}
            className="shadow-sm"
            title="Choose how note input changes the score"
          >
            {noteInputMethod === 2
              ? 'Repitch'
              : noteInputMethod === 3
                ? 'Rhythm'
                : noteInputMethod === 6
                  ? 'Timewise'
                  : 'Step-time'}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          {[
            { label: 'Step-time', value: 1 },
            { label: 'Repitch', value: 2 },
            { label: 'Rhythm', value: 3 },
            { label: 'Timewise (insert)', value: 6 },
          ].map((option) => (
            <DropdownMenuItem
              key={option.value}
              data-testid={`btn-note-input-method-${option.value}`}
              onSelect={() => onSetNoteInputMethod?.(option.value)}
            >
              {option.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button
            data-testid="dropdown-fretboards"
            variant="outline"
            size="sm"
            disabled={mutationDisabled || !selectionActive || !onAddFretDiagram}
            className="shadow-sm"
          >
            Fretboards
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          data-testid="fretboards-menu"
          className="max-h-[var(--radix-dropdown-menu-content-available-height)] overflow-y-auto"
        >
          <DropdownMenuLabel>Common</DropdownMenuLabel>
          {fretDiagramOptions.map((option) => (
            <DropdownMenuItem
              key={option.label}
              data-testid={`btn-fretboard-${option.label.toLowerCase()}`}
              onSelect={() => onAddFretDiagram?.(option.pattern)}
            >
              <span className="mr-3 min-w-8 font-semibold">{option.label}</span>
              <span className="font-mono text-xs text-slate-500">
                {option.pattern.replaceAll('.', '–')}
              </span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button
            data-testid="dropdown-beams"
            variant="outline"
            size="sm"
            disabled={mutationDisabled || !selectionActive}
            className="shadow-sm"
          >
            Beams
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          {beamOptions.map((option) => (
            <DropdownMenuItem
              key={option.value}
              data-testid={`btn-beam-${option.value}`}
              className="min-h-10 gap-3"
              disabled={!onSetBeamMode}
              onSelect={() => onSetBeamMode?.(option.value)}
            >
              <BeamIcon value={option.value} className="shrink-0 text-slate-800" />
              <span>{option.label}</span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button
            data-testid="dropdown-grace-notes"
            variant="outline"
            size="sm"
            disabled={mutationDisabled}
            className="shadow-sm"
          >
            <Music2 size={14} className="mr-2" />
            Grace Notes
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          {graceNoteOptions.map((opt) => (
            <DropdownMenuItem
              key={opt.value}
              data-testid={opt.testId}
              className="min-h-10 gap-3"
              disabled={mutationDisabled || !selectionActive || !onAddGraceNote}
              onSelect={() => onAddGraceNote?.(opt.value)}
            >
              <span
                data-testid={`grace-symbol-${opt.value}`}
                className={styles.graceNoteSymbol}
                aria-hidden="true"
              >
                {graceNoteGlyphs[opt.value]}
              </span>
              <span>{opt.label}</span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button
            data-testid="dropdown-voice"
            variant="outline"
            size="sm"
            disabled={mutationDisabled}
            className="shadow-sm"
          >
            <Speech size={14} className="mr-2" />
            Voice
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          {[1, 2, 3, 4].map((v) => (
            <DropdownMenuItem
              key={v}
              data-testid={`btn-voice-${v}`}
              disabled={mutationDisabled || !onSetVoice}
              onSelect={() => onSetVoice?.(v - 1)}
            >
              Voice {v}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button
            data-testid="dropdown-slur-tie"
            variant="outline"
            size="sm"
            disabled={mutationDisabled || !selectionActive}
            className="shadow-sm"
          >
            <Spline size={14} className="mr-2" />
            Slur/Tie
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem
            data-testid="btn-slur"
            disabled={mutationDisabled || !selectionActive || !onAddSlur}
            onSelect={() => onAddSlur?.()}
          >
            Slur
          </DropdownMenuItem>
          <DropdownMenuItem
            data-testid="btn-tie"
            disabled={mutationDisabled || !selectionActive || !onAddTie}
            onSelect={() => onAddTie?.()}
          >
            Tie
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Button
        data-testid="btn-flip-stem"
        variant="outline"
        size="sm"
        disabled={mutationDisabled || !selectionActive || !onFlipStem}
        onClick={() => onFlipStem?.()}
        className="shadow-sm"
        title="Flip stem direction of the selected notes"
      >
        <FlipVertical2 size={14} className="mr-2" />
        Flip Stem
      </Button>

      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button
            data-testid="dropdown-lines"
            variant="outline"
            size="sm"
            disabled={mutationDisabled || !selectionActive}
            className="shadow-sm"
          >
            <Waves size={14} className="mr-2" />
            Lines
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          data-testid="lines-menu"
          className="max-h-[var(--radix-dropdown-menu-content-available-height)] overflow-y-auto"
        >
          <DropdownMenuLabel>Ottava</DropdownMenuLabel>
          {ottavaOptions
            .filter((option) => option.common)
            .map((option) => (
              <DropdownMenuItem
                key={option.value}
                data-testid={`btn-ottava-${option.value}`}
                className="min-h-10 gap-3"
                disabled={!onAddOttava}
                onSelect={() => onAddOttava?.(option.value)}
              >
                <span
                  data-testid={`ottava-symbol-${option.value}`}
                  className={styles.lineSymbol}
                  aria-hidden="true"
                >
                  {option.symbol}
                </span>
                <span>{option.label}</span>
              </DropdownMenuItem>
            ))}
          <PaletteLink
            category="Ottavas"
            label="Open Ottava Palette…"
            testId="btn-open-ottava-palette"
            onOpenPalette={onOpenPalette}
          />
          <DropdownMenuLabel>Trills</DropdownMenuLabel>
          {trillOptions.map((option) => (
            <DropdownMenuItem
              key={option.value}
              data-testid={`btn-trill-${option.value}`}
              className="min-h-10 gap-3"
              disabled={!onAddTrill}
              onSelect={() => onAddTrill?.(option.value)}
            >
              <span
                data-testid={`trill-symbol-${option.value}`}
                className={styles.lineSymbol}
                aria-hidden="true"
              >
                {'\uE566\uEAA4'}
              </span>
              <span>{option.label}</span>
            </DropdownMenuItem>
          ))}
          <DropdownMenuLabel>Glissandos</DropdownMenuLabel>
          {glissandoOptions.map((option) => (
            <DropdownMenuItem
              key={option.value}
              data-testid={`btn-glissando-${option.value}`}
              className="min-h-10 gap-3"
              disabled={!onAddGlissando}
              onSelect={() => onAddGlissando?.(option.value)}
            >
              <span
                data-testid={`glissando-symbol-${option.value}`}
                className={styles.lineSymbol}
                aria-hidden="true"
              >
                {option.symbol}
              </span>
              <span>{option.label}</span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button
            data-testid="dropdown-chord"
            variant="outline"
            size="sm"
            disabled={mutationDisabled || !selectionActive}
            className="shadow-sm"
          >
            <Layers size={14} className="mr-2" />
            Chord
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          data-testid="chord-menu"
          className="max-h-[var(--radix-dropdown-menu-content-available-height)] overflow-y-auto"
        >
          <DropdownMenuLabel>Arpeggios</DropdownMenuLabel>
          {arpeggioOptions.map((option) => (
            <DropdownMenuItem
              key={option.value}
              data-testid={`btn-arpeggio-${option.value}`}
              className="min-h-10 gap-3"
              disabled={!onAddArpeggio}
              onSelect={() => onAddArpeggio?.(option.value)}
            >
              <span
                data-testid={`arpeggio-symbol-${option.value}`}
                className={styles.chordSymbol}
                aria-hidden="true"
              >
                {option.symbol}
              </span>
              <span>{option.label}</span>
            </DropdownMenuItem>
          ))}
          <DropdownMenuLabel>Tremolos</DropdownMenuLabel>
          {tremoloOptions
            .filter((option) => option.common)
            .map((option) => (
              <DropdownMenuItem
                key={option.value}
                data-testid={`btn-tremolo-${option.value}`}
                className="min-h-10 gap-3"
                disabled={!onAddTremolo}
                onSelect={() => onAddTremolo?.(option.value)}
              >
                <span
                  data-testid={`tremolo-symbol-${option.value}`}
                  className={styles.chordSymbol}
                  aria-hidden="true"
                >
                  {option.symbol}
                </span>
                <span>{option.label}</span>
              </DropdownMenuItem>
            ))}
          <PaletteLink
            category="Tremolos"
            label="Open Tremolo Palette…"
            testId="btn-open-tremolo-palette"
            onOpenPalette={onOpenPalette}
          />
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
};
