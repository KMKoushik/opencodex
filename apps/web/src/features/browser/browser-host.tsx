import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useStore } from 'zustand';
import { browserFileScheme, browserPartition } from '@opencodex/contracts/desktop';
import { useWorkbenchStore } from '../workbench/workbench-context';
import {
  browserRuntime,
  browserViews,
  browserFileDirectories,
  browserLeases,
  closeTab,
  openTab,
  setTabURL,
  updatePage,
  type WebviewElement,
} from './browser-runtime';
import { isBrowserFileURL } from './browser-url';
import { useBrowserNavigation } from './use-browser-navigation';
import { MAX_BROWSER_TABS } from '../workbench/workbench-store';
import './browser.css';

// Each page is a Chromium renderer process; older pages reload from their URL when shown again.
const MAX_LIVE_PAGES = 4;
const MAX_LEASED_PAGES = 8;

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
          const candidates = next.filter(
            (page) => page.id !== surface.tabID && !browserLeases.has(page.id),
          );
          const oldest = candidates.reduce<LivePage | undefined>(
            (a, b) => (!a || b.used < a.used ? b : a),
            undefined,
          );
          if (oldest) next = next.filter((page) => page !== oldest);
          else if (next.length > MAX_LEASED_PAGES) next = live;
        }
        // Appending and removing keep other pages in place; reordering would reload them.
        if (next !== live) setLive(next);
      }
    } else if (current.used !== latest) {
      setLive(live.map((page) => (page === current ? { ...page, used: latest + 1 } : page)));
    }
  }
  useEffect(
    () =>
      workbench.subscribe((state, previous) => {
        for (const [key, entry] of Object.entries(previous.entries)) {
          if (entry.browser === state.entries[key]?.browser) continue;
          void window.desktop
            ?.registerBrowserControl({
              type: 'sync',
              sessionID: key,
              tabIDs: state.entries[key]?.browser.tabs.map((tab) => tab.id) ?? [],
            })
            .catch(() => undefined);
        }
        setLive((live) => {
          const next = live.filter((page) =>
            state.entries[page.key]?.browser.tabs.some((tab) => tab.id === page.id),
          );
          return next.length === live.length ? live : next;
        });
      }),
    [workbench],
  );
  useEffect(() => {
    const desktop = window.desktop;
    if (!desktop) return;
    const unsubscribe = desktop.onBrowserControl((intent) => {
      if (intent.type === 'activity') {
        if (
          workbench
            .getState()
            .entries[intent.sessionID]?.browser.tabs.some((tab) => tab.id === intent.tabID)
        )
          updatePage(intent.tabID, {
            activity: intent.method,
            controlPaused: intent.paused,
            agentControlled: true,
          });
        return;
      }
      if (intent.type === 'release') {
        browserLeases.delete(intent.tabID);
        setLive((live) => {
          const next = [...live];
          while (next.length > MAX_LIVE_PAGES) {
            const oldest = next
              .filter(
                (page) =>
                  !browserLeases.has(page.id) &&
                  page.id !== browserRuntime.getState().surface?.tabID,
              )
              .sort((a, b) => a.used - b.used)[0];
            if (!oldest) break;
            next.splice(next.indexOf(oldest), 1);
          }
          return next;
        });
        return;
      }
      if (intent.type === 'close') {
        browserLeases.delete(intent.tabID);
        workbench.getState().browser(intent.sessionID, (state) => closeTab(state, intent.tabID));
        return;
      }
      const fail = (error: string) => {
        void desktop.registerBrowserControl({ type: 'ack', requestID: intent.requestID, error });
      };
      const state = workbench.getState().entries[intent.sessionID]?.browser;
      const existing = state?.tabs.some((tab) => tab.id === intent.tabID);
      if (!existing && (state?.tabs.length ?? 0) >= MAX_BROWSER_TABS)
        return fail('Close a browser tab before opening another.');
      if (browserLeases.size >= MAX_LEASED_PAGES - 1 && !browserLeases.has(intent.tabID))
        return fail('All browser pages are busy. Retry after a command completes.');
      browserLeases.set(intent.tabID, intent.requestID);
      if (!existing) {
        workbench.getState().browser(intent.sessionID, (state) => ({
          tabs: [...state.tabs, { id: intent.tabID, url: intent.url }],
          selected: intent.tabID,
        }));
        workbench.getState().layout(intent.sessionID, { open: true, panel: 'browser' });
      }
      setLive((live) => {
        if (live.some((page) => page.id === intent.tabID)) return [...live];
        const next = [
          ...live,
          {
            id: intent.tabID,
            key: intent.sessionID,
            // Bind ownership and the approved origin in main before loading any remote URL.
            src: 'about:blank',
            used: Math.max(0, ...live.map((page) => page.used)) + 1,
          },
        ];
        while (next.length > MAX_LIVE_PAGES) {
          const candidate = next
            .filter(
              (page) =>
                !browserLeases.has(page.id) && page.id !== browserRuntime.getState().surface?.tabID,
            )
            .sort((a, b) => a.used - b.used)[0];
          if (!candidate) break;
          next.splice(next.indexOf(candidate), 1);
        }
        return next;
      });
    });
    void desktop.registerBrowserControl({ type: 'host' });
    return () => {
      unsubscribe();
      browserLeases.clear();
    };
  }, [workbench]);
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
          requestID={browserLeases.get(page.id)}
          slot={surface?.tabID === page.id ? surface.slot : null}
        />
      ))}
    </div>
  );
}

function BrowserView({
  page,
  slot,
  requestID,
}: {
  page: LivePage;
  slot: HTMLElement | null;
  requestID?: string;
}) {
  const leased = Boolean(requestID);
  const { id, key, src } = page;
  const workbench = useWorkbenchStore();
  const box = useRef<HTMLDivElement>(null);
  const view = useRef<WebviewElement>(null);
  const { mutate: navigate } = useBrowserNavigation();
  // Errors and crashes show the panel's own message in the slot underneath.
  const covered = useStore(browserRuntime, (state) =>
    Boolean(state.pages[id]?.error || state.pages[id]?.crashed),
  );
  useEffect(() => {
    const element = view.current!;
    let initialized = false;
    const history = () =>
      updatePage(id, { canGoBack: element.canGoBack(), canGoForward: element.canGoForward() });
    const navigated = (url: string) => {
      if (url === 'about:blank') return;
      if (url.startsWith(`${browserFileScheme}:`)) {
        const directory = browserFileDirectories.get(id);
        if (!directory) return;
        const local = new URL(url);
        url = new URL(local.pathname.slice(1) + local.search + local.hash, directory).href;
      }
      workbench.getState().browser(key, (state) => setTabURL(state, id, url));
      history();
    };
    const listeners: Record<string, (event: WebviewEvent) => void> = {
      'dom-ready': () => {
        browserViews.set(id, element);
        void window.desktop
          ?.registerBrowserControl({
            type: 'ready',
            sessionID: key,
            tabID: id,
            webContentsId: element.getWebContentsId(),
            requestID: browserLeases.get(id),
          })
          .catch((error: unknown) => {
            const requestID = browserLeases.get(id);
            if (requestID)
              void window.desktop?.registerBrowserControl({
                type: 'ack',
                requestID,
                error: String(error).slice(0, 1000),
              });
          });
        history();
        if (!initialized) {
          initialized = true;
          if (isBrowserFileURL(src)) navigate({ id, url: src });
        }
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
      browserFileDirectories.delete(id);
      updatePage(id, null);
    };
  }, [id, key, src, workbench, navigate]);
  useLayoutEffect(() => {
    const style = box.current!.style;
    const hide = () => {
      // A leased guest must remain inside the viewport for Chromium to produce capture
      // frames. Near-zero opacity keeps compositing active without reparenting the guest.
      style.left = leased ? '0' : '-100000px';
      style.opacity = leased ? '0.001' : '';
      style.pointerEvents = 'none';
      if (!leased && document.activeElement === view.current) view.current?.blur();
    };
    const acknowledge = () => {
      if (!requestID || !browserViews.has(id)) return;
      void window.desktop
        ?.registerBrowserControl({
          type: 'ready',
          sessionID: key,
          tabID: id,
          webContentsId: view.current!.getWebContentsId(),
          requestID,
        })
        .catch((error: unknown) =>
          window.desktop?.registerBrowserControl({
            type: 'ack',
            requestID,
            error: String(error).slice(0, 1000),
          }),
        );
    };
    if (!slot || covered) {
      hide();
      acknowledge();
      return;
    }
    const place = () => {
      const rect = slot.getBoundingClientRect();
      if (!rect.width || !rect.height) return hide();
      style.left = `${rect.left}px`;
      style.opacity = '';
      style.top = `${rect.top}px`;
      style.width = `${rect.width}px`;
      style.height = `${rect.height}px`;
      style.pointerEvents = '';
    };
    place();
    acknowledge();
    const observer = new ResizeObserver(place);
    observer.observe(slot);
    window.addEventListener('resize', place);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', place);
      hide();
    };
  }, [slot, covered, leased, requestID, id, key]);
  return (
    <div ref={box} className="browser-view" aria-hidden={slot && !covered ? undefined : true}>
      <webview
        ref={view}
        src={isBrowserFileURL(src) ? 'about:blank' : src}
        partition={browserPartition}
        // Electron reads this attribute as the guest attaches; React drops boolean values on it.
        {...({ allowpopups: 'true' } as object)}
        data-workbench-key={key}
      />
    </div>
  );
}
