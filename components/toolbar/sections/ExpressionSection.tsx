import React from 'react';
import { Button } from '../../ui/Button';
import { DropdownMenuItem, DropdownMenuContent, DropdownMenuTrigger, DropdownMenu, DropdownMenuLabel } from '../../ui/DropdownMenu';
import { ToolbarSectionProps } from '../types';
import { dynamicOptions, hairpinOptions, pedalOptions, articulationOptions } from '../constants';
import { Pencil, Footprints, Type, CircleDot } from 'lucide-react';

const resolveMenuPoint = (event?: any) => {
    if (event && 'clientX' in event && typeof event.clientX === 'number' && typeof event.clientY === 'number') {
        return { clientX: event.clientX, clientY: event.clientY };
    }
    const target = event?.currentTarget as HTMLElement | null;
    if (target?.getBoundingClientRect) {
        const rect = target.getBoundingClientRect();
        return { clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2 };
    }
    if (typeof window !== 'undefined') {
        return { clientX: window.innerWidth / 2, clientY: window.innerHeight / 2 };
    }
    return { clientX: 0, clientY: 0 };
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
    mutationsEnabled,
    selectionActive,
}) => {
    const mutationDisabled = !mutationsEnabled;
    const textDropdownDisabled = mutationDisabled || (!selectionActive && !onOpenHeaderEditor);

    return (
        <>
            <DropdownMenu modal={false}>
                <DropdownMenuTrigger asChild>
                    <Button data-testid="dropdown-markings" variant="outline" size="sm" disabled={mutationDisabled} className="shadow-sm">
                        <Pencil size={14} className="mr-2" />
                        Markings
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                    <DropdownMenuLabel>Dynamics</DropdownMenuLabel>
                    {dynamicOptions.map(opt => (
                        <DropdownMenuItem key={opt.label} data-testid={`btn-dynamic-${opt.value}`} disabled={mutationDisabled || !selectionActive || !onAddDynamic} onSelect={() => onAddDynamic?.(opt.value)}>
                            {opt.label}
                        </DropdownMenuItem>
                    ))}
                    <DropdownMenuLabel>Hairpins</DropdownMenuLabel>
                    {hairpinOptions.map(opt => (
                        <DropdownMenuItem key={opt.label} data-testid={opt.testId} disabled={mutationDisabled || !selectionActive || !onAddHairpin} onSelect={() => onAddHairpin?.(opt.value)}>
                            {opt.label}
                        </DropdownMenuItem>
                    ))}
                </DropdownMenuContent>
            </DropdownMenu>

            <DropdownMenu modal={false}>
                <DropdownMenuTrigger asChild>
                    <Button data-testid="dropdown-pedal" variant="outline" size="sm" disabled={mutationDisabled} className="shadow-sm">
                        <Footprints size={14} className="mr-2" />
                        Pedal
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                    {pedalOptions.map(opt => (
                        <DropdownMenuItem key={opt.label} data-testid={opt.testId} disabled={mutationDisabled || !selectionActive || !onAddPedal} onSelect={() => onAddPedal?.(opt.value)}>
                            {opt.label}
                        </DropdownMenuItem>
                    ))}
                    <DropdownMenuLabel>Special</DropdownMenuLabel>
                    <DropdownMenuItem data-testid="btn-pedal-sostenuto" disabled={mutationDisabled || !selectionActive || !onAddSostenutoPedal} onSelect={() => onAddSostenutoPedal?.()}>Sostenuto Pedal</DropdownMenuItem>
                    <DropdownMenuItem data-testid="btn-pedal-una-corda" disabled={mutationDisabled || !selectionActive || !onAddUnaCorda} onSelect={() => onAddUnaCorda?.()}>Una Corda</DropdownMenuItem>
                    <DropdownMenuLabel>Variants</DropdownMenuLabel>
                    <DropdownMenuItem data-testid="btn-pedal-split" disabled={mutationDisabled || !selectionActive || !onSplitPedal} onSelect={() => onSplitPedal?.()}>Pedal Change</DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>

            <DropdownMenu modal={false}>
                <DropdownMenuTrigger asChild>
                    <Button data-testid="dropdown-text" variant="outline" size="sm" disabled={textDropdownDisabled} className="shadow-sm">
                        <Type size={14} className="mr-2" />
                        Text
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                    <DropdownMenuLabel>Score Header</DropdownMenuLabel>
                    <DropdownMenuItem data-testid="btn-text-title" disabled={mutationDisabled || !onOpenHeaderEditor} onSelect={(event) => onOpenHeaderEditor?.('title', resolveMenuPoint(event))}>Title…</DropdownMenuItem>
                    <DropdownMenuItem data-testid="btn-text-subtitle" disabled={mutationDisabled || !onOpenHeaderEditor} onSelect={(event) => onOpenHeaderEditor?.('subtitle', resolveMenuPoint(event))}>Subtitle…</DropdownMenuItem>
                    <DropdownMenuItem data-testid="btn-text-composer" disabled={mutationDisabled || !onOpenHeaderEditor} onSelect={(event) => onOpenHeaderEditor?.('composer', resolveMenuPoint(event))}>Composer…</DropdownMenuItem>
                    <DropdownMenuItem data-testid="btn-text-lyricist" disabled={mutationDisabled || !onOpenHeaderEditor} onSelect={(event) => onOpenHeaderEditor?.('lyricist', resolveMenuPoint(event))}>Lyricist…</DropdownMenuItem>
                    <DropdownMenuLabel>Score Text</DropdownMenuLabel>
                    <DropdownMenuItem data-testid="btn-text-staff" disabled={mutationDisabled || !selectionActive || !onAddStaffText} onSelect={() => onAddStaffText?.()}>Staff Text</DropdownMenuItem>
                    <DropdownMenuItem data-testid="btn-text-system" disabled={mutationDisabled || !selectionActive || !onAddSystemText} onSelect={() => onAddSystemText?.()}>System Text</DropdownMenuItem>
                    <DropdownMenuItem data-testid="btn-text-expression" disabled={mutationDisabled || !selectionActive || !onAddExpressionText} onSelect={() => onAddExpressionText?.()}>Expression Text</DropdownMenuItem>
                    <DropdownMenuItem data-testid="btn-text-lyrics" disabled={mutationDisabled || !selectionActive || !onAddLyricText} onSelect={() => onAddLyricText?.()}>Lyrics</DropdownMenuItem>
                    <DropdownMenuLabel>Harmony</DropdownMenuLabel>
                    <DropdownMenuItem data-testid="btn-text-harmony-standard" disabled={mutationDisabled || !selectionActive || !onAddHarmonyText} onSelect={() => onAddHarmonyText?.(0)}>Chord Symbol</DropdownMenuItem>
                    <DropdownMenuItem data-testid="btn-text-harmony-roman" disabled={mutationDisabled || !selectionActive || !onAddHarmonyText} onSelect={() => onAddHarmonyText?.(1)}>Roman Numeral</DropdownMenuItem>
                    <DropdownMenuItem data-testid="btn-text-harmony-nashville" disabled={mutationDisabled || !selectionActive || !onAddHarmonyText} onSelect={() => onAddHarmonyText?.(2)}>Nashville Number</DropdownMenuItem>
                    <DropdownMenuLabel>Figured Bass</DropdownMenuLabel>
                    <DropdownMenuItem data-testid="btn-text-figured-bass" disabled={mutationDisabled || !selectionActive || !onAddFiguredBassText} onSelect={() => onAddFiguredBassText?.()}>Figured Bass</DropdownMenuItem>
                    <DropdownMenuLabel>Fingering</DropdownMenuLabel>
                    <DropdownMenuItem data-testid="btn-text-fingering" disabled={mutationDisabled || !selectionActive || !onAddFingeringText} onSelect={() => onAddFingeringText?.()}>Fingering</DropdownMenuItem>
                    <DropdownMenuItem data-testid="btn-text-fingering-lh" disabled={mutationDisabled || !selectionActive || !onAddLeftHandGuitarFingeringText} onSelect={() => onAddLeftHandGuitarFingeringText?.()}>LH Guitar Fingering</DropdownMenuItem>
                    <DropdownMenuItem data-testid="btn-text-fingering-rh" disabled={mutationDisabled || !selectionActive || !onAddRightHandGuitarFingeringText} onSelect={() => onAddRightHandGuitarFingeringText?.()}>RH Guitar Fingering</DropdownMenuItem>
                    <DropdownMenuItem data-testid="btn-text-string-number" disabled={mutationDisabled || !selectionActive || !onAddStringNumberText} onSelect={() => onAddStringNumberText?.()}>String Number</DropdownMenuItem>
                    <DropdownMenuLabel>Sticking</DropdownMenuLabel>
                    <DropdownMenuItem data-testid="btn-text-sticking" disabled={mutationDisabled || !selectionActive || !onAddStickingText} onSelect={() => onAddStickingText?.()}>Sticking</DropdownMenuItem>
                    <DropdownMenuLabel>Instrument</DropdownMenuLabel>
                    <DropdownMenuItem data-testid="btn-text-instrument-change" disabled={mutationDisabled || !selectionActive || !onAddInstrumentChangeText} onSelect={() => onAddInstrumentChangeText?.()}>Instrument Change</DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>

            <DropdownMenu modal={false}>
                <DropdownMenuTrigger asChild>
                    <Button data-testid="dropdown-articulations" variant="outline" size="sm" disabled={mutationDisabled || !selectionActive} className="shadow-sm">
                        <CircleDot size={14} className="mr-2" />
                        Articulations
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                    {articulationOptions.map(opt => (
                        <DropdownMenuItem key={opt.symbol} data-testid={`btn-artic-${opt.symbol}`} disabled={mutationDisabled || !selectionActive || !onAddArticulation} onSelect={() => onAddArticulation?.(opt.symbol)}>
                            {opt.label}
                        </DropdownMenuItem>
                    ))}
                </DropdownMenuContent>
            </DropdownMenu>
        </>
    );
};
