/* global document, getComputedStyle, window, Element */
// Read-only, real Electron geometry probe against the sweep's retained fixture.
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { root } from './environment.mjs';
import { installElectron, launchElectron } from './electron.mjs';
import { config } from './states.mjs';
import { reach } from './web.mjs';
const out = root + '/apps/rune/goldens/sweep';
const extras = JSON.parse(readFileSync(out + '/fixture.json'));
const size = process.argv[2] ?? '1280x800';
if (!/^\d+x\d+$/.test(size)) throw new Error('Expected WxH');
const [width, height] = size.split('x').map(Number);
const pw = readdirSync(root + '/node_modules/.bun').find((n) => n.startsWith('playwright-core@'));
const playwright = await import(
  `${root}/node_modules/.bun/${pw}/node_modules/playwright-core/index.mjs`
);
for (const state of ['chat-long-middle', 'panel-side-chat']) {
  const electron = await launchElectron(
    playwright,
    installElectron(),
    extras,
    `scroll-${state}`,
    'light',
    width,
    height,
  );
  try {
    await electron.page.addInitScript(() => {
      window.scrollSamples = [];
      const descriptor = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollTop');
      Object.defineProperty(Element.prototype, 'scrollTop', {
        ...descriptor,
        set(value) {
          if (this.classList.contains('chat-scroll'))
            window.scrollSamples.push({
              value,
              height: this.scrollHeight,
              viewport: this.clientHeight,
            });
          descriptor.set.call(this, value);
        },
      });
    });
    await reach(electron.page, state, config(state, extras), extras);
    const data = await electron.page.evaluate(() =>
      [
        ...document.querySelectorAll(
          '.chat-scroll,.timeline,.timeline-row,.history-status,.timeline-footer,.side-chat-panel,.side-chat-tabs,.side-chat-content,.side-chat,.side-chat-main-status,.composer-area,.composer,.composer-input,textarea,.composer-footer,.composer-controls,.wb-header',
        ),
      ].map((e) => {
        const r = e.getBoundingClientRect(),
          s = getComputedStyle(e);
        return {
          class: e.className,
          text: e.textContent.slice(0, 100),
          rect: [r.x, r.y, r.width, r.height],
          scrollTop: e.scrollTop,
          scrollHeight: e.scrollHeight,
          clientHeight: e.clientHeight,
          padding: s.padding,
          margin: s.margin,
          lineHeight: s.lineHeight,
          fontSize: s.fontSize,
        };
      }),
    );
    writeFileSync(
      `${out}/scroll-${state}-${size}.json`,
      JSON.stringify(
        { data, samples: await electron.page.evaluate(() => window.scrollSamples) },
        null,
        2,
      ),
    );
  } finally {
    await electron.app.close();
  }
}
