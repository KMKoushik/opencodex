// Run Playwright's CDP WebSocket transport on Node (Bun's ws compatibility can
// stall Electron's inspector/DevTools handshake). App services remain isolated.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const result = spawnSync(
  'node',
  [fileURLToPath(new URL('./driver.mjs', import.meta.url)), ...process.argv.slice(2)],
  { stdio: 'inherit' },
);
if (result.error) throw result.error;
process.exit(result.status ?? 1);
