/** App-owned desktop capabilities. OpenCode supplies the caller identity, never model input. */
export type DesktopToolCall = {
  sessionID: string;
  method: string;
  input: Record<string, unknown>;
};

export type DesktopToolResult = {
  content: (
    { type: 'text'; text: string } | { type: 'file'; uri: string; mime: string; name?: string }
  )[];
};

export type DesktopToolHandler = (
  call: DesktopToolCall,
  signal: AbortSignal,
) => Promise<DesktopToolResult>;

/** Discovery stays on the host, outside the renderer and model context. */
export type DesktopToolEndpoint = {
  version: 1;
  pid: number;
  label: string;
  url: string;
  token: string;
};

export type ComputerControlStatus = {
  supported: boolean;
  accessibility: boolean;
  screenRecording: boolean;
  message?: string;
};

export type DesktopControlStatus = {
  available: boolean;
  paused: boolean;
  label: string;
  computer: ComputerControlStatus;
  extension: { connected: boolean; name?: string };
  message?: string;
};

/** UI operations contain no general-purpose execution or plugin credential access. */
export interface DesktopToolsBridge {
  status(): Promise<DesktopControlStatus>;
  copyExtensionPairing(): Promise<void>;
  showExtensionFolder(): Promise<void>;
  disconnectExtension(): Promise<void>;
  openPermissionSettings(kind: 'accessibility' | 'screenRecording'): Promise<void>;
  requestPermissions(kind: 'accessibility' | 'screenRecording'): Promise<void>;
  stop(): Promise<void>;
  resume(): Promise<void>;
}

export const desktopToolChannels = {
  status: 'desktop-tools:status',
  copyExtensionPairing: 'desktop-tools:copy-extension-pairing',
  showExtensionFolder: 'desktop-tools:show-extension-folder',
  disconnectExtension: 'desktop-tools:disconnect-extension',
  openPermissionSettings: 'desktop-tools:open-permission-settings',
  requestPermissions: 'desktop-tools:request-permissions',
  stop: 'desktop-tools:stop',
  resume: 'desktop-tools:resume',
} as const;
