import { useEffect, useRef, useState, type RefObject } from 'react';
import { FindBar } from './find-bar';
import { MATCH_LIMIT, findRanges, insideFindBar, paintMatches, revealRange } from './dom-find';
import { useFindScope } from './find-scope';

/** A short, single-line selection inside `root` seeds the query, as browsers do. */
export function selectedQuery(root: Element | null) {
  const selection = getSelection();
  if (!root || !selection || selection.isCollapsed || !root.contains(selection.anchorNode)) return;
  const text = selection.toString().trim();
  return text && text.length <= 200 && !/[\r\n]/.test(text) ? text : undefined;
}

/** First match at or below the top of the visible area, so find starts where the reader is. */
export function firstInView(ranges: Range[], scroller: Element) {
  const top = scroller.getBoundingClientRect().top;
  const index = ranges.findIndex((range) => range.getBoundingClientRect().bottom > top);
  return index < 0 ? 0 : index;
}

/**
 * Find over fully rendered content (Markdown previews, documents). `root` is the
 * scroller; place `bar` as its first child so the bar floats over the content.
 */
export function useDomFind(root: RefObject<HTMLElement | null>, label: string) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [focusRequest, setFocusRequest] = useState(0);
  const [result, setResult] = useState({ index: -1, total: 0 });
  const [owner] = useState(() => ({}));
  const found = useRef<Found>({ ranges: [], index: -1 });
  useEffect(() => {
    const element = root.current;
    if (!open || !element) return;
    const state = found.current;
    state.ranges = findRanges(element, query);
    setResult(show(owner, state, firstInView(state.ranges, element), element));
    let frame = 0;
    // Live documents re-render; keep the count and selection current without stealing scroll.
    const observer = new MutationObserver((records) => {
      if (frame || records.every((record) => insideFindBar(record.target))) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        state.ranges = findRanges(element, query);
        setResult(show(owner, state, Math.min(state.index, state.ranges.length - 1)));
      });
    });
    observer.observe(element, { subtree: true, childList: true, characterData: true });
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
      state.ranges = [];
      paintMatches(owner, []);
    };
  }, [open, query, root, owner]);
  const openFind = () => {
    const seed = selectedQuery(root.current);
    if (seed) setQuery(seed);
    setOpen(true);
    setFocusRequest((value) => value + 1);
  };
  useFindScope(root, openFind);
  const step = (delta: number) => {
    const state = found.current;
    const total = state.ranges.length;
    if (total && root.current)
      setResult(show(owner, state, (state.index + delta + total) % total, root.current));
  };
  const bar = open ? (
    <div className="find-sticky">
      <FindBar
        label={label}
        query={query}
        index={result.index}
        total={result.total}
        capped={result.total >= MATCH_LIMIT}
        focusRequest={focusRequest}
        onQueryChange={setQuery}
        onNext={() => step(1)}
        onPrevious={() => step(-1)}
        onClose={() => {
          setOpen(false);
          root.current?.focus({ preventScroll: true });
        }}
      />
    </div>
  ) : null;
  return { bar };
}

type Found = { ranges: Range[]; index: number };

/** Paints the matches with `next` current, scrolling it into view when given a scroller. */
function show(owner: object, state: Found, next: number, scroller?: Element) {
  state.index = state.ranges.length ? next : -1;
  const current = state.ranges[state.index];
  paintMatches(owner, state.ranges, current);
  if (scroller && current) revealRange(current, scroller);
  return { index: state.index, total: state.ranges.length };
}
