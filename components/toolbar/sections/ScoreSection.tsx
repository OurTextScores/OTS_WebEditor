import React, { useState, useMemo } from 'react';
import { Button } from '../../ui/Button';
import {
  DropdownMenuItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
  DropdownMenu,
  DropdownMenuLabel,
} from '../../ui/DropdownMenu';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '../../ui/Select';
import { ToolbarSectionProps } from '../types';
import {
  clefButtonOptionsDefault,
  barlineOptions,
  repeatCountOptions,
  voltaOptions,
  markerOptions,
  jumpOptions,
} from '../constants';
import { clefScorePaletteItem, barlineGlyph, SCORE_PALETTE_DRAG_MIME } from '../palette';
import { PaletteLink } from '../PaletteLink';
import { flattenInstrumentGroups, pickCommonInstruments } from '../instrumentChoices';
import { VoltaIcon } from '../VoltaIcon';
import { Guitar, Repeat, Signpost } from 'lucide-react';
import styles from './ScoreSection.module.css';

const commonClefValues = new Set([0, 20, 10, 11]);

const clefSymbol = (clefType: number): string => {
  const exactGlyphs: Record<number, string> = {
    0: '\uE050',
    1: '\uE051',
    2: '\uE052',
    3: '\uE053',
    4: '\uE054',
    5: '\uE055',
    6: '\uE057',
    7: '\uE050',
    20: '\uE062',
    21: '\uE063',
    22: '\uE064',
    23: '\uE065',
    24: '\uE066',
    29: '\uE069',
    30: '\uE06A',
    31: '\uE06D',
    32: '\uE06E',
    33: '\uE06D',
    34: '\uE06E',
  };
  if (exactGlyphs[clefType]) {
    return exactGlyphs[clefType];
  }
  if (clefType >= 8 && clefType <= 19) {
    return '\uE05C';
  }
  if (clefType >= 20 && clefType <= 28) {
    return '\uE062';
  }
  return '\uE050';
};

const TREBLE_CLEF = String.fromCharCode(0xe050); // SMuFL gClef
const REPEAT_START_GLYPH = String.fromCharCode(0xe040); // SMuFL repeatLeft
const REPEAT_END_GLYPH = String.fromCharCode(0xe041); // SMuFL repeatRight

export const ScoreSection: React.FC<ToolbarSectionProps> = ({
  instrumentGroups = [],
  parts = [],
  onAddPart,
  onRemovePart,
  onTogglePartVisible,
  onSetClef,
  clefOptions,
  onToggleRepeatStart,
  onToggleRepeatEnd,
  onSetRepeatCount,
  onSetBarLineType,
  onAddVolta,
  onAddMarker,
  onAddJump,
  onOpenPalette,
  exportsEnabled,
  mutationsEnabled,
  paletteDropEnabled,
  selectionActive,
  instrumentsInDock,
}) => {
  const [selectedInstrumentId, setSelectedInstrumentId] = useState('');

  const mutationDisabled = !mutationsEnabled;
  const instrumentsDisabled = !exportsEnabled;

  const instrumentOptions = useMemo(
    () => flattenInstrumentGroups(instrumentGroups),
    [instrumentGroups],
  );
  const commonInstruments = useMemo(
    () => pickCommonInstruments(instrumentOptions),
    [instrumentOptions],
  );

  const hasInstrumentTemplates = instrumentOptions.length > 0;
  const instrumentIdToAdd =
    selectedInstrumentId || (hasInstrumentTemplates ? instrumentOptions[0].id : '');

  const clefButtonOptions = clefOptions ?? clefButtonOptionsDefault;
  const commonClefOptions = clefButtonOptions.filter((option) =>
    commonClefValues.has(option.value),
  );

  const renderClefOption = (opt: (typeof clefButtonOptions)[number]) => {
    const canClickApply = !mutationDisabled && Boolean(onSetClef);
    const canDragApply = !mutationDisabled && Boolean(paletteDropEnabled);
    return (
      <DropdownMenuItem
        key={opt.value}
        data-testid={`btn-clef-${opt.value}`}
        disabled={!canClickApply && !canDragApply}
        draggable={canDragApply}
        className={
          canDragApply
            ? 'min-h-12 cursor-grab gap-3 py-2 active:cursor-grabbing'
            : 'min-h-12 gap-3 py-2'
        }
        title={
          canClickApply && canDragApply
            ? `Click to apply ${opt.label}; drag to place it`
            : canDragApply
              ? `Drag ${opt.label} onto a measure`
              : `Click to apply ${opt.label}`
        }
        onSelect={(event) => {
          if (!canClickApply) {
            event.preventDefault();
            return;
          }
          onSetClef?.(opt.value);
        }}
        onDragStart={(event) => {
          if (!canDragApply) {
            event.preventDefault();
            return;
          }
          event.stopPropagation();
          event.dataTransfer.effectAllowed = 'copy';
          const item = clefScorePaletteItem(opt.label, opt.value);
          event.dataTransfer.setData(SCORE_PALETTE_DRAG_MIME, JSON.stringify(item));
          event.dataTransfer.setData('text/plain', item.label);
        }}
      >
        <span
          data-testid={`clef-symbol-${opt.value}`}
          className={styles.clefSymbol}
          aria-hidden="true"
        >
          {clefSymbol(opt.value)}
        </span>
        <span>{opt.label}</span>
      </DropdownMenuItem>
    );
  };

  return (
    <>
      {!instrumentsInDock && (
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <Button
              data-testid="dropdown-instruments"
              variant="outline"
              size="sm"
              disabled={instrumentsDisabled}
              className="shadow-sm"
            >
              <Guitar size={14} className="mr-2" />
              Instruments
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuLabel>Add</DropdownMenuLabel>
            {hasInstrumentTemplates ? (
              <>
                <Select
                  value={instrumentIdToAdd}
                  onValueChange={(value) => setSelectedInstrumentId(value)}
                  disabled={mutationDisabled}
                >
                  <SelectTrigger data-testid="select-instrument-add" className="w-full">
                    <SelectValue placeholder="Select instrument" />
                  </SelectTrigger>
                  <SelectContent>
                    {commonInstruments.length > 0 && (
                      <SelectGroup>
                        <SelectLabel>Common</SelectLabel>
                        {commonInstruments.map((entry, index) => (
                          <SelectItem
                            key={`common-${entry.instrument.id}-${index}`}
                            value={entry.instrument.id}
                          >
                            {entry.label}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    )}
                    {instrumentGroups.map((group) => (
                      <SelectGroup key={group.id}>
                        <SelectLabel>{group.name}</SelectLabel>
                        {group.instruments.map((instrument) => (
                          <SelectItem key={instrument.id} value={instrument.id}>
                            {instrument.name}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    ))}
                  </SelectContent>
                </Select>
                <DropdownMenuItem
                  disabled={mutationDisabled || !onAddPart || !instrumentIdToAdd}
                  onSelect={() => {
                    if (instrumentIdToAdd && onAddPart) onAddPart(instrumentIdToAdd);
                  }}
                >
                  Add Instrument
                </DropdownMenuItem>
              </>
            ) : (
              <div className="px-2 py-1 text-sm text-slate-600">Instrument list unavailable.</div>
            )}

            <DropdownMenuLabel>On Score</DropdownMenuLabel>
            {parts.length ? (
              parts.map((part) => (
                <div key={`${part.index}-${part.instrumentId}`} className="flex items-center gap-3">
                  <span className="flex-1 truncate text-sm text-slate-800">
                    {part.name || part.instrumentName || part.instrumentId}
                  </span>
                  <DropdownMenuItem
                    data-testid={`btn-part-visible-${part.index}`}
                    disabled={mutationDisabled || !onTogglePartVisible}
                    onSelect={() => onTogglePartVisible?.(part.index, !part.isVisible)}
                  >
                    {part.isVisible ? 'Hide' : 'Show'}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    data-testid={`btn-part-remove-${part.index}`}
                    disabled={mutationDisabled || !onRemovePart}
                    onSelect={() => {
                      if (!onRemovePart) return;
                      const label = part.name || part.instrumentName || 'this part';
                      if (typeof window === 'undefined' || window.confirm(`Remove ${label}?`))
                        onRemovePart(part.index);
                    }}
                  >
                    Remove
                  </DropdownMenuItem>
                </div>
              ))
            ) : (
              <div className="px-2 py-1 text-sm text-slate-600">No parts loaded.</div>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button
            data-testid="dropdown-clef"
            variant="outline"
            size="sm"
            disabled={mutationDisabled || (!onSetClef && !paletteDropEnabled)}
            className="shadow-sm"
          >
            <span className={styles.triggerGlyph} aria-hidden="true">
              {TREBLE_CLEF}
            </span>
            Clef
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent data-testid="clef-menu" className={styles.clefMenu}>
          <DropdownMenuLabel>Common</DropdownMenuLabel>
          {commonClefOptions.map(renderClefOption)}
          <PaletteLink
            category="Clefs"
            label="Open Clef Palette…"
            testId="btn-open-clef-palette"
            onOpenPalette={onOpenPalette}
          />
        </DropdownMenuContent>
      </DropdownMenu>

      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button
            data-testid="dropdown-repeats"
            variant="outline"
            size="sm"
            disabled={mutationDisabled || !selectionActive}
            className="shadow-sm"
          >
            <Repeat size={14} className="mr-2" />
            Repeats
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent data-testid="repeats-menu" className={styles.navigationMenu}>
          <DropdownMenuLabel>Repeats</DropdownMenuLabel>
          <DropdownMenuItem
            data-testid="btn-repeat-start"
            className="min-h-10 gap-3"
            disabled={mutationDisabled || !selectionActive || !onToggleRepeatStart}
            onSelect={() => onToggleRepeatStart?.()}
          >
            <span className={styles.markerSymbol} aria-hidden="true">
              {REPEAT_START_GLYPH}
            </span>
            <span>Start Repeat</span>
          </DropdownMenuItem>
          <DropdownMenuItem
            data-testid="btn-repeat-end"
            className="min-h-10 gap-3"
            disabled={mutationDisabled || !selectionActive || !onToggleRepeatEnd}
            onSelect={() => onToggleRepeatEnd?.()}
          >
            <span className={styles.markerSymbol} aria-hidden="true">
              {REPEAT_END_GLYPH}
            </span>
            <span>End Repeat</span>
          </DropdownMenuItem>
          <DropdownMenuLabel>Repeat Count</DropdownMenuLabel>
          {repeatCountOptions.map((opt) => (
            <DropdownMenuItem
              key={opt.count}
              data-testid={`btn-repeat-count-${opt.count}`}
              disabled={mutationDisabled || !selectionActive || !onSetRepeatCount}
              onSelect={() => onSetRepeatCount?.(opt.count)}
            >
              {opt.label}
            </DropdownMenuItem>
          ))}
          <DropdownMenuLabel>Barlines</DropdownMenuLabel>
          {barlineOptions.map((opt) => (
            <DropdownMenuItem
              key={opt.value}
              data-testid={`btn-barline-${opt.value}`}
              className="min-h-10 gap-3"
              disabled={mutationDisabled || !selectionActive || !onSetBarLineType}
              onSelect={() => onSetBarLineType?.(opt.value)}
            >
              <span className={styles.markerSymbol} aria-hidden="true">
                {barlineGlyph(opt.value)}
              </span>
              <span>{opt.label}</span>
            </DropdownMenuItem>
          ))}
          <DropdownMenuLabel>Voltas</DropdownMenuLabel>
          {voltaOptions.map((opt) => (
            <DropdownMenuItem
              key={opt.ending}
              data-testid={`btn-volta-${opt.ending}`}
              className="min-h-10 gap-3"
              disabled={mutationDisabled || !selectionActive || !onAddVolta}
              onSelect={() => onAddVolta?.(opt.ending)}
            >
              <VoltaIcon value={opt.ending} className="text-slate-800" />
              <span>{opt.label}</span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button
            data-testid="dropdown-navigation"
            variant="outline"
            size="sm"
            disabled={mutationDisabled || !selectionActive || (!onAddMarker && !onAddJump)}
            className="shadow-sm"
          >
            <Signpost size={14} className="mr-2" />
            Navigation
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent data-testid="navigation-menu" className={styles.navigationMenu}>
          <DropdownMenuLabel>Markers</DropdownMenuLabel>
          {markerOptions
            .filter((option) => option.common)
            .map((option) => (
              <DropdownMenuItem
                key={option.value}
                data-testid={`btn-marker-${option.value}`}
                className="min-h-10 gap-3"
                disabled={mutationDisabled || !selectionActive || !onAddMarker}
                onSelect={() => onAddMarker?.(option.value)}
              >
                <span
                  data-testid={`marker-symbol-${option.value}`}
                  className={styles.markerSymbol}
                  aria-hidden="true"
                >
                  {option.symbol}
                </span>
                <span>{option.label}</span>
              </DropdownMenuItem>
            ))}
          <PaletteLink
            category="Markers"
            label="Open Markers Palette…"
            testId="btn-open-markers-palette"
            onOpenPalette={onOpenPalette}
          />
          <DropdownMenuLabel>Jumps</DropdownMenuLabel>
          {jumpOptions
            .filter((option) => option.common)
            .map((option) => (
              <DropdownMenuItem
                key={option.value}
                data-testid={`btn-jump-${option.value}`}
                disabled={mutationDisabled || !selectionActive || !onAddJump}
                onSelect={() => onAddJump?.(option.value)}
              >
                <span className={styles.jumpLabel}>{option.label}</span>
              </DropdownMenuItem>
            ))}
          <PaletteLink
            category="Jumps"
            label="Open Jumps Palette…"
            testId="btn-open-jumps-palette"
            onOpenPalette={onOpenPalette}
          />
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
};
