// Test-only recording proxy. Never used by the shipping app or gateway.
// record: node composer-replay.mjs record FILE --upstream http://127.0.0.1:4502 --port 4503
// replay: node composer-replay.mjs replay FILE --upstream http://127.0.0.1:4502 --port 4503 --at MS
// `--at` freezes recorded HTTP state; omit it to advance the recorded event clock.
import http from 'node:http';
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
const [mode, file, ...args] = process.argv.slice(2);
const flag = (name, fallback) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback);
if (!['record', 'replay'].includes(mode) || !file) throw new Error('record|replay FILE required');
const upstream = new URL(flag('--upstream', 'http://127.0.0.1:4502'));
if (upstream.hostname !== '127.0.0.1' || upstream.port !== '4502')
  throw new Error('Only isolated gateway 4502 is allowed');
const port = Number(flag('--port', '4503'));
if (port === 4502 || port === 49374) throw new Error('Unsafe proxy port');
const frozen = args.includes('--at');
const at = Number(flag('--at', 'Infinity'));
const start = args.includes('--append')
  ? JSON.parse(readFileSync(file, 'utf8').split('\n')[0]).started
  : Date.now();
const elapsed = () => Date.now() - start;
const canonical = (method, path, body) => {
  const url = new URL(path, upstream);
  url.searchParams.sort();
  return `${method} ${url.pathname}${url.search} ${body}`;
};
const records =
  mode === 'replay' ? readFileSync(file, 'utf8').trim().split('\n').map(JSON.parse) : [];
if (mode === 'record' && !args.includes('--append')) {
  writeFileSync(
    file,
    `${JSON.stringify({ type: 'header', version: 1, upstream: upstream.href, started: start })}\n`,
  );
}
const save = (record) => appendFileSync(file, `${JSON.stringify(record)}\n`);
const server = http.createServer(async (req, res) => {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const body = Buffer.concat(chunks).toString('utf8');
  const key = canonical(req.method, req.url, body);
  if (mode === 'replay' && req.url.startsWith('/api/')) {
    const cutoff = frozen ? at : elapsed();
    if (req.url.split('?')[0] === '/api/events') {
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' });
      res.flushHeaders();
      if (frozen) {
        const ready = records.find(
          (r) =>
            r.type === 'event' &&
            Buffer.from(r.bytes, 'base64').toString('utf8').startsWith('event: ready\n'),
        );
        if (ready) res.write(Buffer.from(ready.bytes, 'base64'));
      }
      // A frozen snapshot does not replay future invalidations over that snapshot.
      const timers = frozen
        ? []
        : records
            .filter((r) => r.type === 'event' && r.at >= cutoff)
            .map((r) => setTimeout(() => res.write(Buffer.from(r.bytes, 'base64')), r.at - cutoff));
      req.on('close', () => timers.forEach(clearTimeout));
      return;
    }
    const matching = records.filter(
      (r) => r.type === 'http' && r.key === key && (req.method !== 'GET' || r.at <= cutoff),
    );
    let record = matching.at(-1);
    // Cursor requests read a suffix of bytes already recorded at this snapshot.
    // This is not synthesized command output: only retained recorded bytes may
    // satisfy the request; a gap outside that interval still fails explicitly.
    const outputURL = new URL(req.url, upstream);
    if (
      !record &&
      req.method === 'GET' &&
      /^\/api\/shells\/[^/]+\/output$/.test(outputURL.pathname) &&
      outputURL.searchParams.has('cursor')
    ) {
      const cursor = Number(outputURL.searchParams.get('cursor'));
      outputURL.searchParams.delete('cursor');
      const originalKey = canonical('GET', outputURL.pathname + outputURL.search, '');
      const original = records
        .filter((r) => r.type === 'http' && r.key === originalKey && r.at <= cutoff)
        .at(-1);
      if (original?.status === 200) {
        const data = JSON.parse(Buffer.from(original.bytes, 'base64').toString('utf8'));
        const bytes = Buffer.from(data.output, 'utf8');
        const start = data.cursor - bytes.length;
        if (Number.isSafeInteger(cursor) && cursor >= start && cursor <= data.cursor) {
          const suffix = Buffer.from(
            JSON.stringify({ ...data, output: bytes.subarray(cursor - start).toString('utf8') }),
          );
          record = {
            ...original,
            bytes: suffix.toString('base64'),
            headers: { ...original.headers, 'content-length': String(suffix.length) },
          };
        }
      }
    }
    if (!record) {
      res.writeHead(599, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: `No recorded response at ${cutoff}: ${key}` }));
      console.error('MISSING', key);
      return;
    }
    const reply = () => {
      res.writeHead(record.status, record.headers);
      res.end(Buffer.from(record.bytes, 'base64'));
    };
    const delay = req.method !== 'GET' ? Number(flag('--mutation-delay', '0')) : 0;
    if (delay) setTimeout(reply, delay);
    else reply();
    return;
  }
  const request = http.request(
    new URL(req.url, upstream),
    {
      method: req.method,
      headers: {
        ...req.headers,
        host: upstream.host,
        ...(req.headers.origin ? { origin: upstream.origin } : {}),
        ...(req.headers.referer
          ? { referer: new URL(new URL(req.headers.referer).pathname, upstream).href }
          : {}),
      },
    },
    (response) => {
      const headers = { ...response.headers };
      delete headers['transfer-encoding'];
      res.writeHead(response.statusCode, headers);
      const bytes = [];
      const events = req.url.split('?')[0] === '/api/events';
      response.on('data', (chunk) => {
        res.write(chunk);
        if (mode !== 'record' || !req.url.startsWith('/api/')) return;
        if (events) save({ type: 'event', at: elapsed(), bytes: chunk.toString('base64') });
        else bytes.push(chunk);
      });
      response.on('end', () => {
        if (mode === 'record' && req.url.startsWith('/api/') && !events) {
          save({
            type: 'http',
            at: elapsed(),
            key,
            status: response.statusCode,
            headers,
            bytes: Buffer.concat(bytes).toString('base64'),
          });
        }
        res.end();
      });
      res.on('close', () => response.destroy());
    },
  );
  request.on('error', (error) => {
    res.writeHead(502);
    res.end(error.message);
  });
  request.end(body);
});
server.listen(port, '127.0.0.1', () => console.log(`${mode} ${file} on http://127.0.0.1:${port}`));
