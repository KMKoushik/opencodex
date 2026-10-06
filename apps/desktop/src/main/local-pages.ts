import { randomUUID } from 'node:crypto';
import { realpath, stat } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { browserFileScheme } from '@opencodex/contracts/desktop';

/** Ephemeral, per-guest directory grants. Pages never receive a raw filesystem origin. */
export function createLocalPages() {
  const scopes = new Map<string, { guest: number; directory: string }>();
  return {
    async grant(guest: number, value: string) {
      const url = new URL(value);
      if (url.protocol !== 'file:' || (url.hostname && url.hostname !== 'localhost'))
        throw new Error('Choose a local HTML file.');
      const path = await realpath(fileURLToPath(url));
      if (!/\.html?$/i.test(path) || !(await stat(path)).isFile())
        throw new Error('Choose a local HTML file.');
      const directory = dirname(path);
      let token = [...scopes].find(
        ([, scope]) => scope.guest === guest && scope.directory === directory,
      )?.[0];
      if (!token) {
        // Bound native history grants as well as the renderer's live pages and tabs.
        const owned = [...scopes].filter(([, scope]) => scope.guest === guest);
        if (owned.length >= 12) scopes.delete(owned[0]![0]);
        token = randomUUID();
        scopes.set(token, { guest, directory });
      }
      return `${browserFileScheme}://${token}/${encodeURIComponent(relative(directory, path))}${url.search}${url.hash}`;
    },
    owns(guest: number, value: string) {
      try {
        const url = new URL(value);
        return (
          url.protocol === `${browserFileScheme}:` && scopes.get(url.hostname)?.guest === guest
        );
      } catch {
        return false;
      }
    },
    displayURL(value: string) {
      const url = new URL(value);
      const scope = scopes.get(url.hostname);
      if (!scope || url.protocol !== `${browserFileScheme}:`) return value;
      return new URL(
        url.pathname.slice(1) + url.search + url.hash,
        pathToFileURL(`${scope.directory}${sep}`),
      ).href;
    },
    async path(value: string) {
      const url = new URL(value);
      const scope = url.protocol === `${browserFileScheme}:` ? scopes.get(url.hostname) : undefined;
      if (!scope) throw new Error('This local preview has closed.');
      const input = decodeURIComponent(url.pathname).slice(1);
      if (input.includes('\0') || input.includes('\\')) throw new Error('Invalid preview path.');
      const path = await realpath(resolve(scope.directory, input));
      const child = relative(scope.directory, path);
      if (
        !child ||
        child === '..' ||
        child.startsWith(`..${sep}`) ||
        isAbsolute(child) ||
        !(await stat(path)).isFile()
      )
        throw new Error('Choose a file within the preview folder.');
      return path;
    },
    release(guest: number) {
      for (const [token, scope] of scopes) if (scope.guest === guest) scopes.delete(token);
    },
  };
}
