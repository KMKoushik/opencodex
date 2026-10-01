import type { FileDiffMetadata, SelectedLineRange } from '@pierre/diffs';
import type { AnnotationTarget } from './annotation';

/** Pierre's partial patches store hunk-relative arrays; file line numbers are not array indexes. */
export function diffComment(
  path: string,
  file: FileDiffMetadata,
  range: SelectedLineRange,
): AnnotationTarget {
  const side = range.side ?? 'additions';
  const endSide = range.endSide ?? side;
  const start = Math.min(range.start, range.end);
  const end = Math.max(range.start, range.end);
  if (side !== endSide)
    return {
      path,
      quote: `Diff selection: ${side === 'deletions' ? 'old' : 'new'} line ${range.start} to ${endSide === 'deletions' ? 'old' : 'new'} line ${range.end}.`,
    };
  const old = side === 'deletions';
  const lines = old ? file.deletionLines : file.additionLines;
  let quote = '';
  for (const hunk of file.hunks) {
    const first = old ? hunk.deletionStart : hunk.additionStart;
    const count = old ? hunk.deletionCount : hunk.additionCount;
    const offset = old ? hunk.deletionLineIndex : hunk.additionLineIndex;
    for (
      let line = Math.max(start, first);
      line <= Math.min(end, first + count - 1) && quote.length < 8000;
      line++
    ) {
      quote += (lines[offset + line - first] ?? '').slice(0, 8000 - quote.length);
      if (!quote.endsWith('\n')) quote += '\n';
    }
    if (quote.length >= 8000) break;
  }
  return { path, start, end, side: old ? 'old' : 'new', quote: quote.slice(0, 8000) };
}
