import { useSyncExternalStore } from 'react';
import { EditorSelection, type EditorState, type Text } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import {
  SearchQuery,
  closeSearchPanel,
  findNext,
  findPrevious,
  getSearchQuery,
  setSearchQuery,
} from '@codemirror/search';
import { FindBar } from './find-bar';

const LIMIT = 2000;

/** A mounted search panel; the panel bumps `revision` and notifies on relevant updates. */
export type FindHost = {
  view: EditorView;
  dom: HTMLElement;
  listeners: Set<() => void>;
  revision: number;
};

export function CodeFindBar({ host }: { host: FindHost }) {
  const { view } = host;
  useSyncExternalStore(
    (listener) => {
      host.listeners.add(listener);
      return () => host.listeners.delete(listener);
    },
    () => host.revision,
  );
  const { state } = view;
  const query = getSearchQuery(state);
  const matches = matchesOf(state.doc, query);
  return (
    <FindBar
      label="Find in file"
      query={query.search}
      index={activeIndex(matches.from, matches.to, state)}
      total={matches.from.length}
      capped={matches.capped}
      onQueryChange={(search) => {
        const next = new SearchQuery({
          search,
          caseSensitive: query.caseSensitive,
          literal: query.literal,
          regexp: query.regexp,
          wholeWord: query.wholeWord,
        });
        // Typing selects the first match from where the reader is, like a browser find.
        const from = view.state.selection.main.from;
        const match = next.valid
          ? (first(next, view.state.doc, from) ?? first(next, view.state.doc, 0))
          : null;
        view.dispatch({
          effects: [
            setSearchQuery.of(next),
            ...(match ? [EditorView.scrollIntoView(match.from, { y: 'center' })] : []),
          ],
          selection: match ? EditorSelection.single(match.from, match.to) : undefined,
          userEvent: 'select.search',
        });
      }}
      onNext={() => step(view, findNext)}
      onPrevious={() => step(view, findPrevious)}
      onClose={() => closeSearchPanel(view)}
    />
  );
}

function first(query: SearchQuery, doc: Text, from: number) {
  const next = query.getCursor(doc, from).next();
  return next.done ? null : next.value;
}

/** Keeps the typed query intact; CodeMirror selects the input text after each step. */
function step(view: EditorView, command: (view: EditorView) => boolean) {
  command(view);
  const input = view.dom.querySelector<HTMLInputElement>('.cm-find-panel input');
  if (input && document.activeElement === input) {
    const end = input.value.length;
    input.setSelectionRange(end, end);
  }
}

type Matches = { query: SearchQuery; from: number[]; to: number[]; capped: boolean };
// Documents are immutable, so moving the cursor reuses the scan for the same text and query.
const scans = new WeakMap<Text, Matches>();

function matchesOf(doc: Text, query: SearchQuery): Matches {
  const cached = scans.get(doc);
  if (cached?.query.eq(query)) return cached;
  const result: Matches = { query, from: [], to: [], capped: false };
  if (query.valid) {
    const cursor = query.getCursor(doc);
    for (let next = cursor.next(); !next.done; next = cursor.next()) {
      if (result.from.length >= LIMIT) {
        result.capped = true;
        break;
      }
      result.from.push(next.value.from);
      result.to.push(next.value.to);
    }
  }
  scans.set(doc, result);
  return result;
}

function activeIndex(from: number[], to: number[], state: EditorState) {
  const selection = state.selection.main;
  let low = 0;
  let high = from.length - 1;
  while (low <= high) {
    const middle = (low + high) >> 1;
    if (from[middle]! < selection.from) low = middle + 1;
    else if (from[middle]! > selection.from) high = middle - 1;
    else return to[middle] === selection.to ? middle : -1;
  }
  return -1;
}
