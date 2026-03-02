import React, { useState, useMemo } from 'react';
import { Button } from '../../ui/Button';
import { DropdownMenuItem, DropdownMenuContent, DropdownMenuTrigger, DropdownMenu, DropdownMenuLabel } from '../../ui/DropdownMenu';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '../../ui/Select';
import { ToolbarSectionProps } from '../types';
import { keySignatureButtonOptionsDefault, clefButtonOptionsDefault, barlineOptions, repeatCountOptions, voltaOptions } from '../constants';
import { Guitar, Repeat } from 'lucide-react';
import { ClefIcon, KeySignatureIcon } from '../CustomIcons';

export const ScoreSection: React.FC<ToolbarSectionProps> = ({
    instrumentGroups = [],
    parts = [],
    onAddPart,
    onRemovePart,
    onTogglePartVisible,
    onSetKeySignature,
    keySignatureOptions,
    onSetClef,
    clefOptions,
    onToggleRepeatStart,
    onToggleRepeatEnd,
    onSetRepeatCount,
    onSetBarLineType,
    onAddVolta,
    exportsEnabled,
    mutationsEnabled,
    selectionActive,
}) => {
    const [selectedInstrumentId, setSelectedInstrumentId] = useState('');

    const mutationDisabled = !mutationsEnabled;
    const instrumentsDisabled = !exportsEnabled;

    const instrumentOptions = instrumentGroups.flatMap(group =>
        group.instruments.map(instrument => ({
            ...instrument,
            groupName: instrument.groupName ?? group.name,
            groupId: instrument.groupId ?? group.id
        }))
    );

    const commonInstrumentPreferences = useMemo(() => ([
        { key: 'piano', ids: ['piano'] },
        { key: 'violin', ids: ['violin'] },
        { key: 'viola', ids: ['viola'] },
        { key: 'cello', ids: ['violoncello', 'cello'] },
        { key: 'double-bass', ids: ['double-bass', 'contrabass'], label: 'Double Bass' },
        { key: 'flute', ids: ['flute'] },
        { key: 'oboe', ids: ['oboe'] },
        { key: 'clarinet', ids: ['clarinet'], label: 'Clarinet' },
        { key: 'bassoon', ids: ['bassoon'] },
        { key: 'trumpet', ids: ['trumpet'], label: 'Trumpet' },
        { key: 'horn', ids: ['horn'] },
        { key: 'trombone', ids: ['trombone'] },
        { key: 'tuba', ids: ['tuba'] },
        { key: 'alto-saxophone', ids: ['alto-saxophone'] },
        { key: 'tenor-saxophone', ids: ['tenor-saxophone'] },
        { key: 'bass-guitar', ids: ['bass-guitar'] },
        { key: 'guitar', ids: ['guitar-nylon', 'guitar-steel'] },
        { key: 'voice', ids: ['voice'] },
        { key: 'drumset', ids: ['drumset'] },
    ]), []);

    const commonInstruments = useMemo(() => {
        const results: { instrument: any; label: string }[] = [];
        const used = new Set<string>();
        for (const pref of commonInstrumentPreferences) {
            const found = pref.ids
                .map((id) => instrumentOptions.find((instrument) => instrument.id === id))
                .find(Boolean);
            if (found && !used.has(found.id)) {
                used.add(found.id);
                results.push({ instrument: found, label: pref.label ?? found.name });
            }
        }
        return results;
    }, [commonInstrumentPreferences, instrumentOptions]);

    const hasInstrumentTemplates = instrumentOptions.length > 0;
    const instrumentIdToAdd = selectedInstrumentId || (hasInstrumentTemplates ? instrumentOptions[0].id : '');

    const keySignatureButtonOptions = keySignatureOptions ?? keySignatureButtonOptionsDefault;
    const clefButtonOptions = clefOptions ?? clefButtonOptionsDefault;

    return (
        <>
            <DropdownMenu modal={false}>
                <DropdownMenuTrigger asChild>
                    <Button data-testid="dropdown-instruments" variant="outline" size="sm" disabled={instrumentsDisabled} className="shadow-sm">
                        <Guitar size={14} className="mr-2" />
                        Instruments
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                    <DropdownMenuLabel>Add</DropdownMenuLabel>
                    {hasInstrumentTemplates ? (
                        <>
                            <Select value={instrumentIdToAdd} onValueChange={(value) => setSelectedInstrumentId(value)} disabled={mutationDisabled}>
                                <SelectTrigger data-testid="select-instrument-add" className="w-full">
                                    <SelectValue placeholder="Select instrument" />
                                </SelectTrigger>
                                <SelectContent>
                                    {commonInstruments.length > 0 && (
                                        <SelectGroup>
                                            <SelectLabel>Common</SelectLabel>
                                            {commonInstruments.map((entry, index) => (
                                                <SelectItem key={`common-${entry.instrument.id}-${index}`} value={entry.instrument.id}>
                                                    {entry.label}
                                                </SelectItem>
                                            ))}
                                        </SelectGroup>
                                    )}
                                    {instrumentGroups.map(group => (
                                        <SelectGroup key={group.id}>
                                            <SelectLabel>{group.name}</SelectLabel>
                                            {group.instruments.map(instrument => (
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
                                onSelect={() => { if (instrumentIdToAdd && onAddPart) onAddPart(instrumentIdToAdd); }}
                            >
                                Add Instrument
                            </DropdownMenuItem>
                        </>
                    ) : (
                        <div className="px-2 py-1 text-sm text-slate-600">Instrument list unavailable.</div>
                    )}

                    <DropdownMenuLabel>On Score</DropdownMenuLabel>
                    {parts.length ? (
                        parts.map(part => (
                            <div key={`${part.index}-${part.instrumentId}`} className="flex items-center gap-3">
                                <span className="flex-1 truncate text-sm text-slate-800">{part.name || part.instrumentName || part.instrumentId}</span>
                                <DropdownMenuItem data-testid={`btn-part-visible-${part.index}`} disabled={mutationDisabled || !onTogglePartVisible} onSelect={() => onTogglePartVisible?.(part.index, !part.isVisible)}>
                                    {part.isVisible ? 'Hide' : 'Show'}
                                </DropdownMenuItem>
                                <DropdownMenuItem data-testid={`btn-part-remove-${part.index}`} disabled={mutationDisabled || !onRemovePart} onSelect={() => {
                                    if (!onRemovePart) return;
                                    const label = part.name || part.instrumentName || 'this part';
                                    if (typeof window === 'undefined' || window.confirm(`Remove ${label}?`)) onRemovePart(part.index);
                                }}>
                                    Remove
                                </DropdownMenuItem>
                            </div>
                        ))
                    ) : (
                        <div className="px-2 py-1 text-sm text-slate-600">No parts loaded.</div>
                    )}
                </DropdownMenuContent>
            </DropdownMenu>

            <DropdownMenu modal={false}>
                <DropdownMenuTrigger asChild>
                    <Button data-testid="dropdown-key" variant="outline" size="sm" disabled={mutationDisabled || !onSetKeySignature} className="shadow-sm">
                        <KeySignatureIcon size={14} className="mr-2" />
                        Key
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                    <DropdownMenuLabel>Major</DropdownMenuLabel>
                    {keySignatureButtonOptions.map(opt => (
                        <DropdownMenuItem key={opt.fifths} data-testid={`btn-keysig-${opt.fifths}`} disabled={mutationDisabled || !onSetKeySignature} onSelect={() => onSetKeySignature?.(opt.fifths)}>
                            {opt.label}
                        </DropdownMenuItem>
                    ))}
                </DropdownMenuContent>
            </DropdownMenu>

            <DropdownMenu modal={false}>
                <DropdownMenuTrigger asChild>
                    <Button data-testid="dropdown-clef" variant="outline" size="sm" disabled={mutationDisabled || !onSetClef} className="shadow-sm">
                        <ClefIcon size={14} className="mr-2" />
                        Clef
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                    <DropdownMenuLabel>Common</DropdownMenuLabel>
                    {clefButtonOptions.map(opt => (
                        <DropdownMenuItem key={opt.value} data-testid={`btn-clef-${opt.value}`} disabled={mutationDisabled || !onSetClef} onSelect={() => onSetClef?.(opt.value)}>
                            {opt.label}
                        </DropdownMenuItem>
                    ))}
                </DropdownMenuContent>
            </DropdownMenu>

            <DropdownMenu modal={false}>
                <DropdownMenuTrigger asChild>
                    <Button data-testid="dropdown-repeats" variant="outline" size="sm" disabled={mutationDisabled || !selectionActive} className="shadow-sm">
                        <Repeat size={14} className="mr-2" />
                        Repeats
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                    <DropdownMenuLabel>Repeats</DropdownMenuLabel>
                    <DropdownMenuItem data-testid="btn-repeat-start" disabled={mutationDisabled || !selectionActive || !onToggleRepeatStart} onSelect={() => onToggleRepeatStart?.()}>Start Repeat</DropdownMenuItem>
                    <DropdownMenuItem data-testid="btn-repeat-end" disabled={mutationDisabled || !selectionActive || !onToggleRepeatEnd} onSelect={() => onToggleRepeatEnd?.()}>End Repeat</DropdownMenuItem>
                    <DropdownMenuLabel>Repeat Count</DropdownMenuLabel>
                    {repeatCountOptions.map(opt => (
                        <DropdownMenuItem key={opt.count} data-testid={`btn-repeat-count-${opt.count}`} disabled={mutationDisabled || !selectionActive || !onSetRepeatCount} onSelect={() => onSetRepeatCount?.(opt.count)}>
                            {opt.label}
                        </DropdownMenuItem>
                    ))}
                    <DropdownMenuLabel>Barlines</DropdownMenuLabel>
                    {barlineOptions.map(opt => (
                        <DropdownMenuItem key={opt.value} data-testid={`btn-barline-${opt.value}`} disabled={mutationDisabled || !selectionActive || !onSetBarLineType} onSelect={() => onSetBarLineType?.(opt.value)}>
                            {opt.label}
                        </DropdownMenuItem>
                    ))}
                    <DropdownMenuLabel>Voltas</DropdownMenuLabel>
                    {voltaOptions.map(opt => (
                        <DropdownMenuItem key={opt.ending} data-testid={`btn-volta-${opt.ending}`} disabled={mutationDisabled || !selectionActive || !onAddVolta} onSelect={() => onAddVolta?.(opt.ending)}>
                            {opt.label}
                        </DropdownMenuItem>
                    ))}
                </DropdownMenuContent>
            </DropdownMenu>
        </>
    );
};
