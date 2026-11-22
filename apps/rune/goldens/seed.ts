import { mkdir, writeFile, realpath } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
const root = process.env.OCR_FIXTURE ?? '/tmp/ocr-goldens';
const base = process.env.OCR_API ?? 'http://127.0.0.1:4432/api';
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
const sessions: { id: string; goldenPrompt: string }[] = [];
const prompts = [
  'Explain this project with a heading, a numbered list, a markdown table, inline code and fenced TypeScript, Python and SQL code examples. Keep it concise.',
  'Read src/index.ts, run git status, then edit src/index.ts to add an exported multiply function. Explain the diff.',
  'Use the question tool to ask which deployment target I want, with options Local, Staging, Production. Wait for my answer.',
  'Give a concise architecture review of this project. Think carefully before replying.',
  'Reply with one sentence summarizing a good testing strategy.',
  'Use a subagent to explore the source files and summarize what it finds.',
  'Write a short release checklist.',
  'Explain the tradeoffs of caching API responses in a concise table.',
];
for (const name of ['atlas-api', 'orbit-web']) {
  const directory = `${await realpath(root)}/proj/${name}`;
  await mkdir(`${directory}/src`, { recursive: true });
  await writeFile(
    `${directory}/src/index.ts`,
    'export const add = (a: number, b: number) => a + b;\n',
  );
  await writeFile(
    `${directory}/README.md`,
    `# ${name}\nA small production-ready TypeScript service.\n`,
  );
  await writeFile(
    `${directory}/package.json`,
    JSON.stringify({ name, version: '1.0.0', type: 'module' }),
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
      'Initial source',
    ],
    { cwd: directory },
  );
  await api('/projects', { directory });
  for (let i = 0; i < 4; i++) {
    const session = await api('/sessions', { directory, model });
    sessions.push({ ...session, goldenPrompt: prompts[sessions.length]! });
  }
}
await writeFile(`${root}/sessions.json`, JSON.stringify(sessions, null, 2));
await Promise.all(
  sessions.map(async (s) => {
    await api(`/sessions/${s.id}/prompt`, { text: s.goldenPrompt, model });
    console.log('Seeded', s.id, s.goldenPrompt);
  }),
);
// Admission is asynchronous. Wait until the short-chat session is idle before each turn.
const long = sessions[4]!;
for (let i = 1; i <= 40; i++) {
  for (let attempt = 0; attempt < 120; attempt++) {
    const active = await api('/sessions/active');
    if (!active[long.id]) break;
    await new Promise((r) => setTimeout(r, 1000));
    if (attempt === 119)
      throw new Error('Timed out waiting for idle; inspect session status shape');
  }
  await api(`/sessions/${long.id}/prompt`, {
    text: `Turn ${i}: give one short testing tip, numbered ${i}.`,
    model,
  });
  console.log('Long chat turn', i);
}
await writeFile(`${root}/permission-note.txt`, 'Fixture file outside both project directories.\n');
await api(`/sessions/${sessions[7]!.id}/prompt`, {
  text: `Use the read tool to read ${await realpath(root)}/permission-note.txt outside this project. Do not use bash. Wait for permission if required.`,
  model,
});
