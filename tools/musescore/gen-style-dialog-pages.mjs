#!/usr/bin/env node
// Generates the Style dialog's pages (roadmap E08) from MuseScore 4.7's own Style dialog: the widget-to-style-key
// table in notationscene/widgets/editstyle.cpp and the pages, labels and ranges in editstyle.ui. Only plain widgets
// are taken (check boxes, checkable group boxes, spin boxes, combo boxes whose items the .ui or a simple addItem
// list gives, line edits). Pages MuseScore builds in QML are written by hand in styleDialogQmlPages.ts.
//
//   node tools/musescore/gen-style-dialog-pages.mjs [<ms47 src dir>]
//
// Writes components/score-editor/score-dialogs/style-pages.generated.json and prints what it skipped.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const src = path.resolve(process.argv[2] ?? path.join(root, '../ms47-spike/src'));
const widgets = path.join(src, 'notationscene/widgets');
const cpp = fs.readFileSync(path.join(widgets, 'editstyle.cpp'), 'utf8');
const ui = new JSDOM(fs.readFileSync(path.join(widgets, 'editstyle.ui'), 'utf8'), { contentType: 'text/xml' }).window.document;

// { StyleId::key, percent, widgetName, resetButton }
const table = [...cpp.replace(/\/\/.*$/gm, '').matchAll(/\{\s*StyleId::(\w+),\s*(true|false),\s*([\w>-]+),\s*[\w>-]+\s*\}/g)].map((m) => ({
  key: m[1],
  percent: m[2] === 'true',
  widget: m[3],
}));

const pageCodes = [...cpp.match(/ALL_PAGE_CODES\s*\{([^}]*)\}/)[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
const pageList = [...ui.querySelectorAll('widget[name="pageList"] > item')].map((item) => text(item, 'text'));
const pages = [...ui.querySelectorAll('widget[name="pageStack"] > widget')];
// Document order of every widget: a page's fields follow MuseScore's layout, not the table's order.
const order = new Map([...ui.querySelectorAll('widget')].map((w, i) => [w.getAttribute('name'), i]));

/** A property's string/number/bool value, by property name, on this element only. */
function prop(el, name) {
  const p = [...el.children].find((c) => c.tagName === 'property' && c.getAttribute('name') === name);
  if (!p) return undefined;
  const v = p.firstElementChild;
  if (!v) return undefined;
  if (v.tagName === 'number' || v.tagName === 'double') return Number(v.textContent);
  if (v.tagName === 'bool') return v.textContent === 'true';
  return v.textContent;
}
function text(el, name) {
  const v = prop(el, name);
  return typeof v === 'string' ? v : undefined;
}
const clean = (label) => label?.replace(/&amp;/g, '&').replace(/&(?=\w)/g, '').replace(/:\s*$/, '').trim();

/**
 * The label shown beside the widget: the one in the same grid row (column before it), else the QLabel whose buddy it
 * is. The row wins: a buddy can point at the wrong widget (the Ottava page's "Dash size" names the line style).
 */
function labelFor(el) {
  const name = el.getAttribute('name');
  const buddy = [...ui.querySelectorAll('widget[class="QLabel"]')].find((l) => prop(l, 'buddy') === name);
  const item = el.parentElement;
  if (item?.tagName === 'item' && item.hasAttribute('row')) {
    const row = item.getAttribute('row');
    const col = Number(item.getAttribute('column'));
    // The nearest label to its left: a row can hold two label/value pairs.
    const left = [...item.parentElement.children]
      .filter((c) => c.getAttribute('row') === row && Number(c.getAttribute('column')) < col)
      .filter((c) => c.firstElementChild?.getAttribute('class') === 'QLabel')
      .sort((a, b) => Number(b.getAttribute('column')) - Number(a.getAttribute('column')))[0];
    if (left) return clean(text(left.firstElementChild, 'text'));
  }
  // A horizontal layout: the label just before it.
  if (item?.tagName === 'item' && item.parentElement?.getAttribute('class') === 'QHBoxLayout') {
    const items = [...item.parentElement.children];
    for (let i = items.indexOf(item) - 1; i >= 0; i--) {
      const w = items[i].firstElementChild;
      if (w?.getAttribute('class') === 'QLabel') return clean(text(w, 'text'));
    }
  }
  return buddy ? clean(text(buddy, 'text')) : undefined;
}

/**
 * An unlabelled check box in a grid (the Tablature page: a row per element, a column per TAB type): the row's text
 * label, and the column's header from the first row, as "Row (Column)".
 */
function gridCellLabel(el) {
  const item = el.parentElement;
  if (item?.tagName !== 'item' || !item.hasAttribute('row')) return undefined;
  const cells = [...item.parentElement.children].filter((c) => c.tagName === 'item');
  const labelAt = (row, column) =>
    cells
      .filter((c) => c.getAttribute('row') === row && (column === undefined || c.getAttribute('column') === column))
      .map((c) => c.firstElementChild)
      .filter((w) => w?.getAttribute('class') === 'QLabel')
      .map((w) => clean(text(w, 'text')))
      .find(Boolean);
  const row = labelAt(item.getAttribute('row'));
  if (!row) return undefined;
  // The header is the top-most label in the column (row 1 on the Tablature page; row 0 holds its title).
  const column = item.getAttribute('column');
  const headerRow = cells
    .filter((c) => c.getAttribute('column') === column && c.firstElementChild?.getAttribute('class') === 'QLabel')
    .map((c) => c.getAttribute('row'))
    .sort((a, b) => Number(a) - Number(b))[0];
  const header = headerRow !== undefined && headerRow !== item.getAttribute('row') ? labelAt(headerRow, column) : undefined;
  return header ? `${row} (${header})` : row;
}

/** The innermost titled group box around the widget, for a sub-heading. */
function groupOf(el, page) {
  for (let p = el.parentElement; p && p !== page; p = p.parentElement) {
    if (p.tagName === 'widget' && p.getAttribute('class') === 'QGroupBox' && p !== el && text(p, 'title')) {
      return clean(text(p, 'title'));
    }
  }
  return undefined;
}

/** Items a combo box gets: from the .ui, else from a run of `<widget>->addItem(label, value)` calls in the .cpp. */
function comboOptions(el, name) {
  const fromUi = [...el.children].filter((c) => c.tagName === 'item').map((item, i) => ({ value: i, label: clean(text(item, 'text')) }));
  if (fromUi.length) return fromUi;
  const calls = [
    ...cpp.matchAll(new RegExp(`\\b${name}->addItem\\(\\s*muse::qtrc\\("[^"]*",\\s*"([^"]+)"[^)]*\\),\\s*(?:static_cast<int>\\()?(?:int\\()?([\\w:]+)\\)?\\)?\\s*\\)`, 'g')),
  ];
  if (!calls.length) return undefined;
  return calls.map((m) => ({ value: m[2], label: m[1] }));
}

const skipped = [];
const out = [];
pages.forEach((page, index) => {
  const fields = [];
  for (const entry of table) {
    const el = page.querySelector(`widget[name="${entry.widget}"]`);
    if (!el) continue;
    const cls = el.getAttribute('class');
    const group = groupOf(el, page);
    const base = { key: entry.key, at: order.get(entry.widget), ...(group ? { group } : {}) };
    if (cls === 'QCheckBox' || cls === 'QRadioButton') {
      const label = clean(text(el, 'text')) || gridCellLabel(el);
      if (!label) {
        skipped.push(`${pageCodes[index]}: ${entry.key} (check box without a label)`);
        continue;
      }
      fields.push({ ...base, kind: 'boolean', label });
    } else if (/GroupBox$/.test(cls) && prop(el, 'checkable')) {
      fields.push({ ...base, kind: 'boolean', label: clean(text(el, 'title')) ?? entry.key, group: undefined });
    } else if (cls === 'QSpinBox' || cls === 'QDoubleSpinBox') {
      const label = labelFor(el);
      if (!label) {
        skipped.push(`${pageCodes[index]}: ${entry.key} (${cls} without a label)`);
        continue;
      }
      const decimals = prop(el, 'decimals') ?? (cls === 'QSpinBox' ? 0 : 2);
      const suffix = clean(text(el, 'suffix'));
      fields.push({
        ...base,
        kind: 'number',
        label,
        min: prop(el, 'minimum') ?? 0,
        max: prop(el, 'maximum') ?? 99,
        step: prop(el, 'singleStep') ?? (decimals ? 10 ** -decimals : 1),
        ...(suffix ? { unit: suffix } : {}),
        ...(entry.percent ? { percent: true } : {}),
      });
    } else if (cls === 'QComboBox') {
      const label = labelFor(el);
      const options = comboOptions(el, entry.widget);
      if (!label || !options) {
        skipped.push(`${pageCodes[index]}: ${entry.key} (combo box ${!label ? 'without a label' : 'filled in code'})`);
        continue;
      }
      fields.push({ ...base, kind: 'select', label, options });
    } else if (cls === 'QTextEdit') {
      // Header and footer texts: plain strings with MuseScore's $-macros, in an Odd/Even × Left/Middle/Right grid.
      const label = gridCellLabel(el) ?? labelFor(el);
      if (label) fields.push({ ...base, kind: 'text', label });
      else skipped.push(`${pageCodes[index]}: ${entry.key} (text box without a label)`);
    } else if (/OffsetSelect$/.test(cls)) {
      // An x/y offset in sp (P_TYPE::POINT).
      const label = labelFor(el);
      if (label) fields.push({ ...base, kind: 'point', label, unit: 'sp' });
      else skipped.push(`${pageCodes[index]}: ${entry.key} (offset without a label)`);
    } else if (cls === 'QLineEdit') {
      const label = labelFor(el);
      if (label) fields.push({ ...base, kind: 'text', label });
      else skipped.push(`${pageCodes[index]}: ${entry.key} (line edit without a label)`);
    } else {
      skipped.push(`${pageCodes[index]}: ${entry.key} (${cls})`);
    }
  }
  if (fields.length) out.push({ code: pageCodes[index], title: clean(pageList[index]) ?? pageCodes[index], fields });
});

// ---------------------------------------------------------------------------------------------------------------
// Pages and sections MuseScore draws in QML (notationscene/qml/.../styledialog), placed where editstyle.cpp adds them.
// Each control binds a page-model getter (`model.beamWidth.value`); the models map getters to style keys.
const qmlDir = path.join(src, 'notationscene/qml/MuseScore/NotationScene/styledialog');
const QML_SOURCES = [
  ['MeasureNumbersPage.qml', 'measure-number'],
  ['ClefKeyTimeSigPage.qml', 'clefs-key-and-time-signatures'],
  ['AccidentalsPage.qml', 'accidentals'],
  ['RepeatBarlinesSection.qml', 'barlines'],
  ['NoteFlagsTypeSelector.qml', 'notes'],
  ['RestOffsetSelector.qml', 'rests'],
  ['RepeatPage.qml', 'repeats'],
  ['BeamsPage.qml', 'beams'],
  ['TupletCenteringSelector.qml', 'tuplets'],
  ['SlursSection.qml', 'slurs-and-ties'],
  ['TiesSection.qml', 'slurs-and-ties'],
  ['LaissezVibrSection.qml', 'slurs-and-ties'],
  ['GlissandoSection.qml', 'glissando-note-line'],
  ['NoteLineSection.qml', 'glissando-note-line'],
  ['BendsPage.qml', 'bend'],
  ['HammerOnPullOffTappingPage.qml', 'hammer-ons-pull-offs-and-tapping'],
  ['VoltasPage.qml', 'volta'],
  ['ChordSymbolsPage.qml', 'chord-symbols'],
  ['FretboardsPage.qml', 'fretboard-diagrams'],
];

// getter -> style key, from every model's `StyleItem* Model::getter() const { return styleItem(StyleId::key); }`.
const getters = new Map();
for (const file of fs.readdirSync(qmlDir).filter((f) => f.endsWith('.cpp'))) {
  const code = fs.readFileSync(path.join(qmlDir, file), 'utf8');
  for (const m of code.matchAll(/StyleItem\*\s+\w+::(\w+)\(\)\s*const\s*\{\s*return\s+styleItem\(StyleId::(\w+)\)/g)) {
    if (getters.has(m[1]) && getters.get(m[1]) !== m[2]) skipped.push(`qml: getter ${m[1]} is ambiguous`);
    getters.set(m[1], m[2]);
  }
}

// Option lists models build in C++ (`model: chordSymbolsModel.possibleChordSymbolSpellings()`): each function's
// { "text", qtrc(…, "Label") }, { "value", static_cast<int>(Enum::MEMBER) } pairs, in order. Resolved after the enums.
const modelFunctionSources = new Map();
for (const file of fs.readdirSync(qmlDir).filter((f) => f.endsWith('.cpp'))) {
  const code = fs.readFileSync(path.join(qmlDir, file), 'utf8');
  for (const m of code.matchAll(/QVariantList\s+\w+::(\w+)\(\)\s*const\s*\{([\s\S]*?)\n\}/g)) modelFunctionSources.set(m[1], m[2]);
}

// Enum members by name, from the engraving headers, so `DirectionV.UP` in a QML option list becomes its int.
const enums = new Map();
for (const header of ['engraving/types/types.h', 'engraving/dom/mscore.h', 'engraving/style/styledef.h']) {
  const file = path.join(src, header);
  if (!fs.existsSync(file)) continue;
  const code = fs.readFileSync(file, 'utf8').replace(/\/\/.*$/gm, '');
  for (const m of code.matchAll(/enum\s+class\s+(\w+)\s*(?::\s*[\w:\s]+?)?\{([^}]*)\}/g)) {
    let next = 0;
    const members = new Map();
    for (const raw of m[2].split(',')) {
      const [name, value] = raw.split('=').map((s) => s.trim());
      if (!/^\w+$/.test(name ?? '')) continue;
      if (value !== undefined) next = /^-?\d+$/.test(value) ? Number(value) : (members.get(value.replace(/^\w+::/, '')) ?? next);
      members.set(name, next++);
    }
    enums.set(m[1], members);
  }
}

const modelFunctions = new Map();
for (const [name, body] of modelFunctionSources) {
  const options = [...body.matchAll(/"text",\s*muse::qtrc\("[^"]*",\s*"([^"]+)"\)\s*\}[\s\S]*?"value",\s*static_cast<int>\(([\w:]+)\)/g)].map((m) => {
    const [enumName, member] = m[2].split('::').slice(-2);
    return { value: enums.get(enumName)?.get(member), label: m[1] };
  });
  if (options.length && options.every((o) => o.value !== undefined)) modelFunctions.set(name, options);
}

// Labels for options MuseScore shows as icons only (its IconCode names and tooltips).
const ICON_LABELS = {
  ALIGN_LEFT: 'Left',
  ALIGN_HORIZONTAL_CENTER: 'Center',
  ALIGN_RIGHT: 'Right',
  CHORD_BASS_ALIGN: 'Aligned',
  CHORD_BASS_OFFSET: 'Staggered',
  GUITAR_BEND_STYLE_1: '1',
  GUITAR_BEND_STYLE_FULL: 'full',
  TAPPING_ENCIRCLED_T: 'Circled T',
  TAPPING_DOT: 'Dot',
  TAPPING_PLUS: '+',
  TAPPING_T: 'T',
};

/** A QML file as an object tree: { type, own (its text minus child objects), children, parent }. */
function parseQml(source) {
  const rootNode = { type: 'file', own: '', children: [], parent: null };
  let node = rootNode;
  const stack = []; // per '{': the object it opened, or null for a JS block / object literal
  let i = 0;
  while (i < source.length) {
    const ch = source[i];
    if (ch === '/' && source[i + 1] === '/') {
      const end = source.indexOf('\n', i);
      i = end < 0 ? source.length : end;
      continue;
    }
    if (ch === '/' && source[i + 1] === '*') {
      i = source.indexOf('*/', i) + 2;
      continue;
    }
    if (ch === '"' || ch === "'") {
      let j = i + 1;
      while (j < source.length && source[j] !== ch) j += source[j] === '\\' ? 2 : 1;
      node.own += source.slice(i, j + 1);
      i = j + 1;
      continue;
    }
    if (ch === '{') {
      const type = /([A-Z][\w.]*)\s*$/.exec(node.own)?.[1];
      // `Type {` opens an object unless it follows a ':' on the same line (a property's object literal).
      const line = node.own.slice(node.own.lastIndexOf('\n') + 1);
      if (type && !/:\s*[A-Z][\w.]*\s*$/.test(line)) {
        node.own = node.own.slice(0, node.own.length - type.length);
        const child = { type, own: '', children: [], parent: node };
        node.children.push(child);
        stack.push(node);
        node = child;
      } else {
        stack.push(null);
        node.own += ch;
      }
      i++;
      continue;
    }
    if (ch === '}') {
      const opened = stack.pop();
      if (opened) node = opened;
      else node.own += ch;
      i++;
      continue;
    }
    node.own += ch;
    i++;
  }
  return rootNode;
}

const qsTr = (text) => text?.match(/qsTrc?\(\s*"[^"]*"\s*,\s*"((?:[^"\\]|\\.)*)"/)?.[1] ?? text?.match(/^\s*"((?:[^"\\]|\\.)*)"/)?.[1];
/** A property of the object's own text: `name: value` up to the line end. */
const qmlProp = (node, name) => node.own.match(new RegExp(`(?:^|\\n)\\s*${name.replace('.', '\\.')}\\s*:\\s*([^\\n]+)`))?.[1]?.trim();
const ancestors = function* (node) {
  for (let p = node.parent; p; p = p.parent) yield p;
};
const labelOf = (node) => clean(qsTr(qmlProp(node, 'title')) ?? qsTr(qmlProp(node, 'text')) ?? qsTr(qmlProp(node, 'label')));
const NUMBER_TYPES = /^(IncrementalPropertyControl|StyleSpinboxWithReset|SpinBox)$/;
const BOOLEAN_TYPES = /^(CheckBox|StyleToggle|StyleToggleWithImage|ToggleButton|FlatToggleButton)$/;
const TEXT_TYPES = /^(TextFieldWithReset|TextInputField)$/;
const GROUP_TYPES = /^(StyledGroupBox|ItemWithTitle|StyleControlRowWithReset|Column|ColumnLayout|RowLayout)$/;

/** `model: [ { text: …, value: … }, … ]` on this object or one of its first ancestors, as options. */
function optionsAround(node) {
  for (const n of [node, ...[...ancestors(node)].slice(0, 5)]) {
    const fromModel = n.own.match(/model\s*:\s*\w+\.(\w+)\(\)/)?.[1];
    if (fromModel && modelFunctions.has(fromModel)) return modelFunctions.get(fromModel);
    const literal = n.own.match(/model\s*:\s*\[([\s\S]*?)\]\s*(?:\n|$)/)?.[1];
    if (!literal) continue;
    const options = [...literal.matchAll(/\{([^{}]*)\}/g)].map((m) => {
      const label =
        qsTr(m[1].match(/(?:text|title|toolTipTitle)\s*:\s*(qsTrc?\([^)]*\)|"[^"]+")/)?.[1]) ??
        ICON_LABELS[m[1].match(/iconCode\s*:\s*IconCode\.(\w+)/)?.[1]];
      const rawValue = m[1].match(/value\s*:\s*([^,}\s]+)/)?.[1];
      let value = rawValue;
      if (rawValue === 'true' || rawValue === 'false') value = rawValue === 'true';
      else if (/^-?\d+(\.\d+)?$/.test(rawValue ?? '')) value = Number(rawValue);
      else if (rawValue?.includes('.')) {
        const [enumName, member] = rawValue.split('.').slice(-2);
        value = enums.get(enumName)?.get(member);
      }
      return { value, label };
    });
    if (options.length && options.every((o) => o.value !== undefined && o.label)) return options;
    return null;
  }
  return null;
}

const LABEL_TYPES = /^(StyledTextLabel|Label|Text)$/;
/** The text label just before this object among its siblings (MuseScore's grid rows: label, control, reset). */
function siblingLabel(node) {
  const siblings = node.parent?.children ?? [];
  for (let i = siblings.indexOf(node) - 1, steps = 0; i >= 0 && steps < 2; i--, steps++) {
    if (LABEL_TYPES.test(siblings[i].type)) return labelOf(siblings[i]);
    if (/\.\w+\.value\b/.test(siblings[i].own)) return undefined; // another control: its label, not ours
  }
  return undefined;
}
/**
 * A control's label: its own title/text (not a delegate's modelData text), else the label before it in its row,
 * then the same one level up at a time, and a group box's title only when nothing nearer names it.
 */
function controlLabel(node, hasOptions, isRadio = false) {
  // A sibling radio button's own text is its option, never the choice's label.
  const own = isRadio ? undefined : labelOf(node);
  // A delegate's text is its option (`modelData.text`), not the control's label; anything else is.
  if (own && !(hasOptions && /modelData/.test(node.own))) return own;
  let fallback;
  for (const n of [node, ...ancestors(node)]) {
    if (n !== node) {
      const title = labelOf(n);
      if (title && n.type !== 'StyledGroupBox') return title;
      if (title) fallback ??= title;
    }
    const before = siblingLabel(n);
    if (before) return before;
  }
  return fallback;
}

/**
 * Radio buttons as siblings, each `checked: model.getter.value === <value>` with its own text (TiesSection's dots
 * placement): one choice with an option per button.
 */
function radioSiblings(node, key) {
  const pattern = (n) => n.own.match(/checked\s*:\s*(?:\w+\.)+?(\w+)\.value\s*===\s*([\w.-]+)/);
  const own = pattern(node);
  if (!own || getters.get(own[1]) !== key || !node.parent) return null;
  const options = node.parent.children
    .map((n) => [n, pattern(n)])
    .filter(([, m]) => m && getters.get(m[1]) === key)
    .map(([n, m]) => ({
      value: m[2] === 'true' ? true : m[2] === 'false' ? false : /^-?\d+$/.test(m[2]) ? Number(m[2]) : undefined,
      label: labelOf(n),
    }));
  return options.length > 1 && options.every((o) => o.value !== undefined && o.label) ? options : null;
}

const QML_HOST_TITLES = {
  useStraightNoteFlags: 'Flag style', // NoteFlagsTypeSelector.qml in groupBox_noteFlags
  multiVoiceRestTwoSpaceOffset: 'Rests (multiple voices)', // RestOffsetSelector.qml in groupBox_rests
};

let qmlOrder = 1e6;
for (const [file, pageCode] of QML_SOURCES) {
  const tree = parseQml(fs.readFileSync(path.join(qmlDir, file), 'utf8'));
  const seen = new Set();
  const visit = (node) => {
    // A control binds its setting as `model.getter.value`, or as `styleItem: model.getter` (the *WithReset controls);
    // a StyleResetButton's styleItem is only its reset.
    const bindings = node.type === 'StyleResetButton' ? [] : [
      ...node.own.matchAll(/\b\w+\.(\w+)\.value\b/g),
      ...node.own.matchAll(/styleItem\s*:\s*(?:[\w.]+\s*\?\s*)?(?:\w+\.)+(\w+)\b/g),
    ];
    // The setting a control edits is the one it assigns (`model.x.value = …`), not one its `enabled:` or `visible:`
    // reads; then its styleItem, then any reference.
    const assigned = node.type === 'StyleResetButton' ? [] : [...node.own.matchAll(/\.(\w+)\.value\s*=(?!=)/g)];
    const refs = [...assigned, ...bindings].map((m) => getters.get(m[1])).filter(Boolean);
    // Only a control edits a setting: a page's own object lists all its settings (for reset-all), which is no control.
    const isControl = /\b(checked|currentValue|onToggled|onClicked|onValueEdited|onTextEdited|styleItem|onActivated|currentIndex)\s*:/.test(node.own);
    const key = isControl ? refs.find((k) => !seen.has(k)) : undefined;
    if (key && !seen.has(key) && !table.some((t) => t.key === key)) {
      // The control: this object, or (for a delegate) the nearest typed ancestor that owns the options.
      const radios = optionsAround(node) ? null : radioSiblings(node, key);
      const options = optionsAround(node) ?? radios;
      // Sibling radio buttons are labelled before the first of them.
      const first = (radios && node.parent?.children.find((n) => radioSiblings(n, key))) || node;
      const label = controlLabel(first, Boolean(options), Boolean(radios));
      const group = [...ancestors(node)].filter((a) => a.type === 'StyledGroupBox').map(labelOf).find(Boolean);
      const base = { key, at: qmlOrder++, ...(group && group !== label ? { group } : {}) };
      const min = Number(qmlProp(node, 'minValue') ?? qmlProp(node, 'min') ?? qmlProp(node, 'from'));
      const max = Number(qmlProp(node, 'maxValue') ?? qmlProp(node, 'max') ?? qmlProp(node, 'to'));
      const step = Number(qmlProp(node, 'step') ?? qmlProp(node, 'stepSize'));
      const unit = qsTr(qmlProp(node, 'measureUnitsSymbol')) ?? qsTr(qmlProp(node, 'suffix'));
      let field = null;
      if (options) field = { ...base, kind: 'select', label, options };
      else if (NUMBER_TYPES.test(node.type))
        field = {
          ...base,
          kind: 'number',
          label,
          min: Number.isFinite(min) ? min : 0,
          max: Number.isFinite(max) ? max : 99,
          step: Number.isFinite(step) ? step : 0.01,
          ...(unit ? { unit } : {}),
          ...(qmlProp(node, 'inPercentage') === 'true' ? { percent: true } : {}),
        };
      else if (BOOLEAN_TYPES.test(node.type) || /checked\s*:/.test(node.own)) field = { ...base, kind: 'boolean', label };
      else if (TEXT_TYPES.test(node.type)) field = { ...base, kind: 'text', label };
      // A label MuseScore gives only as the title of the box it adds the QML into (editstyle.cpp/.ui).
      if (field && !field.label && QML_HOST_TITLES[key]) field.label = QML_HOST_TITLES[key];
      if (field && field.label) {
        seen.add(key);
        let page = out.find((p) => p.code === pageCode);
        if (!page) {
          page = { code: pageCode, title: clean(pageList[pageCodes.indexOf(pageCode)]) ?? pageCode, fields: [] };
          out.push(page);
        }
        page.fields.push(field);
      } else if (!GROUP_TYPES.test(node.type)) {
        skipped.push(`${pageCode}: ${key} (QML ${node.type}${field ? ' without a label' : ''})`);
        seen.add(key);
      }
    }
    node.children.forEach(visit);
  };
  visit(tree);
}

// Controls the heuristics above misread, corrected by hand from the QML (cited): radio pairs nested too deeply for
// optionsAround, or split across rows for radioSiblings.
const OVERRIDES = {
  // BeamsPage.qml: RadioButtonGroup in a StyledGroupBox "Beam style"
  frenchStyleBeams: {
    kind: 'select',
    label: 'Beam style',
    options: [
      { value: false, label: 'Draw inner stems through beams' },
      { value: true, label: 'Draw inner stems to nearest beam (“French” style)' },
    ],
  },
  // Labels MuseScore repeats in sections shown one at a time, or under a parent heading the field loses.
  minSystemSpread: { label: 'Min. system distance (vertical justification)' },
  maxSystemSpread: { label: 'Max. system distance (vertical justification)' },
  guitarBendLineWidth: { label: 'Bend line thickness' },
  guitarDiveLineWidth: { label: 'Dive line thickness' },
  guitarBendLineWidthTab: { label: 'Bend line thickness' },
  guitarDiveLineWidthTab: { label: 'Dive line thickness' },
  lhTappingSymbolNormalStave: { label: 'Symbol on standard staves' },
  lhTappingSymbolTab: { label: 'Symbol on tablature staves' },
  fretCustomSuffix: { label: 'Custom suffix', group: undefined },
  // FretboardsPage.qml: "Format:" with RoundedRadioButtons "Number only" / "Custom suffix:" in separate rows
  fretUseCustomSuffix: {
    kind: 'select',
    label: 'Format',
    group: undefined,
    options: [
      { value: false, label: 'Number only' },
      { value: true, label: 'Custom suffix' },
    ],
  },
};
for (const page of out) {
  page.fields = page.fields.map((f) => (OVERRIDES[f.key] ? { ...f, ...OVERRIDES[f.key] } : f));
}

out.sort((a, b) => pageCodes.indexOf(a.code) - pageCodes.indexOf(b.code));
for (const page of out) {
  page.fields = page.fields
    .sort((a, b) => a.at - b.at)
    .map((f) => Object.fromEntries(Object.entries(f).filter(([k, v]) => k !== 'at' && v !== undefined)));
}

const target = path.join(root, 'components/score-editor/score-dialogs/style-pages.generated.json');
const header = {
  _comment:
    'Generated by tools/musescore/gen-style-dialog-pages.mjs from MuseScore 4.7 notationscene/widgets/editstyle.{cpp,ui}. Do not edit; regenerate.',
};
// One field per line, so a regeneration's diff reads per setting.
const pageJson = (page) =>
  `  {"code": ${JSON.stringify(page.code)}, "title": ${JSON.stringify(page.title)}, "fields": [\n${page.fields
    .map((f) => `    ${JSON.stringify(f)}`)
    .join(',\n')}\n  ]}`;
fs.writeFileSync(target, `{"_comment": ${JSON.stringify(header._comment)},\n "pages": [\n${out.map(pageJson).join(',\n')}\n]}\n`);
const count = out.reduce((n, p) => n + p.fields.length, 0);
console.log(`${out.length} pages, ${count} fields; ${skipped.length} widgets skipped:`);
for (const s of skipped) console.log(`  ${s}`);
