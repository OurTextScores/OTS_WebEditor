import { CODE_EDITOR_THEME_OPTIONS } from './MusicXmlPanel';
import type { CodeEditorThemeMode } from '../CodeMirrorEditor';

export const CODE_EDITOR_THEME_STORAGE_KEY = 'ots_code_editor_theme';

export const MUSIC_SPECIALISTS_NOTAGEN_BACKEND_STORAGE_KEY =
  'ots_music_specialists_notagen_backend';

export const MUSIC_SPECIALISTS_NOTAGEN_MODEL_STORAGE_KEY = 'ots_music_specialists_notagen_model';

export const MUSIC_SPECIALISTS_NOTAGEN_REVISION_STORAGE_KEY =
  'ots_music_specialists_notagen_revision';

export const MUSIC_SPECIALISTS_NOTAGEN_SPACE_ID_STORAGE_KEY =
  'ots_music_specialists_notagen_space_id';

export const MUSIC_SPECIALISTS_NOTAGEN_SPACE_PERIOD_STORAGE_KEY =
  'ots_music_specialists_notagen_space_period';

export const MUSIC_SPECIALISTS_NOTAGEN_SPACE_COMPOSER_STORAGE_KEY =
  'ots_music_specialists_notagen_space_composer';

export const MUSIC_SPECIALISTS_NOTAGEN_SPACE_INSTRUMENTATION_STORAGE_KEY =
  'ots_music_specialists_notagen_space_instrumentation';

export const MUSIC_SPECIALISTS_DEFAULT_NOTAGEN_BACKEND = 'huggingface';

export const MUSIC_SPECIALISTS_DEFAULT_NOTAGEN_MODEL = (
  process.env.NEXT_PUBLIC_MUSIC_NOTAGEN_DEFAULT_MODEL_ID || ''
).trim();

export const MUSIC_SPECIALISTS_DEFAULT_NOTAGEN_REVISION = (
  process.env.NEXT_PUBLIC_MUSIC_NOTAGEN_DEFAULT_REVISION || ''
).trim();

export const MUSIC_SPECIALISTS_DEFAULT_NOTAGEN_SPACE_ID = (
  process.env.NEXT_PUBLIC_MUSIC_NOTAGEN_DEFAULT_SPACE_ID || 'ElectricAlexis/NotaGen'
).trim();

export const MUSIC_SPECIALISTS_DEFAULT_NOTAGEN_SPACE_PERIOD = (
  process.env.NEXT_PUBLIC_MUSIC_NOTAGEN_SPACE_DEFAULT_PERIOD || 'Classical'
).trim();

export const MUSIC_SPECIALISTS_DEFAULT_NOTAGEN_SPACE_COMPOSER = (
  process.env.NEXT_PUBLIC_MUSIC_NOTAGEN_SPACE_DEFAULT_COMPOSER || 'Mozart, Wolfgang Amadeus'
).trim();

export const MUSIC_SPECIALISTS_DEFAULT_NOTAGEN_SPACE_INSTRUMENTATION = (
  process.env.NEXT_PUBLIC_MUSIC_NOTAGEN_SPACE_DEFAULT_INSTRUMENTATION || 'Keyboard'
).trim();

export const MUSIC_SPECIALISTS_DEFAULT_TRANSCODA_SPACE_ID = (
  process.env.NEXT_PUBLIC_MUSIC_TRANSCODA_SPACE_ID || 'jhlusko/transcoda'
).trim();

export const MUSIC_SPECIALISTS_DEFAULT_TRANSCODA_MODEL = (
  process.env.NEXT_PUBLIC_MUSIC_TRANSCODA_MODEL_ID || 'btrkeks/transcoda-59M-zeroshot-v1'
).trim();

export const MUSIC_SPECIALISTS_DEFAULT_TRANSCODA_REVISION = (
  process.env.NEXT_PUBLIC_MUSIC_TRANSCODA_REVISION || 'b529f8aa5d996d9224df3395b5b92d0867343c91'
).trim();

export const CODE_EDITOR_THEME_VALUES = new Set<CodeEditorThemeMode>(
  CODE_EDITOR_THEME_OPTIONS.map((option) => option.value),
);
