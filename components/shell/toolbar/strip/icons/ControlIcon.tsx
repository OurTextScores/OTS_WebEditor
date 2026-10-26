import React from 'react';
import type { LucideIcon } from 'lucide-react';
import { BeamIcon } from '../../../../toolbar/BeamIcon';
import { GlyphIcon, StripIcon, type IconSpec } from './StripIcon';
import { ICON_VIEW_WIDTH, STRIP_ICON_SPECS } from './stripIconSpecs';

/** The picture a menu item carries: a glyph, a beam mode or a drawn icon (`StripItem`). */
export interface ItemPicture {
  readonly glyph?: string;
  readonly beam?: number;
  readonly icon?: IconSpec;
}

export const hasPicture = (item: ItemPicture) =>
  Boolean(item.glyph || item.icon) || item.beam !== undefined;

/** An item's picture at the given size, or null when it has none. */
export function ItemPictureIcon({ item, size = 22 }: { item: ItemPicture; size?: number }) {
  if (item.beam !== undefined)
    return <BeamIcon value={item.beam} width={size * 1.3} height={size * 0.7} />;
  if (item.icon) return <StripIcon spec={item.icon} size={size} />;
  if (item.glyph) return <GlyphIcon glyph={item.glyph} size={size} />;
  return null;
}

/**
 * The icon of a strip control: the picture of the variant a split button runs when it has one, else the control's
 * designed icon (`stripIconSpecs.ts`), else its Lucide icon (file and view chrome).
 */
export function ControlIcon({
  testId,
  fallback: Fallback,
  current,
}: {
  testId: string;
  fallback: LucideIcon;
  current?: ItemPicture;
}) {
  if (current && hasPicture(current)) return <ItemPictureIcon item={current} size={20} />;
  const spec = STRIP_ICON_SPECS[testId];
  if (spec) return <StripIcon spec={spec} viewWidth={ICON_VIEW_WIDTH[testId]} />;
  return <Fallback size={18} aria-hidden="true" />;
}
