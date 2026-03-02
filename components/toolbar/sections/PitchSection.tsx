import React from 'react';
import { Button } from '../../ui/Button';
import { DropdownMenuItem, DropdownMenuContent, DropdownMenuTrigger, DropdownMenu } from '../../ui/DropdownMenu';
import { ToolbarSectionProps } from '../types';
import { accidentalOptions } from '../constants';
import { PlusCircle, ArrowDown, ArrowUp, ChevronsDown, ChevronsUp, Hash } from 'lucide-react';

export const PitchSection: React.FC<ToolbarSectionProps> = ({
    onAddNoteFromRest,
    onPitchDown,
    onPitchUp,
    onTranspose,
    onSetAccidental,
    mutationsEnabled,
    selectionActive,
}) => {
    const mutationDisabled = !mutationsEnabled;

    return (
        <>
            <Button
                data-testid="btn-add-note-top"
                onClick={onAddNoteFromRest}
                disabled={mutationDisabled || !selectionActive || !onAddNoteFromRest}
                variant="outline"
                size="sm"
                className="shadow-sm"
            >
                <PlusCircle size={14} className="mr-2" />
                Add Note
            </Button>
            <div className="h-3 w-px bg-slate-200"></div>
            <Button
                data-testid="btn-pitch-down"
                title="Shortcut: Arrow Down (Pitch Down)"
                aria-label="Pitch Down"
                onClick={onPitchDown}
                disabled={mutationDisabled || !onPitchDown || !selectionActive}
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
                disabled={mutationDisabled || !onPitchUp || !selectionActive}
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
                disabled={mutationDisabled || !selectionActive || !onTranspose}
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
                disabled={mutationDisabled || !selectionActive || !onTranspose}
                variant="outline"
                size="xs"
                className="shadow-sm"
            >
                <ChevronsUp size={14} />
            </Button>
            <div className="h-3 w-px bg-slate-200"></div>
            <DropdownMenu modal={false}>
                <DropdownMenuTrigger asChild>
                    <Button data-testid="dropdown-accidental" variant="outline" size="sm" disabled={mutationDisabled || !selectionActive || !onSetAccidental} className="shadow-sm">
                        <Hash size={14} className="mr-2" />
                        Accidental
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                    {accidentalOptions.map(opt => (
                        <DropdownMenuItem key={opt.label} data-testid={`btn-acc-${opt.value}`} disabled={mutationDisabled || !selectionActive || !onSetAccidental} onSelect={() => onSetAccidental?.(opt.value)}>
                            {opt.label}
                        </DropdownMenuItem>
                    ))}
                </DropdownMenuContent>
            </DropdownMenu>
        </>
    );
};
