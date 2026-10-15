import { readdir, realpath, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { basename, isAbsolute, join } from 'node:path';
import type { FolderList, Project } from '@opencodex/contracts';
import { GatewayError } from './errors';

const MAX_FOLDERS = 5000;

function expandHome(input: string) {
  return input === '~'
    ? homedir()
    : input.startsWith('~/')
      ? join(homedir(), input.slice(2))
      : input;
}

export async function resolveProject(input: string): Promise<Project> {
  const directory = expandHome(input);
  if (!isAbsolute(directory)) throw new GatewayError('Enter an absolute directory path.', 400);
  try {
    const canonical = await realpath(directory);
    if (!(await stat(canonical)).isDirectory()) {
      throw new GatewayError('Choose a directory, not a file.', 400);
    }
    return { directory: canonical, name: basename(canonical) || canonical };
  } catch (error) {
    if (error instanceof GatewayError) throw error;
    throw new GatewayError(
      'That directory could not be opened on the machine running OpenCodex.',
      400,
    );
  }
}

/**
 * Lists one folder's subfolders, never descending further: reading a folder is the user's
 * explicit step, so protected folders (macOS Documents, Desktop) are only read when typed into.
 */
export async function listFolders(input: string): Promise<FolderList> {
  const directory = expandHome(input);
  if (!isAbsolute(directory)) throw new GatewayError('Enter an absolute directory path.', 400);
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'EACCES' || code === 'EPERM')
      throw new GatewayError('OpenCodex is not allowed to read this folder.', 403);
    if (code === 'ENOENT' || code === 'ENOTDIR')
      throw new GatewayError('There is no folder at this path.', 404);
    throw new GatewayError('This folder could not be read.', 400);
  }
  const folders: string[] = [];
  const links: string[] = [];
  for (const entry of entries) {
    if (entry.isDirectory()) folders.push(entry.name);
    else if (entry.isSymbolicLink()) links.push(entry.name);
  }
  // Symlinks are rare in folder listings; only these need a stat to know their target.
  const linked = await Promise.all(
    links
      .slice(0, MAX_FOLDERS)
      .map(async (name) =>
        (await stat(join(directory, name)).catch(() => undefined))?.isDirectory()
          ? name
          : undefined,
      ),
  );
  for (const name of linked) if (name) folders.push(name);
  folders.sort((a, b) => a.localeCompare(b));
  return { folders: folders.slice(0, MAX_FOLDERS) };
}
