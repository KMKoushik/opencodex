import { constants } from 'node:fs';
import { open, realpath } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { GatewayError } from './errors';

/** Read-only fallback for host capabilities absent from the native V2 file API. */
export async function localFile(directory: string, path: string) {
  if (!isAbsolute(directory)) throw new GatewayError('Choose an absolute directory.', 400);
  try {
    const root = await realpath(directory);
    const canonical = await realpath(resolve(root, path));
    const child = relative(root, canonical);
    if (!child || isAbsolute(child) || child === '..' || child.startsWith(`..${sep}`))
      throw new GatewayError('Choose a file within the project.', 403);
    // Do not follow a leaf symlink swapped in after canonicalization, or block on a FIFO.
    const file = await open(
      canonical,
      constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
    );
    try {
      const info = await file.stat();
      if (!info.isFile()) throw new GatewayError('Choose a regular file.', 400);
      return { file, info, path: canonical };
    } catch (error) {
      await file.close();
      throw error;
    }
  } catch (error) {
    if (error instanceof GatewayError) throw error;
    throw new GatewayError('This file could not be opened on the machine running OpenCodex.', 404);
  }
}
