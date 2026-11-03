import { useEffect, useState, type RefObject } from 'react';
import type { Score } from '../../../lib/webmscore-loader';
import { hasTextElementClass } from '../selection-classes';
import { markupOfTextElement, markupToHtml, type BaseFont } from './textMarkup';

const FALLBACK_FONT: BaseFont = { family: 'Edwin', size: 10 };

/**
 * The selected text, for the inline editor (roadmap E17): its plain text and MuseScore markup, read from the
 * selection's copy data, and its own font (the markup's font switches are relative to it). While the editor is open
 * and the user has not typed, its content is the markup as formatted HTML, caret at the end.
 */
export function useInlineTextContent({
  score,
  selectedElementClasses,
  editorOpen,
  contentRef,
  editedRef,
}: {
  score: Score | null;
  selectedElementClasses: string;
  editorOpen: boolean;
  contentRef: RefObject<HTMLDivElement | null>;
  editedRef: RefObject<boolean>;
}) {
  const [selectedTextValue, setSelectedTextValue] = useState('');
  const [markup, setMarkup] = useState('');
  const [baseFont, setBaseFont] = useState<BaseFont>(FALLBACK_FONT);

  useEffect(() => {
    const shouldLoadText = hasTextElementClass(selectedElementClasses) || editorOpen;
    const clear = () => {
      setSelectedTextValue('');
      setMarkup('');
    };
    if (!score || !shouldLoadText) {
      clear();
      return;
    }
    let canceled = false;
    const read = async () => {
      if (!score.selectionMimeData || typeof DOMParser === 'undefined') return clear();
      const data = await score.selectionMimeData();
      if (canceled) return;
      if (!data) return clear();
      let decoded: string;
      try {
        decoded = new TextDecoder().decode(data);
      } catch (decodeErr) {
        console.warn('Failed to decode text selection MIME data', decodeErr);
        return clear();
      }
      const textNode = new DOMParser()
        .parseFromString(decoded, 'application/xml')
        .querySelector('text');
      setSelectedTextValue((textNode?.textContent ?? '').trim());
      setMarkup(textNode ? markupOfTextElement(textNode) : '');
      // The element's own font, which markup without a <font> switch is in.
      const fonts = await score.getElementPropertyValues?.(['family', 'size']);
      if (canceled) return;
      const size = Number(fonts?.size?.value);
      setBaseFont({
        family: fonts?.family?.value || FALLBACK_FONT.family,
        size: Number.isFinite(size) && size > 0 ? size : FALLBACK_FONT.size,
      });
    };
    void read();
    return () => {
      canceled = true;
    };
  }, [score, selectedElementClasses, editorOpen]);

  // Reset the edited flag whenever the inline text editor opens or closes.
  useEffect(() => {
    editedRef.current = false;
  }, [editorOpen, editedRef]);

  // Populate the (uncontrolled) editor from the selected text, formatted. Runs on open and again if the text loads
  // asynchronously, but never once the user has started typing, so keystrokes are not reverted by a late load.
  useEffect(() => {
    if (!editorOpen || editedRef.current) return;
    const node = contentRef.current;
    if (!node) return;
    const html = markup ? markupToHtml(markup) : '';
    if (node.innerHTML !== html) node.innerHTML = html;
    node.focus();
    const selection = typeof window !== 'undefined' ? window.getSelection() : null;
    if (selection && typeof document !== 'undefined') {
      const range = document.createRange();
      range.selectNodeContents(node);
      range.collapse(false);
      selection.removeAllRanges();
      selection.addRange(range);
    }
  }, [editorOpen, markup, contentRef, editedRef]);

  return { selectedTextValue, setSelectedTextValue, markup, baseFont };
}
