import React from 'react';
import type { LucideIcon } from 'lucide-react';
import { BeamIcon } from '../../../../toolbar/BeamIcon';
import { GlyphIcon, StripIcon } from './StripIcon';
import { ICON_VIEW_WIDTH, STRIP_ICON_SPECS } from './stripIconSpecs';

/**
 * The icon of a strip control: the face glyph of a split button when it has one, else the control's designed icon
 * (`stripIconSpecs.ts`), else its Lucide icon (file and view chrome).
 */
export function ControlIcon({
  testId,
  fallback: Fallback,
  glyph,
}: {
  testId: string;
  fallback: LucideIcon;
  glyph?: string;
}) {
  if (glyph) return <GlyphIcon glyph={glyph} />;
  // The beams menu shows the palette's own beamed-notes picture.
  if (testId === 'dropdown-beams') return <BeamIcon value={0} width={26} height={14} />;
  const spec = STRIP_ICON_SPECS[testId];
  if (spec) return <StripIcon spec={spec} viewWidth={ICON_VIEW_WIDTH[testId]} />;
  return <Fallback size={18} aria-hidden="true" />;
}
