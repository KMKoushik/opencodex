import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  workers: 1,
  timeout: 30_000,
  use: { browserName: 'chromium', channel: 'chrome', trace: 'retain-on-failure' },
  reporter: 'list',
});
