import { remoteSessionSchema } from '@opencodex/contracts/remote';

/** True in a browser that reached the gateway through remote access, not on this computer. */
export const remoteClient =
  typeof window !== 'undefined' &&
  !window.desktop &&
  !['127.0.0.1', 'localhost', '[::1]'].includes(location.hostname);

let reloading = false;

/** A revoked device reloads into the pairing screen. */
export function requirePairing() {
  if (!remoteClient || reloading) return;
  reloading = true;
  location.reload();
}

export async function remotePaired() {
  const response = await fetch('/api/remote/session', { signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new Error('The remote session could not be checked.');
  return remoteSessionSchema.parse(await response.json()).paired;
}
