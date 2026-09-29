import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { z } from 'zod';
import type { DesktopPreferences, PreferenceKey } from '@opencodex/contracts/desktop';

const preferencesSchema = z.object({
  project: z.string().nullable(),
  theme: z.string().nullable(),
});
export const preferenceInputSchema = z.object({
  key: z.enum(['project', 'theme']),
  value: z.string().max(16_384).nullable(),
});

export async function createPreferences(file: string) {
  let state: DesktopPreferences = { project: null, theme: null };
  try {
    state = preferencesSchema.parse(JSON.parse(await readFile(file, 'utf8')));
  } catch {
    // Missing or invalid preferences should not prevent the workspace from opening.
  }
  let pending = Promise.resolve();
  return {
    get: () => ({ ...state }),
    set(key: PreferenceKey, value: string | null) {
      state = { ...state, [key]: value };
      const snapshot = JSON.stringify(state);
      // Serialize atomic replacements so rapid preference changes cannot finish out of order.
      pending = pending
        .catch(() => {})
        .then(async () => {
          await mkdir(dirname(file), { recursive: true });
          await writeFile(`${file}.tmp`, snapshot, { mode: 0o600 });
          await rename(`${file}.tmp`, file);
        });
      return pending;
    },
    flush: () => pending,
  };
}
