// Isolated real-gateway evidence for the workbench file surfaces, not mocked responses.
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
if (fixture !== '/tmp/ocr-pc-files2' || base !== 'http://127.0.0.1:4498')
  throw new Error('Use only the dedicated files fixture.');
const sessions = JSON.parse(readFileSync(`${fixture}/sessions.json`, 'utf8'));
const projects = await (await fetch(`${base}/api/projects`)).json();
const session = await (await fetch(`${base}/api/sessions/${sessions[1].id}`)).json();
const out = 'apps/rune/goldens/pc-files';
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const nativeComment = `${out}/inline-rows.script.json`;
const nativeDiffComment = `${out}/diff-inline-rows.script.json`;
writeFileSync(
  nativeComment,
  JSON.stringify([
    { t: 0.2, type: 'click', key: 'source-comment-0-0' },
    { t: 0.5, paste: 'Keep the source and review together.' },
    { t: 0.7, type: 'key', name: 'Enter', cmd: true },
  ]),
);
writeFileSync(
  nativeDiffComment,
  JSON.stringify([
    { t: 0.2, type: 'click', key: 'plus' },
    { t: 0.5, paste: 'Review this context line.' },
    { t: 0.7, type: 'key', name: 'Enter', cmd: true },
  ]),
);
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
      let previousPanel;
      for (const [state, panel, title, file] of [
        ['files', 'files', 'Files', 'src/index.ts'],
        ['inline', 'files', 'Files', 'src/index.ts'],
        ['changes', 'changes', 'Changes', 'src/index.ts'],
        ['diff-inline', 'changes', 'Changes', 'src/index.ts'],
        ['expanded', 'changes', 'Changes', 'src/index.ts'],
        ['image', 'files', 'Files', 'diagram.png'],
      ]) {
        if (previousPanel !== panel)
          await page.locator('.wb-rail').getByRole('button', { name: title, exact: true }).click();
        previousPanel = panel;
        await page.locator('#workbench').waitFor();
        if (file.includes('/')) {
          const folder = page.locator('[aria-label="src"]').filter({ visible: true }).first();
          if ((await folder.getAttribute('aria-expanded')) !== 'true') await folder.click();
        }
        await page
          .locator(`[aria-label="${file.split('/').at(-1)}"]`)
          .filter({ visible: true })
          .first()
          .click();
        await page.waitForTimeout(600);
        if (state === 'inline') {
          await page.locator('.cm-comment-gutter button').first().click({ force: true });
          await page
            .getByRole('textbox', { name: 'Review comment', exact: true })
            .fill('Keep the source and review together.');
          await page.getByRole('button', { name: 'Add comment', exact: true }).click();
          await page.waitForTimeout(300);
        }
        if (state === 'expanded') {
          const full = page.waitForResponse(
            (r) => r.url().includes('/api/workspace/diff?') && r.url().includes('full=1'),
          );
          await page
            .getByText('More unchanged context may be available', { exact: true })
            .filter({ visible: true })
            .click();
          await full;
          await page.waitForTimeout(300);
        }
        if (state === 'diff-inline') {
          await page.locator('[data-column-number="5"]').first().hover();
          await page.locator('[data-utility-button]').click();
          await page
            .getByRole('textbox', { name: 'Review comment', exact: true })
            .fill('Review this context line.');
          await page.getByRole('button', { name: 'Add comment', exact: true }).click();
          await page.waitForTimeout(300);
        }
        const script =
          state === 'inline'
            ? nativeComment
            : ['diff-inline', 'expanded'].includes(state)
              ? nativeDiffComment
              : undefined;
        const key = `${state}-${theme}-${width}x${height}-rows`;
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
            script ? '1.0' : '0.1',
            '--theme',
            theme,
            ...(script ? ['--script', script] : []),
          ],
          {
            env: {
              ...process.env,
              OPENCODEX_DATA_DIR: `${fixture}/native`,
              ...(state === 'expanded' ? { OPENCODEX_CAPTURE_EXPAND_GAP: '2' } : {}),
            },
            stdio: 'inherit',
          },
        );
      }
      await context.close();
    }
  }
} finally {
  await browser.close();
}
