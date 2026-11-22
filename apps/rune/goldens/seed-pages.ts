// Real isolated-gateway fixtures for populated page comparisons; no API mocks.
import { writeFile } from 'node:fs/promises';
const base = 'http://127.0.0.1:4491/api';
async function api(path: string, body?: unknown) {
  const response = await fetch(
    base + path,
    body === undefined
      ? undefined
      : {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        },
  );
  if (!response.ok) throw new Error(`${path}: ${response.status} ${await response.text()}`);
  return response.json();
}
const projects = await api('/projects');
const project = projects.find((p: { canonical: string }) => p.canonical.endsWith('/atlas-api'));
if (!project?.canonical.includes('/ocr-parity/')) throw new Error('Not the isolated fixture');
const existing = await api('/tasks');
for (const task of [
  {
    title: 'Review the API changes',
    notes: 'Check error handling and document the new endpoints.',
    bucket: 'today',
    project: { id: project.id, directory: project.canonical },
  },
  {
    title: 'Add request validation',
    notes: 'Cover the public endpoints before the next release.',
    bucket: 'today',
    assignee: 'agent',
    project: { id: project.id, directory: project.canonical },
  },
  { title: 'Plan the release', bucket: 'week' },
  { title: 'Explore caching strategies', bucket: 'someday', assignee: 'agent' },
  { title: 'Update project instructions', bucket: 'today' },
]) {
  if (!existing.some((t: { title: string }) => t.title === task.title)) await api('/tasks', task);
}
let canvas = (await api('/canvases')).find(
  (c: { title: string }) => c.title === 'Release dashboard',
);
canvas ??= await api('/canvases', {
  title: 'Release dashboard',
  icon: { glyph: 'rocket', color: 'blue' },
});
if (!canvas.path?.startsWith('/tmp/ocr-parity/')) throw new Error('Canvas is outside the fixture');
await writeFile(
  canvas.path + '/server.ts',
  'export async function refresh() { return { status: "Ready for review", checks: 3 }; }\n',
);
console.log(JSON.stringify({ tasks: await api('/tasks'), canvas }, null, 2));
