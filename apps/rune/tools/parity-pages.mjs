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
        if (state === 'tasks-empty' || state === 'tasks') await click('Tasks');
        if (state === 'tasks-edit-open' || state === 'tasks-new-open') {
          await click('Tasks');
          if (state === 'tasks-edit-open') await click('Review the API changes');
          else await click('Add a task to Today');
        }
        if (state === 'apps-empty' || state === 'apps') await click('Apps');
        if (
          [
            'project-picker-open',
            'project-picker-path',
            'project-picker-empty',
            'project-switcher-dialog',
          ].includes(state)
        ) {
          await click('Switch project');
          if (state === 'project-picker-path')
            await page
              .getByRole('combobox', {
                name: 'Search projects or enter a folder path',
                exact: true,
              })
              .fill('/tmp/ocr-parity/proj/new-folder');
          if (state === 'project-picker-empty')
            await page
              .getByRole('combobox', {
                name: 'Search projects or enter a folder path',
                exact: true,
              })
              .fill('no-matching-project');
          if (state === 'project-switcher-dialog') await click('Open project…');
        }
        if (
          [
            'app-detail',
            'app-settings',
            'app-code',
            'app-code-index',
            'app-runs-open',
            'app-icon-open',
            'app-model-open',
            'app-delete-open',
          ].includes(state)
        ) {
          await click('Apps');
          await page.locator('.apps-tile').filter({ hasText: 'Release dashboard' }).click();
          if (state === 'app-settings')
            await page.getByRole('radio', { name: 'Settings', exact: true }).click();
          if (state === 'app-code' || state === 'app-code-index')
            await page.getByRole('radio', { name: 'Code', exact: true }).click();
          if (state === 'app-code-index')
            await page.getByRole('tab', { name: 'index.html', exact: true }).click();
          if (state === 'app-runs-open') await page.getByRole('button', { name: /^Runs/ }).click();
          if (state === 'app-icon-open') await click('Change icon');
          if (state === 'app-model-open' || state === 'app-delete-open') {
            await click('Actions for Release dashboard');
            await page
              .getByRole('menuitem', {
                name: state === 'app-model-open' ? 'Change model…' : 'Delete app…',
                exact: true,
              })
              .click();
          }
        }
        if (
          [
            'project-edit-open',
            'project-actions-open',
            'project-add-open',
            'project-instructions-open',
            'worktrees-open',
            'worktrees-confirm-open',
          ].includes(state)
        ) {
          await click('Settings');
          await click('Projects');
          if (state === 'project-add-open') await click('Add project');
          else if (state === 'project-edit-open') await click('atlas-api');
          else {
            const box = await page
              .getByRole('button', { name: 'Actions for atlas-api', exact: true })
              .boundingBox();
            point = `${box.x + box.width - 180},${box.y + box.height + 4}`;
            await click('Actions for atlas-api');
            if (state === 'project-instructions-open')
              await page.getByRole('menuitem', { name: 'Instructions', exact: true }).click();
            if (state.startsWith('worktrees-'))
              await page.getByRole('menuitem', { name: 'Manage worktrees', exact: true }).click();
            if (state === 'worktrees-confirm-open')
              await page
                .getByRole('button', { name: /^Remove worktree / })
                .first()
                .click();
          }
        }
        if (state === 'project-open-dialog') await page.keyboard.press('Meta+o');
        if (state === 'project-folder-suggestions' || state === 'project-folder-empty') {
          await page.keyboard.press('Meta+o');
          await page
            .getByRole('combobox', { name: 'Project directory', exact: true })
            .fill('/tmp/ocr-parity/proj/' + (state === 'project-folder-empty' ? 'zzzz' : ''));
          await page.getByRole('listbox', { name: 'Folders', exact: true }).waitFor();
        }
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
        // Park the pointer away from controls: native captures start unhovered too.
        await page.mouse.move(width - 2, height - 2);
        await page.waitForTimeout(500);
        const stem = `${state}-${theme}-${width}x${height}-${process.env.OCR_LABEL ?? 'final'}`;
        await page.screenshot({ path: `${out}/web-${stem}.png` });
        const args = [
          '--screenshot',
          `${out}/rune-${stem}.png`,
          '--size',
          `${width}x${height}`,
          '--scale',
          '2',
          '--at',
          '0.3',
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
