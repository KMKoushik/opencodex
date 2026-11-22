// Complete authored permission requests through the real isolated gateway once.
// Run only after the initial matrix is recorded; marks select before/after replay snapshots.
import { readFileSync, writeFileSync } from 'node:fs';
const root = '/tmp/ocr-pc-composer2';
const base = 'http://127.0.0.1:4503/api';
const matrix = JSON.parse(readFileSync(`${root}/matrix.json`, 'utf8'));
const started = JSON.parse(readFileSync(`${root}/recording.jsonl`, 'utf8').split('\n')[0]).started;
const marks = { before: Date.now() - started };
writeFileSync(`${root}/marks.json`, JSON.stringify(marks, null, 2));
const abort = new AbortController();
const stream = await fetch(`${base}/events`, { signal: abort.signal });
const drain = (async () => {
  try {
    for await (const chunk of stream.body) void chunk;
  } catch (error) {
    if (!abort.signal.aborted) throw error;
  }
})();
async function api(path, body) {
  const response = await fetch(
    base + path,
    body === undefined
      ? {}
      : {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        },
  );
  if (!response.ok) throw new Error(`${path}: ${response.status} ${await response.text()}`);
  return response.json();
}
for (const decision of ['once', 'reject', 'full', 'always']) {
  const id = matrix[`permission-${decision}`].id;
  const requests = await api(`/sessions/${id}/permissions`);
  if (!requests.length) throw new Error(`No pending request for ${decision}`);
  if (decision === 'full') await api(`/sessions/${id}/access`, { mode: 'full' });
  else await api(`/sessions/${id}/permissions/${requests[0].id}`, { decision });
  const remaining = await api(`/sessions/${id}/permissions`);
  if (remaining.length) throw new Error(`Request did not complete for ${decision}`);
  await api(`/sessions/${id}`);
  console.log('Recorded real permission result:', decision);
}
marks.after = Date.now() - started;
writeFileSync(`${root}/marks.json`, JSON.stringify(marks, null, 2));
abort.abort();
await drain;
