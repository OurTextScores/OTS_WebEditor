'use client';

import React, { useRef, type RefObject } from 'react';
import { Button } from '../../ui/Button';

/** Fonts OTS ships for scores (the engine's text fonts and each music font's text companion). */
const FONTS = [
  'Edwin',
  'FreeSerif',
  'FreeSans',
  'MScore Text',
  'Leland Text',
  'Bravura Text',
  'Gonville Text',
  'MuseJazz Text',
  'Petaluma Text',
  'Finale Maestro Text',
  'Finale Broadway Text',
];

const STYLES = [
  { command: 'bold', label: 'Bold', short: 'B', className: 'font-bold' },
  { command: 'italic', label: 'Italic', short: 'I', className: 'italic' },
  { command: 'underline', label: 'Underline', short: 'U', className: 'underline' },
  { command: 'strikeThrough', label: 'Strikethrough', short: 'S', className: 'line-through' },
  { command: 'superscript', label: 'Superscript', short: 'x²', className: '' },
  { command: 'subscript', label: 'Subscript', short: 'x₂', className: '' },
] as const;

const controlClass = 'rounded border border-slate-300 bg-white px-1 py-0.5 text-xs';

/**
 * MuseScore's text toolbar for the inline editor (roadmap E17): bold, italic, underline, strikethrough, superscript,
 * subscript, font and size, on the selected part of the text. The buttons keep the focus in the editor; the font menu
 * and size field take it, so the editor's selection is saved when they are reached and restored before applying.
 */
export function RichTextToolbar({
  editorRef,
  onEdit,
}: {
  editorRef: RefObject<HTMLDivElement | null>;
  onEdit: () => void;
}) {
  const saved = useRef<Range | null>(null);

  const save = () => {
    const selection = window.getSelection();
    const range = selection && selection.rangeCount ? selection.getRangeAt(0) : null;
    if (range && editorRef.current?.contains(range.commonAncestorContainer))
      saved.current = range.cloneRange();
  };
  const restore = () => {
    const editor = editorRef.current;
    if (!editor) return false;
    editor.focus();
    if (saved.current) {
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(saved.current);
    }
    return true;
  };
  const run = (command: string, value?: string) => {
    if (!restore()) return;
    // Tags (<b>, <font>), not inline styles: the markup conversion reads both, but tags are simpler to keep.
    document.execCommand('styleWithCSS', false, 'false');
    document.execCommand(command, false, value);
    onEdit();
  };
  /** Size in points: the browser's fontSize command only knows 1–7, so mark the text with 7 and turn that into points. */
  const applySize = (points: number) => {
    if (!Number.isFinite(points) || points <= 0) return;
    run('fontSize', '7');
    editorRef.current?.querySelectorAll('font[size="7"]').forEach((font) => {
      const span = document.createElement('span');
      span.dataset.size = String(points);
      span.style.fontSize = `${points}pt`;
      while (font.firstChild) span.appendChild(font.firstChild);
      font.replaceWith(span);
    });
    onEdit();
  };

  return (
    <div
      className="flex flex-wrap items-center gap-0.5 border-b border-slate-200 pb-1"
      role="toolbar"
      aria-label="Text formatting"
    >
      {STYLES.map(({ command, label, short, className }) => (
        <Button
          key={command}
          type="button"
          variant="quiet"
          size="bar"
          title={label}
          aria-label={label}
          data-testid={`rich-text-${command}`}
          // Keep the focus (and so the selection) in the editor.
          onMouseDown={(event) => {
            event.preventDefault();
            save();
            run(command);
          }}
        >
          <span className={className}>{short}</span>
        </Button>
      ))}
      <select
        aria-label="Font"
        data-testid="rich-text-font"
        className={controlClass}
        defaultValue=""
        onMouseDown={save}
        onFocus={save}
        onChange={(event) => {
          if (event.currentTarget.value) run('fontName', event.currentTarget.value);
          event.currentTarget.value = '';
        }}
      >
        <option value="">Font…</option>
        {FONTS.map((font) => (
          <option key={font} value={font}>
            {font}
          </option>
        ))}
      </select>
      <input
        type="number"
        aria-label="Size (pt)"
        title="Size (pt)"
        data-testid="rich-text-size"
        className={`${controlClass} w-14`}
        min={1}
        max={1000}
        step={0.5}
        placeholder="pt"
        onMouseDown={save}
        onFocus={save}
        onKeyDown={(event) => {
          if (event.key !== 'Enter') return;
          event.preventDefault();
          applySize(event.currentTarget.valueAsNumber);
        }}
      />
    </div>
  );
}
