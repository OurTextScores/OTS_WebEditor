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
const table = [...cpp.matchAll(/\{\s*StyleId::(\w+),\s*(true|false),\s*([\w>-]+),\s*[\w>-]+\s*\}/g)].map((m) => ({
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

/** The QLabel whose buddy is this widget, or the label in the same grid row (column before it). */
function labelFor(el) {
  const name = el.getAttribute('name');
  const buddy = [...ui.querySelectorAll('widget[class="QLabel"]')].find((l) => prop(l, 'buddy') === name);
  if (buddy) return clean(text(buddy, 'text'));
  const item = el.parentElement;
  if (item?.tagName === 'item' && item.hasAttribute('row')) {
    const row = item.getAttribute('row');
    const col = Number(item.getAttribute('column'));
    for (const sibling of item.parentElement.children) {
      if (sibling.getAttribute('row') !== row || Number(sibling.getAttribute('column')) >= col) continue;
      const w = sibling.firstElementChild;
      if (w?.getAttribute('class') === 'QLabel') return clean(text(w, 'text'));
    }
  }
  // A horizontal layout: the label just before it.
  if (item?.tagName === 'item' && item.parentElement?.getAttribute('class') === 'QHBoxLayout') {
    const items = [...item.parentElement.children];
    for (let i = items.indexOf(item) - 1; i >= 0; i--) {
      const w = items[i].firstElementChild;
      if (w?.getAttribute('class') === 'QLabel') return clean(text(w, 'text'));
    }
  }
  return undefined;
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
      fields.push({ ...base, kind: 'boolean', label: clean(text(el, 'text')) ?? entry.key });
    } else if (cls === 'QGroupBox' && prop(el, 'checkable')) {
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

for (const page of out) {
  page.fields = page.fields
    .sort((a, b) => a.at - b.at)
    .map(({ at: _at, ...f }) => Object.fromEntries(Object.entries(f).filter(([, v]) => v !== undefined)));
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
