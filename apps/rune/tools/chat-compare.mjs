// Paired captures use the same isolated gateway and imported authored UI fixtures.
/* global document */
import { createRequire } from 'node:module';
import { globSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
const require = createRequire(import.meta.url);
const { chromium } = require(
  process.cwd() +
    '/' +
    globSync('node_modules/.bun/playwright-core@*/node_modules/playwright-core')[0],
);
const fixture = process.env.OPENCODEX_FIXTURE;
const base = process.env.OPENCODEX_GATEWAY;
if (!fixture || !base)
  throw new Error('Set OPENCODEX_FIXTURE and OPENCODEX_GATEWAY to isolated services');
const sessions = JSON.parse(readFileSync(`${fixture}/sessions.json`, 'utf8'));
const out = process.env.OPENCODEX_CAPTURE_OUT ?? 'apps/rune/goldens/chat-review';
mkdirSync(out, { recursive: true });
const projects = await (await fetch(`${base}/api/projects`)).json();
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
        ({ projects }) => {
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
            JSON.stringify({
              name: 'atlas-api',
              directory: projects.find((p) => p.canonical.endsWith('atlas-api')).canonical,
            }),
          );
        },
        { projects },
      );
      const page = await context.newPage();
      await page.goto(base);
      await page.evaluate(() => (document.documentElement.dataset.platform = 'darwin'));
      for (const [index, name] of [
        [0, 'markdown'],
        [4, 'long'],
        [1, 'tools'],
      ]) {
        const info = await (await fetch(`${base}/api/sessions/${sessions[index].id}`)).json();
        const project = page.locator('.project-row').filter({ hasText: 'atlas-api' });
        if ((await project.getAttribute('aria-expanded')) !== 'true') await project.click();
        await page.locator('.session-entry').first().waitFor();
        for (let more = 0; more < 10; more++) {
          if (await page.getByRole('button', { name: info.title, exact: false }).first().count())
            break;
          const expand = page.getByRole('button', { name: 'Show more', exact: true });
          if (!(await expand.count())) break;
          await expand.first().click();
          await page.waitForTimeout(150);
        }
        try {
          await page.getByRole('button', { name: info.title, exact: false }).first().click();
        } catch (error) {
          writeFileSync(`${out}/navigation-error.txt`, await page.locator('body').innerText());
          await page.screenshot({ path: `${out}/navigation-error.png` });
          throw error;
        }
        await page.locator('.timeline-scroll').waitFor();
        await page.waitForTimeout(800);
        for (const pos of index === 1 ? ['bottom'] : ['bottom', 'top', 'middle']) {
          if (pos !== 'bottom') {
            for (let pageNumber = 0; pageNumber < (index === 4 ? 6 : 1); pageNumber++) {
              await page.locator('.timeline-scroll').focus();
              await page.keyboard.press('Home');
              const bounds = await page.locator('.timeline-scroll').boundingBox();
              await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + 12);
              // A real reading gesture stops follow-output before older-page anchoring.
              await page.mouse.wheel(0, -100000);
              await page.locator('.timeline-scroll').evaluate((el) => {
                el.scrollTop = 0;
              });
              await page.waitForTimeout(500);
            }
            if (pos === 'middle')
              await page.locator('.timeline-scroll').evaluate((el) => {
                el.scrollTop = (el.scrollHeight - el.clientHeight) / 2;
              });
            await page.waitForTimeout(700);
          }
          const key = `chat-${name}-${pos}-${theme}-${width}x${height}`;
          await page.screenshot({ path: `${out}/web-${key}.png` });
          execFileSync(
            'apps/rune/target/release/opencodex',
            [
              '--session',
              sessions[index].id,
              '--scroll',
              pos,
              '--at',
              '1',
              '--screenshot',
              `${out}/rune-${key}.png`,
              '--theme',
              theme,
              '--size',
              `${width}x${height}`,
              '--scale',
              '2',
            ],
            { stdio: 'inherit' },
          );
        }
        if (index === 1) {
          for (const mode of ['open', 'details', 'thoughts']) {
            if (mode !== 'details')
              for (const button of await page.locator('.activity-item > .disclosure-trigger').all())
                if ((await button.getAttribute('aria-expanded')) === 'true') await button.click();
            for (const selector of [
              '.turn-work',
              '.activity-group > .disclosure-trigger',
              ...(mode === 'details' ? ['.activity-item > .disclosure-trigger'] : []),
              ...(mode === 'thoughts' ? ['.activity-thought'] : []),
            ]) {
              for (const button of await page.locator(selector).all()) {
                if ((await button.getAttribute('aria-expanded')) !== 'true') await button.click();
              }
            }
            await page.locator('.timeline-scroll').evaluate((el) => {
              el.scrollTop = el.scrollHeight;
            });
            await page.waitForTimeout(350);
            const key = `tools-${mode}-${theme}-${width}x${height}`;
            await page.screenshot({ path: `${out}/web-${key}.png` });
            execFileSync(
              'apps/rune/target/release/opencodex',
              [
                '--session',
                sessions[index].id,
                '--work',
                mode,
                '--at',
                '1',
                '--screenshot',
                `${out}/rune-${key}.png`,
                '--theme',
                theme,
                '--size',
                `${width}x${height}`,
                '--scale',
                '2',
              ],
              { stdio: 'inherit' },
            );
          }
        }
      }
      await context.close();
    }
  }
} finally {
  await browser.close();
}
