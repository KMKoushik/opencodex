import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useStore } from 'zustand';
import { HugeiconsIcon } from '@hugeicons/react';
import {
  Add01Icon,
  ArrowLeft01Icon,
  ArrowRight01Icon,
  Cancel01Icon,
  CommentAdd01Icon,
  Globe02Icon,
  LinkSquare02Icon,
  RefreshIcon,
} from '@hugeicons/core-free-icons';
import { Button } from '../../components/ui/button';
import { useDraftStore } from '../chat/draft-context';
import type { PanelContext } from '../workbench/panels';
import { useWorkbenchStore, workbenchKey } from '../workbench/workbench-context';
import { defaultBrowserState } from '../workbench/workbench-store';
import {
  browserRuntime,
  browserViews,
  closeTab,
  emptyPage,
  openTab,
  setTabURL,
  updatePage,
} from './browser-runtime';
import { addressURL, isBrowserFileURL } from './browser-url';
import { useBrowserNavigation } from './use-browser-navigation';
import { addPageComment, annotationTheme } from './page-comment';
import './browser.css';

export function BrowserPanel({
  directory,
  sessionID,
  active,
  headerElement,
}: Pick<PanelContext, 'directory' | 'sessionID' | 'active' | 'headerElement'>) {
  const workbench = useWorkbenchStore();
  const key = workbenchKey(sessionID, directory);
  const state = useStore(workbench, (state) => state.entries[key]?.browser ?? defaultBrowserState);
  const update = (change: Parameters<ReturnType<typeof workbench.getState>['browser']>[1]) =>
    workbench.getState().browser(key, change);
  const tab = state.tabs.find((tab) => tab.id === state.selected) ?? state.tabs[0];
  const page = useStore(browserRuntime, (runtime) =>
    tab ? (runtime.pages[tab.id] ?? emptyPage) : emptyPage,
  );
  const [draft, setDraft] = useState<string>();
  const [draftTab, setDraftTab] = useState(tab?.id);
  if (draftTab !== tab?.id) {
    setDraftTab(tab?.id);
    setDraft(undefined);
  }
  const address = useRef<HTMLInputElement>(null);
  const [slot, setSlot] = useState<HTMLDivElement | null>(null);
  const navigation = useBrowserNavigation();
  const shownID = tab?.url ? tab.id : undefined;
  useEffect(() => {
    if (!active || !shownID || !slot) return;
    const surface = { key, tabID: shownID, slot };
    browserRuntime.setState({ surface });
    return () => {
      if (browserRuntime.getState().surface === surface) browserRuntime.setState({ surface: null });
    };
  }, [active, shownID, slot, key]);
  // A new or empty tab starts in the address bar.
  useEffect(() => {
    if (active && tab && !tab.url) address.current?.focus();
  }, [active, tab]);

  const navigate = (url: string) => {
    setDraft(undefined);
    if (!tab) {
      update((state) => openTab(state, url));
      return;
    }
    update((state) => setTabURL(state, tab.id, url));
    navigation.mutate({ id: tab.id, url });
    browserViews.get(tab.id)?.focus();
  };
  const view = tab ? browserViews.get(tab.id) : undefined;
  const drafts = useDraftStore();
  const [notice, setNotice] = useState<string>();
  const comment = async () => {
    const desktop = window.desktop;
    if (!tab || !view || !desktop) return;
    const contents = view.getWebContentsId();
    if (page.annotating) {
      void desktop.cancelBrowserAnnotation(contents).catch(() => undefined);
      return;
    }
    const id = tab.id;
    setNotice(undefined);
    updatePage(id, { annotating: true });
    // The overlay's shortcuts (Esc, V/R/D/E) need the page focused.
    view.focus();
    try {
      const annotation = await desktop.annotateBrowserPage(contents, annotationTheme());
      if (annotation) setNotice(addPageComment(drafts, sessionID, annotation));
    } catch {
      setNotice('The comment could not be added. Try again.');
    } finally {
      if (browserRuntime.getState().pages[id]) updatePage(id, { annotating: false });
    }
  };
  const reload = () => {
    if (page.loading) view?.stop();
    else if (view && !(page.error && isBrowserFileURL(tab?.url ?? ''))) view.reload();
    else if (tab?.url) navigate(tab.url);
  };
  const label = (index: number) => {
    const item = state.tabs[index]!;
    return item.url ? item.url : 'New tab';
  };

  return (
    <div className="browser-panel">
      {active &&
        headerElement &&
        createPortal(
          <>
            <div className="wb-document-tabs browser-tabs" role="tablist" aria-label="Browser tabs">
              {state.tabs.map((item, index) => (
                <div className="wb-document-tab" key={item.id} data-active={item.id === tab?.id}>
                  <button
                    role="tab"
                    id={`browser-tab-${item.id}`}
                    aria-selected={item.id === tab?.id}
                    tabIndex={item.id === tab?.id ? 0 : -1}
                    title={label(index)}
                    onClick={() => update((state) => ({ ...state, selected: item.id }))}
                    onKeyDown={(event) => {
                      const tabs = state.tabs;
                      const next =
                        event.key === 'ArrowRight'
                          ? (index + 1) % tabs.length
                          : event.key === 'ArrowLeft'
                            ? (index + tabs.length - 1) % tabs.length
                            : event.key === 'Home'
                              ? 0
                              : event.key === 'End'
                                ? tabs.length - 1
                                : undefined;
                      if (next === undefined) return;
                      event.preventDefault();
                      update((state) => ({ ...state, selected: tabs[next]!.id }));
                      document.getElementById(`browser-tab-${tabs[next]!.id}`)?.focus();
                    }}
                  >
                    <HugeiconsIcon icon={Globe02Icon} size={14} />
                    <TabTitle id={item.id} url={item.url} />
                  </button>
                  <button
                    aria-label={`Close ${label(index)}`}
                    title="Close tab"
                    onClick={() => update((state) => closeTab(state, item.id))}
                  >
                    <HugeiconsIcon icon={Cancel01Icon} size={12} />
                  </button>
                </div>
              ))}
            </div>
            <Button
              className="browser-add"
              variant="ghost"
              size="icon"
              aria-label="New tab"
              onClick={() => update((state) => openTab(state, '', state.selected))}
            >
              <HugeiconsIcon icon={Add01Icon} size={16} />
            </Button>
          </>,
          headerElement,
        )}
      <div className="wb-subtoolbar browser-toolbar">
        <Button
          variant="ghost"
          size="icon"
          aria-label="Back"
          disabled={!view || !page.canGoBack}
          onClick={() => view?.goBack()}
        >
          <HugeiconsIcon icon={ArrowLeft01Icon} size={16} />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Forward"
          disabled={!view || !page.canGoForward}
          onClick={() => view?.goForward()}
        >
          <HugeiconsIcon icon={ArrowRight01Icon} size={16} />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          aria-label={page.loading ? 'Stop loading' : 'Reload'}
          disabled={!tab?.url}
          onClick={reload}
        >
          <HugeiconsIcon icon={page.loading ? Cancel01Icon : RefreshIcon} size={16} />
        </Button>
        <form
          className="browser-address"
          onSubmit={(event) => {
            event.preventDefault();
            const url = addressURL(draft ?? tab?.url ?? '');
            if (url) navigate(url);
          }}
        >
          <input
            ref={address}
            aria-label="Address"
            placeholder="Search or enter address, e.g. localhost:3000"
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            value={draft ?? tab?.url ?? ''}
            onChange={(event) => setDraft(event.target.value)}
            onFocus={(event) => event.target.select()}
            onKeyDown={(event) => {
              if (event.key !== 'Escape' || draft === undefined) return;
              event.preventDefault();
              setDraft(undefined);
              event.currentTarget.blur();
            }}
          />
        </form>
        <Button
          variant="ghost"
          size="icon"
          aria-label={page.annotating ? 'Cancel comment' : 'Comment on page'}
          aria-pressed={Boolean(page.annotating)}
          disabled={!page.annotating && (!view || !tab?.url || page.loading)}
          onClick={() => void comment()}
        >
          <HugeiconsIcon icon={CommentAdd01Icon} size={16} />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Open in system browser"
          disabled={!tab?.url || isBrowserFileURL(tab.url)}
          onClick={() => tab?.url && window.open(tab.url, '_blank', 'noreferrer')}
        >
          <HugeiconsIcon icon={LinkSquare02Icon} size={16} />
        </Button>
      </div>
      {notice && (
        <div role="alert" className="wb-notice">
          {notice}
          <Button variant="ghost" size="sm" onClick={() => setNotice(undefined)}>
            Dismiss
          </Button>
        </div>
      )}
      <div className="browser-slot" ref={setSlot}>
        {!tab?.url ? (
          <div className="wb-empty">
            <HugeiconsIcon icon={Globe02Icon} size={28} />
            <h3>Preview your app</h3>
            <p>Enter a local server such as localhost:3000, a web address, or a search.</p>
            <p>Local server and HTML links in chat open here too.</p>
          </div>
        ) : page.crashed || page.error ? (
          <div className="wb-empty" role="alert">
            <h3>{page.crashed ? 'This page crashed' : 'This page could not be loaded'}</h3>
            {page.error && (
              <>
                <p>{page.error.description}</p>
                <p className="browser-error-url">{page.error.url}</p>
              </>
            )}
            <div className="browser-error-actions">
              <Button variant="secondary" onClick={reload}>
                Try again
              </Button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function TabTitle({ id, url }: { id: string; url: string }) {
  const title = useStore(browserRuntime, (runtime) => runtime.pages[id]?.title);
  let host = '';
  try {
    host = url
      ? isBrowserFileURL(url)
        ? decodeURIComponent(new URL(url).pathname.split('/').pop() ?? '')
        : new URL(url).host
      : '';
  } catch {
    host = url;
  }
  return <span className="browser-tab-title">{title || host || 'New tab'}</span>;
}
