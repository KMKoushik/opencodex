import { realpath, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { basename, isAbsolute, join } from 'node:path';
import type { Project } from '@opencodex/contracts';
import { GatewayError } from './errors';

export async function resolveProject(input: string): Promise<Project> {
  const directory =
    input === '~' ? homedir() : input.startsWith('~/') ? join(homedir(), input.slice(2)) : input;
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
