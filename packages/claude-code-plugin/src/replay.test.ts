import { createServer, type Socket } from 'node:net';
import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setImmediate } from 'node:timers/promises';
import { once } from 'node:events';
import { expect, it } from 'vitest';
import { createClaudeCode } from '@khalilgharbaoui/opencode-claude-code-plugin';

// Exercise the pinned provider's real subprocess reader and replay path. The
// fixture speaks Claude's protocol but never contacts a model or reads credentials.
it('ignores detached housekeeping while preserving and labeling genuine late text', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'opencodex-replay-'));
  const server = createServer();
  let control: Socket | undefined;
  try {
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Missing fixture port');
    const connected = once(server, 'connection');
    const cliPath = join(cwd, 'claude.cjs');
    await writeFile(
      cliPath,
      `#!/usr/bin/env node
const { createInterface } = require('node:readline');
const { connect } = require('node:net');
if (process.argv.includes('--version') || process.argv.includes('--help')) {
  console.log('2.1.289'); process.exit(0);
}
const control = connect(${address.port}, '127.0.0.1');
control.on('end', () => process.exit(0));
createInterface({ input: control }).on('line', line => {
  const frames = JSON.parse(line);
  process.stdout.write(frames.map(frame => JSON.stringify(frame) + '\\n').join(''), () => control.write('flushed\\n'));
});
let turn = 0;
createInterface({ input: process.stdin }).on('line', line => {
  if (JSON.parse(line).type !== 'user') return;
  turn++;
  console.log(JSON.stringify({type:'assistant',session_id:'fixture',message:{role:'assistant',content:[{type:'text',text:'Answer ' + turn}]}}));
  console.log(JSON.stringify({type:'result',subtype:'success',session_id:'fixture'}));
});
`,
    );
    await chmod(cliPath, 0o755);
    const model = createClaudeCode({
      cliPath,
      cwd,
      proxyTools: [],
      bridgeOpencodeMcp: false,
      proxyOpencodeMcpTools: false,
      resumeAfterRestart: false,
      logging: { file: false },
    }).languageModel('claude-replay-fixture');
    type Options = Parameters<typeof model.doStream>[0];
    const prompt: Options['prompt'] = [];
    async function turn(number: number) {
      prompt.push({ role: 'user', content: [{ type: 'text', text: `Question ${number}` }] });
      const { stream } = await model.doStream({
        prompt,
        tools: [
          {
            type: 'function',
            name: 'shell',
            description: 'Test',
            inputSchema: { type: 'object', properties: {} },
          },
        ],
      });
      const parts = [];
      const reader = stream.getReader();
      try {
        while (true) {
          const next = await reader.read();
          if (next.done) break;
          parts.push(next.value);
        }
      } finally {
        reader.releaseLock();
      }
      prompt.push({ role: 'assistant', content: [{ type: 'text', text: `Answer ${number}` }] });
      return parts;
    }
    const first = turn(1);
    [control] = (await connected) as [Socket];
    await first;
    async function emit(frames: unknown[]) {
      const flushed = once(control!, 'data');
      control!.write(`${JSON.stringify(frames)}\n`);
      await flushed;
      // Drain the ready stdout I/O after the fixture acknowledges its write.
      await setImmediate();
    }
    await emit([
      { type: 'system', subtype: 'turn_duration', duration_ms: 3 },
      { type: 'tool_progress', tool_use_id: 'old-call', elapsed_time_seconds: 1 },
      { type: 'rate_limit_event', rate_limit_info: { status: 'allowed' } },
      { type: 'stream_event', event: { type: 'content_block_stop', index: 0 } },
      { type: 'result', subtype: 'success', session_id: 'fixture' },
    ]);
    const housekeeping = await turn(2);
    expect(
      housekeeping
        .filter((part) => part.type === 'text-delta')
        .map((part) => part.delta)
        .join(''),
    ).toBe('Answer 2');
    expect(housekeeping.filter((part) => part.type === 'text-start')).toHaveLength(1);

    await emit([
      { type: 'system', subtype: 'turn_duration' },
      {
        type: 'stream_event',
        event: { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Late ' } },
      },
      {
        type: 'stream_event',
        event: { type: 'content_block_delta', delta: { type: 'text_delta', text: 'reply' } },
      },
      { type: 'assistant', message: { content: [{ type: 'text', text: 'Late reply' }] } },
    ]);
    const late = await turn(3);
    const text = late
      .filter((part) => part.type === 'text-delta')
      .map((part) => part.delta)
      .join('');
    expect(text.match(/between turns/g)).toHaveLength(1);
    expect(text.match(/Late reply/g)).toHaveLength(1);
    expect(text).toContain('Answer 3');
    expect(late.filter((part) => part.type === 'text-start')).toHaveLength(2);
    expect(late.filter((part) => part.type === 'text-end')).toHaveLength(2);
    await emit([
      { type: 'result', is_error: true, result: 'Late CLI failure', session_id: 'fixture' },
    ]);
    const failure = await turn(4);
    const failureText = failure
      .filter((part) => part.type === 'text-delta')
      .map((part) => part.delta)
      .join('');
    expect(failureText).toContain('between turns');
    expect(failureText).toContain('Late CLI failure');
    expect(failureText).toContain('Answer 4');
  } finally {
    control?.end();
    server.close();
    await rm(cwd, { recursive: true, force: true });
  }
}, 15_000);
