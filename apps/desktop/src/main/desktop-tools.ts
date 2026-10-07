import { app, clipboard, shell } from 'electron';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ComputerControlStatus, DesktopToolsBridge } from '@opencodex/contracts/desktop-tools';
import { browserControl } from './browser-control';
import { createComputerControl } from './computer-control';
import { createExtensionControl } from './extension-control';
import { startDesktopToolHost } from './desktop-tool-host';

export async function createDesktopTools(label: string) {
  const computer = createComputerControl();
  const extension = createExtensionControl();
  const host = await startDesktopToolHost({
    label,
    handle: (call, signal) => {
      if (call.method.startsWith('computer.')) return computer.handle(call, signal);
      if (call.input.backend === 'chrome') return extension.handle(call, signal);
      if (call.input.backend !== undefined && call.input.backend !== 'embedded')
        throw new Error('Unknown browser backend.');
      return browserControl.handle(call, signal);
    },
  });
  extension.attach(host.server, { url: host.endpoint.url });
  const bridge: DesktopToolsBridge = {
    async status() {
      let state: ComputerControlStatus;
      try {
        const result = await computer.handle(
          { sessionID: 'desktop-status', method: 'computer.status', input: {} },
          AbortSignal.timeout(5_000),
        );
        const part = result.content.find((part) => part.type === 'text');
        if (!part || part.type !== 'text') throw new Error('Missing native computer status.');
        state = JSON.parse(part.text) as ComputerControlStatus;
      } catch (error) {
        state = {
          supported: process.platform === 'darwin',
          accessibility: false,
          screenRecording: false,
          message: error instanceof Error ? error.message : 'Native helper unavailable.',
        };
      }
      return {
        available: true,
        paused: host.isPaused(),
        label,
        computer: state,
        extension: extension.getState(),
        ...(state.message ? { message: state.message } : {}),
      };
    },
    async copyExtensionPairing() {
      const pairing = extension.getPairingInfo();
      if (!pairing) throw new Error('Extension pairing is unavailable.');
      clipboard.writeText(`${pairing.url}#${pairing.token}`);
    },
    async showExtensionFolder() {
      const path = app.isPackaged
        ? join(process.resourcesPath, 'browser-extension')
        : fileURLToPath(new URL('../../../browser-extension/', import.meta.url));
      const error = await shell.openPath(path);
      if (error) throw new Error(error);
    },
    async disconnectExtension() {
      extension.disconnect();
    },
    async openPermissionSettings(kind) {
      if (process.platform !== 'darwin')
        throw new Error('macOS permission settings are unavailable.');
      await shell.openExternal(
        `x-apple.systempreferences:com.apple.preference.security?${kind === 'accessibility' ? 'Privacy_Accessibility' : 'Privacy_ScreenCapture'}`,
      );
    },
    async stop() {
      host.pause();
    },
    async requestPermissions(kind) {
      await computer.requestPermissions(kind);
    },
    async resume() {
      host.resume();
    },
  };
  return {
    bridge,
    async close() {
      host.pause();
      // Await worker exit (including its forced-termination fallback) before Electron quits.
      // Every resource gets its cleanup even when a different resource fails to close.
      const results = await Promise.allSettled([
        Promise.resolve().then(() => extension.close()),
        Promise.resolve().then(() => browserControl.close()),
        computer.close(),
        host.close(),
      ]);
      const failure = results.find((result) => result.status === 'rejected');
      if (failure?.status === 'rejected') throw failure.reason;
    },
  };
}
