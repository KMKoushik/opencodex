import { expect, it } from 'vitest';
import { parsePatchFiles } from '@pierre/diffs';
import { diffComment } from './diff-comment';

it('quotes native patch selections using hunk offsets and preserves the old/new side', () => {
  const file = parsePatchFiles(
    '--- a/file.ts\n+++ b/file.ts\n@@ -4,2 +4,3 @@\n same\n-old\n+new\n+extra\n@@ -90 +91 @@\n-before\n+after\n',
  )[0]!.files[0]!;
  expect(diffComment('file.ts', file, { start: 91, end: 91, side: 'additions' })).toEqual({
    path: 'file.ts',
    start: 91,
    end: 91,
    side: 'new',
    quote: 'after\n',
  });
  expect(diffComment('file.ts', file, { start: 90, end: 90, side: 'deletions' })).toEqual({
    path: 'file.ts',
    start: 90,
    end: 90,
    side: 'old',
    quote: 'before\n',
  });
});
