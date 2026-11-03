import React from 'react';
import { RichTextToolbar, htmlToMarkup, htmlToPlain, type BaseFont } from '../rich-text';

type Props = {
  rect: { x: number; y: number; w: number; h: number };
  zoom: number;
  contentRef: React.RefObject<HTMLDivElement | null>;
  editedRef: React.RefObject<boolean>;
  selectedTextValue: string;
  /** The text's own font: the markup's font switches are relative to it. */
  baseFont: BaseFont;
  onChange: (value: string) => void;
  /** The plain text, and the formatting as MuseScore markup (roadmap E17). */
  onApply: (value: string, markup?: string) => Promise<unknown> | void;
  onClose: () => void;
};

/**
 * Edits a piece of score text in place, over the score, at 100% size whatever the zoom, with its formatting (bold,
 * italic, fonts… per span, roadmap E17). Ctrl/Cmd+Enter saves, Escape closes; Ctrl/Cmd+B, I and U format.
 */
export function InlineTextEditor({
  rect: textEditorRect,
  zoom,
  contentRef: inlineTextContentRef,
  editedRef: inlineTextEditedRef,
  selectedTextValue,
  baseFont,
  onChange: handleSelectedTextChange,
  onApply: applySelectedTextValue,
  onClose: closeTextEditor,
}: Props) {
  const save = () => {
    const node = inlineTextContentRef.current;
    void applySelectedTextValue(
      node ? htmlToPlain(node) : selectedTextValue,
      node ? htmlToMarkup(node, baseFont) : undefined,
    );
    closeTextEditor();
  };
  const markEdited = () => {
    inlineTextEditedRef.current = true;
    handleSelectedTextChange(
      inlineTextContentRef.current ? htmlToPlain(inlineTextContentRef.current) : '',
    );
  };
  return (
    <div
      data-testid="inline-text-editor"
      className="absolute z-50 flex flex-col gap-1 rounded border-2 border-accent bg-white p-1 shadow-raised"
      style={{
        left: textEditorRect.x,
        top: textEditorRect.y,
        minWidth: Math.max(160, textEditorRect.w),
        minHeight: Math.max(30, textEditorRect.h),
        // The editor lives inside the zoomed score canvas; counter-scale so
        // text editing is always shown at 100% regardless of the score zoom.
        transform: `scale(${1 / zoom})`,
        transformOrigin: 'top left',
      }}
      onClick={(event) => event.stopPropagation()}
      onMouseDown={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <RichTextToolbar editorRef={inlineTextContentRef} onEdit={markEdited} />
      <div
        ref={inlineTextContentRef}
        data-testid="inline-text-content"
        role="textbox"
        aria-label="Edit score text"
        contentEditable
        suppressContentEditableWarning
        onInput={markEdited}
        onKeyDown={(event) => {
          const mod = event.ctrlKey || event.metaKey;
          const format =
            mod && !event.altKey
              ? { b: 'bold', i: 'italic', u: 'underline' }[event.key.toLowerCase()]
              : undefined;
          if (event.key === 'Escape') {
            event.preventDefault();
            closeTextEditor();
          } else if (event.key === 'Enter' && mod) {
            event.preventDefault();
            save();
          } else if (format) {
            // The editor's own shortcuts, not the score's (Mod+B is a score command too).
            event.preventDefault();
            event.stopPropagation();
            document.execCommand(format);
            markEdited();
          }
        }}
        className="min-h-7 min-w-[150px] px-1 py-0.5 text-base text-slate-900 outline-none"
      />
      <div className="flex justify-end gap-1 border-t border-slate-200 pt-1">
        <button
          type="button"
          onClick={save}
          className="rounded bg-accent px-2 py-0.5 text-xs font-medium text-white hover:bg-accent-hover"
        >
          Save
        </button>
        <button
          type="button"
          onClick={closeTextEditor}
          className="rounded border border-slate-300 px-2 py-0.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
