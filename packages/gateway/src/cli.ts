import { fileURLToPath } from 'node:url';
import { startGateway } from './server';

const port = Number(process.env.PORT ?? 4310);
if (!Number.isInteger(port) || port < 1 || port > 65535)
  throw new Error('PORT must be between 1 and 65535.');
const gateway = await startGateway({
  port,
  assets: process.argv.includes('--production')
    ? fileURLToPath(new URL('../../../apps/web/dist/', import.meta.url))
    : undefined,
});
console.log(`OpenCodex gateway: ${gateway.url}`);
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    void gateway.close().then(() => process.exit(0));
  });
}
