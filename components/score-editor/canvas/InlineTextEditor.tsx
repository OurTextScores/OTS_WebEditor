import React from 'react';

type Props = {
  rect: { x: number; y: number; w: number; h: number };
  zoom: number;
  contentRef: React.RefObject<HTMLDivElement | null>;
  editedRef: React.RefObject<boolean>;
  selectedTextValue: string;
  onChange: (value: string) => void;
  onApply: (value: string) => Promise<unknown> | void;
  onClose: () => void;
};

/** Edits a piece of score text in place, over the score, at 100% size whatever the zoom. Ctrl/Cmd+Enter saves, Escape closes. */
export function InlineTextEditor({
  rect: textEditorRect,
  zoom,
  contentRef: inlineTextContentRef,
  editedRef: inlineTextEditedRef,
  selectedTextValue,
  onChange: handleSelectedTextChange,
  onApply: applySelectedTextValue,
  onClose: closeTextEditor,
}: Props) {
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
      <div
        ref={inlineTextContentRef}
        data-testid="inline-text-content"
        role="textbox"
        aria-label="Edit score text"
        contentEditable
        suppressContentEditableWarning
        onInput={(event) => {
          inlineTextEditedRef.current = true;
          handleSelectedTextChange(event.currentTarget.textContent ?? '');
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault();
            closeTextEditor();
          } else if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
            event.preventDefault();
            void applySelectedTextValue(event.currentTarget.textContent ?? '');
            closeTextEditor();
          }
        }}
        className="min-h-7 min-w-[150px] px-1 py-0.5 text-base text-slate-900 outline-none"
      />
      <div className="flex justify-end gap-1 border-t border-slate-200 pt-1">
        <button
          type="button"
          onClick={() => {
            void applySelectedTextValue(
              inlineTextContentRef.current?.textContent ?? selectedTextValue,
            );
            closeTextEditor();
          }}
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
