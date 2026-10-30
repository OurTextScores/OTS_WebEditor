import type {
  StyleValue,
  TextStyleEntry,
  TextStyleProperty,
} from '../../../lib/webmscore-score-settings-types';
import type { DialogField, FieldValue } from './dialogSpecs';

/**
 * MuseScore's Text styles page (EditStyle's text style sub-page in editstyle.ui): one sub-page per editable text
 * style, its fields labelled as MuseScore labels them. The engine says which styles exist and which style keys each
 * has (getTextStyleCatalog). Values that MuseScore keeps as one style key but edits with several controls (an
 * offset, an alignment, the bold/italic/underline/strikethrough flags) become one dialog field per part, written
 * back together by `mergePart`.
 */

export type PartKind = 'x' | 'y' | 'h' | 'v' | 'bold' | 'italic' | 'underline' | 'strike';

/** FontStyle's bits (engraving/types/types.h). */
const FONT_STYLE_BITS: Record<'bold' | 'italic' | 'underline' | 'strike', number> = {
  bold: 1,
  italic: 2,
  underline: 4,
  strike: 8,
};

/** AlignH and AlignV as engraving numbers them. */
const ALIGN_H = [
  { value: '0', label: 'Left' },
  { value: '2', label: 'Center' },
  { value: '1', label: 'Right' },
];
const ALIGN_V = [
  { value: '0', label: 'Top' },
  { value: '1', label: 'Middle' },
  { value: '3', label: 'Baseline' },
  { value: '2', label: 'Bottom' },
];
const FRAME_TYPES = [
  { value: '0', label: 'None' },
  { value: '1', label: 'Rectangle' },
  { value: '2', label: 'Circle' },
];

/** One dialog field over a style key, or over one part of it. */
export interface StyleControl {
  field: DialogField;
  /** The style key this control edits. */
  styleKey: string;
  part?: PartKind;
  value: FieldValue;
  defaultValue?: FieldValue;
}

/** The dialog key for a part of a style key: `titleOffset:x`, `titleFontStyle:bold`. */
export const partKey = (styleKey: string, part: PartKind) => `${styleKey}:${part}`;

const round = (value: number) => Math.round(value * 1e6) / 1e6;

/** A part of an engine value as the dialog shows it. */
export function partValue(value: StyleValue | undefined, part: PartKind): FieldValue | undefined {
  if (value === undefined) return undefined;
  if (part === 'bold' || part === 'italic' || part === 'underline' || part === 'strike') {
    return (Number(value) & FONT_STYLE_BITS[part]) !== 0;
  }
  if (!Array.isArray(value)) return undefined;
  const index = part === 'x' || part === 'h' ? 0 : 1;
  return part === 'h' || part === 'v' ? String(value[index]) : round(value[index]);
}

/** The engine value with one part replaced. */
export function mergePart(current: StyleValue, part: PartKind, value: FieldValue): StyleValue {
  if (part === 'bold' || part === 'italic' || part === 'underline' || part === 'strike') {
    const bit = FONT_STYLE_BITS[part];
    return value === true ? Number(current) | bit : Number(current) & ~bit;
  }
  const next: [number, number] = Array.isArray(current) ? [current[0], current[1]] : [0, 0];
  next[part === 'x' || part === 'h' ? 0 : 1] = Number(value);
  return next;
}

/** The fields of one text style, in MuseScore's order, for the keys this engine reads. */
export function textStyleControls(
  entry: TextStyleEntry,
  values: Record<string, StyleValue>,
  defaults: Record<string, StyleValue>,
): StyleControl[] {
  const controls: StyleControl[] = [];
  const key = (property: TextStyleProperty) => {
    const styleKey = entry.keys[property];
    return styleKey && styleKey in values ? styleKey : undefined;
  };
  const whole = (property: TextStyleProperty, field: (styleKey: string) => DialogField) => {
    const styleKey = key(property);
    if (!styleKey) return;
    const value = values[styleKey];
    const shown = (v: StyleValue | undefined) =>
      v === undefined
        ? undefined
        : typeof v === 'number'
          ? field(styleKey).kind === 'select'
            ? String(v)
            : round(v)
          : (v as FieldValue);
    controls.push({
      field: field(styleKey),
      styleKey,
      value: shown(value)!,
      defaultValue: shown(defaults[styleKey]),
    });
  };
  const parts = (property: TextStyleProperty, list: [PartKind, (k: string) => DialogField][]) => {
    const styleKey = key(property);
    if (!styleKey) return;
    for (const [part, field] of list) {
      const dialogKey = partKey(styleKey, part);
      controls.push({
        field: field(dialogKey),
        styleKey,
        part,
        value: partValue(values[styleKey], part)!,
        defaultValue: partValue(defaults[styleKey], part),
      });
    }
  };
  const number =
    (label: string, unit?: string, step = 0.1, min = 0, max = 99) =>
    (k: string): DialogField => ({
      kind: 'number',
      key: k,
      label,
      min,
      max,
      step,
      unit,
    });

  whole('fontFace', (k) => ({ kind: 'text', key: k, label: 'Font' }));
  whole('fontSize', number('Size', 'pt', 0.5, 1, 1000));
  whole('sizeSpatiumDependent', (k) => ({ kind: 'boolean', key: k, label: 'Follow staff size' }));
  parts('fontStyle', [
    ['bold', (k) => ({ kind: 'boolean', key: k, label: 'Bold' })],
    ['italic', (k) => ({ kind: 'boolean', key: k, label: 'Italic' })],
    ['underline', (k) => ({ kind: 'boolean', key: k, label: 'Underline' })],
    ['strike', (k) => ({ kind: 'boolean', key: k, label: 'Strikethrough' })],
  ]);
  parts('align', [
    ['h', (k) => ({ kind: 'select', key: k, label: 'Align (horizontal)', options: ALIGN_H })],
    ['v', (k) => ({ kind: 'select', key: k, label: 'Align (vertical)', options: ALIGN_V })],
  ]);
  whole('position', (k) => ({ kind: 'select', key: k, label: 'Position', options: ALIGN_H }));
  parts('offset', [
    ['x', number('Offset (horizontal)', 'sp', 0.1, -99)],
    ['y', number('Offset (vertical)', 'sp', 0.1, -99)],
  ]);
  whole('lineSpacing', number('Line spacing', undefined, 0.1, 0.1, 10));
  whole('color', (k) => ({ kind: 'color', key: k, label: 'Color' }));
  whole('musicalSymbolsSize', number('Text font size (musical symbols)', 'pt', 0.5, 1, 1000));
  whole('frameType', (k) => ({ kind: 'select', key: k, label: 'Frame', options: FRAME_TYPES }));
  whole('frameBorderColor', (k) => ({ kind: 'color', key: k, label: 'Border' }));
  whole('frameFillColor', (k) => ({ kind: 'color', key: k, label: 'Highlight' }));
  whole('frameWidth', number('Thickness', 'sp', 0.05));
  whole('framePadding', number('Padding', 'sp', 0.05));
  whole('frameRound', number('Corner radius', 'sp', 0.1));
  return controls;
}

/** Every style key the catalogue's text styles use, for one getStyleValues call. */
export const textStyleKeys = (catalog: TextStyleEntry[]) =>
  catalog.flatMap((entry) => Object.values(entry.keys).filter((k): k is string => Boolean(k)));
