import { fromMarkdown } from 'mdast-util-from-markdown';

// Reference definitions resolve across the whole document, so such text stays whole.
const DEFINITION = /^ {0,3}\[[^\]\n]+\]:/m;

/**
 * Splits streamed Markdown into top-level blocks so only the growing tail re-renders.
 * A block followed by two later blocks can no longer change (a list can still absorb the
 * next item until something else follows it), so it is kept and never parsed again.
 */
export function createBlockSplitter() {
  let settled: string[] = [];
  let source = '';
  return (text: string): string[] => {
    if (DEFINITION.test(text)) {
      settled = [];
      source = '';
      return [text];
    }
    if (!text.startsWith(source)) {
      settled = [];
      source = '';
    }
    const rest = text.slice(source.length);
    const starts = fromMarkdown(rest).children.map((node) => node.position?.start.offset ?? 0);
    const blocks = starts.map((start, index) => rest.slice(start, starts[index + 1]));
    const settle = Math.max(0, blocks.length - 2);
    if (settle) {
      settled = [...settled, ...blocks.slice(0, settle)];
      source = text.slice(0, source.length + starts[settle]!);
    }
    return [...settled, ...blocks.slice(settle)];
  };
}
