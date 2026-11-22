/* global document */
// Real web + native snapshots from the same isolated fixture, never API mocks.
import { createRequire } from 'node:module';
import { globSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
const require = createRequire(import.meta.url);
const { chromium } = require(
  process.cwd() +
    '/' +
    globSync('node_modules/.bun/playwright-core@*/node_modules/playwright-core')[0],
);
const base = 'http://127.0.0.1:4491';
const fixture = '/tmp/ocr-parity';
const out = 'apps/rune/goldens/parity-pages';
mkdirSync(out, { recursive: true });
const projects = await (await fetch(base + '/api/projects')).json();
const project = projects.find((p) => p.canonical.endsWith('/atlas-api'));
const session = JSON.parse(readFileSync(fixture + '/sessions.json', 'utf8'))[0];
const info = await (await fetch(`${base}/api/sessions/${session.id}`)).json();
const states = (
  process.env.OCR_STATES ??
  'home-empty,settings-general,settings-appearance,settings-shortcuts,settings-projects,settings-usage,settings-remote,tasks-empty,apps-empty,app-menu-open,thread-search-open,thread-context-menu,find-chat-open'
).split(',');
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
      });
      const page = await context.newPage();
      await page.addInitScript(
        ({ projects, project }) => {
          const folders = projects.map((p) => ({
            name: p.name ?? p.canonical.split('/').at(-1),
            directory: p.canonical,
          }));
          // Same explicit order in both clients: service snapshot order.
          localStorage.setItem('opencodex:projects', JSON.stringify(folders));
          localStorage.setItem(
            'opencodex:project',
            JSON.stringify({ name: 'atlas-api', directory: project.canonical }),
          );
          localStorage.setItem('opencodex:threadView', 'projects');
        },
        { projects, project },
      );
      const click = async (name) =>
        page.getByRole('button', { name, exact: true }).filter({ visible: true }).first().click();
      for (const state of states) {
        let point;
        await page.goto(base);
        await page.getByRole('heading', { name: 'What should we build?' }).waitFor();
        await page.evaluate(() => {
          document.documentElement.dataset.platform = 'darwin';
        });
        if (state.startsWith('settings-')) {
          await click('Settings');
          const title =
            state === 'settings-remote'
              ? 'Remote access'
              : state.slice(9).replace(/^./, (c) => c.toUpperCase());
          if (state !== 'settings-general') await click(title);
          await page.locator('.settings-page').waitFor();
        }
        if (state === 'tasks-empty') await click('Tasks');
        if (state === 'apps-empty') await click('Apps');
        if (state === 'app-menu-open') await click('OpenCodex menu');
        if (state === 'thread-search-open') await click('Search threads');
        const chat = state === 'thread-context-menu' || state === 'find-chat-open';
        if (chat) {
          const thread = page.locator('.session-row').filter({ hasText: info.title }).first();
          if (state === 'thread-context-menu') {
            await thread.click();
            const box = await thread.boundingBox();
            point = `${box.x + box.width / 2},${box.y + box.height / 2}`;
            await thread.click({ button: 'right' });
          } else {
            await thread.click();
            await page.locator('.chat-scroll').waitFor();
            await page.keyboard.press('Meta+f');
            await page.locator('.find-input').waitFor();
          }
        }
        await page.evaluate(() => document.fonts.ready);
        await page.waitForTimeout(500);
        const stem = `${state}-${theme}-${width}x${height}-final`;
        await page.screenshot({ path: `${out}/web-${stem}.png` });
        const args = [
          '--screenshot',
          `${out}/rune-${stem}.png`,
          '--size',
          `${width}x${height}`,
          '--scale',
          '2',
          '--theme',
          theme,
        ];
        if (state !== 'home-empty') args.push('--page', state);
        if (chat) args.push('--session', session.id);
        const env = {
          ...process.env,
          OPENCODEX_GATEWAY: base,
          OPENCODEX_DATA_DIR: fixture + '/native',
          OPENCODEX_BENCH_PROJECT: project.canonical,
          ...(point ? { OCR_MENU_POINT: point } : {}),
        };
        execFileSync('apps/rune/target/release/opencodex', args, { env, stdio: 'pipe' });
        execFileSync('python3', [
          '-c',
          `from PIL import Image
a=Image.open('${out}/web-${stem}.png'); b=Image.open('${out}/rune-${stem}.png')
p=Image.new('RGB',(a.width+b.width,max(a.height,b.height))); p.paste(a,(0,0));p.paste(b,(a.width,0));p.save('${out}/pair-${stem}.png')`,
        ]);
        console.log(stem);
      }
      await context.close();
    }
  }
  writeFileSync(`${out}/fixture.json`, JSON.stringify({ projects, session: info }, null, 2) + '\n');
  execFileSync('bunx', ['prettier', '--write', `${out}/fixture.json`], { stdio: 'pipe' });
} finally {
  await browser.close();
}
