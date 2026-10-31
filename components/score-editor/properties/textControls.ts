import type { NotationPropertyDescriptor } from './notationProperties';

/** The descriptor kinds the Text section renders with its own controls (TextPropertyControl). */
export type TextPropertyDescriptor = Extract<
  NotationPropertyDescriptor,
  { kind: 'textStyle' | 'text' | 'color' | 'fontStyle' | 'align' }
>;

export const isTextControl = (
  property: NotationPropertyDescriptor,
): property is TextPropertyDescriptor =>
  property.kind === 'textStyle' ||
  property.kind === 'text' ||
  property.kind === 'color' ||
  property.kind === 'fontStyle' ||
  property.kind === 'align';
