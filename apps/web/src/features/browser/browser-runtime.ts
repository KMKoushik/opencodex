import { createStore } from 'zustand/vanilla';
import { MAX_BROWSER_TABS, type BrowserState } from '../workbench/workbench-store';
import { newBrowserTabID } from './browser-url';

/** The subset of Electron's `<webview>` element the browser panel uses. */
export interface WebviewElement extends HTMLElement {
  src: string;
  loadURL(url: string): Promise<void>;
  reload(): void;
  stop(): void;
  goBack(): void;
  goForward(): void;
  canGoBack(): boolean;
  canGoForward(): boolean;
  getWebContentsId(): number;
}

export type BrowserPage = {
  title: string;
  loading: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
  error?: { description: string; url: string };
  crashed?: boolean;
  /** The comment overlay is open in the page. */
  annotating?: boolean;
  activity?: string | null;
  agentControlled?: boolean;
  controlPaused?: boolean;
};

/** Where the visible panel wants the selected page drawn. Pages outside it stay loaded offscreen. */
export type BrowserSurface = { key: string; tabID: string; slot: HTMLElement };

/** Live page presentation, keyed by tab. Tab lists and URLs live in the workbench store. */
export const browserRuntime = createStore<{
  pages: Record<string, BrowserPage>;
  surface: BrowserSurface | null;
}>(() => ({ pages: {}, surface: null }));

export const emptyPage: BrowserPage = {
  title: '',
  loading: false,
  canGoBack: false,
  canGoForward: false,
};

export function updatePage(tabID: string, patch: Partial<BrowserPage> | null) {
  browserRuntime.setState((state) => {
    const pages = { ...state.pages };
    if (patch) pages[tabID] = { ...(pages[tabID] ?? emptyPage), ...patch };
    else delete pages[tabID];
    return { pages };
  });
}

/** Attached webviews that can take commands; a webview joins after its first `dom-ready`. */
export const browserViews = new Map<string, WebviewElement>();
/** Filesystem display URLs for opaque, isolated local-preview origins. */
export const browserFileDirectories = new Map<string, string>();
/** Mount leases are granted before a native command begins and released in its finally block. */
export const browserLeases = new Map<string, string>();

export function navigateView(tabID: string, url: string) {
  const view = browserViews.get(tabID);
  if (!view) return false;
  // Load failures are reported through the page's `did-fail-load` event.
  view.loadURL(url).catch(() => undefined);
  return true;
}

export function openTab(state: BrowserState, url: string, after?: string): BrowserState {
  const id = newBrowserTabID();
  const tabs = [...state.tabs];
  const index = tabs.findIndex((tab) => tab.id === after);
  tabs.splice(index < 0 ? tabs.length : index + 1, 0, { id, url });
  while (tabs.length > MAX_BROWSER_TABS) {
    const oldest = tabs.findIndex(
      (tab) => tab.id !== id && tab.id !== state.selected && !browserLeases.has(tab.id),
    );
    if (oldest < 0) return state;
    tabs.splice(oldest, 1);
  }
  return { tabs, selected: id };
}

export function closeTab(state: BrowserState, id: string): BrowserState {
  const index = state.tabs.findIndex((tab) => tab.id === id);
  const tabs = state.tabs.filter((tab) => tab.id !== id);
  const selected =
    state.selected === id ? (tabs[index]?.id ?? tabs[index - 1]?.id ?? '') : state.selected;
  return { tabs, selected };
}

export function setTabURL(state: BrowserState, id: string, url: string): BrowserState {
  const tab = state.tabs.find((tab) => tab.id === id);
  if (!tab || tab.url === url) return state;
  return { ...state, tabs: state.tabs.map((tab) => (tab.id === id ? { ...tab, url } : tab)) };
}
