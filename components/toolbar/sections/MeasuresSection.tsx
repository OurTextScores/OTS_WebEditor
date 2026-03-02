import React, { useState } from 'react';
import { Button } from '../../ui/Button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../ui/Select';
import { ToolbarSectionProps } from '../types';
import { toolbarInputBaseClass } from '../constants';
import { MeasureInsertTarget } from '../Toolbar';
import { Plus, Trash2, ListStart } from 'lucide-react';

export const MeasuresSection: React.FC<ToolbarSectionProps> = ({
    onInsertMeasures,
    onAddPickup,
    onRemoveContainingMeasures,
    onRemoveTrailingEmptyMeasures,
    insertMeasuresDisabled,
    mutationsEnabled,
    selectionActive,
}) => {
    const [measureCount, setMeasureCount] = useState(1);
    const [measureTarget, setMeasureTarget] = useState<MeasureInsertTarget>('after-selection');
    const [pickupNumerator, setPickupNumerator] = useState(1);
    const [pickupDenominator, setPickupDenominator] = useState(4);

    const handleApplyMeasures = () => {
        if (!onInsertMeasures) return;
        const sanitized = Math.max(1, Math.floor(measureCount));
        setMeasureCount(sanitized);
        onInsertMeasures(sanitized, measureTarget);
    };

    const handleAddPickup = () => {
        if (!onAddPickup) return;
        const sanitized = Math.max(1, Math.floor(pickupNumerator));
        setPickupNumerator(sanitized);
        onAddPickup(sanitized, pickupDenominator);
    };

    const mutationDisabled = !mutationsEnabled;
    const insertMeasuresBlocked = insertMeasuresDisabled || !onInsertMeasures || mutationDisabled;

    return (
        <>
            <input
                data-testid="input-measure-count"
                type="number"
                min={1}
                value={measureCount}
                onChange={event => setMeasureCount(Number(event.currentTarget.value) || 1)}
                className={`${toolbarInputBaseClass} w-16`}
            />
            <Select
                value={measureTarget}
                onValueChange={(value) => setMeasureTarget(value as MeasureInsertTarget)}
            >
                <SelectTrigger data-testid="select-measure-target" className="w-40 shadow-sm">
                    <SelectValue />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value="beginning">Beginning</SelectItem>
                    <SelectItem value="after-selection">After Selection</SelectItem>
                    <SelectItem value="end">End</SelectItem>
                </SelectContent>
            </Select>
            <Button
                data-testid="btn-insert-measures"
                onClick={handleApplyMeasures}
                disabled={insertMeasuresBlocked}
                variant="outline"
                size="sm"
                className="shadow-sm"
            >
                <Plus size={14} className="mr-2" />
                Add Bars
            </Button>
            <div className="h-3 w-px bg-slate-200"></div>
            <input
                data-testid="input-pickup-numerator"
                type="number"
                min={1}
                value={pickupNumerator}
                onChange={event => setPickupNumerator(Number(event.currentTarget.value) || 1)}
                className={`${toolbarInputBaseClass} w-16`}
            />
            <Select
                value={String(pickupDenominator)}
                onValueChange={(value) => setPickupDenominator(Number(value))}
            >
                <SelectTrigger data-testid="select-pickup-denominator" className="w-20 shadow-sm">
                    <SelectValue />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value="1">1</SelectItem>
                    <SelectItem value="2">2</SelectItem>
                    <SelectItem value="4">4</SelectItem>
                    <SelectItem value="8">8</SelectItem>
                    <SelectItem value="16">16</SelectItem>
                    <SelectItem value="32">32</SelectItem>
                </SelectContent>
            </Select>
            <Button
                data-testid="btn-add-pickup"
                onClick={handleAddPickup}
                disabled={mutationDisabled || !onAddPickup}
                variant="outline"
                size="sm"
                className="shadow-sm"
            >
                <ListStart size={14} className="mr-2" />
                Add Pickup
            </Button>
            <div className="h-3 w-px bg-slate-200"></div>
            <Button
                data-testid="btn-remove-containing-measures"
                onClick={onRemoveContainingMeasures}
                disabled={mutationDisabled || !selectionActive || !onRemoveContainingMeasures}
                variant="outline"
                size="sm"
                className="shadow-sm"
            >
                <Trash2 size={14} className="mr-2" />
                Selected Bars
            </Button>
            <Button
                data-testid="btn-remove-trailing-empty"
                onClick={onRemoveTrailingEmptyMeasures}
                disabled={mutationDisabled || !onRemoveTrailingEmptyMeasures}
                variant="outline"
                size="sm"
                className="shadow-sm"
            >
                <Trash2 size={14} className="mr-2" />
                Trailing Empty Bars
            </Button>
        </>
    );
};
