// Authored deterministic data, not model output. No prompt/generate calls.
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { connect } from './lib/opencode';
import { requireIsolatedEnvironment } from './lib/screen';

requireIsolatedEnvironment();
if (process.env.HOME !== '/tmp/ocr-bench/home') throw new Error('Use bench/env.sh');
const root = '/tmp/ocr-bench';
mkdirSync('bench/.build', { recursive: true });
if (!existsSync(`${root}/boundary.png`)) {
  execFileSync('swiftc', [
    '-O',
    'bench/lib/fixture-image.swift',
    '-o',
    'bench/.build/fixture-image',
  ]);
  execFileSync('bench/.build/fixture-image', [`${root}/boundary.png`]);
}
const image = {
  data: readFileSync(`${root}/boundary.png`).toString('base64'),
  mime: 'image/png',
  name: 'boundary.png',
  source: { type: 'inline' as const },
};
function checkpoint(messages: { id: string; time: { created: number } }[]) {
  const recent = messages.at(-8)!;
  return {
    id: 'msg_ocrbench_checkpoint',
    type: 'compaction',
    status: 'completed',
    reason: 'manual',
    summary:
      'Authored benchmark checkpoint, not a model summary: reviewed request boundaries, cancellation, bounded caches and ownership. The gateway owns relative /api transport; OpenCode owns execution and history.',
    recent: recent.id,
    time: { created: recent.time.created - 1 },
    metadata: { authoredFixture: true },
  };
}
const { client, url } = await connect();
if (new URL(url).port !== '4989') throw new Error(`Unexpected isolated service: ${url}`);
if (existsSync(`${root}/fixture.json`)) {
  const saved = await Bun.file(`${root}/fixture.json`).json();
  if (saved.schemaVersion !== 5) {
    if (saved.sessionID !== 'ses_ocrbench_0_0')
      throw new Error('Refusing to migrate an unknown fixture');
    const exported = await client.session.export({ sessionID: saved.sessionID });
    const backup = JSON.stringify(exported);
    writeFileSync(`${root}/image-upgrade-backup.json`, backup);
    const updated = {
      ...exported,
      location: { directory: '/tmp/ocr-bench/proj/atlas-api' },
      messages: exported.messages.map((message, index) =>
        message.type === 'user' && index % 100 === 0 ? { ...message, files: [image] } : message,
      ),
    };
    if (!updated.messages.some((message) => message.type === 'compaction'))
      updated.messages.splice(
        updated.messages.length - 8,
        0,
        checkpoint(updated.messages) as (typeof updated.messages)[number],
      );
    await client.session.remove({ sessionID: saved.sessionID });
    try {
      await client.session.import(updated);
    } catch (error) {
      await client.session.import(JSON.parse(backup));
      throw error;
    }
    saved.payloadBytes += JSON.stringify(updated).length - backup.length;
    saved.messages = updated.messages.length;
    saved.schemaVersion = 5;
  }
  const session = await client.session.get({ sessionID: saved.sessionID });
  saved.projects = saved.projects.map((directory: string) =>
    directory.replace(/^\/private\/tmp\//, '/tmp/'),
  );
  writeFileSync(`${root}/fixture.json`, JSON.stringify(saved, null, 2));
  await client.session.update({ sessionID: saved.sessionID, title: session.title });
  const context = await client.session.context({ sessionID: saved.sessionID });
  if (context.length > 20)
    throw new Error('Fixture compaction checkpoint did not bound model context');
  console.log('Reusing', saved);
  process.exit(0);
}
const model = { providerID: 'opencode', id: 'big-pickle' };
const projects: string[] = [];
const now = Date.now() - 9_000_000;
const markdown = `## Boundary review\n\nThe transport validates records before persistence. Prefer explicit ownership and bounded caches.\n\n| Component | Owner | Status |\n| --- | --- | --- |\n| Transport | Gateway | Reviewed |\n| Storage | OpenCode | Durable |\n\n\`\`\`rust\nfn checked(value: usize) -> Option<usize> { value.checked_add(1) }\n\`\`\`\n\n- [x] Inspect failure paths\n- [ ] Profile realistic history\n\n`;
let payloadBytes = 0;
let heavyID = '';
for (let project = 0; project < 3; project++) {
  const directory = `${root}/proj/${['atlas-api', 'console-ui', 'worker-pool'][project]}`;
  mkdirSync(`${directory}/src`, { recursive: true });
  writeFileSync(`${directory}/src/index.ts`, 'export const limit = 128;\n');
  writeFileSync(
    `${directory}/README.md`,
    `# Benchmark project ${project + 1}\nAuthored local fixture.\n`,
  );
  execFileSync('git', ['init', '-q'], { cwd: directory });
  execFileSync('git', ['add', '.'], { cwd: directory });
  execFileSync(
    'git',
    ['-c', 'user.name=Bench', '-c', 'user.email=bench@example.test', 'commit', '-qm', 'Fixture'],
    { cwd: directory },
  );
  writeFileSync(`${directory}/src/index.ts`, 'export const limit = 256;\n');
  projects.push(directory);
  for (let thread = 0; thread < 13; thread++) {
    const heavy = project === 0 && thread === 0;
    const template = await client.session.create({
      location: { directory },
      model,
      title: 'Fixture template',
    });
    const info = {
      ...template,
      id: `ses_ocrbench_${project}_${thread}`,
      title: heavy
        ? 'Heavy architecture review — 750 turns'
        : `${['API reliability', 'UI accessibility', 'Worker scheduling'][project]} ${thread + 1}`,
      outcome: 'succeeded' as const,
    };
    const messages: unknown[] = [];
    for (let turn = 0; turn < (heavy ? 750 : 3); turn++) {
      const at = now + turn * 10_000;
      messages.push({
        id: `msg_ocrbench_${project}_${thread}_${turn}_u`,
        type: 'user',
        text: `Review iteration ${turn + 1}: verify the boundary, explain tradeoffs and show the patch.`,
        time: { created: at },
      });
      const content: unknown[] = [
        {
          type: 'reasoning',
          text: 'Inspect the request path, then check cancellation, allocation limits and retry policy.',
          time: { created: at + 1, completed: at + 10 },
        },
        {
          type: 'tool',
          id: `tool_${turn}`,
          name: 'bash',
          time: { created: at + 20 },
          state: {
            status: 'completed',
            input: { command: 'bun test --verbose' },
            content: [
              {
                type: 'text',
                text: Array.from(
                  { length: heavy ? 480 : 4 },
                  (_, line) =>
                    `PASS boundary-${turn}-${line}: request=${line} status=200 cache=hit duration=0.42ms; verified ownership and cancellation\n`,
                ).join(''),
              },
            ],
            metadata: {},
          },
        },
        {
          type: 'tool',
          id: `edit_${turn}`,
          name: 'edit',
          time: { created: at + 30 },
          state: {
            status: 'completed',
            input: { filePath: 'src/index.ts', oldString: 'limit = 128', newString: 'limit = 256' },
            content: [
              {
                type: 'text',
                text: 'Updated src/index.ts\n@@ -1 +1 @@\n-export const limit = 128;\n+export const limit = 256;',
              },
            ],
            metadata: {},
          },
        },
        {
          type: 'text',
          text: `${markdown.repeat(heavy ? 5 : 1)}\nIteration ${turn + 1}: retain bounded memory and preserve backpressure.`,
          time: { start: at + 40, end: at + 4000 },
        },
      ];
      messages.push({
        id: `msg_ocrbench_${project}_${thread}_${turn}_a`,
        type: 'assistant',
        agent: 'build',
        model,
        time: { created: at + 1, completed: at + 4000 },
        content,
      });
    }
    // Put valid image attachments on selected user messages; data stays in the service.
    for (let i = 0; heavy && i < messages.length; i += 100) {
      const message = messages[i] as Record<string, unknown>;
      message.files = [image];
    }
    if (heavy)
      messages.splice(
        messages.length - 8,
        0,
        checkpoint(messages as { id: string; time: { created: number } }[]),
      );
    const body = { info, messages, location: template.location };
    payloadBytes += JSON.stringify(body).length;
    await client.session.import(body as Parameters<typeof client.session.import>[0]);
    await client.session.remove({ sessionID: template.id });
    if (heavy) heavyID = info.id;
  }
}
const fixture = {
  schemaVersion: 5,
  sessionID: heavyID,
  projects,
  messages: 1501,
  sessions: 39,
  payloadBytes,
  service: url,
  modelCalls: 0,
  created: new Date().toISOString(),
};
await client.session.update({ sessionID: heavyID, title: 'Heavy architecture review — 750 turns' });
writeFileSync(`${root}/fixture.json`, JSON.stringify(fixture, null, 2));
console.log(fixture);
