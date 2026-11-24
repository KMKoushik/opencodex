import { createContext, useContext, useEffect, useLayoutEffect, useRef } from 'react';

/** The active panel's "close my current tab"; false when it has no tab to close. */
type TabCloser = () => boolean;
/** Holds the active panel's closer for its container. */
export class TabSlot {
  private closer?: TabCloser;
  offer(closer: TabCloser) {
    this.closer = closer;
    return () => {
      if (this.closer === closer) this.closer = undefined;
    };
  }
  close() {
    return this.closer?.() ?? false;
  }
}

/** A panel container Cmd+W works in: the workspace panel or the terminal drawer. */
type TabHost = { element: HTMLElement; slot: TabSlot; closePanel: () => void };

const hosts = new Set<TabHost>();

export const TabCloseSlot = createContext<TabSlot | null>(null);

/** Registers a panel container; its content offers tabs through `useTabCloser`. */
export function useTabHost(
  ref: React.RefObject<HTMLElement | null>,
  slot: TabSlot,
  closePanel: () => void,
) {
  const latest = useRef(closePanel);
  useLayoutEffect(() => {
    latest.current = closePanel;
  });
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const host = { element, slot, closePanel: () => latest.current() };
    hosts.add(host);
    return () => void hosts.delete(host);
  }, [ref, slot]);
}

/** While `active`, Cmd+W in this panel's container closes this panel's current tab. */
export function useTabCloser(active: boolean, close: TabCloser) {
  const slot = useContext(TabCloseSlot);
  const latest = useRef(close);
  useLayoutEffect(() => {
    latest.current = close;
  });
  useEffect(() => {
    if (!active || !slot) return;
    return slot.offer(() => latest.current());
  }, [active, slot]);
}

/**
 * Cmd+W: closes the current tab of the panel with focus, or of the open workspace panel when
 * focus is elsewhere (the chat), like T3 Code. A panel with no tab left closes itself. False
 * when no panel is open, so the window closes as usual.
 */
export function closeFocusedTab() {
  const open = [...hosts].filter((host) => host.element.isConnected && !host.element.hidden);
  const focused = document.activeElement;
  const host =
    open.find((item) => focused && item.element.contains(focused)) ??
    open.find((item) => item.element.id === 'workbench') ??
    open[0];
  if (!host) return false;
  if (!host.slot.close()) host.closePanel();
  return true;
}
