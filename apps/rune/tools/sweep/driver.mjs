/* global document, getComputedStyle */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { parseArgs } from 'node:util';
import {
  root,
  fixture,
  env,
  command,
  setup,
  cleanup,
  now,
  gwPort,
  ocPort,
} from './environment.mjs';
import { seed, api, beginState } from './fixture.mjs';
import { states, config } from './states.mjs';
import { reach } from './web.mjs';
import { installElectron, launchElectron } from './electron.mjs';
const { values } = parseArgs({
  options: {
    states: { type: 'string' },
    themes: { type: 'string', default: 'dark,light' },
    sizes: { type: 'string', default: '1280x800' },
    'keep-env': { type: 'boolean' },
    'report-only': { type: 'boolean' },
  },
});
const selected = values.states?.split(',') ?? states;
if (states.length !== 69 || new Set(states).size !== 69)
  throw new Error('Expected 69 unique parity states');
if (selected.some((s) => !states.includes(s))) throw new Error('Unknown state');
const themes = values.themes.split(',');
if (themes.some((t) => !['dark', 'light'].includes(t))) throw new Error('Unknown theme');
const sizes = values.sizes.split(',');
if (sizes.some((s) => !/^\d+x\d+$/.test(s))) throw new Error('Expected WxH sizes');
const out = root + '/apps/rune/goldens/sweep';
mkdirSync(out, { recursive: true });
const resultPath = out + '/results.json';
const results = values.states && existsSync(resultPath) ? JSON.parse(readFileSync(resultPath)) : [];
const reviewPath = import.meta.dirname + '/review.json';
const sourceFiles = command('git', [
  'ls-files',
  'apps/rune/src',
  'apps/rune/crates',
  'apps/rune/Cargo.lock',
  'apps/rune/Cargo.toml',
  'apps/web/src',
  'packages/gateway/src',
  'apps/desktop/src',
  'apps/desktop/package.json',
])
  .toString()
  .trim()
  .split('\n');
const sourceFingerprint = createHash('sha256');
for (const file of sourceFiles)
  sourceFingerprint.update(file).update(readFileSync(root + '/' + file));
const sourceKey = sourceFingerprint.digest('hex');
function report(rows) {
  const review = existsSync(reviewPath) ? JSON.parse(readFileSync(reviewPath)) : {};
  const groups = new Map();
  for (const row of rows) {
    const r =
      review.$reference === row.reference && review.$source === (row.source ?? sourceKey)
        ? review[row.state]
        : undefined;
    row.classification = row.reason
      ? 'not capturable'
      : (r?.classification ??
        (row.blurMAE < 0.7 && row.meanRGB < 1.5
          ? 'equivalent (only rasterization)'
          : row.blurMAE < 5
            ? 'small layout differences'
            : 'missing/extra UI'));
    row.description =
      row.reason ??
      r?.description ??
      'Unreviewed metric-based classification; not a visual sign-off.';
    const old = groups.get(row.state);
    if (
      !old ||
      (row.reason && !old.reason) ||
      (!old.reason && (row.blurMAE ?? -1) > (old.blurMAE ?? -1))
    )
      groups.set(row.state, row);
  }
  const worst = [...groups.values()].sort((a, b) => (b.blurMAE ?? -1) - (a.blurMAE ?? -1));
  const counts = {};
  for (const row of worst) counts[row.classification] = (counts[row.classification] ?? 0) + 1;
  const lines = [
    '# Same-data Electron / Rune parity sweep',
    '',
    `Revision: \`${command('git', ['rev-parse', 'HEAD']).toString().trim()}\`. Clock: ${new Date(now).toISOString()}.`,
    `UI/backend source fingerprint: \`${rows[0]?.source ?? sourceKey}\`. Reviewed observations are used only for matching fingerprints.`,
    '',
    `**${worst.length} states; ${rows.length} state/theme/size attempts.** ${Object.entries(counts)
      .map(([k, v]) => `${v} ${k}`)
      .join(' · ')}.`,
    '',
    `Both clients use gateway **${gwPort}**, isolated OpenCode **${ocPort}**, and the same authored fixture. No model calls or historical screenshots. **Real Electron is LEFT**, Rune RIGHT. Electron runs this checkout’s built main and sandboxed preload with \`ELECTRON_RENDERER_URL=http://127.0.0.1:${gwPort}\`, isolated HOME/XDG and a per-capture temporary user-data directory. Its genuine desktop bridge supplies Browser and Updates capabilities; no preload substitute or host-capability mock is installed. Fixtures include Markdown, 40-turn history, completed tools/reasoning, a real native form and permission, source diff/files, native child, side fork, tasks, and an app/canvas. Tasks/Apps empty states temporarily remove their data before the pair and restore it afterwards; both captures and their digests use the same empty lists. New side chat creates a real gateway fork before capturing that selected conversation (including inherited context) in both clients; this compares the rendered result, not native mutation behavior.`,
    '',
    '## Method and limits',
    '',
    ...(review.$reference === rows[0]?.reference &&
    review.$source === (rows[0]?.source ?? sourceKey)
      ? [review.$note, '']
      : []),
    '- Logical size 1280×800 (unless requested otherwise), device scale 2. Installed Electron binary runs this checkout’s actual built desktop main, preload and IPC handlers; Playwright connects through its ephemeral remote-debugging port/CDP. A finite temporary bootstrap imports that real main and only sets window content size, theme and hidden state. CDP device metrics match the content size. `Page.captureScreenshot` captures the hidden renderer surface, excluding OS titlebar traffic lights. The genuine preload enables the macOS titlebar inset. Native release `--screenshot --at 0.7` uses the same size/theme. Each scored record verifies the real bridge, viewport and scale and records Electron/Chromium versions.',
    '- Fixed browser Date and verified native realtime-clock interposer; monotonic/network time remains real. Web CSS animations paused at their initial phase and input caret hidden; the delayed follow-pill entrance is explicitly sampled at 0.7s, matching native --at 0.7 rather than hiding a mounted control at zero opacity. Native animation/caret phase uses the fixed virtual capture clock. Pointer parked except explicit hover. Transcript scroll fraction explicit. No redraw loops.',
    '- Each pair brackets capture with a SHA-256 digest of the same gateway projects, session info/history, forms, permissions, children, side forks, tasks, apps and canvas data. A changing digest invalidates the pair (no score). Captures are sequential over an unchanged snapshot, **not atomic simultaneous GPU presentation**.',
    '- RGB MAE is 0–255; over16 is the percentage of pixels whose maximum channel error exceeds 16. Structural metric is grayscale MAE after a 2-physical-pixel Gaussian blur and 2× downsampling (lower is better). No alignment correction, masks or cropping. Heatmap magnifies errors 4×.',
    '- Classification is manually reviewed where noted in the driver review file; otherwise thresholds are provisional: equivalent requires RGB <1.5 and blurred MAE <0.7; small layout <5; larger errors missing/extra. State classification uses the worst theme/size. Metrics alone never prove semantic equivalence.',
    '- See tools/sweep/LAST.md for the final fix measurements, geometry checks and inspected caveats. In particular, a new side fork may return empty history; its introduction can meet numerical thresholds while retaining locale-time/plugin-hint text differences. It must not be called pixel-equivalent or substituted with an older populated-fork capture.',
    '- Native canvas capture composites the real WKWebView takeSnapshot export at its laid-out host rectangle; adjacent child PNG/JSON preserve pixels and placement provenance. It uses the same gateway runtime, source, data and theme, waiting for document/fonts and the snapshot paint fence. No blank-child substitute, image mask or alignment correction. Unsupported run states remain unscored with explicit reasons; chat-streaming is an active-run limitation, not a second canvas.',
    '',
    '## States, worst first (worst theme/size shown)',
    '',
    '| State | Theme / size | RGB MAE | >16 % | Blur MAE | Classification | Observed difference |',
    '|---|---|---:|---:|---:|---|---|',
  ];
  for (const r of worst)
    lines.push(
      `| ${r.state} | ${r.theme} / ${r.size} | ${r.meanRGB ?? '—'} | ${r.over16 ?? '—'} | ${r.blurMAE ?? '—'} | ${r.classification} | ${r.description.replaceAll('|', '/').replaceAll('\n', ' ')} |`,
    );
  lines.push(
    '',
    '## All theme / size measurements',
    '',
    '| State | Theme | Size | RGB MAE | >16 % | Blur MAE | Snapshot stable |',
    '|---|---|---|---:|---:|---:|---|',
  );
  for (const row of [...rows].sort((a, b) => (b.blurMAE ?? -1) - (a.blurMAE ?? -1))) {
    lines.push(
      `| ${row.state} | ${row.theme} | ${row.size} | ${row.reason ? '—' : row.meanRGB} | ${row.reason ? '—' : row.over16} | ${row.reason ? '—' : row.blurMAE} | ${row.before && row.before === row.after ? row.before.slice(0, 12) : 'unscored'} |`,
    );
  }
  lines.push(
    '',
    '## Reproduce',
    '',
    '```sh',
    'bun apps/rune/tools/sweep/run.ts',
    '# Optional: --states home-empty,chat-markdown-top --themes dark,light --sizes 1280x800',
    '```',
    '',
    'Requires Bun, Node, the pinned Electron dependency, Rust/macOS toolchain and Python Pillow. Builds the shared renderer, real desktop main/preload, and Rune incrementally; isolated CLI pinned to 2.3.2. Each Electron instance is closed after capture. Only processes whose actual environment contains `HOME=/tmp/ocr-sweep/home` are terminated during fallback cleanup. The temporary environment is removed in finally; `--keep-env` is for diagnosis only. PNGs, logs, DOM observations, fixture manifest and full per-theme metrics stay local/ignored. Reference PNGs are `.electron.png`, never historical `.web.png` files. `--report-only` regenerates this report from local results and checked-in review descriptions.'.replaceAll(
      '/tmp/ocr-sweep',
      fixture,
    ),
    '',
  );
  writeFileSync(out + '/REPORT.md', lines.join('\n'));
  command('bunx', ['prettier', '--write', out + '/REPORT.md']);
}
if (values['report-only']) {
  report(JSON.parse(readFileSync(resultPath)));
  process.exit(0);
}
Object.assign(process.env, env);
let electron;
try {
  await setup();
  console.log('Isolated services connected');
  const extras = await seed();
  writeFileSync(out + '/fixture.json', JSON.stringify(extras, null, 2));
  command('bun', ['run', 'build:web']);
  command('bun', ['run', '--cwd', 'apps/desktop', 'build']);
  const executablePath = installElectron();
  command('cargo', [
    'build',
    '--release',
    '--workspace',
    '--manifest-path',
    'apps/rune/Cargo.toml',
  ]);
  command('clang', [
    '-dynamiclib',
    import.meta.dirname + '/clock.c',
    '-o',
    fixture + '/clock.dylib',
  ]);
  command('clang', [
    '-DSWEEP_CLOCK_PROBE',
    import.meta.dirname + '/clock.c',
    '-o',
    fixture + '/clock-probe',
  ]);
  command(fixture + '/clock-probe', [], { DYLD_INSERT_LIBRARIES: fixture + '/clock.dylib' });
  const pw = readdirSync(root + '/node_modules/.bun').find((n) => n.startsWith('playwright-core@'));
  const playwright = await import(
    `${root}/node_modules/.bun/${pw}/node_modules/playwright-core/index.mjs`
  );
  async function digest() {
    const paths = [
      '/projects',
      '/tasks',
      '/apps',
      '/canvases',
      `/models?directory=${encodeURIComponent(extras.project.canonical)}`,
      ...extras.sessions.flatMap((s) => [
        `/sessions/${s.id}`,
        `/sessions/${s.id}/forms`,
        `/sessions/${s.id}/permissions`,
        `/sessions/${s.id}/subagents`,
        `/sessions/${s.id}/side-chats`,
      ]),
      `/canvases/${extras.canvas.id}/data`,
      `/canvases/${extras.canvas.id}`,
      `/workspace/diff?directory=${encodeURIComponent(extras.project.canonical)}`,
      ...['README.md', 'src/index.ts'].map(
        (path) =>
          `/workspace/file?directory=${encodeURIComponent(extras.project.canonical)}&path=${encodeURIComponent(path)}`,
      ),
    ];
    const values = await Promise.all(paths.map((p) => api(p)));
    const ids = new Set(extras.sessions.map((s) => s.id));
    for (const value of values) {
      for (const item of Array.isArray(value)
        ? value
        : Array.isArray(value?.data)
          ? value.data
          : [])
        if (item?.id?.startsWith('ses_')) ids.add(item.id);
    }
    const histories = await Promise.all(
      [...ids].sort().map(async (id) => {
        const pages = [];
        let cursor;
        do {
          const page = await api(
            `/sessions/${id}/messages${cursor ? '?cursor=' + encodeURIComponent(cursor) : ''}`,
          );
          pages.push(page);
          cursor = page.cursor.next;
          if (pages.length > 20) throw new Error('Fixture history exceeds sweep bound');
        } while (cursor);
        return [id, pages];
      }),
    );
    return createHash('sha256')
      .update(JSON.stringify([values, histories]))
      .digest('hex');
  }
  for (const size of sizes)
    for (const theme of themes)
      for (const state of selected) {
        const [width, height] = size.split('x').map(Number);
        const name = `${state}-${theme}${sizes.length > 1 || size !== '1280x800' ? '-' + size : ''}`;
        const stem = out + '/' + name;
        const c = config(state, extras, { width, height });
        const row = { state, theme, size, stem: name, source: sourceKey, reference: 'electron' };
        results.splice(
          0,
          results.length,
          ...results.filter((r) => !(r.state === state && r.theme === theme && r.size === size)),
        );
        let restore;
        try {
          if (c.reason) throw new Error(c.reason);
          restore = await beginState(state, extras);
          electron = await launchElectron(
            playwright,
            executablePath,
            extras,
            state,
            theme,
            width,
            height,
          );
          const { page } = electron;
          page.setDefaultTimeout(6000);
          const extraEnv = await reach(page, state, c, extras);
          row.before = await digest();
          row.desktop = await electron.capture(stem + '.electron.png');
          row.versions = { electron: electron.versions.electron, chrome: electron.versions.chrome };
          writeFileSync(stem + '.dom.txt', await page.locator('body').innerText());
          writeFileSync(
            stem + '.geometry.json',
            JSON.stringify(
              await page.evaluate(() => {
                const selectors =
                  '[role="menu"],[role="listbox"],dialog[open],:popover-open,.slash-menu,.model-picker,.find-bar,.session-panel,.select-menu,.project-form,.settings-page,.question-dock,.workbench,.terminal-panel,.toolbar,.activity-group';
                const measure = (e) => {
                  const r = e.getBoundingClientRect(),
                    c = getComputedStyle(e);
                  return {
                    tag: e.tagName,
                    class: e.className,
                    text: e.textContent?.slice(0, 160),
                    rect: [r.x, r.y, r.width, r.height],
                    ...(e.tagName === 'CANVAS' ? { pixels: [e.width, e.height] } : {}),
                    padding: c.padding,
                    radius: c.borderRadius,
                    border: c.border,
                    shadow: c.boxShadow,
                    lineHeight: c.lineHeight,
                    fontSize: c.fontSize,
                    fontFamily: c.fontFamily,
                    fontWeight: c.fontWeight,
                    color: c.color,
                    background: c.backgroundColor,
                    gap: c.gap,
                    position: c.position,
                  };
                };
                return {
                  roots: [...document.querySelectorAll(selectors)]
                    .filter((e) => e.getBoundingClientRect().height)
                    .map((e) => ({
                      ...measure(e),
                      rows: [
                        ...e.querySelectorAll(
                          'button,input,summary,canvas,.terminal-viewport,[role="option"],[role="menuitem"],[role="treeitem"],li,.session-panel-row,.session-details-content > *,.settings-group,.settings-row,.settings-label,.settings-label > *,.question-dock *',
                        ),
                      ].map(measure),
                    })),
                  triggers: [
                    ...document.querySelectorAll(
                      '[aria-expanded="true"],[aria-haspopup],[popovertarget],.composer',
                    ),
                  ].map(measure),
                };
              }),
              null,
              2,
            ),
          );
          writeFileSync(
            stem + '.blocks.json',
            JSON.stringify(
              await page.evaluate(() =>
                [
                  ...document.querySelectorAll(
                    '.timeline-row, .markdown, .markdown *, .history-status, .timeline-footer, .chat-status',
                  ),
                ].map((el) => {
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
              ),
              null,
              2,
            ),
          );
          // Computed font-family is only a fallback list. Record the actual
          // platform faces too: Blink and Rune can resolve ui-monospace differently.
          const fonts = {};
          const fontCDP = await page.context().newCDPSession(page);
          try {
            await fontCDP.send('DOM.enable');
            await fontCDP.send('CSS.enable');
            const { root: document } = await fontCDP.send('DOM.getDocument');
            for (const selector of [
              '.markdown p',
              '.markdown pre code',
              '.markdown a code',
              '.settings-label code',
              '.activity-target',
            ]) {
              const { nodeId } = await fontCDP.send('DOM.querySelector', {
                nodeId: document.nodeId,
                selector,
              });
              if (nodeId)
                fonts[selector] = (
                  await fontCDP.send('CSS.getPlatformFontsForNode', { nodeId })
                ).fonts;
            }
          } finally {
            await fontCDP.detach();
          }
          writeFileSync(stem + '.fonts.json', JSON.stringify(fonts, null, 2));
          const args = [
            ...c.flags,
            '--screenshot',
            stem + '.rune.png',
            '--tree',
            stem + '.rune-tree.json',
            '--size',
            size,
            '--scale',
            '2',
            '--theme',
            theme,
            '--at',
            '0.7',
            '--tree',
            stem + '.tree.json',
          ];
          if (c.script.length) {
            writeFileSync(fixture + '/script.json', JSON.stringify(c.script));
            args.push('--script', fixture + '/script.json');
          }
          const log = command(root + '/apps/rune/target/release/opencodex', args, {
            ...extraEnv,
            ...c.env,
            OPENCODEX_BENCH_PROJECT: extras.project.canonical,
            DYLD_INSERT_LIBRARIES: fixture + '/clock.dylib',
          });
          writeFileSync(stem + '.log', log);
          if (state === 'subagent-conversation') {
            // A tiny status label can move hundreds of pixels while remaining
            // below whole-window MAE thresholds. Guard this scroll boundary
            // directly instead of classifying a fixed bottom dock as text AA.
            const blocks = JSON.parse(readFileSync(stem + '.blocks.json'));
            const tree = JSON.parse(readFileSync(stem + '.tree.json'));
            const expected = blocks.find(
              (e) => e.class === 'chat-status' && e.text.trim() === 'Idle',
            );
            const actual = tree.elements.find((e) => e.text === 'Idle');
            const history = tree.elements.find((e) => e.key === 'reader-history');
            if (!history || Math.abs(history.rect[3] - 44) > 0.01)
              throw new Error('Subagent history header is not 44px scroll content');
            if (!expected || !actual || Math.abs(expected.rect[1] - actual.rect[1]) > 1)
              throw new Error(
                'Subagent status footer does not follow the transcript inside its scroller',
              );
          }
          row.after = await digest();
          if (row.before !== row.after)
            throw new Error('Shared gateway snapshot changed during capture; pair invalidated');
          Object.assign(
            row,
            JSON.parse(command('python3', [import.meta.dirname + '/metrics.py', stem])),
          );
        } catch (error) {
          row.reason = String(error.message).slice(0, 1000);
          if (electron?.page) {
            writeFileSync(
              stem + '.failure.dom.txt',
              await electron.page.locator('body').innerText(),
            );
          }
        } finally {
          await electron?.app.close();
          electron = undefined;
          if (c.createdSide)
            await api('/sessions/ses_parity_0/side-chats/' + c.createdSide, {}, 'DELETE');
          await restore?.();
        }
        results.push(row);
        writeFileSync(resultPath, JSON.stringify(results, null, 2));
        console.log(
          name,
          row.reason ??
            `RGB ${row.meanRGB}; >16 ${row.over16}%; blur ${row.blurMAE}; snapshot stable`,
        );
      }
  report(results);
} finally {
  await electron?.app.close();
  if (!values['keep-env']) await cleanup();
}
