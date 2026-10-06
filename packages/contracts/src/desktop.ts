// Only native capabilities cross IPC. Agent data always uses the gateway API.
export interface DesktopBridge {
  getFullscreen(): Promise<boolean>;
  onFullscreenChanged(callback: (fullscreen: boolean) => void): () => void;
  selectDirectory(): Promise<string | null>;
  getPreferences(): Promise<DesktopPreferences>;
  setPreference(key: PreferenceKey, value: string | null): Promise<void>;
  listOpenApps(): Promise<OpenApp[]>;
  openInApp(directory: string, appID: OpenAppID): Promise<void>;
  revealFile(path: string): Promise<void>;
  getUpdateState(): Promise<DesktopUpdateState>;
  onUpdateStateChanged(callback: (state: DesktopUpdateState) => void): () => void;
  checkForUpdates(): Promise<void>;
  downloadUpdate(): Promise<void>;
  installUpdate(): Promise<void>;
  /** A browser panel page asked for a new tab (a popup or "Open link in new tab"). */
  onBrowserOpenTab(callback: (request: BrowserOpenTabRequest) => void): () => void;
  /** Loads a local HTML file in a sandboxed browser guest, not the app's origin. */
  loadBrowserFile(webContentsId: number, url: string): Promise<void>;
  /** Shows the comment overlay in a browser panel page; resolves when it is attached or closed. */
  annotateBrowserPage(
    webContentsId: number,
    theme: BrowserAnnotationTheme,
  ): Promise<BrowserAnnotation | null>;
  cancelBrowserAnnotation(webContentsId: number): Promise<void>;
  platform: string;
}

/** Browser panel pages share one persistent profile, separate from the app's own storage. */
export const browserPartition = 'persist:opencodex-browser';
export const browserFileScheme = 'opencodex-preview';
export type BrowserOpenTabRequest = { webContentsId: number; url: string };
/** CSS values for the overlay drawn inside the page, so it matches the app theme. */
export type BrowserAnnotationTheme = {
  primary: string;
  onPrimary: string;
  surface: string;
  text: string;
  muted: string;
  border: string;
  font: string;
};
/** A page element the user picked. Page-provided text; bounded in size by the overlay. */
export type BrowserAnnotationElement = {
  tag: string;
  selector: string;
  text: string;
  html: string;
};
export type BrowserAnnotation = {
  url: string;
  title: string;
  comment: string;
  elements: BrowserAnnotationElement[];
  regions: number;
  drawings: number;
  /** PNG data URL of the annotated area with its marks, when the capture succeeded. */
  screenshot?: string;
};

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
  | 'focusExcluded'
  | 'sessionWorkbench'
  | 'notifications';
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
    | 'sessionWorkbench'
    | 'notifications'
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
  sessionWorkbench?: string | null;
  notifications?: string | null;
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
  revealFile: 'desktop:reveal-file',
  getUpdateState: 'desktop:get-update-state',
  updateStateChanged: 'desktop:update-state-changed',
  checkForUpdates: 'desktop:check-for-updates',
  downloadUpdate: 'desktop:download-update',
  installUpdate: 'desktop:install-update',
  browserOpenTab: 'desktop:browser-open-tab',
  loadBrowserFile: 'desktop:load-browser-file',
  annotateBrowserPage: 'desktop:annotate-browser-page',
  cancelBrowserAnnotation: 'desktop:cancel-browser-annotation',
} as const;
