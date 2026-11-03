/**
 * Rich text in the inline editor (roadmap E17): MuseScore's text markup to and from the editor's HTML, its text
 * toolbar, and its special characters.
 */
export {
  htmlToMarkup,
  htmlToPlain,
  markupOfTextElement,
  markupToHtml,
  symChipHtml,
  type BaseFont,
} from './textMarkup';
export {
  loadSmuflCodes,
  loadSpecialCharacters,
  symbolLabel,
  type SpecialCharacter,
  type SpecialCharacters,
} from './specialCharacters';
export { useInlineTextContent } from './useInlineTextContent';
export { RichTextToolbar } from './RichTextToolbar';
export { SpecialCharactersPicker } from './SpecialCharactersPicker';
