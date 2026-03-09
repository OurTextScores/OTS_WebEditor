import React from 'react';
import { Button } from '../../ui/Button';
import { ToolbarSectionProps } from '../types';
import { Trash2, Undo2, Redo2, CheckSquare } from 'lucide-react';

export const EditSection: React.FC<ToolbarSectionProps> = ({
    onDeleteSelection,
    onUndo,
    onRedo,
    onSelectAll,
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
