import React, { useState } from 'react';
import { Button } from '../../ui/Button';
import { ToolbarSectionProps } from '../types';
import { toolbarInputBaseClass } from '../constants';
import { Check } from 'lucide-react';

export const TempoSection: React.FC<ToolbarSectionProps> = ({
    onAddTempoText,
    mutationsEnabled,
}) => {
    const [tempoBpm, setTempoBpm] = useState('120');

    const handleApplyTempo = () => {
        if (!onAddTempoText) return;
        const trimmed = tempoBpm.trim();
        if (!trimmed) return;
        const parsed = Number(trimmed);
        const sanitized = Number.isFinite(parsed) ? Math.max(1, Math.floor(parsed)) : 120;
        setTempoBpm(String(sanitized));
        onAddTempoText(sanitized);
    };

    const mutationDisabled = !mutationsEnabled;

    return (
        <>
            <input
                data-testid="input-tempo-bpm"
                type="number"
                min={1}
                value={tempoBpm}
                onChange={event => setTempoBpm(event.currentTarget.value)}
                onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                        event.preventDefault();
                        handleApplyTempo();
                    }
                }}
                className={`${toolbarInputBaseClass} w-20`}
            />
            <Button
                data-testid="btn-tempo-apply"
                onClick={handleApplyTempo}
                disabled={mutationDisabled || !onAddTempoText}
                variant="outline"
                size="xs"
                className="shadow-sm"
                title="Apply Tempo"
                aria-label="Apply Tempo"
            >
                <Check size={14} />
            </Button>
        </>
    );
};
