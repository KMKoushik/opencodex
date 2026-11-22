/* global document */
// Paired web/Rune composer captures against tools/isolated.sh's private fixture.
import { createRequire } from 'node:module';
import { globSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
const require = createRequire(import.meta.url);
const { chromium } = require(
  process.cwd() +
    '/' +
    globSync('node_modules/.bun/playwright-core@*/node_modules/playwright-core')[0],
);
const base = process.env.OCR_BASE ?? 'http://127.0.0.1:4442';
const fixture = process.env.OCR_FIXTURE ?? '/tmp/ocr-composer';
const out = 'apps/rune/goldens/composer';
mkdirSync(out, { recursive: true });
const projects = await (await fetch(base + '/api/projects')).json();
const project = projects.find((p) => p.canonical.endsWith('/atlas-api'));
const sessions = JSON.parse(readFileSync(fixture + '/sessions.json', 'utf8'));
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const version = process.env.OCR_CAPTURE_VERSION ?? 'v1';
const states = (
  process.env.OCR_STATES ??
  'text,attachment,model,filtered,slash,mention,worktree,new-worktree,question-selected,question-review'
).split(',');
try {
  for (const theme of ['dark', 'light'])
    for (const [width, height] of [
      [1280, 800],
      [1600, 1000],
    ]) {
      const context = await browser.newContext({
        viewport: { width, height },
        deviceScaleFactor: 2,
        colorScheme: theme,
      });
      const page = await context.newPage();
      await page.addInitScript(
        ({ projects, project }) => {
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
            JSON.stringify({ name: 'atlas-api', directory: project.canonical }),
          );
          localStorage.setItem('opencodex:threadView', 'projects');
        },
        { projects, project },
      );
      for (const state of states) {
        await page.goto(base);
        await page.getByRole('heading', { name: 'What should we build?' }).waitFor();
        await page.evaluate(() => {
          document.documentElement.dataset.platform = 'darwin';
        });
        const message = page.getByRole('textbox', { name: 'Message', exact: true });
        const click = async (name) =>
          page.getByRole('button', { name, exact: true }).filter({ visible: true }).first().click();
        if (state === 'text' || state === 'attachment')
          await message.fill('Review the API changes and suggest a test plan.');
        if (state === 'attachment')
          await page.locator('input[type=file]').setInputFiles({
            name: 'notes.txt',
            mimeType: 'text/plain',
            buffer: Buffer.from('Golden attachment review notes'),
          });
        if (state === 'model' || state === 'filtered') {
          await click('Model');
          if (state === 'filtered') await page.locator('.model-picker-search input').fill('big');
        }
        if (state === 'slash' || state === 'mention')
          await message.fill(state === 'slash' ? '/' : '@');
        if (state === 'worktree' || state === 'new-worktree') {
          await click('Where this chat works');
          if (state === 'new-worktree')
            await page.getByRole('option', { name: /New worktree/ }).click();
        }
        const question = state.startsWith('question-');
        if (question) {
          const title = await (await fetch(`${base}/api/sessions/${sessions[2].id}`)).json();
          await page.locator('.session-row').filter({ hasText: title.title }).first().click();
          await page.locator('.question-choice').filter({ hasText: 'Local' }).first().click();
          if (state === 'question-review') await click('Review answers');
        }
        await page.evaluate(() => document.fonts.ready);
        await page.waitForTimeout(400);
        const stem = `${state}-${theme}-${width}x${height}-${version}`;
        await page.screenshot({ path: `${out}/web-${stem}.png` });
        const rects = await page.evaluate(() =>
          Object.fromEntries(
            [
              '.composer',
              '.composer-area',
              '.composer-input',
              '.workspace-bar',
              '.question-dock',
              '.model-picker',
            ].map((selector) => {
              const e = document.querySelector(selector);
              if (!e) return [selector, null];
              const r = e.getBoundingClientRect();
              return [selector, { x: r.x, y: r.y, width: r.width, height: r.height }];
            }),
          ),
        );
        writeFileSync(`${out}/web-${stem}.json`, JSON.stringify(rects, null, 2));
        execFileSync(
          'apps/rune/target/release/opencodex',
          [
            '--screenshot',
            `${out}/rune-${stem}.png`,
            '--tree',
            `${out}/rune-${stem}.json`,
            '--size',
            `${width}x${height}`,
            '--scale',
            '2',
            '--theme',
            theme,
            '--composer-state',
            state,
            ...(question ? ['--session', sessions[2].id] : []),
          ],
          {
            env: {
              ...process.env,
              OPENCODEX_GATEWAY: base,
              OPENCODEX_DATA_DIR: fixture + '/rune',
              OPENCODEX_BENCH_PROJECT: project.canonical,
            },
            stdio: 'inherit',
          },
        );
        console.log(stem);
      }
      await context.close();
    }
} finally {
  await browser.close();
}
