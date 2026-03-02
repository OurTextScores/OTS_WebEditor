import React from 'react';
import { Button } from '../../ui/Button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from '../../ui/DropdownMenu';
import { ToolbarSectionProps } from '../types';
import { shortcutEntries, dropdownTextClass } from '../constants';
import { Keyboard } from 'lucide-react';

export const HelpSection: React.FC<ToolbarSectionProps> = () => {
    return (
        <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
                <Button
                    data-testid="dropdown-shortcuts"
                    variant="outline"
                    size="sm"
                    className="shadow-sm"
                >
                    <Keyboard size={14} className="mr-2" />
                    Shortcuts
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
                {shortcutEntries.map(opt => (
                    <div key={opt.label} className={dropdownTextClass} title={opt.title}>
                        {opt.label}
                    </div>
                ))}
            </DropdownMenuContent>
        </DropdownMenu>
    );
};
