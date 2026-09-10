import React from 'react';
import { Button } from '../../ui/Button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from '../../ui/DropdownMenu';
import { ToolbarSectionProps } from '../types';
import { shortcutEntries, dropdownTextClass } from '../constants';
import { Keyboard, HelpCircle } from 'lucide-react';

export const HelpSection: React.FC<ToolbarSectionProps> = () => {
  // The embed build is a static export (output: 'export', no trailingSlash) under
  // basePath /score-editor, so the page lands at /score-editor/help.html — the host
  // serves the .html file directly and 404s the extensionless route. A raw <a href>
  // is also not basePath-prefixed by Next (only <Link>/router are). The normal
  // server build serves the App Router route at /help.
  const helpHref =
    process.env.NEXT_PUBLIC_BUILD_MODE === 'embed' ? '/score-editor/help.html' : '/help';
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
