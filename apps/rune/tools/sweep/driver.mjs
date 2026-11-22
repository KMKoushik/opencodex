import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { parseArgs } from 'node:util';
import { root, fixture, env, command, setup, cleanup, now } from './environment.mjs';
import { seed, api, beginState } from './fixture.mjs';
import { states, config } from './states.mjs';
import { prepare, reach } from './web.mjs';
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
    const r = review.$source === (row.source ?? sourceKey) ? review[row.state] : undefined;
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
    const extraBrowser =
      /^(chat-|find-|panel-|tool-|tools-|thoughts-|question-|side-chat-|subagents-|subagent-)/.test(
        row.state,
      ) ||
      ['thread-actions-open', 'thread-context-menu', 'session-details-open'].includes(row.state);
    if (!row.reason && r && extraBrowser) {
      row.classification = 'missing/extra UI';
      row.description += ' Extra native Browser rail button (host-only).';
    }
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
  const hostDriven = worst.filter((row) =>
    row.description.endsWith('Extra native Browser rail button (host-only).'),
  ).length;
  const lines = [
    '# Same-data web / Rune parity sweep',
    '',
    `Revision: \`${command('git', ['rev-parse', 'HEAD']).toString().trim()}\`. Clock: ${new Date(now).toISOString()}.`,
    `UI/backend source fingerprint: \`${rows[0]?.source ?? sourceKey}\`. Reviewed observations are used only for matching fingerprints.`,
    '',
    `**${worst.length} states; ${rows.length} state/theme/size attempts.** ${Object.entries(counts)
      .map(([k, v]) => `${v} ${k}`)
      .join(' · ')}.`,
    ...(hostDriven
      ? [
          `**${hostDriven} of the missing/extra classifications are driven by the additional native Browser rail button**, not different transcript data. See the per-state layout observations below.`,
          '',
        ]
      : []),
    '',
    'Both clients use gateway **4507**, isolated OpenCode **4977**, and the same authored fixture. No model calls or historical screenshots. Web is LEFT in every pair. Fixtures include Markdown, 40-turn history, completed tools/reasoning, a real native form and permission, source diff/files, native child, side fork, tasks, and an app/canvas. Tasks/Apps empty states temporarily remove their data before the pair and restore it afterwards; both captures and their digests use the same empty lists. New side chat creates a real gateway fork before capturing that selected conversation (including inherited context) in both clients; this compares the rendered result, not native mutation behavior.',
    '',
    '## Method and limits',
    '',
    ...(review.$source === (rows[0]?.source ?? sourceKey) ? [review.$note, ''] : []),
    '- Logical size 1280×800 (unless requested otherwise), device scale 2. Chrome channel, gateway `/`, macOS titlebar CSS inset. Native release `--screenshot --at 0.7` with identical size/theme.',
    '- Fixed browser Date and verified native realtime-clock interposer; monotonic/network time remains real. Web CSS animations paused at their initial phase and input caret hidden; native animation/caret phase uses the fixed virtual capture clock. Pointer parked except explicit hover. Transcript scroll fraction explicit. No redraw loops.',
    '- Each pair brackets capture with a SHA-256 digest of the same gateway projects, session info/history, forms, permissions, children, side forks, tasks, apps and canvas data. A changing digest invalidates the pair (no score). Captures are sequential over an unchanged snapshot, **not atomic simultaneous GPU presentation**.',
    '- RGB MAE is 0–255; over16 is the percentage of pixels whose maximum channel error exceeds 16. Structural metric is grayscale MAE after a 2-physical-pixel Gaussian blur and 2× downsampling (lower is better). No alignment correction, masks or cropping. Heatmap magnifies errors 4×.',
    '- Classification is manually reviewed where noted in the driver review file; otherwise thresholds are provisional: equivalent requires RGB <1.5 and blurred MAE <0.7; small layout <5; larger errors missing/extra. State classification uses the worst theme/size. Metrics alone never prove semantic equivalence.',
    '- WKWebView content and unsupported interaction/run states are unscored with explicit reasons; no blank-child or parent/completed-state substitutes.',
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
    'Requires Bun, Node, Chrome, Rust/macOS toolchain and Python Pillow. Builds web and Rune incrementally; isolated CLI pinned to 2.3.2. Only processes whose actual environment contains `HOME=/tmp/ocr-sweep/home` are terminated. The temporary environment is removed in finally; `--keep-env` is for diagnosis only. PNGs, logs, DOM observations, fixture manifest and full per-theme metrics stay local/ignored. `--report-only` regenerates this report from local results and checked-in review descriptions.',
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
let browser;
try {
  await setup();
  console.log('Isolated services connected');
  const extras = await seed();
  writeFileSync(out + '/fixture.json', JSON.stringify(extras, null, 2));
  command('bun', ['run', 'build:web']);
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
  const { chromium } = await import(
    `${root}/node_modules/.bun/${pw}/node_modules/playwright-core/index.mjs`
  );
  browser = await chromium.launch({ channel: 'chrome' });
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
        const c = config(state, extras);
        const row = { state, theme, size, stem: name, source: sourceKey };
        results.splice(
          0,
          results.length,
          ...results.filter((r) => !(r.state === state && r.theme === theme && r.size === size)),
        );
        let context, restore;
        try {
          if (c.reason) throw new Error(c.reason);
          restore = await beginState(state, extras);
          context = await browser.newContext({
            viewport: { width, height },
            deviceScaleFactor: 2,
            colorScheme: theme,
            permissions: ['clipboard-write'],
          });
          await prepare(context, extras, state);
          const page = await context.newPage();
          page.setDefaultTimeout(6000);
          const extraEnv = await reach(page, state, c, extras);
          row.before = await digest();
          await page.screenshot({ path: stem + '.web.png', caret: 'hide', animations: 'disabled' });
          writeFileSync(stem + '.dom.txt', await page.locator('body').innerText());
          const args = [
            ...c.flags,
            '--screenshot',
            stem + '.rune.png',
            '--size',
            size,
            '--scale',
            '2',
            '--theme',
            theme,
            '--at',
            '0.7',
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
          row.after = await digest();
          if (row.before !== row.after)
            throw new Error('Shared gateway snapshot changed during capture; pair invalidated');
          Object.assign(
            row,
            JSON.parse(command('python3', [import.meta.dirname + '/metrics.py', stem])),
          );
        } catch (error) {
          row.reason = String(error.message).slice(0, 1000);
        } finally {
          await context?.close();
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
  await browser?.close();
  if (!values['keep-env']) await cleanup();
}
