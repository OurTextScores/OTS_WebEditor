import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    '.next/**',
    '.next-dev*/**',
    'out/**',
    'build/**',
    'next-env.d.ts',
  ]),
  {
    // SHELL_REDESIGN_DESIGN §8.6: feedback goes through the notice service, and
    // confirm()/prompt() become confirmDialog()/promptDialog(). Every call site has migrated
    // (Phase 5), so this is an error.
    rules: { 'no-alert': 'error' },
  },
  {
    // docs/private/SCOREEDITOR_DECOMPOSITION_PLAN §6 (Viritura's max-lines-per-function). A
    // warning with a count budget, like the raw-<button> rule below: the existing long functions
    // are made visible, and eslint.maxWarnings is the ratchet that drives them down as
    // ScoreEditor is decomposed. Tests are exempt: a long `describe` is fixture, not logic.
    files: ['app/**/*.{ts,tsx}', 'components/**/*.{ts,tsx}', 'lib/**/*.{ts,tsx}'],
    rules: {
      'max-lines-per-function': ['warn', { max: 200, skipBlankLines: true, skipComments: true }],
    },
  },
  {
    // docs/private/DESIGN_LANGUAGE.md §5.2: controls come from components/ui (Button, IconButton),
    // so hover, focus and disabled look the same everywhere. A warning, not an error: the
    // remaining raw buttons migrate as their files are touched, and the debt budget
    // (eslint.maxWarnings) is the ratchet that only goes down.
    files: ['components/**/*.tsx', 'app/**/*.tsx'],
    ignores: ['components/ui/**'],
    rules: {
      'no-restricted-syntax': [
        'warn',
        {
          selector: "JSXOpeningElement[name.name='button']",
          message:
            'Use Button or IconButton from components/ui instead of a raw <button> (docs/private/DESIGN_LANGUAGE.md §5).',
        },
      ],
    },
  },
]);

export default eslintConfig;
