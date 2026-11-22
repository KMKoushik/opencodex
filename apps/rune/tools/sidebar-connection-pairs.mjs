/* global document */
// No API response fixtures. Checking delays the real HTTP request; Offline
// points both clients at an actually closed port (without telling Query that
// the browser is offline, which would pause its periodic connection check).
import { createRequire } from 'node:module';
import { globSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
const require = createRequire(import.meta.url);
const { chromium } = require(
  process.cwd() +
    '/' +
    globSync('node_modules/.bun/playwright-core@*/node_modules/playwright-core')[0],
);
const base = process.env.OCR_BASE ?? 'http://127.0.0.1:4504';
const out = 'apps/rune/goldens/pp-sidebar';
const states = process.argv.includes('--disconnected')
  ? ['connection-disconnected']
  : ['home-no-project', 'connection-checking', 'connection-offline'];
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  for (const theme of ['dark', 'light'])
    for (const [width, height] of [
      [1280, 800],
      [1600, 1000],
    ]) {
      for (const state of states) {
        const context = await browser.newContext({
          viewport: { width, height },
          deviceScaleFactor: 2,
          colorScheme: theme,
        });
        const page = await context.newPage();
        await page.addInitScript(() => {
          localStorage.setItem('opencodex:projects', '[]');
          localStorage.removeItem('opencodex:project');
        });
        if (state === 'connection-checking')
          await page.route('**/api/connection', async (route) => {
            await new Promise((resolve) => setTimeout(resolve, 10000));
            await route.continue().catch(() => {});
          });
        await page.goto(base);
        await page.evaluate(() => {
          document.documentElement.dataset.platform = 'darwin';
        });
        if (state === 'connection-checking')
          await page.getByRole('heading', { name: 'Looking for OpenCode…' }).waitFor();
        else if (state === 'connection-disconnected')
          await page.getByRole('heading', { name: 'Connect to OpenCode' }).waitFor();
        else {
          await page.getByRole('heading', { name: 'Open a project' }).waitFor();
          if (state === 'connection-offline') {
            await page.route('**/api/connection', (route) =>
              route.continue({ url: 'http://127.0.0.1:4505/api/connection' }),
            );
            await page
              .getByRole('heading', { name: 'Can’t reach the gateway' })
              .waitFor({ timeout: 25000 });
          }
        }
        await page.evaluate(() => document.fonts.ready);
        await page.mouse.move(width - 2, height - 2);
        const stem = `${state}-${theme}-${width}x${height}-sidebar-final`;
        await page.screenshot({ path: `${out}/web-${stem}.png` });
        const env = {
          ...process.env,
          OPENCODEX_GATEWAY: state === 'connection-offline' ? 'http://127.0.0.1:4505' : base,
        };
        delete env.OPENCODEX_BENCH_PROJECT;
        execFileSync(
          'apps/rune/target/release/opencodex',
          [
            '--screenshot',
            `${out}/rune-${stem}.png`,
            '--page',
            state === 'connection-checking' ? state : 'home-empty',
            '--size',
            `${width}x${height}`,
            '--scale',
            '2',
            '--theme',
            theme,
            '--at',
            '0.3',
          ],
          { env, stdio: 'pipe' },
        );
        execFileSync('python3', [
          '-c',
          `from PIL import Image
a=Image.open('${out}/web-${stem}.png');b=Image.open('${out}/rune-${stem}.png');p=Image.new('RGB',(a.width+b.width,max(a.height,b.height)));p.paste(a,(0,0));p.paste(b,(a.width,0));p.save('${out}/pair-${stem}.png')`,
        ]);
        console.log(stem);
        await context.close();
      }
    }
} finally {
  await browser.close();
}
