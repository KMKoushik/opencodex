import type { DesktopBridge } from '@opencodex/contracts/desktop';

declare global {
  interface Window {
    desktop?: DesktopBridge;
  }
}
