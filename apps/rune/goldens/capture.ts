import { readdir, mkdir, writeFile, readFile, realpath, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const here = fileURLToPath(new URL('.', import.meta.url));
const root = resolve(here, '../../..');
const pw = (await readdir(`${root}/node_modules/.bun`)).find((n) =>
  n.startsWith('playwright-core@'),
)!;
const { chromium } = (await import(
  `${root}/node_modules/.bun/${pw}/node_modules/playwright-core/index.mjs`
)) as typeof import('@playwright/test');
const out = resolve(here, 'web');
const extrasOnly = process.argv.includes('--extras');
await mkdir(out, { recursive: true });
if (!extrasOnly)
  for (const file of await readdir(out)) if (file.endsWith('.png')) await rm(`${out}/${file}`);
const browser = await chromium.launch({ channel: 'chrome' });
const records: {
  sources: Record<string, string | string[]>;
  screens: Record<string, unknown>[];
  failures: { theme: string; width: number; name: string; error: string }[];
} = { sources: {}, screens: [], failures: [] };
if (extrasOnly) {
  const saved = JSON.parse(await readFile(resolve(here, 'computed.json'), 'utf8'));
  records.screens = saved.screens;
  records.failures = saved.failures;
}
for (const file of await readdir(`${root}/apps/web/src`, { recursive: true })) {
  if (!/\.(css|tsx)$/.test(file)) continue;
  const text = await readFile(`${root}/apps/web/src/${file}`, 'utf8');
  if (file.endsWith('.css')) records.sources[file] = text;
  else {
    const icons = [...new Set(text.match(/\b[A-Z]\w+Icon\b/g) ?? [])].sort();
    if (icons.length) records.sources[file] = icons;
  }
}
const fixture = await realpath('/tmp/ocr-goldens');
const projects = ['atlas-api', 'orbit-web'].map((name) => ({
  name,
  directory: `${fixture}/proj/${name}`,
}));
const sessions: { id: string }[] = JSON.parse(
  await readFile('/tmp/ocr-goldens/sessions.json', 'utf8'),
);
const names = [
  'markdown',
  'tools',
  'question',
  'architecture',
  'long',
  'subagent',
  'checklist',
  'external-read',
];
const titles = await Promise.all(
  sessions.map(async (s) => (await fetch(`http://127.0.0.1:4432/api/sessions/${s.id}`)).json()),
);
for (const theme of ['dark', 'light'] as const)
  for (const [width, height] of [
    [1280, 800],
    [1600, 1000],
  ] as const) {
    const context = await browser.newContext({
      viewport: { width, height },
      deviceScaleFactor: 2,
      colorScheme: theme,
    });
    const page = await context.newPage();
    page.setDefaultTimeout(7000);
    await page.addInitScript(
      ({ projects }) => {
        if (sessionStorage.getItem('golden-empty')) {
          localStorage.clear();
          return;
        }
        localStorage.setItem('opencodex:projects', JSON.stringify(projects));
        localStorage.setItem('opencodex:project', JSON.stringify(projects[0]));
        localStorage.setItem('opencodex:threadView', 'projects');
      },
      { projects },
    );
    const click = async (name: string) =>
      page
        .getByRole('button', { name, exact: true })
        .filter({ visible: true })
        .first()
        .click({ timeout: 7000 });
    const snap = async (name: string) => {
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(350);
      const key = `${name}-${theme}-${width}x${height}`;
      await page.screenshot({ path: `${out}/${key}.png` });
      const computed = await page.evaluate(() => {
        const props = [
          'fontFamily',
          'fontSize',
          'fontWeight',
          'lineHeight',
          'letterSpacing',
          'color',
          'backgroundColor',
          'backgroundImage',
          'padding',
          'gap',
          'border',
          'borderRadius',
          'boxShadow',
          'outline',
          'overflow',
          'transition',
          'animation',
          'maxWidth',
          'minHeight',
        ];
        const selectors = [
          'body',
          '.app-shell',
          '.sidebar',
          '.sidebar-header',
          '.session-row',
          '.toolbar',
          '.chat',
          '.chat-transcript',
          '.user-message',
          '.user-message-bubble',
          '.markdown',
          '.activity-item',
          '.activity-thought',
          '.disclosure-trigger',
          '.composer-area',
          '.composer',
          '.composer-input',
          '.composer-footer',
          'textarea',
          '.settings-page',
          '.settings-row',
          '.workspace',
          '.workbench',
          '[role="dialog"]',
          '[role="menu"]',
          '.find-overlay',
          'pre',
          'table',
          'h1',
          'h2',
          'button',
        ];
        const elements: Record<string, unknown> = {};
        selectors.push(
          '.nav-row',
          '.sidebar-content',
          '.sidebar-identity',
          '.project-row',
          '.session-entry[data-selected]',
          '.hero-art',
          '.starters',
          '.model-picker',
          '.model-picker-option',
          '.slash-menu',
          '.mention-menu',
          '.question-dock',
          '.permission-request',
          '.tasks-page',
          '.task-columns',
          '.task-column',
          '.task-card',
          '.apps-page',
          '.wb-header',
          '.wb-subtoolbar',
          '.wb-rail',
          '.side-chat-panel',
          '.subagents-panel',
          '.canvas-panel',
          '.terminal-drawer',
          '.settings-group',
          '.settings-control',
          '.settings-label',
          '.workspace-bar',
          '.workspace-picker',
          '.dialog',
          '.dialog-content',
        );
        for (const selector of selectors)
          elements[selector] = Array.from(document.querySelectorAll(selector))
            .filter((e) => e.getBoundingClientRect().width)
            .slice(0, 12)
            .map((e) => {
              const s = getComputedStyle(e),
                r = e.getBoundingClientRect();
              return {
                text: e.textContent?.slice(0, 90),
                rect: { x: r.x, y: r.y, width: r.width, height: r.height },
                style: Object.fromEntries(
                  props.map((p) => [
                    p,
                    s.getPropertyValue(p.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)),
                  ]),
                ),
              };
            });
        const style = getComputedStyle(document.documentElement);
        return {
          elements,
          tokens: Object.fromEntries(
            Array.from(style)
              .filter((p) => p.startsWith('--'))
              .map((p) => [p, style.getPropertyValue(p).trim()]),
          ),
        };
      });
      records.screens = records.screens.filter((s) => s.key !== key);
      records.screens.push({ key, ...computed });
      records.failures = records.failures.filter(
        (f) => !(f.theme === theme && f.width === width && f.name === name),
      );
      console.log(key);
      await writeFile(resolve(here, 'computed.json'), JSON.stringify(records, null, 2));
    };
    const attempt = async (name: string, fn: () => Promise<void>) => {
      try {
        await fn();
        await snap(name);
      } catch (e) {
        records.failures.push({ theme, width, name, error: String(e).slice(0, 250) });
      }
    };
    const home = async () => {
      await page.goto('http://127.0.0.1:4432');
      await page.getByRole('textbox', { name: 'Message', exact: true }).waitFor({ timeout: 10000 });
    };
    const chat = async (i: number) => {
      await home();
      if (i >= 4) await click('orbit-web');
      const title = (
        await (await fetch(`http://127.0.0.1:4432/api/sessions/${sessions[i]!.id}`)).json()
      ).title;
      const group = page.locator('.project-group').filter({
        has: page.getByRole('button', { name: i >= 4 ? 'orbit-web' : 'atlas-api', exact: true }),
      });
      await group.locator('.session-row').first().waitFor();
      for (
        let more = 0;
        more < 20 && !(await group.locator('.session-row').filter({ hasText: title }).count());
        more++
      ) {
        await group.getByRole('button', { name: 'Show more', exact: true }).click();
        await page.waitForTimeout(100);
      }
      await page
        .locator('.session-row')
        .filter({ hasText: title })
        .first()
        .click({ timeout: 10000 });
      await page.locator('.chat[data-empty="false"]').waitFor();
      await page.waitForTimeout(600);
    };
    const extras = async () => {
      await chat(2);
      await attempt('question-selected', async () => {
        await page.locator('.question-choice').filter({ hasText: 'Local' }).first().click();
      });
      await attempt('question-review', () => click('Review answers'));
      await home();
      await attempt('sidebar-focus-view', () => click('Focus view'));
      await home();
      await attempt('usage-limits-open', () => click('Usage limits'));
      await home();
      await attempt('worktree-new-selected', async () => {
        await click('Where this chat works');
        await page.getByRole('option', { name: /New worktree/ }).click();
      });
      await home();
      await attempt('model-picker-filtered', async () => {
        await click('Model');
        await page.locator('.model-picker-search input').fill('big');
      });
      await chat(1);
      await page.getByRole('button', { name: /Worked for/ }).click();
      await attempt('tool-detail-open', async () => {
        await page.locator('.activity-group .disclosure-trigger').first().click();
        await page.locator('.activity-item .disclosure-trigger').first().click();
      });
      await home();
      await click('Settings');
      await click('General');
      await attempt('settings-general-bottom', async () => {
        await page.locator('.main').evaluate((e) => {
          e.scrollTop = e.scrollHeight;
        });
      });
      await home();
      await page.evaluate(() => sessionStorage.setItem('golden-empty', '1'));
      await page.goto('http://127.0.0.1:4432');
      await attempt('home-no-project', async () => {
        await page.getByRole('heading', { name: 'Open a project', exact: true }).waitFor();
      });
      await page.evaluate(() => sessionStorage.removeItem('golden-empty'));
      await home();
      const before = await (await fetch('http://127.0.0.1:4432/api/sessions/active')).json();
      await click('New chat in orbit-web');
      await attempt('chat-streaming', async () => {
        await page
          .getByRole('textbox', { name: 'Message', exact: true })
          .fill(
            'Explain twenty distinct strategies for testing a TypeScript API, with detailed examples. Reply in chat; do not create files.',
          );
        await click('Send message');
        await page.getByRole('button', { name: 'Stop', exact: true }).waitFor({ timeout: 15000 });
        await page.waitForFunction(
          () =>
            Array.from(document.querySelectorAll('.assistant-message')).some(
              (e) => (e.textContent?.length ?? 0) > 80,
            ),
          {},
          { timeout: 45000 },
        );
      });
      const after = await (await fetch('http://127.0.0.1:4432/api/sessions/active')).json();
      for (const id of Object.keys(after))
        if (!before[id])
          await fetch(`http://127.0.0.1:4432/api/sessions/${id}/interrupt`, { method: 'POST' });
    };
    if (extrasOnly) {
      await extras();
      await context.close();
      continue;
    }
    await home();
    await snap('home-empty');
    await attempt('composer-focused', async () => {
      await page.getByRole('textbox', { name: 'Message', exact: true }).focus();
    });
    await attempt('composer-text', async () => {
      await page
        .getByRole('textbox', { name: 'Message', exact: true })
        .fill('Review the API changes and suggest a test plan.');
    });
    await attempt('composer-attachment', async () => {
      await page.locator('input[type=file]').setInputFiles({
        name: 'notes.txt',
        mimeType: 'text/plain',
        buffer: Buffer.from('Golden attachment review notes'),
      });
    });
    await home();
    await attempt('model-picker-open', () => click('Model'));
    await page.keyboard.press('Escape');
    await home();
    await attempt('worktree-picker-open', () => click('Where this chat works'));
    await home();
    await attempt('composer-slash', async () => {
      await page.getByRole('textbox', { name: 'Message', exact: true }).fill('/');
    });
    await attempt('composer-mention', async () => {
      await page.getByRole('textbox', { name: 'Message', exact: true }).fill('@');
    });
    await home();
    await attempt('sidebar-project-collapsed', () => click('atlas-api'));
    await home();
    await attempt('sidebar-hidden', () => click('Hide sidebar'));
    await home();
    await attempt('project-picker-open', () => click('Switch project'));
    await home();
    await attempt('thread-search-open', () => click('Search threads'));
    await home();
    await attempt('app-menu-open', () => click('OpenCodex menu'));
    await home();
    await attempt('tasks-empty', () => click('Tasks'));
    await home();
    await attempt('apps-empty', () => click('Apps'));
    await home();
    await click('Settings');
    for (const name of ['General', 'Appearance', 'Shortcuts', 'Projects', 'Usage', 'Remote access'])
      await attempt(`settings-${name.toLowerCase().replaceAll(' ', '-')}`, () => click(name));
    await click('Projects');
    await attempt('project-actions-open', () => click('Actions for atlas-api'));
    await attempt('worktrees-empty', async () => {
      await page.getByRole('menuitem', { name: 'Manage worktrees', exact: true }).click();
    });
    await page.keyboard.press('Escape');
    await attempt('project-edit-open', async () => {
      await click('Actions for atlas-api');
      await page.getByRole('menuitem', { name: 'Edit project', exact: true }).click();
    });
    await page.keyboard.press('Escape');
    await attempt('project-copy-feedback', async () => {
      await click('Actions for atlas-api');
      await page.getByRole('menuitem', { name: 'Copy path', exact: true }).click();
      await page.getByText('Project path copied.', { exact: true }).waitFor({ timeout: 3000 });
    });
    await home();
    await attempt('project-open-dialog', () => click('Open project'));
    for (const i of [0, 1, 2, 3, 4, 5, 6, 7]) {
      try {
        await chat(i);
      } catch (e) {
        records.failures.push({ theme, width, name: `chat-${i}`, error: String(e) });
        continue;
      }
      await snap(`chat-${names[i]}-bottom`);
      if (i === 0 || i === 4) {
        for (const [name, fraction] of [
          ['top', 0],
          ['middle', 0.5],
        ] as const)
          await attempt(`chat-${names[i]}-${name}`, async () => {
            await page.evaluate((f) => {
              for (const e of document.querySelectorAll('*')) {
                const s = getComputedStyle(e);
                if (/auto|scroll/.test(s.overflowY) && e.scrollHeight > e.clientHeight + 100)
                  e.scrollTop = (e.scrollHeight - e.clientHeight) * f;
              }
            }, fraction);
          });
        await attempt(`find-${names[i]}-open`, async () => {
          await page.keyboard.press('Meta+f');
          await page.locator('.find-input').waitFor();
        });
        await page.keyboard.press('Escape');
      }
      if (i === 1) {
        await attempt('tools-expanded', async () => {
          await page.getByRole('button', { name: /Worked for/ }).click();
        });
        await attempt('tool-rows-expanded', async () => {
          await page.locator('.activity-group .disclosure-trigger').first().click();
        });
        await attempt('thoughts-expanded', async () => {
          await page.locator('.activity-thought').first().click();
        });
        for (const name of ['Changes', 'Files', 'Terminal', 'Side chat', 'Canvas', 'Subagents']) {
          await chat(i);
          await attempt(`panel-${name.toLowerCase().replaceAll(' ', '-')}`, () => click(name));
          if (name === 'Changes')
            await attempt('panel-diff-open', () =>
              page.locator('[aria-label="index.ts"]').filter({ visible: true }).first().click(),
            );
          if (name === 'Files')
            await attempt('panel-file-open', () =>
              page.locator('[aria-label="README.md"]').filter({ visible: true }).first().click(),
            );
          if (name === 'Side chat') await attempt('side-chat-new', () => click('New side chat'));
        }
        await chat(i);
        await attempt('thread-actions-open', () => click('Thread actions'));
        await chat(i);
        await attempt('session-details-open', () => click('Session details'));
      }
      if (i === 5) {
        await attempt('subagents-list', () => click('Subagents'));
        await attempt('subagent-conversation', async () => {
          await page
            .locator('.subagents-panel button')
            .filter({ hasText: /explor|source/i })
            .first()
            .click({ timeout: 3000 });
        });
      }
    }
    await home();
    await attempt('sidebar-row-hover', async () => {
      await page.getByRole('button', { name: titles[0].title, exact: true }).hover();
    });
    await attempt('thread-context-menu', async () => {
      await page
        .getByRole('button', { name: titles[0].title, exact: true })
        .click({ button: 'right' });
    });
    await extras();
    await home();
    await page.route('**/api/**', (route) => route.abort());
    await page.reload();
    await page.waitForTimeout(1200);
    await snap('connection-offline');
    await context.close();
  }
await browser.close();
await writeFile(resolve(here, 'computed.json'), JSON.stringify(records, null, 2));
