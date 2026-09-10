import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname),
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    include: ['unit/**/*.{test,spec}.{ts,tsx}'],
    exclude: [
      '**/node_modules/**',
      '**/.next/**',
      '**/public/**',
      '**/webmscore-fork/**',
      '**/tests/**', // Playwright e2e tests
      '**/test-results/**',
      '**/playwright-report/**',
      '**/blob-report/**',
    ],
    coverage: {
      provider: 'v8',
      reportsDirectory: './coverage',
      reporter: ['text', 'html', 'lcov'],
      include: [
        'app/**/*.{ts,tsx}',
        'components/**/*.{ts,tsx}',
        'lib/**/*.{ts,tsx}',
        'scripts/**/*.{js,ts,tsx}',
      ],
      exclude: [
        '**/*.d.ts',
        '**/*.config.*',
        'next-env.d.ts',
        '.next/**',
        'public/**',
        'webmscore-fork/**',
        'scripts/debug-select.js',
        'scripts/*-cli.js',
        'tests/**',
        'unit/**',
      ],
    },
  },
});
