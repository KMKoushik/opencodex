import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: [
      'packages/**/*.test.ts',
      'apps/web/src/**/*.test.ts',
      'apps/desktop/src/**/*.test.ts',
    ],
    testTimeout: 10_000,
  },
});
