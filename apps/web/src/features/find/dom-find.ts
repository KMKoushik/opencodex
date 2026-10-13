const SKIP =
  'script, style, textarea, input, svg, [hidden], [aria-hidden="true"], [data-find-skip]';
const BLOCK =
  'p, li, td, th, pre, h1, h2, h3, h4, h5, h6, blockquote, div, dt, dd, figcaption, summary, tr';
export const MATCH_LIMIT = 2000;

/**
 * Case-insensitive matching without changing string length, so offsets in the
 * folded text address the original text nodes.
 */
export function fold(text: string) {
  const lower = text.toLowerCase();
  if (lower.length === text.length) return lower;
  let out = '';
  for (const char of text) {
    const folded = char.toLowerCase();
    out += folded.length === char.length ? folded : char;
  }
  return out;
}

/** Offsets of each occurrence of an already folded needle. */
export function occurrences(haystack: string, needle: string, limit = MATCH_LIMIT) {
  const found: number[] = [];
  if (!needle) return found;
  for (let at = haystack.indexOf(needle); at !== -1 && found.length < limit;) {
    found.push(at);
    at = haystack.indexOf(needle, at + needle.length);
  }
  return found;
}

/**
 * Ranges for each occurrence in the rendered text under `root`. Inline markup
 * (bold, links, syntax tokens) never splits a phrase; block boundaries do.
 */
export function findRanges(root: Element, query: string, limit = MATCH_LIMIT) {
  const needle = fold(query);
  const ranges: Range[] = [];
  if (!needle || root.closest(SKIP)) return ranges;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
    acceptNode: (node) =>
      node instanceof Element
        ? node.matches(SKIP)
          ? NodeFilter.FILTER_REJECT
          : NodeFilter.FILTER_SKIP
        : (node as Text).data
          ? NodeFilter.FILTER_ACCEPT
          : NodeFilter.FILTER_REJECT,
  });
  let text = '';
  let nodes: { node: Text; start: number }[] = [];
  let block: Element | null = null;
  const flush = () => {
    let cursor = 0;
    for (const at of occurrences(fold(text), needle, limit - ranges.length)) {
      while (cursor + 1 < nodes.length && nodes[cursor + 1]!.start <= at) cursor++;
      let end = cursor;
      while (end + 1 < nodes.length && nodes[end + 1]!.start < at + needle.length) end++;
      const range = document.createRange();
      range.setStart(nodes[cursor]!.node, at - nodes[cursor]!.start);
      range.setEnd(nodes[end]!.node, at + needle.length - nodes[end]!.start);
      ranges.push(range);
    }
    text = '';
    nodes = [];
  };
  for (let node = walker.nextNode(); node && ranges.length < limit; node = walker.nextNode()) {
    const textNode = node as Text;
    const owner = textNode.parentElement?.closest(BLOCK) ?? null;
    if (owner !== block) {
      flush();
      block = owner;
    }
    nodes.push({ node: textNode, start: text.length });
    text += textNode.data;
  }
  if (ranges.length < limit) flush();
  return ranges;
}

/** Mutations from the bar itself (its counter) must not trigger a rescan. */
export function insideFindBar(node: Node) {
  return Boolean((node instanceof Element ? node : node.parentElement)?.closest('.find-bar'));
}

const supported = typeof CSS !== 'undefined' && 'highlights' in CSS;
let matches: Highlight | undefined;
let active: Highlight | undefined;
const painted = new Map<object, { ranges: Range[]; current?: Range }>();

/** Paints one owner's matches; several surfaces can show results at once. */
export function paintMatches(owner: object, ranges: Range[], current?: Range) {
  if (!supported) return;
  if (!matches || !active) {
    matches = new Highlight();
    active = new Highlight();
    // Above comment and selection marks, so the current match stays visible.
    matches.priority = 1;
    active.priority = 2;
    CSS.highlights.set('find-match', matches);
    CSS.highlights.set('find-active', active);
  }
  const previous = painted.get(owner);
  if (previous) {
    for (const range of previous.ranges) matches.delete(range);
    if (previous.current) active.delete(previous.current);
  }
  if (!ranges.length && !current) {
    painted.delete(owner);
    return;
  }
  for (const range of ranges) if (range !== current) matches.add(range);
  if (current) active.add(current);
  painted.set(owner, { ranges, current });
}

/** Centers a match in its scroller when it is outside the comfortable reading band. */
export function revealRange(range: Range, scroller: Element) {
  const rect = range.getBoundingClientRect();
  const view = scroller.getBoundingClientRect();
  if (!rect.height && !rect.width) return;
  const margin = Math.min(80, view.height / 4);
  if (rect.top >= view.top + margin && rect.bottom <= view.bottom - margin) return;
  scroller.scrollTop += rect.top - view.top - view.height / 2 + rect.height / 2;
}
