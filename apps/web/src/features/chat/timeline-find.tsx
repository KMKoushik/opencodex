import {
  useDeferredValue,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from 'react';
import type { LegendListRef } from '@legendapp/list/react';
import { FindBar } from '../find/find-bar';
import { findRanges, fold, insideFindBar, paintMatches, revealRange } from '../find/dom-find';
import { selectedQuery } from '../find/use-dom-find';
import type { DisplayRow, TimelineRow } from './timeline-model';

type Target = { id: string; occurrence: number };
type Matches = {
  ids: string[];
  starts: number[];
  counts: number[];
  total: number;
  order: Map<string, number>;
};
const none: Matches = { ids: [], starts: [], counts: [], total: 0, order: new Map() };

/**
 * Find in a windowed transcript. Matching runs on message data, so rows that are not
 * mounted (or folded inside a turn) still count; mounted rows are painted in place.
 */
export function useTimelineFind({
  sessionID,
  scope,
  list,
  rows,
  projected,
  ownerOf,
  openTurn,
  stopFollowing,
}: {
  sessionID: string;
  scope: RefObject<HTMLElement | null>;
  list: RefObject<LegendListRef | null>;
  rows: DisplayRow[];
  projected: TimelineRow[];
  ownerOf: (id: string) => string | undefined;
  openTurn: (id: string) => void;
  stopFollowing: () => void;
}) {
  // Find belongs to one conversation; switching threads closes it.
  const [openFor, setOpenFor] = useState<string>();
  const open = openFor === sessionID;
  const [query, setQuery] = useState('');
  const [focusRequest, setFocusRequest] = useState(0);
  const [target, setTargetState] = useState<Target | null>(null);
  const [owner] = useState(() => ({}));
  const targetRef = useRef<Target | null>(null);
  const queryRef = useRef('');
  const rowsRef = useRef(rows);
  const pending = useRef<Target | null>(null);
  const revealToken = useRef(0);
  const returnFocus = useRef<HTMLElement | null>(null);
  useLayoutEffect(() => {
    rowsRef.current = rows;
  });
  const setTarget = (next: Target | null) => {
    targetRef.current = next;
    setTargetState(next);
  };

  const deferred = useDeferredValue(open ? query : '');
  const matches = useMemo(() => {
    const needle = fold(deferred);
    if (!needle) return none;
    const result: Matches = { ids: [], starts: [], counts: [], total: 0, order: new Map() };
    projected.forEach((row, index) => {
      result.order.set(row.id, index);
      const count = countIn(searchText(row), needle);
      if (!count) return;
      result.ids.push(row.id);
      result.starts.push(result.total);
      result.counts.push(count);
      result.total += count;
    });
    return result;
  }, [projected, deferred]);

  const unit = target ? matches.ids.indexOf(target.id) : -1;
  const index =
    unit < 0 ? -1 : matches.starts[unit]! + Math.min(target!.occurrence, matches.counts[unit]! - 1);

  /** Paints mounted matches and returns the current one when its row is mounted. */
  const paint = () => paintRows(owner, scope.current, queryRef.current, targetRef.current);

  const reveal = async (next: Target) => {
    const token = ++revealToken.current;
    const position = rowsRef.current.findIndex((row) => row.id === next.id);
    if (position < 0) {
      const turn = ownerOf(next.id);
      pending.current = turn ? next : null;
      if (turn) openTurn(turn);
      return;
    }
    stopFollowing();
    const scroller = list.current?.getScrollableNode();
    if (!scroller) return;
    const element = scope.current?.querySelector(`[data-row-id="${CSS.escape(next.id)}"]`);
    if (!element || !intersects(element, scroller))
      await list.current?.scrollToIndex({ index: position, animated: false, viewPosition: 0.3 });
    // The row mounts and measures over the next frames; reveal once its text is there.
    for (let attempt = 0; attempt < 8; attempt++) {
      await new Promise(requestAnimationFrame);
      if (token !== revealToken.current) return;
      const range = paint();
      if (range) {
        revealRange(range, scroller);
        return;
      }
    }
  };
  // Effects reach the latest closures without resubscribing on every render.
  const actions = useRef({ paint, reveal });
  useLayoutEffect(() => {
    actions.current = { paint, reveal };
  });

  // Opening a folded turn mounts its rows; finish revealing the match inside it.
  useEffect(() => {
    const next = pending.current;
    if (!next || !rows.some((row) => row.id === next.id)) return;
    pending.current = null;
    void actions.current.reveal(next);
  }, [rows]);

  // A new query starts from the top of what the reader is looking at; streamed rows
  // that change the matches afterwards keep the current match.
  const startedFor = useRef('');
  useEffect(() => {
    if (startedFor.current === deferred) return;
    startedFor.current = deferred;
    queryRef.current = deferred;
    const start = deferred
      ? startTarget(matches, scope.current, list.current?.getScrollableNode())
      : null;
    targetRef.current = start;
    setTargetState(start);
    if (start) void actions.current.reveal(start);
    else actions.current.paint();
  }, [deferred, matches, scope, list]);

  // Rows mount as the list scrolls and text streams in; repaint at most once a frame.
  useEffect(() => {
    const root = scope.current;
    if (!open || !deferred || !root) return;
    let frame = 0;
    const observer = new MutationObserver((records) => {
      if (frame || records.every((record) => insideFindBar(record.target))) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        actions.current.paint();
      });
    });
    observer.observe(root, { subtree: true, childList: true, characterData: true });
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [open, deferred, scope]);

  useEffect(
    () => () => {
      revealToken.current++;
      paintMatches(owner, []);
    },
    [owner],
  );

  const step = (delta: number) => {
    const { ids, starts, total } = matches;
    if (!total) return;
    const next = (index < 0 ? (delta > 0 ? -1 : 0) : index) + delta;
    const wrapped = (next + total) % total;
    let found = 0;
    while (found + 1 < starts.length && starts[found + 1]! <= wrapped) found++;
    const nextTarget = { id: ids[found]!, occurrence: wrapped - starts[found]! };
    setTarget(nextTarget);
    void reveal(nextTarget);
  };

  const close = () => {
    revealToken.current++;
    pending.current = null;
    setOpenFor(undefined);
    paintMatches(owner, []);
    const back = returnFocus.current;
    returnFocus.current = null;
    if (back?.isConnected) back.focus({ preventScroll: true });
  };

  const openFind = () => {
    const seed = selectedQuery(scope.current);
    if (seed) setQuery(seed);
    if (!open && document.activeElement instanceof HTMLElement)
      returnFocus.current = document.activeElement;
    setOpenFor(sessionID);
    setFocusRequest((value) => value + 1);
  };

  const bar = open ? (
    <div className="find-overlay">
      <FindBar
        label="Find in chat"
        query={query}
        index={index}
        total={matches.total}
        focusRequest={focusRequest}
        onQueryChange={setQuery}
        onNext={() => step(1)}
        onPrevious={() => step(-1)}
        onClose={close}
      />
    </div>
  ) : null;
  return { open: openFind, bar };
}

function startTarget(matches: Matches, root: Element | null, scroller: Element | null | undefined) {
  if (!matches.total) return null;
  let top = Infinity;
  const view = scroller?.getBoundingClientRect();
  if (root && view)
    for (const element of root.querySelectorAll('[data-row-id]')) {
      const rect = element.getBoundingClientRect();
      if (rect.bottom <= view.top || rect.top >= view.bottom) continue;
      const order = matches.order.get(element.getAttribute('data-row-id')!);
      if (order !== undefined && order < top) top = order;
    }
  // The first match from the visible top down, else the nearest one above it.
  const after = matches.ids.findIndex((id) => matches.order.get(id)! >= top);
  const unit = after < 0 ? matches.ids.length - 1 : after;
  return { id: matches.ids[unit]!, occurrence: after < 0 ? matches.counts[unit]! - 1 : 0 };
}

function intersects(element: Element, scroller: Element) {
  const rect = element.getBoundingClientRect();
  const view = scroller.getBoundingClientRect();
  return rect.bottom > view.top && rect.top < view.bottom;
}

function paintRows(owner: object, root: Element | null, query: string, target: Target | null) {
  if (!root || !query) {
    paintMatches(owner, []);
    return;
  }
  const all: Range[] = [];
  let active: Range[] = [];
  for (const element of root.querySelectorAll('[data-find-text]')) {
    const ranges = findRanges(element, query);
    all.push(...ranges);
    if (target && element.closest('[data-row-id]')?.getAttribute('data-row-id') === target.id)
      active = active.concat(ranges);
  }
  const range = target ? active[Math.min(target.occurrence, active.length - 1)] : undefined;
  paintMatches(owner, all, range);
  return range;
}

function countIn(haystack: string, needle: string) {
  let count = 0;
  for (
    let at = haystack.indexOf(needle);
    at !== -1;
    at = haystack.indexOf(needle, at + needle.length)
  )
    count++;
  return count;
}

const texts = new WeakMap<TimelineRow, string>();

/** Folded text as the row renders it: user messages verbatim, answers without Markdown syntax. */
function searchText(row: TimelineRow) {
  let text = texts.get(row);
  if (text !== undefined) return text;
  text =
    row.type === 'text'
      ? fold(markdownText(row.text))
      : row.type === 'message' && row.message.type === 'user'
        ? fold(row.message.text)
        : '';
  texts.set(row, text);
  return text;
}

/**
 * Approximates rendered Markdown text without a parse: drops syntax that never
 * renders as text, so counts line up with what the reader sees.
 */
function markdownText(source: string) {
  return source
    .replace(/^ {0,3}(?:`{3,}|~{3,}).*$/gm, '')
    .replace(/!?\[([^\]\n]*)\]\([^)\n]*\)/g, '$1')
    .replace(/^ {0,3}#{1,6}[ \t]+/gm, '')
    .replace(/^ {0,3}>[ \t]?/gm, '')
    .replace(/^[ \t]*(?:[-*+]|\d+[.)])[ \t]+(?:\[[ xX]\][ \t]+)?/gm, '')
    .replace(/^[ \t]*\|?(?:[ \t]*:?-{3,}:?[ \t]*\|?)+[ \t]*$/gm, '')
    .replace(/^[ \t]*\|.*\|[ \t]*$/gm, (line) => line.replace(/\|/g, '\n'))
    .replace(/(\*\*|__|~~)(?=\S)([^\n]*?\S)\1/g, '$2')
    .replace(/(^|[^\w*])\*(?=\S)([^*\n]*?\S)\*(?![\w*])/g, '$1$2')
    .replace(/(^|[^\w])_(?=\S)([^_\n]*?\S)_(?!\w)/g, '$1$2')
    .replace(/(`+)([^`\n]+?)\1/g, '$2')
    .replace(/<\/?[a-zA-Z][^>\n]*>/g, '')
    .replace(/\\([\\`*_{}[\]()#+\-.!|>~])/g, '$1');
}
