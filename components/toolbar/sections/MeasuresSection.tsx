import React, { useState } from 'react';
import { Button } from '../../ui/Button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../ui/Select';
import { ToolbarSectionProps } from '../types';
import { toolbarInputBaseClass } from '../constants';
import { MeasureInsertTarget } from '../Toolbar';
import { Plus, Trash2 } from 'lucide-react';

export const MeasuresSection: React.FC<ToolbarSectionProps> = ({
    onInsertMeasures,
    onRemoveContainingMeasures,
    onRemoveTrailingEmptyMeasures,
    insertMeasuresDisabled,
    mutationsEnabled,
    selectionActive,
}) => {
    const [measureCount, setMeasureCount] = useState(1);
    const [measureTarget, setMeasureTarget] = useState<MeasureInsertTarget>('after-selection');

    const handleApplyMeasures = () => {
        if (!onInsertMeasures) return;
        const sanitized = Math.max(1, Math.floor(measureCount));
        setMeasureCount(sanitized);
        onInsertMeasures(sanitized, measureTarget);
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
