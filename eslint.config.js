import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import globals from 'globals';

export default tseslint.config(
  {
    ignores: [
      '.reference/**',
      '**/node_modules/**',
      'apps/ios/build/**',
      '**/out/**',
      '**/dist/**',
      '**/release/**',
      '**/coverage/**',
      'test-results/**',
      'playwright-report/**',
      'packages/gateway/src/canvas-runtime.generated.ts',
      'packages/gateway/src/canvas-types.generated.ts',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  { languageOptions: { globals: globals.node } },
  {
    files: ['apps/web/src/**/*.{ts,tsx}'],
    languageOptions: { globals: globals.browser },
    plugins: { 'react-hooks': reactHooks, 'react-refresh': reactRefresh },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['error', { allowConstantExport: true }],
    },
  },
  {
    // The canvas frame runtime and comment overlay run in sandboxed frames.
    files: ['packages/canvas/src/**/*.ts'],
    languageOptions: { globals: globals.browser },
  },
);
