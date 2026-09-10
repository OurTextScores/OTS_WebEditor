import React from 'react';
import { LayoutGrid } from 'lucide-react';
import { DropdownMenuItem } from '../ui/DropdownMenu';

interface PaletteLinkProps {
  /** Palette category to open, e.g. 'Clefs', 'Ottavas'. */
  category: string;
  label: string;
  testId: string;
  onOpenPalette?: (category: string) => void;
}

// Dropdown footer link that opens the full floating palette for a category
// (replacing the old "Other" section within a dropdown).
export const PaletteLink: React.FC<PaletteLinkProps> = ({
  category,
  label,
  testId,
  onOpenPalette,
}) => (
  <DropdownMenuItem
    data-testid={testId}
    disabled={!onOpenPalette}
    onSelect={() => onOpenPalette?.(category)}
    className="mt-1 gap-2 border-t border-slate-100 font-medium text-blue-700 data-[highlighted]:text-blue-800"
  >
    <LayoutGrid size={14} />
    {label}
  </DropdownMenuItem>
);
