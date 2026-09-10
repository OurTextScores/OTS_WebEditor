import React, { useState } from 'react';
import { Button } from '../../ui/Button';
import {
  DropdownMenuItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
  DropdownMenu,
} from '../../ui/DropdownMenu';
import { ToolbarSectionProps } from '../types';
import { accidentalOptions } from '../constants';
import { ArrowDown, ArrowUp, ChevronsDown, ChevronsUp, Hash, ArrowUpDown } from 'lucide-react';
import { TransposeDialog } from '../TransposeDialog';
import styles from './PitchSection.module.css';

export const PitchSection: React.FC<ToolbarSectionProps> = ({
  onPitchDown,
  onPitchUp,
  onTranspose,
  onTransposeEx,
  onSetAccidental,
  mutationsEnabled,
  selectionActive,
  noteInputActive,
}) => {
  const mutationDisabled = !mutationsEnabled;
  const [transposeDialogOpen, setTransposeDialogOpen] = useState(false);

  return (
    <>
      <Button
        data-testid="btn-pitch-down"
        title="Shortcut: Arrow Down (Pitch Down)"
        aria-label="Pitch Down"
        onClick={onPitchDown}
        disabled={mutationDisabled || !onPitchDown || !selectionActive || noteInputActive}
        variant="outline"
        size="xs"
        className="shadow-sm"
      >
        <ArrowDown size={14} />
      </Button>
      <Button
        data-testid="btn-pitch-up"
        title="Shortcut: Arrow Up (Pitch Up)"
        aria-label="Pitch Up"
        onClick={onPitchUp}
        disabled={mutationDisabled || !onPitchUp || !selectionActive || noteInputActive}
        variant="outline"
        size="xs"
        className="shadow-sm"
      >
        <ArrowUp size={14} />
      </Button>
      <div className="h-3 w-px bg-slate-200"></div>
      <Button
        data-testid="btn-transpose--12"
        onClick={() => onTranspose?.(-12)}
        title="Shortcut: Ctrl/Cmd + Arrow Down (Octave Down)"
        aria-label="Octave Down"
        disabled={mutationDisabled || !selectionActive || !onTranspose || noteInputActive}
        variant="outline"
        size="xs"
        className="shadow-sm"
      >
        <ChevronsDown size={14} />
      </Button>
      <Button
        data-testid="btn-transpose-12"
        title="Shortcut: Ctrl/Cmd + Arrow Up (Octave Up)"
        aria-label="Octave Up"
        onClick={() => onTranspose?.(12)}
        disabled={mutationDisabled || !selectionActive || !onTranspose || noteInputActive}
        variant="outline"
        size="xs"
        className="shadow-sm"
      >
        <ChevronsUp size={14} />
      </Button>
      <div className="h-3 w-px bg-slate-200"></div>
      <Button
        data-testid="btn-transpose-dialog"
        title="Transpose... (full options)"
        aria-label="Transpose"
        onClick={() => setTransposeDialogOpen(true)}
        disabled={mutationDisabled || !onTransposeEx || noteInputActive}
        variant="outline"
        size="sm"
        className="shadow-sm"
      >
        <ArrowUpDown size={14} className="mr-1" />
        Transpose...
      </Button>
      {onTransposeEx && (
        <TransposeDialog
          open={transposeDialogOpen}
          onOpenChange={setTransposeDialogOpen}
          onTranspose={onTransposeEx}
        />
      )}
      <div className="h-3 w-px bg-slate-200"></div>
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button
            data-testid="dropdown-accidental"
            variant="outline"
            size="sm"
            disabled={
              mutationDisabled || (!noteInputActive && !selectionActive) || !onSetAccidental
            }
            className="shadow-sm"
          >
            <Hash size={14} className="mr-2" />
            Accidental
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          {accidentalOptions.map((opt) => (
            <DropdownMenuItem
              key={opt.value}
              data-testid={`btn-acc-${opt.value}`}
              className="min-h-9 gap-3"
              disabled={
                mutationDisabled || (!noteInputActive && !selectionActive) || !onSetAccidental
              }
              onSelect={() => onSetAccidental?.(opt.value)}
            >
              {opt.symbol ? (
                <span
                  data-testid={`acc-symbol-${opt.value}`}
                  className={styles.accidentalSymbol}
                  aria-hidden="true"
                >
                  {opt.symbol}
                </span>
              ) : (
                <span className="inline-flex min-w-[1.5rem] justify-center" aria-hidden="true" />
              )}
              <span>{opt.name}</span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
};
