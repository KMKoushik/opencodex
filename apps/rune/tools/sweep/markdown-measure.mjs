/* global document, getComputedStyle */
// Opt-in block geometry oracle. Reuses a seeded --keep-env sweep, never user data.
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { root, command } from './environment.mjs';
import { installElectron, launchElectron } from './electron.mjs';
import { config } from './states.mjs';
import { reach } from './web.mjs';
const out = root + '/apps/rune/goldens/sweep';
const extras = JSON.parse(readFileSync(out + '/fixture.json'));
const state = process.argv[2] ?? 'chat-markdown-top';
if (!/^(chat-(markdown|long)-(top|middle|bottom)|panel-side-chat)$/.test(state))
  throw new Error('Geometry measurement requires a read-only transcript state');
const pw = readdirSync(root + '/node_modules/.bun').find((n) => n.startsWith('playwright-core@'));
const playwright = await import(
  `${root}/node_modules/.bun/${pw}/node_modules/playwright-core/index.mjs`
);
for (const [width, height] of [
  [1280, 800],
  [1600, 1000],
]) {
  for (const theme of ['dark', 'light']) {
    const c = config(state, extras);
    const electron = await launchElectron(
      playwright,
      installElectron(),
      extras,
      `measure-${state}`,
      theme,
      width,
      height,
    );
    try {
      await reach(electron.page, state, c, extras);
      const blocks = await electron.page.evaluate(() =>
        [...document.querySelectorAll('.timeline-row, .markdown, .markdown *')].map((el) => {
          const r = el.getBoundingClientRect();
          const s = getComputedStyle(el);
          return {
            tag: el.tagName,
            class: el.className,
            text: el.textContent.slice(0, 120),
            rect: [r.x, r.y, r.width, r.height],
            style: Object.fromEntries(
              [
                'marginTop',
                'marginBottom',
                'paddingTop',
                'paddingBottom',
                'paddingLeft',
                'paddingRight',
                'lineHeight',
                'fontFamily',
                'fontSize',
                'fontWeight',
                'borderTopWidth',
                'borderBottomWidth',
                'display',
              ].map((k) => [k, s[k]]),
            ),
          };
        }),
      );
      const stem = `${out}/measure-${state}-${theme}-${width}x${height}`;
      writeFileSync(stem + '.blocks.json', JSON.stringify(blocks, null, 2));
      const probes = await electron.page.evaluate(() => {
        const host = document.createElement('div');
        host.className = 'assistant-message';
        host.style.cssText = 'position:fixed;left:0;top:0;width:720px';
        document.body.append(host);
        const results = [];
        for (const size of [14, 16, 18]) {
          for (const count of [1, 2, 3]) {
            host.style.fontSize = `${size}px`;
            host.style.lineHeight = `${size * 1.625}px`;
            host.innerHTML = `<div class="markdown"><pre><code>${'const a = 1;\n'.repeat(count)}</code></pre></div>`;
            const pre = host.querySelector('pre');
            results.push({ size, count, height: pre.getBoundingClientRect().height });
          }
        }
        host.style.fontSize = '14px';
        host.style.lineHeight = '22.75px';
        host.classList.add('workbench');
        host.innerHTML =
          '<div class="markdown"><h5>Five</h5><h6>Six</h6><blockquote><p>first</p><p>second</p></blockquote><ul><li>outer<ul><li>inner</li></ul></li></ul><pre><code>one\ntwo\n</code></pre><ul><li><input type="checkbox" disabled> first</li><li><input type="checkbox" disabled checked> second</li></ul><hr></div>';
        results.push({
          nested: [...host.querySelector('.markdown').children].map((el) => ({
            tag: el.tagName,
            height: el.getBoundingClientRect().height,
          })),
        });
        host.remove();
        return results;
      });
      writeFileSync(stem + '.probes.json', JSON.stringify(probes, null, 2));
      command(
        root + '/apps/rune/target/release/opencodex',
        [
          ...c.flags,
          '--tree',
          stem + '.tree.json',
          '--size',
          `${width}x${height}`,
          '--scale',
          '2',
          '--theme',
          theme,
          '--at',
          '0.7',
        ],
        { ...c.env, OPENCODEX_BENCH_PROJECT: extras.project.canonical },
      );
      console.log(stem);
    } finally {
      await electron.app.close();
    }
  }
}
