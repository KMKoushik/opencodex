import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useStore } from 'zustand';
import { browserPartition } from '@opencodex/contracts/desktop';
import { useWorkbenchStore } from '../workbench/workbench-context';
import {
  browserRuntime,
  browserViews,
  openTab,
  setTabURL,
  updatePage,
  type WebviewElement,
} from './browser-runtime';
import './browser.css';

// Each page is a Chromium renderer process; older pages reload from their URL when shown again.
const MAX_LIVE_PAGES = 4;

type WebviewEvent = Event & {
  url: string;
  isMainFrame: boolean;
  title: string;
  errorCode: number;
  errorDescription: string;
  validatedURL: string;
};
type LivePage = { id: string; key: string; src: string; used: number };

/**
 * Owns every browser page outside the workbench panel, so switching panels or threads never
 * reloads a page: moving or hiding a `<webview>` in the DOM restarts it. The visible page is
 * drawn over the panel's slot; the others stay loaded offscreen.
 */
export function BrowserHost() {
  const workbench = useWorkbenchStore();
  const surface = useStore(browserRuntime, (state) => state.surface);
  const [live, setLive] = useState<LivePage[]>([]);
  if (surface) {
    const current = live.find((page) => page.id === surface.tabID);
    const latest = Math.max(0, ...live.map((page) => page.used));
    if (!current) {
      const src = workbench
        .getState()
        .entries[surface.key]?.browser.tabs.find((tab) => tab.id === surface.tabID)?.url;
      if (src) {
        let next = [...live, { id: surface.tabID, key: surface.key, src, used: latest + 1 }];
        if (next.length > MAX_LIVE_PAGES) {
          const oldest = next.reduce((a, b) => (b.used < a.used ? b : a));
          next = next.filter((page) => page !== oldest);
        }
        // Appending and removing keep other pages in place; reordering would reload them.
        setLive(next);
      }
    } else if (current.used !== latest) {
      setLive(live.map((page) => (page === current ? { ...page, used: latest + 1 } : page)));
    }
  }
  useEffect(
    () =>
      workbench.subscribe((state) =>
        setLive((live) => {
          const next = live.filter((page) =>
            state.entries[page.key]?.browser.tabs.some((tab) => tab.id === page.id),
          );
          return next.length === live.length ? live : next;
        }),
      ),
    [workbench],
  );
  useEffect(
    () =>
      window.desktop?.onBrowserOpenTab(({ webContentsId, url }) => {
        for (const [id, view] of browserViews) {
          if (view.getWebContentsId() !== webContentsId) continue;
          const key = view.dataset.workbenchKey;
          if (key) workbench.getState().browser(key, (state) => openTab(state, url, id));
          return;
        }
      }),
    [workbench],
  );
  return (
    <div className="browser-host">
      {live.map((page) => (
        <BrowserView
          key={page.id}
          page={page}
          slot={surface?.tabID === page.id ? surface.slot : null}
        />
      ))}
    </div>
  );
}

function BrowserView({ page, slot }: { page: LivePage; slot: HTMLElement | null }) {
  const { id, key, src } = page;
  const workbench = useWorkbenchStore();
  const box = useRef<HTMLDivElement>(null);
  const view = useRef<WebviewElement>(null);
  // Errors and crashes show the panel's own message in the slot underneath.
  const covered = useStore(browserRuntime, (state) =>
    Boolean(state.pages[id]?.error || state.pages[id]?.crashed),
  );
  useEffect(() => {
    const element = view.current!;
    const history = () =>
      updatePage(id, { canGoBack: element.canGoBack(), canGoForward: element.canGoForward() });
    const navigated = (url: string) => {
      workbench.getState().browser(key, (state) => setTabURL(state, id, url));
      history();
    };
    const listeners: Record<string, (event: WebviewEvent) => void> = {
      'dom-ready': () => {
        browserViews.set(id, element);
        history();
      },
      'did-start-loading': () =>
        updatePage(id, { loading: true, error: undefined, crashed: undefined }),
      'did-stop-loading': () => {
        updatePage(id, { loading: false });
        history();
      },
      'did-navigate': (event) => navigated(event.url),
      'did-navigate-in-page': (event) => {
        if (event.isMainFrame) navigated(event.url);
      },
      'page-title-updated': (event) => updatePage(id, { title: event.title }),
      'did-fail-load': (event) => {
        // -3 is an aborted load, such as a navigation that replaced it.
        if (!event.isMainFrame || event.errorCode === -3) return;
        updatePage(id, {
          loading: false,
          error: {
            description: event.errorDescription || 'The page could not be loaded.',
            url: event.validatedURL,
          },
        });
      },
      'render-process-gone': () => updatePage(id, { loading: false, crashed: true }),
    };
    for (const [name, listener] of Object.entries(listeners))
      element.addEventListener(name, listener as EventListener);
    return () => {
      for (const [name, listener] of Object.entries(listeners))
        element.removeEventListener(name, listener as EventListener);
      browserViews.delete(id);
      updatePage(id, null);
    };
  }, [id, key, workbench]);
  useLayoutEffect(() => {
    const style = box.current!.style;
    const hide = () => {
      style.left = '-100000px';
      style.pointerEvents = 'none';
      if (document.activeElement === view.current) view.current?.blur();
    };
    if (!slot || covered) return hide();
    const place = () => {
      const rect = slot.getBoundingClientRect();
      if (!rect.width || !rect.height) return hide();
      style.left = `${rect.left}px`;
      style.top = `${rect.top}px`;
      style.width = `${rect.width}px`;
      style.height = `${rect.height}px`;
      style.pointerEvents = '';
    };
    place();
    const observer = new ResizeObserver(place);
    observer.observe(slot);
    window.addEventListener('resize', place);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', place);
      hide();
    };
  }, [slot, covered]);
  return (
    <div ref={box} className="browser-view" aria-hidden={slot && !covered ? undefined : true}>
      <webview
        ref={view}
        src={src}
        partition={browserPartition}
        // Electron reads this attribute as the guest attaches; React drops boolean values on it.
        {...({ allowpopups: 'true' } as object)}
        data-workbench-key={key}
      />
    </div>
  );
}
