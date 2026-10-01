import React from 'react';
import { Button } from '../../ui/Button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from '../../ui/DropdownMenu';
import { ToolbarSectionProps } from '../types';
import { shortcutEntries, dropdownTextClass, getHelpHref } from '../constants';
import { Keyboard, HelpCircle } from 'lucide-react';

export const HelpSection: React.FC<ToolbarSectionProps> = () => {
  const helpHref = getHelpHref();
  return (
    <>
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
          {shortcutEntries.map((opt) => (
            <div key={opt.label} className={dropdownTextClass} title={opt.title}>
              {opt.label}
            </div>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      <Button asChild data-testid="link-help" variant="outline" size="sm" className="shadow-sm">
        <a
          href={helpHref}
          target="_blank"
          rel="noopener noreferrer"
          title="Open the editor help page"
        >
          <HelpCircle size={14} className="mr-2" />
          Help
        </a>
      </Button>
    </>
  );
};
