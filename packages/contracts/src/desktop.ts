// Only native capabilities cross IPC. Agent data always uses the gateway API.
export interface DesktopBridge {
  selectDirectory(): Promise<string | null>;
  getPreferences(): Promise<DesktopPreferences>;
  setPreference(key: PreferenceKey, value: string | null): Promise<void>;
  platform: string;
}

export type PreferenceKey = 'project' | 'theme';
export type DesktopPreferences = { project: string | null; theme: string | null };

export const desktopChannels = {
  selectDirectory: 'desktop:select-directory',
  getPreferences: 'desktop:get-preferences',
  setPreference: 'desktop:set-preference',
} as const;
