import React from 'react';
import { Button } from '../../ui/Button';
import { DropdownMenuItem, DropdownMenuContent, DropdownMenuTrigger, DropdownMenu, DropdownMenuLabel } from '../../ui/DropdownMenu';
import { ToolbarSectionProps } from '../types';
import { durationOptions, tupletOptions } from '../constants';
import { ArrowLeftToLine, ArrowRightToLine, Timer } from 'lucide-react';

export const DurationSection: React.FC<ToolbarSectionProps> = ({
    onDurationShorter,
    onDurationLonger,
    onAddNoteFromRest,
    onSetDurationType,
    onToggleDot,
    onToggleDoubleDot,
    onAddTuplet,
    mutationsEnabled,
    selectionActive,
}) => {
    const mutationDisabled = !mutationsEnabled;

    return (
        <>
            <Button
                data-testid="btn-duration-shorter"
                onClick={onDurationShorter}
                disabled={mutationDisabled || !onDurationShorter || !selectionActive}
                variant="outline"
                size="xs"
                className="shadow-sm"
                title="Shorter"
                aria-label="Shorter"
            >
                <ArrowLeftToLine size={14} />
            </Button>
            <Button
                data-testid="btn-duration-longer"
                onClick={onDurationLonger}
                disabled={mutationDisabled || !onDurationLonger || !selectionActive}
                variant="outline"
                size="xs"
                className="shadow-sm"
                title="Longer"
                aria-label="Longer"
            >
                <ArrowRightToLine size={14} />
            </Button>
            <div className="h-3 w-px bg-slate-200"></div>
            <DropdownMenu modal={false}>
                <DropdownMenuTrigger asChild>
                    <Button data-testid="dropdown-rhythm" variant="outline" size="sm" disabled={mutationDisabled} className="shadow-sm">
                        <Timer size={14} className="mr-2" />
                        Rhythm
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                    <DropdownMenuLabel>Notes</DropdownMenuLabel>
                    <DropdownMenuItem data-testid="btn-add-note-dropdown" disabled={mutationDisabled || !selectionActive || !onAddNoteFromRest} onSelect={() => onAddNoteFromRest?.()}>Add Note</DropdownMenuItem>
                    <DropdownMenuLabel>Duration</DropdownMenuLabel>
                    {durationOptions.map(opt => (
                        <DropdownMenuItem key={opt.value} data-testid={opt.testId} disabled={mutationDisabled || !selectionActive || !onSetDurationType} title={`Shortcut: press ${opt.shortcut} for ${opt.label}`} onSelect={() => onSetDurationType?.(opt.value)}>
                            {opt.label}
                        </DropdownMenuItem>
                    ))}
                    <DropdownMenuLabel>Dots</DropdownMenuLabel>
                    <DropdownMenuItem data-testid="btn-dot" disabled={mutationDisabled || !selectionActive || !onToggleDot} onSelect={() => onToggleDot?.()}>Dot</DropdownMenuItem>
                    <DropdownMenuItem data-testid="btn-double-dot" disabled={mutationDisabled || !selectionActive || !onToggleDoubleDot} onSelect={() => onToggleDoubleDot?.()}>Double Dot</DropdownMenuItem>
                    <DropdownMenuLabel>Tuplets</DropdownMenuLabel>
                    {tupletOptions.map(opt => (
                        <DropdownMenuItem key={opt.count} data-testid={`btn-tuplet-${opt.count}`} disabled={mutationDisabled || !selectionActive || !onAddTuplet} onSelect={() => onAddTuplet?.(opt.count)}>
                            {opt.label}
                        </DropdownMenuItem>
                    ))}
                </DropdownMenuContent>
            </DropdownMenu>
        </>
    );
};
