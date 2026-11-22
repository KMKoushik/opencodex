// Isolated real-gateway evidence for the workbench file surfaces, not mocked responses.
/* global document */
import { createRequire } from 'node:module';
import { globSync, mkdirSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
const require = createRequire(import.meta.url);
const { chromium } = require(
  process.cwd() +
    '/' +
    globSync('node_modules/.bun/playwright-core@*/node_modules/playwright-core')[0],
);
const fixture = process.env.OPENCODEX_FIXTURE;
const base = process.env.OPENCODEX_GATEWAY;
if (fixture !== '/tmp/ocr-pc-files' || base !== 'http://127.0.0.1:4498')
  throw new Error('Use only the dedicated files fixture.');
const sessions = JSON.parse(readFileSync(`${fixture}/sessions.json`, 'utf8'));
const projects = await (await fetch(`${base}/api/projects`)).json();
const session = await (await fetch(`${base}/api/sessions/${sessions[1].id}`)).json();
const out = 'apps/rune/goldens/pc-files';
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  for (const theme of ['dark', 'light']) {
    for (const [width, height] of [
      [1280, 800],
      [1600, 1000],
    ]) {
      const context = await browser.newContext({
        viewport: { width, height },
        deviceScaleFactor: 2,
        colorScheme: theme,
        reducedMotion: 'reduce',
      });
      await context.addInitScript(
        ({ projects, directory }) => {
          localStorage.setItem(
            'opencodex:projects',
            JSON.stringify(
              projects.map((p) => ({
                name: p.name ?? p.canonical.split('/').at(-1),
                directory: p.canonical,
              })),
            ),
          );
          localStorage.setItem(
            'opencodex:project',
            JSON.stringify({ name: 'atlas-api', directory }),
          );
        },
        { projects, directory: session.location.directory },
      );
      const page = await context.newPage();
      await page.goto(base);
      await page.evaluate(() => {
        document.documentElement.dataset.platform = 'darwin';
      });
      const project = page.locator('.project-row').filter({ hasText: 'atlas-api' });
      if ((await project.getAttribute('aria-expanded')) !== 'true') await project.click();
      await page.getByRole('button', { name: session.title, exact: false }).first().click();
      for (const [state, panel, title, file] of [
        ['files', 'files', 'Files', 'README.md'],
        ['changes', 'changes', 'Changes', 'src/index.ts'],
        ['image', 'files', 'Files', 'diagram.png'],
      ]) {
        await page.locator('.wb-rail').getByRole('button', { name: title, exact: true }).click();
        await page.locator('#workbench').waitFor();
        await page
          .locator(`[aria-label="${file.split('/').at(-1)}"]`)
          .filter({ visible: true })
          .first()
          .click();
        await page.waitForTimeout(600);
        const key = `${state}-${theme}-${width}x${height}-final`;
        await page.screenshot({ path: `${out}/web-${key}.png` });
        execFileSync(
          'apps/rune/target/release/opencodex',
          [
            '--session',
            session.id,
            '--panel',
            panel,
            '--file',
            file,
            '--screenshot',
            `${out}/rune-${key}.png`,
            '--tree',
            `${out}/tree-${key}.json`,
            '--size',
            `${width}x${height}`,
            '--scale',
            '2',
            '--at',
            '0.1',
            '--theme',
            theme,
          ],
          { env: { ...process.env, OPENCODEX_DATA_DIR: `${fixture}/native` }, stdio: 'inherit' },
        );
      }
      await context.close();
    }
  }
} finally {
  await browser.close();
}
