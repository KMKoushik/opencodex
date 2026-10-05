// Only native capabilities cross IPC. Agent data always uses the gateway API.
export interface DesktopBridge {
  getFullscreen(): Promise<boolean>;
  onFullscreenChanged(callback: (fullscreen: boolean) => void): () => void;
  selectDirectory(): Promise<string | null>;
  getPreferences(): Promise<DesktopPreferences>;
  setPreference(key: PreferenceKey, value: string | null): Promise<void>;
  listOpenApps(): Promise<OpenApp[]>;
  openInApp(directory: string, appID: OpenAppID): Promise<void>;
  getUpdateState(): Promise<DesktopUpdateState>;
  onUpdateStateChanged(callback: (state: DesktopUpdateState) => void): () => void;
  checkForUpdates(): Promise<void>;
  downloadUpdate(): Promise<void>;
  installUpdate(): Promise<void>;
  platform: string;
}

export type DesktopUpdateState = {
  status:
    | 'disabled'
    | 'idle'
    | 'up-to-date'
    | 'checking'
    | 'available'
    | 'downloading'
    | 'ready'
    | 'installing'
    | 'error';
  currentVersion: string;
  version?: string;
  percent?: number;
  error?: string;
  disabledReason?: string;
};

export type PreferenceKey =
  | 'project'
  | 'projects'
  | 'theme'
  | 'openInApp'
  | 'terminalPlacement'
  | 'sessionCardVisible'
  | 'projectModels'
  | 'modelUsage'
  | 'modelVariants'
  | 'chatFontSize'
  | 'threadView'
  | 'pinnedThreads'
  | 'focusExcluded';
export type DesktopPreferences = Record<
  Exclude<
    PreferenceKey,
    | 'openInApp'
    | 'terminalPlacement'
    | 'sessionCardVisible'
    | 'projectModels'
    | 'modelUsage'
    | 'modelVariants'
    | 'chatFontSize'
    | 'threadView'
    | 'pinnedThreads'
    | 'focusExcluded'
  >,
  string | null
> & {
  openInApp?: string | null;
  terminalPlacement?: string | null;
  sessionCardVisible?: string | null;
  projectModels?: string | null;
  modelUsage?: string | null;
  modelVariants?: string | null;
  chatFontSize?: string | null;
  threadView?: string | null;
  pinnedThreads?: string | null;
  focusExcluded?: string | null;
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
  getFullscreen: 'desktop:get-fullscreen',
  fullscreenChanged: 'desktop:fullscreen-changed',
  selectDirectory: 'desktop:select-directory',
  getPreferences: 'desktop:get-preferences',
  setPreference: 'desktop:set-preference',
  listOpenApps: 'desktop:list-open-apps',
  openInApp: 'desktop:open-in-app',
  getUpdateState: 'desktop:get-update-state',
  updateStateChanged: 'desktop:update-state-changed',
  checkForUpdates: 'desktop:check-for-updates',
  downloadUpdate: 'desktop:download-update',
  installUpdate: 'desktop:install-update',
} as const;
