// Real gateway paired workbench captures. No mocked data or backend mutations.
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
if (!fixture || !base) throw new Error('Set an isolated OPENCODEX_FIXTURE and OPENCODEX_GATEWAY');
const sessions = JSON.parse(readFileSync(`${fixture}/sessions.json`, 'utf8'));
const projects = await (await fetch(`${base}/api/projects`)).json();
const session = await (await fetch(`${base}/api/sessions/${sessions[1].id}`)).json();
const out = process.env.OPENCODEX_CAPTURE_OUT ?? 'apps/rune/goldens/workbench';
mkdirSync(out, { recursive: true });
const version = process.env.OCR_CAPTURE_VERSION ?? 'v2';
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
      await page.evaluate(() => (document.documentElement.dataset.platform = 'darwin'));
      const project = page.locator('.project-row').filter({ hasText: 'atlas-api' });
      if ((await project.getAttribute('aria-expanded')) !== 'true') await project.click();
      await page.locator('.session-entry').first().waitFor();
      for (let more = 0; more < 10; more++) {
        if (await page.getByRole('button', { name: session.title, exact: false }).first().count())
          break;
        const expand = page.getByRole('button', { name: 'Show more', exact: true });
        if (!(await expand.count())) break;
        await expand.first().click();
        await page.waitForTimeout(150);
      }
      await page.getByRole('button', { name: session.title, exact: false }).first().click();
      await page.locator('.timeline-scroll').waitFor();
      for (const [panel, label, file] of [
        ['changes', 'Changes', 'src/index.ts'],
        ['files', 'Files', 'README.md'],
        ['subagents', 'Subagents', null],
        ['side-chat', 'Side chat', null],
        ['canvas', 'Canvas', null],
        ['terminal', 'Terminal', null],
      ]) {
        await page.locator('.wb-rail').getByRole('button', { name: label, exact: true }).click();
        await page.locator('#workbench').waitFor();
        if (file) {
          const name = file.split('/').at(-1);
          const candidate = page
            .locator(`[aria-label="${name}"]`)
            .filter({ visible: true })
            .first();
          await candidate.click();
        }
        await page.waitForTimeout(500);
        const key = `${panel}-${theme}-${width}x${height}-${version}`;
        await page.screenshot({ path: `${out}/web-${key}.png` });
        execFileSync(
          'apps/rune/target/release/opencodex',
          [
            '--session',
            session.id,
            '--panel',
            panel,
            ...(file ? ['--file', file] : []),
            '--screenshot',
            `${out}/rune-${key}.png`,
            '--size',
            `${width}x${height}`,
            '--scale',
            '2',
            '--theme',
            theme,
          ],
          { env: { ...process.env, OPENCODEX_DATA_DIR: `${fixture}/native` }, stdio: 'inherit' },
        );
        console.log(key);
      }
      await context.close();
    }
  }
} finally {
  await browser.close();
}
