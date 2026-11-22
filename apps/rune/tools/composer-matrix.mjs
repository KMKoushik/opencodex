/* global document */
import { createRequire } from 'node:module';
import { globSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
const require = createRequire(import.meta.url);
const { chromium } = require(
  `${process.cwd()}/${globSync('node_modules/.bun/playwright-core@*/node_modules/playwright-core')[0]}`,
);
const root = '/tmp/ocr-pc-composer2';
const base = process.env.OCR_BASE ?? 'http://127.0.0.1:4503';
const version = process.env.OCR_CAPTURE_VERSION ?? 'record';
const matrix = JSON.parse(readFileSync(`${root}/matrix.json`, 'utf8'));
const out = 'apps/rune/goldens/composer-matrix';
mkdirSync(out, { recursive: true });
const projects = await (await fetch(`${base}/api/projects`)).json();
const states = Object.keys(matrix).map((key) => [key, key, 'initial']);
states.push(
  ...['selected', 'custom', 'review', 'back', 'edit', 'invalid'].map((state) => [
    `single-${state}`,
    'single',
    state,
  ]),
);
states.push(
  ['multi-selected', 'multi', 'selected'],
  ['multi-custom', 'multi', 'custom'],
  ['date-picker', 'date', 'picker'],
  ['permission-confirm', 'permission-full', 'confirm'],
  ['shell-output', 'background', 'output'],
  ['context', 'background', 'context'],
  ...['text', 'email', 'uri', 'number', 'integer'].map((key) => [
    `${key}-invalid`,
    key,
    'value-invalid',
  ]),
  ['conditional-next', 'conditional', 'next'],
);
if (process.env.OCR_PENDING === '1')
  states.push(
    ...['once', 'always', 'reject', 'full'].map((v) => [
      `permission-${v}-pending`,
      `permission-${v}`,
      'pending',
    ]),
  );
const selected = process.env.OCR_STATES?.split(',');
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  for (const theme of (process.env.OCR_THEMES ?? 'dark,light').split(','))
    for (const size of (process.env.OCR_SIZES ?? '1280x800,1600x1000').split(',')) {
      const [width, height] = size.split('x').map(Number);
      const context = await browser.newContext({
        viewport: { width, height },
        deviceScaleFactor: 2,
        colorScheme: theme,
        reducedMotion: 'reduce',
      });
      if (process.env.OCR_NOW)
        await context.addInitScript((now) => {
          Date.now = () => now;
        }, Number(process.env.OCR_NOW));
      await context.addInitScript(
        ({ projects }) => {
          localStorage.setItem(
            'opencodex:projects',
            JSON.stringify(projects.map((p) => ({ name: 'proj', directory: p.canonical }))),
          );
          localStorage.setItem(
            'opencodex:project',
            JSON.stringify({ name: 'proj', directory: projects[0].canonical }),
          );
          localStorage.setItem('opencodex:threadView', 'projects');
        },
        { projects },
      );
      for (const [name, key, state] of states) {
        if (selected && !selected.includes(name)) continue;
        const page = await context.newPage();
        page.on('pageerror', console.error);
        await page.goto(base);
        await page.evaluate(() => {
          document.documentElement.dataset.platform = 'darwin';
        });
        const info = await (await fetch(`${base}/api/sessions/${matrix[key].id}`)).json();
        const project = page.locator('.project-row').first();
        await project.waitFor();
        if ((await project.getAttribute('aria-expanded')) !== 'true') await project.click();
        await page.locator('.session-row').first().waitFor();
        const target = page
          .locator('.session-row')
          .filter({ hasText: new RegExp(`^${info.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`) })
          .first();
        for (let i = 0; i < 12 && !(await target.count()); i++) {
          const more = page.getByRole('button', { name: 'Show more', exact: true }).first();
          if (!(await more.count())) break;
          await more.click();
          await page.waitForTimeout(100);
        }
        await target.click();
        await page
          .locator(
            process.env.OCR_AFTER === '1'
              ? '.composer'
              : key.startsWith('permission')
                ? '.request-card'
                : key === 'background'
                  ? '.activity-tray[data-active=true]'
                  : '.question-dock',
          )
          .waitFor();
        const script = [];
        const click = (key) => script.push({ t: 0.2 + script.length * 0.3, type: 'click', key });
        const type = (text) => script.push({ t: 0.2 + script.length * 0.3, type: 'type', text });
        if (['selected', 'review', 'back', 'edit'].includes(state)) {
          await page.locator('.question-choice').filter({ hasText: 'Local' }).first().click();
          click('question-option-0');
          if (key === 'multi') {
            await page.locator('.question-choice').filter({ hasText: 'Staging' }).first().click();
            click('question-option-1');
          }
        }
        if (state === 'custom') {
          await page
            .locator('.question-choice')
            .filter({ hasText: 'Type your own answer' })
            .click();
          click('question-option-3');
          await page.locator('textarea.question-input').fill('Canary');
          type('Canary');
        }
        if (['review', 'back', 'edit', 'invalid'].includes(state)) {
          await page.getByRole('button', { name: 'Review answers', exact: true }).click();
          click('question-next');
          if (state === 'back') {
            await page.getByRole('button', { name: 'Back', exact: true }).click();
            click('question-back');
          }
          if (state === 'edit') {
            await page
              .getByRole('button', { name: /^Edit / })
              .first()
              .click();
            click('question-edit-0');
          }
        }
        if (state === 'value-invalid') {
          const value = key === 'integer' ? '2.5' : key === 'number' ? '101' : 'x';
          await page.locator('.question-input').fill(value);
          click('question-custom');
          type(value);
          await page.getByRole('button', { name: 'Review answers', exact: true }).click();
          click('question-next');
        }
        if (state === 'next') {
          await page.locator('.question-choice').filter({ hasText: 'Yes' }).click();
          click('question-option-0');
          await page.getByRole('button', { name: 'Next', exact: true }).click();
          click('question-next');
        }
        if (state === 'confirm') {
          await page.getByRole('button', { name: 'Enable full access for this thread' }).click();
          click('permission-full');
        }
        if (state === 'pending') {
          if (key === 'permission-full') {
            await page.getByRole('button', { name: 'Enable full access for this thread' }).click();
            click('permission-full');
            await page.getByRole('button', { name: 'Enable full access', exact: true }).click();
            click('access-enable');
          } else {
            const decision = key.slice('permission-'.length);
            await page
              .getByRole('button', {
                name:
                  decision === 'once'
                    ? 'Allow once'
                    : decision === 'always'
                      ? 'Always allow'
                      : 'Reject',
                exact: true,
              })
              .click();
            click(`permission-${decision}`);
          }
        }
        if (state === 'picker') {
          await page.locator('input[type=date]').evaluate((el) => el.showPicker());
          click('question-calendar-trigger');
        }
        if (key === 'background') {
          if (state === 'context') {
            if (await page.getByRole('button', { name: 'Collapse running activity' }).count())
              await page.getByRole('button', { name: 'Collapse running activity' }).click();
            await page.getByRole('button', { name: 'Context usage unavailable' }).click();
            await page.locator('.context-popover').waitFor();
          } else {
            if (await page.getByRole('button', { name: 'Expand running activity' }).count())
              await page.getByRole('button', { name: 'Expand running activity' }).click();
            await page.getByRole('tab', { name: /Shell \(/ }).click();
            if (state === 'output')
              await page.getByRole('button', { name: /View output:/ }).click();
          }
        }
        await page.evaluate(() => document.fonts.ready);
        await page.waitForTimeout(200);
        const stem = `${name}-${theme}-${size}-${version}`;
        await page.screenshot({ path: `${out}/web-${stem}.png` });
        writeFileSync(`${out}/script-${stem}.json`, JSON.stringify(script));
        execFileSync(
          'apps/rune/target/release/opencodex',
          [
            '--session',
            matrix[key].id,
            '--composer-state',
            key === 'background'
              ? state === 'context'
                ? 'context'
                : state === 'output'
                  ? 'shell-output'
                  : 'running'
              : '',
            '--script',
            `${out}/script-${stem}.json`,
            '--at',
            String(1 + script.length * 0.3),
            '--screenshot',
            `${out}/rune-${stem}.png`,
            '--tree',
            `${out}/tree-${stem}.json`,
            '--size',
            size,
            '--scale',
            '2',
            '--theme',
            theme,
          ],
          {
            env: {
              ...process.env,
              OPENCODEX_GATEWAY: base,
              OPENCODEX_CAPTURE_NOW: process.env.OCR_NOW ?? '',
              OPENCODEX_DATA_DIR: `${root}/rune`,
              OPENCODEX_BENCH_PROJECT: projects[0].canonical,
            },
            stdio: 'inherit',
          },
        );
        execFileSync('python3', [
          '-c',
          `from PIL import Image\na=Image.open('${out}/web-${stem}.png');b=Image.open('${out}/rune-${stem}.png');o=Image.new('RGB',(a.width+b.width,max(a.height,b.height)));o.paste(a,(0,0));o.paste(b,(a.width,0));o.save('${out}/pair-${stem}.png')`,
        ]);
        console.log(stem);
        await page.close();
      }
      await context.close();
    }
} finally {
  await browser.close();
}
