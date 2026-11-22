// Run from repository root after starting tools/isolated.sh (see README).
/* global document, getComputedStyle */
import { createRequire } from 'node:module';
import { globSync, mkdirSync, writeFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
const { chromium } = require(
  process.cwd() +
    '/' +
    globSync('node_modules/.bun/playwright-core@*/node_modules/playwright-core')[0],
);
const out = 'apps/rune/goldens/m1';
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const context = await browser.newContext({
    baseURL: 'http://127.0.0.1:4431',
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 2,
    colorScheme: 'dark',
  });
  const page = await context.newPage();
  page.on('pageerror', (e) => console.error('pageerror', e.message));
  await page.goto('http://127.0.0.1:4431/');
  await page.getByPlaceholder('~/projects/my-app').fill('/tmp/ocr-m1/proj');
  await page.getByRole('button', { name: 'Open', exact: true }).click();
  await page.getByRole('heading', { name: 'What should we build?' }).waitFor();
  if (process.argv.includes('--seed')) {
    const api = async (path, body) => {
      const res = await page.request.post('/api' + path, { data: body });
      if (!res.ok()) throw new Error(await res.text());
      return res.json();
    };
    for (const [title, question] of [
      ['Explain the project structure', 'Reply with exactly: This repository is ready to explore.'],
      ['Review the latest changes', 'Reply with exactly: The working tree is clean.'],
      ['Plan the next feature', 'Reply with exactly: Start with a focused milestone.'],
    ]) {
      const session = await api('/sessions', {
        directory: '/tmp/ocr-m1/proj',
        model: { providerID: 'opencode', id: 'big-pickle' },
      });
      await api(`/sessions/${session.id}/prompt`, {
        text: question,
        model: { providerID: 'opencode', id: 'big-pickle' },
      });
      const until = Date.now() + 180_000;
      let reply;
      while (Date.now() < until) {
        const messages = await (
          await page.request.get(`/api/sessions/${session.id}/messages`)
        ).json();
        reply = messages.data?.find((m) => m.type === 'assistant' && m.time.completed);
        if (reply) break;
        await new Promise((r) => setTimeout(r, 500));
      }
      if (!reply) throw new Error(`No real reply for ${title}`);
      await api(`/sessions/${session.id}/action`, { action: 'rename', title });
      console.log(
        title,
        reply.content
          .filter((p) => p.type === 'text')
          .map((p) => p.text)
          .join(''),
      );
    }
  }
  // Apply Electron's native CSS without faking a preload implementation or network data.
  await page.evaluate(() => {
    document.documentElement.dataset.platform = 'darwin';
  });
  await page.mouse.move(1200, 750);
  for (const theme of ['dark', 'light']) {
    await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
    await page.waitForFunction((mode) => document.documentElement.dataset.theme === mode, theme);
    await page
      .getByRole('button', { name: 'Plan the next feature', exact: false })
      .first()
      .waitFor();
    await page.screenshot({ path: `${out}/web-${theme}.png` });
    const rects = await page.evaluate(() =>
      Object.fromEntries(
        [
          '.sidebar-header',
          '.sidebar-identity',
          '.sidebar-actions',
          '.sidebar-heading',
          '.project-heading',
          '.session-entry',
          '.chat-empty',
          '.hero-art',
          '.chat-empty h2',
          '.chat-empty > p',
          '.project-switcher',
          '.starters',
          '.starter',
          '.composer-area',
          '.composer',
          '.composer-input',
          '.composer-footer',
          '.workspace-bar',
          '.toolbar',
          '.composer-controls',
          '.permission-control',
        ].map((selector) => {
          const node = document.querySelector(selector);
          if (!node) return [selector, null];
          const r = node.getBoundingClientRect();
          return [
            selector,
            {
              x: r.x,
              y: r.y,
              width: r.width,
              height: r.height,
              text: node.textContent,
              font: getComputedStyle(node).font,
              color: getComputedStyle(node).color,
              opacity: getComputedStyle(node).opacity,
            },
          ];
        }),
      ),
    );
    writeFileSync(`/tmp/ocr-m1/web-${theme}-rects.json`, JSON.stringify(rects, null, 2));
    console.log(theme, rects);
  }
} finally {
  await browser.close();
}
