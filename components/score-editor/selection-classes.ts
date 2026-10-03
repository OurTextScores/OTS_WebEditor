export const SELECTION_FILTER_STORAGE_KEY = 'ots_editor_selection_filter_v1';

export const DEFAULT_SELECTION_FILTER_MASK = 0xffffff;

export const NOTE_INPUT_VOICE_COLORS = ['#0065BF', '#007F00', '#C53F00', '#C31989'] as const;

export const TEXT_ELEMENT_CLASS_NAMES = [
  'Text',
  'RehearsalMark',
  'StaffText',
  'SystemText',
  'ExpressionText',
  'LyricText',
  'HarmonyText',
  'FingeringText',
  'LeftHandGuitarFingeringText',
  'RightHandGuitarFingeringText',
  'StringNumberText',
  'InstrumentChangeText',
  'StickingText',
  'FiguredBassText',
  'TempoText',
];

export const TEXT_ELEMENT_SELECTOR = TEXT_ELEMENT_CLASS_NAMES.map((cls) => `.${cls}`).join(', ');

export const ELEMENT_SELECTION_SELECTOR = [
  '.Note',
  '.Rest',
  '.Chord',
  '.LayoutBreak',
  '.Pedal',
  '.PedalSegment',
  '.Measure',
  TEXT_ELEMENT_SELECTOR,
]
  .filter(Boolean)
  .join(', ');

export const ELEMENT_SELECTION_CLASSES = new Set([
  'Note',
  'Rest',
  'Chord',
  'LayoutBreak',
  'Pedal',
  'PedalSegment',
  'Measure',
  ...TEXT_ELEMENT_CLASS_NAMES,
]);

export const TEXT_ELEMENT_CLASS_SET = new Set(TEXT_ELEMENT_CLASS_NAMES);

export const hasSelectableClass = (classAttr: string | null | undefined) => {
  if (!classAttr) {
    return false;
  }
  return classAttr.split(/\s+/).some((cls) => ELEMENT_SELECTION_CLASSES.has(cls));
};

export const hasTextElementClass = (classAttr: string | null | undefined) => {
  if (!classAttr) {
    return false;
  }
  return classAttr.split(/\s+/).some((cls) => TEXT_ELEMENT_CLASS_SET.has(cls));
};

export const isSvgTextElement = (element: Element | null) => {
  if (!element) {
    return false;
  }
  if (hasTextElementClass(element.getAttribute('class'))) {
    return true;
  }
  const tagName = element.tagName?.toLowerCase();
  if (tagName === 'text' || tagName === 'tspan') {
    return true;
  }
  return Boolean(element.closest?.('text'));
};

export const normalizeElementClasses = (element: Element, classAttr: string) => {
  if (!isSvgTextElement(element)) {
    return classAttr;
  }
  const tokens = classAttr.split(/\s+/).filter(Boolean);
  if (tokens.includes('Text')) {
    return classAttr;
  }
  return [...tokens, 'Text'].join(' ').trim() || 'Text';
};

export const resolveTextElement = (element: Element) => {
  const tagName = element.tagName?.toLowerCase();
  if (tagName === 'tspan') {
    return element.closest?.('text') ?? element;
  }
  return element;
};
