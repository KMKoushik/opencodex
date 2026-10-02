import Store from 'electron-store';
import { z } from 'zod';
import type { DesktopPreferences, PreferenceKey } from '@opencodex/contracts/desktop';

export const preferenceInputSchema = z.object({
  key: z.enum([
    'project',
    'projects',
    'theme',
    'openInApp',
    'terminalPlacement',
    'projectModels',
    'modelUsage',
  ]),
  value: z.string().max(16_384).nullable(),
});

export function createPreferences() {
  // Keep the existing filename and value shapes so saved preferences load in place.
  // Construct after app.whenReady(), when Electron's userData path is available.
  const store = new Store<DesktopPreferences>({
    name: 'preferences',
    defaults: { project: null, projects: null, theme: null },
    schema: {
      project: { type: ['string', 'null'] },
      projects: { type: ['string', 'null'] },
      theme: { type: ['string', 'null'] },
      openInApp: { type: ['string', 'null'] },
      terminalPlacement: { enum: ['bottom', 'right', null] },
      projectModels: { type: ['string', 'null'] },
      modelUsage: { type: ['string', 'null'] },
    },
    accessPropertiesByDotNotation: false,
    clearInvalidConfig: true,
    configFileMode: 0o600,
  });
  return {
    get: () => store.store,
    set(key: PreferenceKey, value: string | null) {
      store.set(key, value);
    },
  };
}
