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
import {
  dynamicOptions,
  hairpinOptions,
  pedalOptions,
  articulationOptions,
  fermataOptions,
  breathOptions,
} from '../constants';
import {
  articulationScorePaletteItem,
  dynamicScorePaletteItem,
  SCORE_PALETTE_DRAG_MIME,
} from '../palette';
import { Pencil, Footprints, Type, CircleDot } from 'lucide-react';
import styles from './ExpressionSection.module.css';

const resolveMenuPoint = (event?: unknown) => {
  const eventRecord =
    typeof event === 'object' && event !== null
      ? (event as { clientX?: unknown; clientY?: unknown; currentTarget?: EventTarget | null })
      : null;
  if (typeof eventRecord?.clientX === 'number' && typeof eventRecord.clientY === 'number') {
    return { clientX: eventRecord.clientX, clientY: eventRecord.clientY };
  }
  const target =
    eventRecord?.currentTarget instanceof HTMLElement ? eventRecord.currentTarget : null;
  if (target?.getBoundingClientRect) {
    const rect = target.getBoundingClientRect();
    return { clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2 };
  }
  if (typeof window !== 'undefined') {
    return { clientX: window.innerWidth / 2, clientY: window.innerHeight / 2 };
  }
  return { clientX: 0, clientY: 0 };
};

const dynamicGlyphs: Record<string, string> = {
  p: '\uE520',
  m: '\uE521',
  f: '\uE522',
  r: '\uE523',
  s: '\uE524',
  z: '\uE525',
  n: '\uE526',
};

const dynamicSymbol = (label: string) =>
  Array.from(label)
    .map((character) => dynamicGlyphs[character] ?? character)
    .join('');

const commonDynamicValues = new Set([4, 5, 6, 7, 8, 9, 10, 11, 15, 16, 18]);
const commonDynamics = dynamicOptions.filter((option) => commonDynamicValues.has(option.value));
const articulationGlyphs: Record<string, string> = {
  articStaccatoAbove: '\uE4A2',
  articTenutoAbove: '\uE4A4',
  articMarcatoAbove: '\uE4AC',
  articAccentAbove: '\uE4A0',
};

const renderDynamicOption = (
  opt: (typeof dynamicOptions)[number],
  mutationDisabled: boolean,
  selectionActive: boolean | undefined,
  onAddDynamic: ToolbarSectionProps['onAddDynamic'],
  paletteDropEnabled: boolean | undefined,
) => {
  const symbol = dynamicSymbol(opt.label);
  const canClickApply = !mutationDisabled && Boolean(selectionActive && onAddDynamic);
  const canDragApply = !mutationDisabled && Boolean(paletteDropEnabled);
  return (
    <DropdownMenuItem
      key={opt.label}
      data-testid={`btn-dynamic-${opt.value}`}
      aria-label={`Add ${opt.label} dynamic`}
      disabled={!canClickApply && !canDragApply}
      draggable={canDragApply}
      className={`min-h-9 justify-center ${canDragApply ? 'cursor-grab active:cursor-grabbing' : ''}`}
      title={
        canClickApply && canDragApply
          ? `Click to apply ${opt.label}; drag to place it`
          : canClickApply
            ? `Click to apply ${opt.label}`
            : `Drag ${opt.label} onto a note`
      }
      onSelect={(event) => {
        if (!canClickApply) {
          event.preventDefault();
          return;
        }
        onAddDynamic?.(opt.value);
      }}
      onDragStart={(event) => {
        if (!canDragApply) {
          event.preventDefault();
          return;
        }
        event.stopPropagation();
        event.dataTransfer.effectAllowed = 'copy';
        const item = dynamicScorePaletteItem(opt.label, symbol, opt.value);
        event.dataTransfer.setData(SCORE_PALETTE_DRAG_MIME, JSON.stringify(item));
        event.dataTransfer.setData('text/plain', item.label);
      }}
    >
      <span
        data-testid={`dynamic-symbol-${opt.value}`}
        className={styles.dynamicSymbol}
        aria-hidden="true"
      >
        {symbol}
      </span>
    </DropdownMenuItem>
  );
};

export const ExpressionSection: React.FC<ToolbarSectionProps> = ({
  onAddDynamic,
  onAddHairpin,
  onAddPedal,
  onAddSostenutoPedal,
  onAddUnaCorda,
  onSplitPedal,
  onOpenHeaderEditor,
  onAddStaffText,
  onAddSystemText,
  onAddExpressionText,
  onAddLyricText,
  onAddHarmonyText,
  onAddFiguredBassText,
  onAddFingeringText,
  onAddLeftHandGuitarFingeringText,
  onAddRightHandGuitarFingeringText,
  onAddStringNumberText,
  onAddStickingText,
  onAddInstrumentChangeText,
  onAddArticulation,
  onAddFermata,
  onAddBreath,
  onOpenPalette,
  mutationsEnabled,
  paletteDropEnabled,
  selectionActive,
}) => {
  const mutationDisabled = !mutationsEnabled;
  const textDropdownDisabled = mutationDisabled || (!selectionActive && !onOpenHeaderEditor);

  return (
    <>
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button
            data-testid="dropdown-markings"
            variant="outline"
            size="sm"
            disabled={mutationDisabled}
            className="shadow-sm"
          >
            <Pencil size={14} className="mr-2" />
            Dynamics
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent data-testid="markings-menu" className={styles.markingsMenu}>
          <DropdownMenuLabel>Common</DropdownMenuLabel>
          {commonDynamics.map((opt) =>
            renderDynamicOption(
              opt,
              mutationDisabled,
              selectionActive,
              onAddDynamic,
              paletteDropEnabled,
            ),
          )}
          <PaletteLink
            category="Dynamics"
            label="Open Dynamics Palette…"
            testId="btn-open-dynamics-palette"
            onOpenPalette={onOpenPalette}
          />
        </DropdownMenuContent>
      </DropdownMenu>

      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button
            data-testid="dropdown-hairpins"
            variant="outline"
            size="sm"
            disabled={mutationDisabled || !selectionActive || !onAddHairpin}
            className="shadow-sm"
          >
            <span className={styles.hairpinTriggerSymbol} aria-hidden="true">
              {''}
            </span>
            Hairpins
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          {hairpinOptions.map((opt) => (
            <DropdownMenuItem
              key={opt.label}
              data-testid={opt.testId}
              aria-label={`Add ${opt.label}`}
              className="min-h-9 justify-center"
              onSelect={() => onAddHairpin?.(opt.value)}
            >
              <span className={styles.hairpinSymbol} aria-hidden="true">
                {opt.value === 0 ? '' : ''}
              </span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button
            data-testid="dropdown-pedal"
            variant="outline"
            size="sm"
            disabled={mutationDisabled}
            className="shadow-sm"
          >
            <Footprints size={14} className="mr-2" />
            Pedal
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          {pedalOptions.map((opt) => (
            <DropdownMenuItem
              key={opt.label}
              data-testid={opt.testId}
              disabled={mutationDisabled || !selectionActive || !onAddPedal}
              onSelect={() => onAddPedal?.(opt.value)}
            >
              {opt.label}
            </DropdownMenuItem>
          ))}
          <DropdownMenuLabel>Special</DropdownMenuLabel>
          <DropdownMenuItem
            data-testid="btn-pedal-sostenuto"
            disabled={mutationDisabled || !selectionActive || !onAddSostenutoPedal}
            onSelect={() => onAddSostenutoPedal?.()}
          >
            Sostenuto Pedal
          </DropdownMenuItem>
          <DropdownMenuItem
            data-testid="btn-pedal-una-corda"
            disabled={mutationDisabled || !selectionActive || !onAddUnaCorda}
            onSelect={() => onAddUnaCorda?.()}
          >
            Una Corda
          </DropdownMenuItem>
          <DropdownMenuLabel>Variants</DropdownMenuLabel>
          <DropdownMenuItem
            data-testid="btn-pedal-split"
            disabled={mutationDisabled || !selectionActive || !onSplitPedal}
            onSelect={() => onSplitPedal?.()}
          >
            Pedal Change
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button
            data-testid="dropdown-text"
            variant="outline"
            size="sm"
            disabled={textDropdownDisabled}
            className="shadow-sm"
          >
            <Type size={14} className="mr-2" />
            Text
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuLabel>Score Header</DropdownMenuLabel>
          <DropdownMenuItem
            data-testid="btn-text-title"
            disabled={mutationDisabled || !onOpenHeaderEditor}
            onSelect={(event) => onOpenHeaderEditor?.('title', resolveMenuPoint(event))}
          >
            Title…
          </DropdownMenuItem>
          <DropdownMenuItem
            data-testid="btn-text-subtitle"
            disabled={mutationDisabled || !onOpenHeaderEditor}
            onSelect={(event) => onOpenHeaderEditor?.('subtitle', resolveMenuPoint(event))}
          >
            Subtitle…
          </DropdownMenuItem>
          <DropdownMenuItem
            data-testid="btn-text-composer"
            disabled={mutationDisabled || !onOpenHeaderEditor}
            onSelect={(event) => onOpenHeaderEditor?.('composer', resolveMenuPoint(event))}
          >
            Composer…
          </DropdownMenuItem>
          <DropdownMenuItem
            data-testid="btn-text-lyricist"
            disabled={mutationDisabled || !onOpenHeaderEditor}
            onSelect={(event) => onOpenHeaderEditor?.('lyricist', resolveMenuPoint(event))}
          >
            Lyricist…
          </DropdownMenuItem>
          <DropdownMenuLabel>Score Text</DropdownMenuLabel>
          <DropdownMenuItem
            data-testid="btn-text-staff"
            disabled={mutationDisabled || !selectionActive || !onAddStaffText}
            onSelect={() => onAddStaffText?.()}
          >
            Staff Text
          </DropdownMenuItem>
          <DropdownMenuItem
            data-testid="btn-text-system"
            disabled={mutationDisabled || !selectionActive || !onAddSystemText}
            onSelect={() => onAddSystemText?.()}
          >
            System Text
          </DropdownMenuItem>
          <DropdownMenuItem
            data-testid="btn-text-expression"
            disabled={mutationDisabled || !selectionActive || !onAddExpressionText}
            onSelect={() => onAddExpressionText?.()}
          >
            Expression Text
          </DropdownMenuItem>
          <DropdownMenuItem
            data-testid="btn-text-lyrics"
            disabled={mutationDisabled || !selectionActive || !onAddLyricText}
            onSelect={() => onAddLyricText?.()}
          >
            Lyrics
          </DropdownMenuItem>
          <DropdownMenuLabel>Harmony</DropdownMenuLabel>
          <DropdownMenuItem
            data-testid="btn-text-harmony-standard"
            disabled={mutationDisabled || !selectionActive || !onAddHarmonyText}
            onSelect={() => onAddHarmonyText?.(0)}
          >
            Chord Symbol
          </DropdownMenuItem>
          <DropdownMenuItem
            data-testid="btn-text-harmony-roman"
            disabled={mutationDisabled || !selectionActive || !onAddHarmonyText}
            onSelect={() => onAddHarmonyText?.(1)}
          >
            Roman Numeral
          </DropdownMenuItem>
          <DropdownMenuItem
            data-testid="btn-text-harmony-nashville"
            disabled={mutationDisabled || !selectionActive || !onAddHarmonyText}
            onSelect={() => onAddHarmonyText?.(2)}
          >
            Nashville Number
          </DropdownMenuItem>
          <DropdownMenuLabel>Figured Bass</DropdownMenuLabel>
          <DropdownMenuItem
            data-testid="btn-text-figured-bass"
            disabled={mutationDisabled || !selectionActive || !onAddFiguredBassText}
            onSelect={() => onAddFiguredBassText?.()}
          >
            Figured Bass
          </DropdownMenuItem>
          <DropdownMenuLabel>Fingering</DropdownMenuLabel>
          <DropdownMenuItem
            data-testid="btn-text-fingering"
            disabled={mutationDisabled || !selectionActive || !onAddFingeringText}
            onSelect={() => onAddFingeringText?.()}
          >
            Fingering
          </DropdownMenuItem>
          <DropdownMenuItem
            data-testid="btn-text-fingering-lh"
            disabled={mutationDisabled || !selectionActive || !onAddLeftHandGuitarFingeringText}
            onSelect={() => onAddLeftHandGuitarFingeringText?.()}
          >
            LH Guitar Fingering
          </DropdownMenuItem>
          <DropdownMenuItem
            data-testid="btn-text-fingering-rh"
            disabled={mutationDisabled || !selectionActive || !onAddRightHandGuitarFingeringText}
            onSelect={() => onAddRightHandGuitarFingeringText?.()}
          >
            RH Guitar Fingering
          </DropdownMenuItem>
          <DropdownMenuItem
            data-testid="btn-text-string-number"
            disabled={mutationDisabled || !selectionActive || !onAddStringNumberText}
            onSelect={() => onAddStringNumberText?.()}
          >
            String Number
          </DropdownMenuItem>
          <DropdownMenuLabel>Sticking</DropdownMenuLabel>
          <DropdownMenuItem
            data-testid="btn-text-sticking"
            disabled={mutationDisabled || !selectionActive || !onAddStickingText}
            onSelect={() => onAddStickingText?.()}
          >
            Sticking
          </DropdownMenuItem>
          <DropdownMenuLabel>Instrument</DropdownMenuLabel>
          <DropdownMenuItem
            data-testid="btn-text-instrument-change"
            disabled={mutationDisabled || !selectionActive || !onAddInstrumentChangeText}
            onSelect={() => onAddInstrumentChangeText?.()}
          >
            Instrument Change
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button
            data-testid="dropdown-articulations"
            variant="outline"
            size="sm"
            disabled={
              mutationDisabled || (!paletteDropEnabled && (!selectionActive || !onAddArticulation))
            }
            className="shadow-sm"
          >
            <CircleDot size={14} className="mr-2" />
            Articulations
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent data-testid="articulations-menu" className={styles.markingsMenu}>
          <DropdownMenuLabel>Articulations — Common</DropdownMenuLabel>
          {articulationOptions.map((opt, subtype) => {
            const canClickApply =
              !mutationDisabled && Boolean(selectionActive && onAddArticulation);
            const canDragApply = !mutationDisabled && Boolean(paletteDropEnabled);
            return (
              <DropdownMenuItem
                key={opt.symbol}
                data-testid={`btn-artic-${opt.symbol}`}
                disabled={!canClickApply && !canDragApply}
                draggable={canDragApply}
                className={canDragApply ? 'cursor-grab gap-2 active:cursor-grabbing' : 'gap-2'}
                title={
                  canClickApply && canDragApply
                    ? `Click to apply ${opt.label}; drag to place it`
                    : canDragApply
                      ? `Drag ${opt.label} onto a note`
                      : `Click to apply ${opt.label}`
                }
                onSelect={(event) => {
                  if (!canClickApply) {
                    event.preventDefault();
                    return;
                  }
                  onAddArticulation?.(opt.symbol);
                }}
                onDragStart={(event) => {
                  if (!canDragApply) {
                    event.preventDefault();
                    return;
                  }
                  event.stopPropagation();
                  event.dataTransfer.effectAllowed = 'copy';
                  const item = articulationScorePaletteItem(opt.label, subtype);
                  event.dataTransfer.setData(SCORE_PALETTE_DRAG_MIME, JSON.stringify(item));
                  event.dataTransfer.setData('text/plain', item.label);
                }}
              >
                <span
                  data-testid={`artic-symbol-${opt.symbol}`}
                  className={styles.articulationSymbol}
                  aria-hidden="true"
                >
                  {articulationGlyphs[opt.symbol]}
                </span>
                <span>{opt.label}</span>
              </DropdownMenuItem>
            );
          })}
          <DropdownMenuLabel>Fermatas</DropdownMenuLabel>
          {fermataOptions
            .filter((option) => option.common)
            .map((option) => (
              <DropdownMenuItem
                key={option.value}
                data-testid={`btn-fermata-${option.value}`}
                className="min-h-10 gap-3"
                disabled={mutationDisabled || !selectionActive || !onAddFermata}
                onSelect={() => onAddFermata?.(option.value)}
              >
                <span
                  data-testid={`fermata-symbol-${option.value}`}
                  className={styles.articulationSymbol}
                  aria-hidden="true"
                >
                  {option.symbol}
                </span>
                <span>{option.label}</span>
              </DropdownMenuItem>
            ))}
          <PaletteLink
            category="Fermatas"
            label="Open Fermata Palette…"
            testId="btn-open-fermata-palette"
            onOpenPalette={onOpenPalette}
          />
          <DropdownMenuLabel>Breaths & Caesuras</DropdownMenuLabel>
          {breathOptions
            .filter((option) => option.common)
            .map((option) => (
              <DropdownMenuItem
                key={option.value}
                data-testid={`btn-breath-${option.value}`}
                className="min-h-10 gap-3"
                disabled={mutationDisabled || !selectionActive || !onAddBreath}
                onSelect={() => onAddBreath?.(option.value)}
              >
                <span
                  data-testid={`breath-symbol-${option.value}`}
                  className={styles.articulationSymbol}
                  aria-hidden="true"
                >
                  {option.symbol}
                </span>
                <span>{option.label}</span>
              </DropdownMenuItem>
            ))}
          <PaletteLink
            category="Breaths"
            label="Open Breath Palette…"
            testId="btn-open-breath-palette"
            onOpenPalette={onOpenPalette}
          />
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
};
