import { memo, useEffect, type RefObject } from 'react';
import { useStore } from 'zustand';
import { useDraftStore } from './draft-context';
import { EMPTY_COMMENTS } from './review-comments';

/** Native highlights leave Markdown and the virtualized transcript DOM untouched. */
export const ResponseMarks = memo(function ResponseMarks({
  root,
  sessionID,
  messageID,
  ordinal,
  text,
}: {
  root: RefObject<HTMLDivElement | null>;
  sessionID: string;
  messageID: string;
  ordinal: number;
  text: string;
}) {
  const store = useDraftStore();
  const comments = useStore(store, (state) => state.drafts[sessionID]?.comments ?? EMPTY_COMMENTS);
  useEffect(() => {
    const element = root.current;
    if (!element || typeof Highlight === 'undefined' || !CSS.highlights) return;
    const targets = comments.flatMap(({ target }) =>
      'messageID' in target && target.messageID === messageID && target.ordinal === ordinal
        ? [target]
        : [],
    );
    if (!targets.length) return;
    const content = element.textContent ?? '';
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    const nodes: { node: Node; offset: number; end: number }[] = [];
    let offset = 0;
    while (walker.nextNode()) {
      const node = walker.currentNode;
      const end = offset + (node.textContent?.length ?? 0);
      nodes.push({ node, offset, end });
      offset = end;
    }
    const highlight = CSS.highlights.get('reviewed-response') ?? new Highlight();
    const ranges: Range[] = [];
    for (const target of targets) {
      const start = target.offset ?? content.indexOf(target.quote);
      if (start < 0 || content.slice(start, start + target.quote.length) !== target.quote) continue;
      const end = start + target.quote.length;
      const first = nodes.find((entry) => entry.end > start);
      const last = nodes.find((entry) => entry.end >= end);
      if (!first || !last) continue;
      const range = document.createRange();
      range.setStart(first.node, start - first.offset);
      range.setEnd(last.node, end - last.offset);
      ranges.push(range);
      highlight.add(range);
    }
    CSS.highlights.set('reviewed-response', highlight);
    return () => {
      for (const range of ranges) highlight.delete(range);
      if (!highlight.size) CSS.highlights.delete('reviewed-response');
    };
  }, [root, comments, messageID, ordinal, text]);
  return null;
});
