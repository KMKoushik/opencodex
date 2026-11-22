import { readFileSync, writeFileSync, renameSync } from 'node:fs';
import { OpenCode } from '../../../../packages/gateway/node_modules/@opencode/client/dist/promise/index.js';
import { Service } from '../../../../packages/gateway/node_modules/@opencode/client/dist/promise/service.js';
import { base, fixture, command, now } from './environment.mjs';
export async function api(path, body, method = 'POST') {
  const response = await fetch(base + '/api' + path, {
    signal: AbortSignal.timeout(15000),
    ...(body === undefined
      ? {}
      : { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
  });
  if (!response.ok) throw new Error(`${path}: ${response.status} ${await response.text()}`);
  return response.json();
}
export async function seed() {
  command('bun', ['apps/rune/tools/parity-fixture.ts']);
  const sessions = JSON.parse(readFileSync(fixture + '/sessions.json'));
  // Native import/form APIs are intentionally the same exception as parity-fixture.ts.
  // No prompt route or model call is used anywhere in this sweep.
  const endpoint = await Service.discover();
  if (!endpoint || new URL(endpoint.url).port !== '4977')
    throw new Error('Refusing non-sweep OpenCode');
  const client = OpenCode.make({ baseUrl: endpoint.url, headers: Service.headers(endpoint) });
  if (!(await client.session.form.list({ sessionID: 'ses_parity_2' })).length)
    await client.session.form.create({
      sessionID: 'ses_parity_2',
      title: 'Release configuration',
      fields: [
        {
          key: 'target',
          title: 'Which deployment target?',
          type: 'string',
          required: true,
          custom: true,
          options: [
            { value: 'local', label: 'Local', description: 'Run on this machine' },
            { value: 'staging', label: 'Staging', description: 'Test before production' },
            { value: 'production', label: 'Production' },
          ],
        },
      ],
    });
  if (!(await client.permission.list({ sessionID: 'ses_parity_7' })).length)
    await client.permission.create({
      sessionID: 'ses_parity_7',
      action: 'read',
      resources: [fixture + '/outside.txt'],
      save: [fixture + '/outside.txt'],
    });
  const parent = await api('/sessions/ses_parity_5');
  const child = {
    info: {
      ...parent,
      id: 'ses_sweep_child',
      parentID: parent.id,
      title: 'Explore source',
      time: { created: now - 110000, updated: now - 100000 },
    },
    location: parent.location,
    messages: [
      {
        id: 'msg_sweep_child_1',
        type: 'user',
        text: 'Inspect the source.',
        time: { created: now - 110000 },
      },
      {
        id: 'msg_sweep_child_2',
        type: 'assistant',
        agent: 'explore',
        model: parent.model,
        text: 'The source exports add and multiply.',
        content: [{ type: 'text', text: 'The source exports add and multiply.' }],
        time: { created: now - 109000, completed: now - 100000 },
      },
    ],
  };
  if (!(await fetch(base + '/api/sessions/ses_sweep_child')).ok)
    command(fixture + '/pkg/node_modules/.bin/opencode', [
      'api',
      'post',
      '/api/experimental/session/import',
      '--data',
      JSON.stringify(child),
    ]);
  const sides = await api('/sessions/ses_parity_0/side-chats');
  const side = sides[0] ?? (await api('/sessions/ses_parity_0/side-chats', {}));
  const canvases = await api('/canvases');
  const canvas =
    canvases[0] ??
    (await api('/canvases', {
      title: 'Release dashboard',
      sessionID: 'ses_parity_0',
      icon: { glyph: 'chart', color: 'blue' },
    }));
  writeFileSync(
    canvas.path + '/index.html',
    '<!doctype html><h1>Release dashboard</h1><p id="status">Two checks passed.</p>',
  );
  writeFileSync(
    canvas.path + '/server.ts',
    'export async function refresh() { return { passed: 2 }; }\n',
  );
  // Tasks requires its real native plugin, not a fabricated HTTP response.
  await api('/tasks/plugin', {}, 'PUT');
  for (let attempt = 0; attempt < 40; attempt++) {
    if ((await fetch(base + '/api/tasks')).ok) break;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  if (!(await api('/tasks')).length)
    await api('/tasks', { title: 'Review the API changes', bucket: 'today', assignee: 'user' });
  const projects = await api('/projects');
  const project = projects.find((p) => p.canonical.endsWith('/atlas-api'));
  const result = { sessions, projects, project, side, canvas, child: child.info };
  writeFileSync(fixture + '/extras.json', JSON.stringify(result, null, 2));
  return result;
}

// Empty-state names mean genuinely empty data, not a populated-page substitute.
// Mutate before the pair, restore after it; both clients see the same gateway snapshot.
export async function beginState(state, extras) {
  if (state === 'tasks-empty') {
    const tasks = await api('/tasks');
    for (const task of tasks) await api('/tasks/' + task.id, {}, 'DELETE');
    return async () => {
      for (const task of tasks)
        await api('/tasks', {
          title: task.title,
          notes: task.notes,
          bucket: task.bucket,
          assignee: task.assignee,
        });
    };
  }
  if (state !== 'apps-empty') return async () => {};
  const path = extras.canvas.path + '/server.ts';
  renameSync(path, path + '.sweep-held');
  const restore = async () => {
    renameSync(path + '.sweep-held', path);
    for (let attempt = 0; attempt < 40; attempt++) {
      if ((await api('/apps')).length) return;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error('App fixture did not reappear after empty capture');
  };
  try {
    for (let attempt = 0; attempt < 40; attempt++) {
      if (!(await api('/apps')).length) return restore;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error('App fixture did not disappear for empty capture');
  } catch (error) {
    await restore();
    throw error;
  }
}
