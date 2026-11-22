// Test-only deterministic transcripts imported through the isolated OpenCode V2 API.
// These are authored UI fixtures, never represented as model output or cloud recordings.
import { mkdir, readFile, realpath, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
const root = process.env.OCR_FIXTURE ?? '/tmp/ocr-parity-chat';
const base = `${process.env.OCR_BASE ?? 'http://127.0.0.1:4495'}/api`;
const env = {
  ...process.env,
  HOME: `${root}/home`,
  XDG_CONFIG_HOME: `${root}/home/.config`,
  XDG_DATA_HOME: `${root}/home/.local/share`,
  XDG_STATE_HOME: `${root}/home/.local/state`,
  XDG_CACHE_HOME: `${root}/home/.cache`,
};
const cli = `${root}/pkg/node_modules/.bin/opencode`;
const model = { providerID: 'opencode', id: 'big-pickle' };
async function api(path: string, body?: unknown) {
  const r = await fetch(
    base + path,
    body === undefined
      ? {}
      : {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        },
  );
  if (!r.ok) throw new Error(`${path}: ${r.status} ${await r.text()}`);
  return r.json();
}
await api('/connection', {});
let existing: { id: string }[] | undefined;
try {
  existing = JSON.parse(await readFile(`${root}/sessions.json`, 'utf8'));
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
}
if (existing?.length === 8 && !process.argv.includes('--live')) {
  for (const session of existing) await api(`/sessions/${session.id}/messages`);
  console.log('Reusing the existing isolated fixture:', root);
  process.exit(0);
}
const directory = `${await realpath(root)}/proj/atlas-api`;
await mkdir(`${directory}/src`, { recursive: true });
await writeFile(
  `${directory}/src/index.ts`,
  'export const add = (a: number, b: number) => a + b;\n',
);
await writeFile(
  `${directory}/README.md`,
  '# atlas-api\nA small production-ready TypeScript service.\n',
);
await writeFile(
  `${directory}/report.html`,
  '<!doctype html><title>Local report</title><h1>Local report</h1><a href="README.md">Source</a>',
);
execFileSync('git', ['init'], { cwd: directory });
execFileSync('git', ['add', '.'], { cwd: directory });
execFileSync(
  'git',
  [
    '-c',
    'user.name=Golden',
    '-c',
    'user.email=golden@example.test',
    'commit',
    '--allow-empty',
    '-m',
    'Initial fixture',
  ],
  { cwd: directory },
);
await writeFile(
  `${directory}/src/index.ts`,
  'export const add = (a: number, b: number) => a + b;\nexport const multiply = (a: number, b: number) => a * b;\n',
);
await api('/projects', { directory });
const template = await api('/sessions', { directory, model });
const info = await api(`/sessions/${template.id}`);
if (process.argv.includes('--live')) {
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt) await new Promise((r) => setTimeout(r, 25_000 * attempt));
    await api(`/sessions/${template.id}/prompt`, {
      text: 'Reply with a short Markdown heading and a two-row table.',
      model,
    });
    for (;;) {
      await new Promise((r) => setTimeout(r, 1000));
      const active = await api('/sessions/active');
      if (!active[template.id]) break;
    }
    const messages = await api(`/sessions/${template.id}/messages`);
    await writeFile(`${root}/live-attempt-${attempt}.json`, JSON.stringify(messages, null, 2));
    if (
      messages.data.some(
        (m: { type: string; error?: unknown }) => m.type === 'assistant' && !m.error,
      )
    )
      break;
  }
}
const markdown = `# Project overview

The source lives in [\`src/index.ts\`](src/index.ts), with a [README](README.md) and [local report](report.html).
External links, such as [OpenCode](https://opencode.ai), have no file icon.

## Modules

1. **API** — accepts requests and validates input.
2. **Storage** — persists records and caches lookups.
3. **Tests** — cover failure paths and boundaries.

| Module | Responsibility | Status |
| --- | --- | --- |
| API | Request validation | Ready |
| Storage | Durable records | Reviewed |
| Tests | Boundary coverage | Passing |

> Keep the transport separate from execution.

- [x] Read the source
- [ ] Review the changes

\`\`\`typescript
export const multiply = (a: number, b: number) => a * b;
\`\`\`

Inline \`code\`, **bold**, *emphasis* and ~~strikethrough~~ stay selectable.
`;
const at = Date.now() - 120_000;
let sequence = 0;
const id = () => `msg_parity_${(++sequence).toString().padStart(5, '0')}`;
const user = (text: string, time = at) => ({
  id: id(),
  type: 'user',
  text,
  time: { created: time },
});
const answer = (text: string, content: unknown[] = [], time = at + 1000) => ({
  id: id(),
  type: 'assistant',
  agent: 'build',
  model,
  time: { created: time, completed: time + 4000 },
  content: [...content, { type: 'text', text, time: { start: time, end: time + 4000 } }],
});
const idle = (time = at + 5000) => ({
  id: id(),
  type: 'idle',
  outcome: 'succeeded',
  time: { created: time },
});
const tool = (name: string, input: unknown, text: string) => ({
  type: 'tool',
  id: `tool_${name}`,
  name,
  time: { created: at + 1500 },
  state: { status: 'completed', input, content: [{ type: 'text', text }], metadata: {} },
});
const work = [
  {
    type: 'reasoning',
    text: 'I will inspect the source and verify the working tree before proposing a change.',
    time: { created: at + 1000, completed: at + 1200 },
  },
  tool('read', { filePath: 'src/index.ts' }, 'export const add = (a: number, b: number) => a + b;'),
  tool('bash', { command: 'git status --short' }, ' M src/index.ts'),
  tool('grep', { pattern: 'export' }, 'src/index.ts:1:export const add'),
  tool(
    'edit',
    { filePath: 'src/index.ts', oldString: '', newString: 'multiply' },
    'Updated src/index.ts',
  ),
  tool(
    'skill',
    { name: 'review' },
    '<skill_content name="review">Review complete.</skill_content>',
  ),
];
const sessions: { id: string; goldenPrompt: string }[] = [];
for (const [index, title, messages] of [
  [
    0,
    'Markdown parity fixture',
    [
      user('Explain this project with headings, lists, a table and code.'),
      answer(markdown),
      idle(),
    ],
  ],
  [
    1,
    'Tool parity fixture',
    [
      user('Read the source, run git status and explain the change.'),
      answer('Added [multiply](src/index.ts) alongside the existing add function.', work),
      idle(),
    ],
  ],
  [2, 'Question parity fixture', [user('Ask which deployment target I want.')]],
  [3, 'Architecture parity fixture', [user('Review the architecture.'), answer(markdown), idle()]],
  [
    4,
    'Long parity fixture',
    Array.from({ length: 40 }, (_, n) => [
      user(`Turn ${n + 1}: give a testing tip.`, at + n * 6000),
      answer(
        `Testing tip ${n + 1}: exercise the boundary before the happy path.`,
        [],
        at + n * 6000 + 1000,
      ),
      idle(at + n * 6000 + 5000),
    ]).flat(),
  ],
  [
    5,
    'Subagent parity fixture',
    [
      user('Inspect the project.'),
      answer('The source is small and the transport is isolated.'),
      idle(),
    ],
  ],
  [
    6,
    'Release parity fixture',
    [user('Write a release checklist.'), answer('- [x] Tests\n- [ ] Release'), idle()],
  ],
  [7, 'Caching parity fixture', [user('Explain caching tradeoffs.'), answer(markdown), idle()]],
] as const) {
  const session = {
    ...info,
    id: `ses_parity_${index}`,
    title,
    outcome: 'succeeded',
    time: { created: at + index, updated: at + 6000 + index },
  };
  const body = { info: session, messages, location: session.location };
  await writeFile(`${root}/import-${index}.json`, JSON.stringify(body, null, 2));
  if (!(await fetch(`${base}/sessions/${session.id}`)).ok)
    execFileSync(
      cli,
      ['api', 'post', '/api/experimental/session/import', '--data', JSON.stringify(body)],
      { env },
    );
  sessions.push({ id: session.id, goldenPrompt: title });
}
await writeFile(`${root}/sessions.json`, JSON.stringify(sessions, null, 2));
await writeFile(
  `${root}/fixture-provenance.txt`,
  'Authored deterministic UI fixtures imported via the isolated OpenCode V2 API, not model replies or original cloud recordings.\n',
);
// Record the service's actual imported projection for reuse, including any normalization.
for (const session of sessions)
  await writeFile(
    `${root}/${session.id}.json`,
    JSON.stringify(await api(`/sessions/${session.id}/messages`), null, 2),
  );
console.log(
  'Reusable isolated fixture:',
  root,
  sessions.map((s) => s.id),
);
