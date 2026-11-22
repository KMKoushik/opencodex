import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';

// Dispatch before importing the gateway: children must not start listeners or schedulers.
if (process.argv[2] === '--canvas-host' && process.send) {
  await import('../../canvas/src/server-host');
} else {
  const { values } = parseArgs({
    options: {
      port: { type: 'string' },
      assets: { type: 'string' },
      production: { type: 'boolean' },
      'parent-stdin': { type: 'boolean' },
    },
    strict: true,
  });
  const port = Number(values.port ?? process.env.PORT ?? 4310);
  if (!Number.isInteger(port) || port < 0 || port > 65535)
    throw new Error('Port must be between 0 and 65535.');
  const { startGateway } = await import('./server');
  const gateway = await startGateway({
    port,
    assets: values.assets
      ? resolve(values.assets)
      : values.production && process.env.OPENCODEX_COMPILED !== '1'
        ? fileURLToPath(new URL('../../../apps/web/dist/', import.meta.url))
        : undefined,
  });
  let closing = false;
  const close = () => {
    if (closing) return;
    closing = true;
    const timeout = setTimeout(() => process.exit(1), 10_000);
    timeout.unref();
    void gateway.close().then(
      () => process.exit(0),
      (error: unknown) => {
        console.error(error);
        process.exit(1);
      },
    );
  };
  for (const signal of ['SIGINT', 'SIGTERM'] as const) process.once(signal, close);
  if (values['parent-stdin']) {
    process.stdin.once('end', close);
    process.stdin.once('close', close);
    process.stdin.once('error', close);
    process.stdin.resume();
  }
  console.log(`OPENCODEX_GATEWAY_READY ${JSON.stringify({ url: gateway.url })}`);
}
