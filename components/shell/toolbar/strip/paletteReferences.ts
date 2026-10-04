import { scorePaletteItems } from '../../../toolbar/palette';
import type { StripItem } from './toolbarLayout';

/** The notation glyph the palette shows for a variant, so a strip cell and a palette cell agree. */
export const paletteGlyph = (kind: string, subtype: number): string | undefined =>
  scorePaletteItems.find((item) => item.kind === kind && item.subtype === subtype)?.symbol;

/** The open-the-palette footer the ribbon's menus ended with. */
export const paletteFooter = (testId: string, category: string): StripItem => ({
  testId,
  label: `Open ${category.toLowerCase()} palette`,
  commandId: 'view.palette.open',
  arg: category,
});
