// Author request definitions through OpenCode's native API, then record the real
// gateway HTTP/SSE lifecycle with composer-replay.mjs. No application data mocking.
import { readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { OpenCode } from '../../../packages/gateway/node_modules/@opencode/client/dist/promise/index.js';
import { Service } from '../../../packages/gateway/node_modules/@opencode/client/dist/promise/service.js';
const root = '/tmp/ocr-pc-composer2';
if (process.env.HOME !== `${root}/home`) throw new Error('Isolated HOME required');
const endpoint = await Service.discover();
if (!endpoint || new URL(endpoint.url).port !== '4972')
  throw new Error('Isolated service 4972 required');
const client = OpenCode.make({ baseUrl: endpoint.url, headers: Service.headers(endpoint) });
const directory = realpathSync(`${root}/proj`);
const base = 'http://127.0.0.1:4503/api';
const sessions = process.argv.includes('--requests-only')
  ? JSON.parse(readFileSync(`${root}/matrix.json`, 'utf8'))
  : {};
for (const session of Object.values(sessions)) {
  const info = await client.session.get({ sessionID: session.id });
  if (info.location.directory !== directory)
    await client.session.move({ sessionID: session.id, directory });
}
const choice = [
  { value: 'local', label: 'Local', description: 'Run on this machine' },
  { value: 'staging', label: 'Staging', description: 'Test before production' },
  { value: 'production', label: 'Production' },
];
const fields = {
  single: [
    {
      key: 'target',
      title: 'Which deployment target?',
      type: 'string',
      required: true,
      options: choice,
      custom: true,
    },
  ],
  multi: [
    {
      key: 'targets',
      title: 'Which targets should we test?',
      type: 'multiselect',
      required: true,
      options: choice,
      custom: true,
      minItems: 1,
      maxItems: 3,
    },
  ],
  text: [
    {
      key: 'name',
      title: 'Release name',
      type: 'string',
      required: true,
      minLength: 3,
      maxLength: 20,
      pattern: '[A-Za-z]+',
    },
  ],
  email: [
    { key: 'email', title: 'Contact email', type: 'string', required: true, format: 'email' },
  ],
  uri: [{ key: 'url', title: 'Release URL', type: 'string', required: true, format: 'uri' }],
  date: [{ key: 'date', title: 'Release date', type: 'string', required: true, format: 'date' }],
  datetime: [
    { key: 'time', title: 'Release time', type: 'string', required: true, format: 'date-time' },
  ],
  number: [
    {
      key: 'ratio',
      title: 'Rollout percentage',
      type: 'number',
      minimum: 0,
      maximum: 100,
      required: true,
    },
  ],
  integer: [
    {
      key: 'count',
      title: 'Replica count',
      type: 'integer',
      minimum: 1,
      maximum: 10,
      required: true,
    },
  ],
  boolean: [{ key: 'confirm', title: 'Deploy now?', type: 'boolean', required: true }],
  external: [
    {
      key: 'link',
      title: 'Read release notes',
      type: 'external',
      url: 'https://example.com/release',
    },
  ],
  conditional: [
    { key: 'enabled', title: 'Enable deployment?', type: 'boolean', required: true },
    {
      key: 'target',
      title: 'Choose deployment target',
      type: 'string',
      options: choice,
      required: true,
      when: [{ key: 'enabled', op: 'eq', value: true }],
    },
  ],
};
for (const [name, definition] of Object.entries(fields)) {
  if (sessions[name] && (await client.session.form.list({ sessionID: sessions[name].id })).length)
    continue;
  const session =
    sessions[name] ??
    (await client.session.create({ location: { directory }, title: `Question · ${name}` }));
  const form = await client.session.form.create({
    sessionID: session.id,
    title: 'Release configuration',
    fields: definition,
  });
  sessions[name] = { id: session.id, form: form.id };
  const response = await fetch(`${base}/sessions/${session.id}/forms`);
  if (!response.ok) throw new Error(await response.text());
  console.log(name, session.id, await response.text());
}
for (const name of [
  'permission-once',
  'permission-always',
  'permission-reject',
  'permission-full',
]) {
  const session =
    sessions[name] ?? (await client.session.create({ location: { directory }, title: name }));
  await client.session.update({
    sessionID: session.id,
    title: name,
    permissions: [{ action: 'read', resource: '*', effect: 'ask' }],
  });
  // create resolves after a reply; let it stay pending while the real gateway lists it.
  if (!(await client.permission.list({ sessionID: session.id })).length)
    console.log(
      name,
      await client.permission.create({
        sessionID: session.id,
        action: 'read',
        resources: [`${directory}/permission-${name}.txt`],
        save: [`${directory}/permission-${name}.txt`],
      }),
    );
  sessions[name] = { id: session.id };
}
{
  const session =
    sessions.background ??
    (await client.session.create({ location: { directory }, title: 'Background work' }));
  const shells = await client.shell.list({ location: { directory } });
  if (!shells.data.some((s) => s.status === 'running' && s.metadata.sessionID === session.id)) {
    const shell = await client.shell.create({
      location: { directory },
      command: 'echo Composer-background-output; sleep 3600',
      cwd: directory,
      metadata: { sessionID: session.id },
    });
    sessions.background = { id: session.id, shell: shell.data.id };
  }
}
writeFileSync(`${root}/matrix.json`, JSON.stringify(sessions, null, 2));
console.log('Fixture ready; definitions are authored, lifecycle events are real.');
