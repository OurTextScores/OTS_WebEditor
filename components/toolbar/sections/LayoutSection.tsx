import React from 'react';
import { Button } from '../../ui/Button';
import { ToolbarSectionProps } from '../types';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '../../ui/DropdownMenu';
import { WrapText, FileText, Wrench } from 'lucide-react';

export const LayoutSection: React.FC<ToolbarSectionProps> = ({
  onToggleLineBreak,
  onTogglePageBreak,
  mutationsEnabled,
  selectionActive,
  onAddAmbitus,
  onExplodeSelection,
  onImplodeSelection,
  onRegroupSelection,
  onResequenceRehearsalMarks,
}) => {
  const mutationDisabled = !mutationsEnabled;
  const breakDisabled = mutationDisabled || !selectionActive;
  const breakDisabledTitle = breakDisabled ? 'Select a note or rest to split the bar.' : undefined;

  return (
    <>
      <span className="inline-flex" title={breakDisabledTitle}>
        <Button
          data-testid="btn-new-line"
          onClick={onToggleLineBreak}
          disabled={breakDisabled || !onToggleLineBreak}
          variant="outline"
          size="sm"
          className="shadow-sm"
        >
          <WrapText size={14} className="mr-2" />
          New Line
        </Button>
      </span>
      <span className="inline-flex" title={breakDisabledTitle}>
        <Button
          data-testid="btn-new-page"
          onClick={onTogglePageBreak}
          disabled={breakDisabled || !onTogglePageBreak}
          variant="outline"
          size="sm"
          className="shadow-sm"
        >
          <FileText size={14} className="mr-2" />
          New Page
        </Button>
      </span>
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button
            data-testid="dropdown-bulk-tools"
            variant="outline"
            size="sm"
            disabled={mutationDisabled}
            className="shadow-sm"
          >
            <Wrench size={14} className="mr-2" />
            Tools
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuLabel>Specialized</DropdownMenuLabel>
          <DropdownMenuItem
            data-testid="btn-add-ambitus"
            disabled={!selectionActive || !onAddAmbitus}
            onSelect={() => onAddAmbitus?.()}
          >
            Add ambitus
          </DropdownMenuItem>
          <DropdownMenuLabel>Range</DropdownMenuLabel>
          <DropdownMenuItem
            data-testid="btn-explode-selection"
            disabled={!selectionActive || !onExplodeSelection}
            onSelect={() => onExplodeSelection?.()}
          >
            Explode
          </DropdownMenuItem>
          <DropdownMenuItem
            data-testid="btn-implode-selection"
            disabled={!selectionActive || !onImplodeSelection}
            onSelect={() => onImplodeSelection?.()}
          >
            Implode
          </DropdownMenuItem>
          <DropdownMenuItem
            data-testid="btn-regroup-selection"
            disabled={!selectionActive || !onRegroupSelection}
            onSelect={() => onRegroupSelection?.()}
          >
            Regroup rhythms
          </DropdownMenuItem>
          <DropdownMenuItem
            data-testid="btn-resequence-rehearsal"
            disabled={!selectionActive || !onResequenceRehearsalMarks}
            onSelect={() => onResequenceRehearsalMarks?.()}
          >
            Resequence rehearsal marks
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
};
