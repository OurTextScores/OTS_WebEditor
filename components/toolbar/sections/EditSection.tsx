import React from 'react';
import { Button } from '../../ui/Button';
import { Checkbox } from '../../ui/Checkbox';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '../../ui/DropdownMenu';
import { ToolbarSectionProps } from '../types';
import { selectionFilterOptions } from '../constants';
import { Trash2, Undo2, Redo2, CheckSquare, ListFilter } from 'lucide-react';

export const EditSection: React.FC<ToolbarSectionProps> = ({
  onDeleteSelection,
  onUndo,
  onRedo,
  onSelectAll,
  selectionFilterMask = 0xffffff,
  onSetSelectionFilterBit,
  mutationsEnabled,
  selectionActive,
}) => {
  const mutationDisabled = !mutationsEnabled;

  return (
    <>
      <Button
        data-testid="btn-select-all"
        title="Shortcut: Ctrl/Cmd + A (Select All)"
        aria-label="Select All"
        onClick={onSelectAll}
        disabled={!mutationsEnabled || !onSelectAll}
        variant="outline"
        size="sm"
        className="shadow-sm"
      >
        <CheckSquare size={14} className="mr-2" />
        Select All
      </Button>
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button
            data-testid="dropdown-selection-filter"
            disabled={!mutationsEnabled || !onSetSelectionFilterBit}
            variant="outline"
            size="sm"
            className="shadow-sm"
          >
            <ListFilter size={14} className="mr-2" />
            Selection Filter
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          data-testid="selection-filter-menu"
          className="max-h-[var(--radix-dropdown-menu-content-available-height)] overflow-y-auto"
        >
          {(['Voices', 'Elements'] as const).map((group) => (
            <React.Fragment key={group}>
              <DropdownMenuLabel>{group}</DropdownMenuLabel>
              {selectionFilterOptions
                .filter((option) => option.group === group)
                .map((option) => {
                  const checked = Boolean(selectionFilterMask & option.bit);
                  return (
                    <DropdownMenuItem
                      key={option.bit}
                      data-testid={`selection-filter-${option.bit}`}
                      onSelect={(event) => {
                        event.preventDefault();
                        onSetSelectionFilterBit?.(option.bit, !checked);
                      }}
                      className="gap-2"
                    >
                      <Checkbox
                        checked={checked}
                        tabIndex={-1}
                        className="pointer-events-none"
                        aria-hidden="true"
                      />
                      {option.label}
                    </DropdownMenuItem>
                  );
                })}
            </React.Fragment>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      <div className="h-3 w-px bg-slate-200"></div>
      <Button
        data-testid="btn-delete"
        title="Shortcut: Delete / Backspace"
        aria-label="Delete"
        onClick={onDeleteSelection}
        disabled={mutationDisabled || !onDeleteSelection || !selectionActive}
        variant="outline"
        size="sm"
        className="shadow-sm"
      >
        <Trash2 size={14} className="mr-2" />
        Delete
      </Button>
      <div className="h-3 w-px bg-slate-200"></div>
      <Button
        data-testid="btn-undo"
        title="Shortcut: Ctrl/Cmd + Z"
        aria-label="Undo"
        onClick={onUndo}
        disabled={mutationDisabled || !onUndo}
        variant="outline"
        size="sm"
        className="shadow-sm"
      >
        <Undo2 size={14} className="mr-2" />
        Undo
      </Button>
      <Button
        data-testid="btn-redo"
        title="Shortcut: Ctrl + Y, Cmd + Shift + Z"
        aria-label="Redo"
        onClick={onRedo}
        disabled={mutationDisabled || !onRedo}
        variant="outline"
        size="sm"
        className="shadow-sm"
      >
        <Redo2 size={14} className="mr-2" />
        Redo
      </Button>
    </>
  );
};
