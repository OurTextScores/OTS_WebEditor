import React from 'react';
import { Button } from '../../ui/Button';
import { ToolbarSectionProps } from '../types';
import { WrapText, FileText } from 'lucide-react';

export const LayoutSection: React.FC<ToolbarSectionProps> = ({
    onToggleLineBreak,
    onTogglePageBreak,
    mutationsEnabled,
    selectionActive,
}) => {
    const mutationDisabled = !mutationsEnabled;

    return (
        <>
            <Button
                data-testid="btn-new-line"
                onClick={onToggleLineBreak}
                disabled={mutationDisabled || !selectionActive || !onToggleLineBreak}
                variant="outline"
                size="sm"
                className="shadow-sm"
            >
                <WrapText size={14} className="mr-2" />
                New Line
            </Button>
            <Button
                data-testid="btn-new-page"
                onClick={onTogglePageBreak}
                disabled={mutationDisabled || !selectionActive || !onTogglePageBreak}
                variant="outline"
                size="sm"
                className="shadow-sm"
            >
                <FileText size={14} className="mr-2" />
                New Page
            </Button>
        </>
    );
};
