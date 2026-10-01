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
    // confirm()/prompt() become confirmDialog()/promptDialog(). Warn while the remaining
    // call sites migrate; Phase 5 raises this to 'error'.
    rules: { 'no-alert': 'warn' },
  },
]);

export default eslintConfig;
