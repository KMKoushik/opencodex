// Only native capabilities cross IPC. Agent data always uses the gateway API.
export interface DesktopBridge {
  selectDirectory(): Promise<string | null>;
  getPreferences(): Promise<DesktopPreferences>;
  setPreference(key: PreferenceKey, value: string | null): Promise<void>;
  listOpenApps(): Promise<OpenApp[]>;
  openInApp(directory: string, appID: OpenAppID): Promise<void>;
  platform: string;
}

export type PreferenceKey =
  | 'project'
  | 'projects'
  | 'theme'
  | 'openInApp'
  | 'terminalPlacement'
  | 'projectModels'
  | 'modelUsage';
export type DesktopPreferences = Record<
  Exclude<PreferenceKey, 'openInApp' | 'terminalPlacement' | 'projectModels' | 'modelUsage'>,
  string | null
> & {
  openInApp?: string | null;
  terminalPlacement?: string | null;
  projectModels?: string | null;
  modelUsage?: string | null;
};

export const openAppIDs = [
  'finder',
  'terminal',
  'ghostty',
  'cursor',
  'zed',
  'vscode',
  'iterm',
] as const;
export type OpenAppID = (typeof openAppIDs)[number];
export type OpenApp = { id: OpenAppID; label: string; icon?: string };

export const desktopChannels = {
  selectDirectory: 'desktop:select-directory',
  getPreferences: 'desktop:get-preferences',
  setPreference: 'desktop:set-preference',
  listOpenApps: 'desktop:list-open-apps',
  openInApp: 'desktop:open-in-app',
} as const;
