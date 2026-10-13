import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { EditorView, keymap, type ViewUpdate } from '@codemirror/view';
import {
  closeSearchPanel,
  findNext,
  findPrevious,
  openSearchPanel,
  search,
  setSearchQuery,
} from '@codemirror/search';
import { CodeFindBar, type FindHost } from './code-find-bar';

const theme = EditorView.theme({
  '.cm-panels.cm-panels-top': { borderBottom: 'none', background: 'transparent' },
  '.cm-searchMatch': {
    borderRadius: '2px',
    backgroundColor: 'color-mix(in srgb, var(--warning) 30%, transparent)',
  },
  '.cm-searchMatch.cm-searchMatch-selected': {
    backgroundColor: 'color-mix(in srgb, var(--warning) 70%, transparent)',
  },
});

/**
 * CodeMirror's own search, which covers lines outside the rendered viewport,
 * driven by the shared find bar rendered into its panel.
 */
export function useCodeFind() {
  const [host, setHost] = useState<FindHost>();
  const extension = useMemo(
    () => [
      search({
        top: true,
        createPanel: (view) => {
          const dom = document.createElement('div');
          dom.className = 'cm-find-panel';
          const panel: FindHost = { view, dom, listeners: new Set(), revision: 0 };
          return {
            dom,
            top: true,
            mount: () => setHost(panel),
            update: (update: ViewUpdate) => {
              if (
                !update.docChanged &&
                !update.selectionSet &&
                !update.transactions.some((tr) => tr.effects.some((e) => e.is(setSearchQuery)))
              )
                return;
              panel.revision++;
              for (const listener of panel.listeners) listener();
            },
            destroy: () => setHost((current) => (current === panel ? undefined : current)),
          };
        },
      }),
      keymap.of([
        { key: 'Mod-f', run: openSearchPanel },
        { key: 'Mod-g', run: findNext, shift: findPrevious, preventDefault: true },
        { key: 'F3', run: findNext, shift: findPrevious, preventDefault: true },
        { key: 'Escape', run: closeSearchPanel },
      ]),
      theme,
    ],
    [],
  );
  const bar = host ? createPortal(<CodeFindBar host={host} />, host.dom) : null;
  /** Opens or refocuses the bar; CodeMirror selects its query when it was not focused. */
  const open = (view: EditorView | null) => {
    if (view) openSearchPanel(view);
  };
  return { extension, bar, open };
}
