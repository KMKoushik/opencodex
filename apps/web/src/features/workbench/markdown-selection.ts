import type { ExtraProps } from 'react-markdown';
import type { FileCommentTarget } from '../chat/review-comments';

/** Reuse the Markdown parser's positions; no second parse or text-search guessing. */
export function markdownSourcePositions() {
  return (tree: { children: { type: string }[] }) => {
    const visit = (node: { type: string }) => {
      if (node.type !== 'element') return;
      const element = node as NonNullable<ExtraProps['node']>;
      if (element.position) {
        element.properties['data-source-start'] = element.position.start.line;
        element.properties['data-source-end'] = element.position.end.line;
      }
      element.children.forEach(visit);
    };
    tree.children.forEach(visit);
  };
}

export function markdownSelectionTarget(
  range: Range,
  previewQuote: string,
  file: Pick<FileCommentTarget, 'directory' | 'path' | 'version'>,
  lines: readonly string[],
): FileCommentTarget | undefined {
  const first = range.startContainer.parentElement?.closest<HTMLElement>('[data-source-start]');
  const last = range.endContainer.parentElement?.closest<HTMLElement>('[data-source-end]');
  const start = Number(first?.dataset.sourceStart);
  const end = Number(last?.dataset.sourceEnd);
  if (
    !Number.isInteger(start) ||
    !Number.isInteger(end) ||
    start < 1 ||
    end < start ||
    end > lines.length
  )
    return;
  // Source comments are line-based. Keep those lines for stale-anchor checks and the
  // exact rendered excerpt separately, so formatting never changes what gets quoted.
  return {
    ...file,
    start,
    end,
    quote: lines
      .slice(start - 1, end)
      .join('\n')
      .replace(/\r$/, '')
      .slice(0, 8000),
    previewQuote,
  };
}
