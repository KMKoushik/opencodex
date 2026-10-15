import type { FileDiffLoadedFiles, FileDiffMetadata } from '@pierre/diffs';

/**
 * Rebuilds both sides of a file from a whole-file-context patch, which is a single hunk
 * holding every line. Pierre uses them to expand collapsed unchanged lines.
 */
export function diffFiles(patch: string, file: FileDiffMetadata): FileDiffLoadedFiles {
  const lines = patch.split('\n');
  const start = lines.findIndex((line) => line.startsWith('@@'));
  if (start < 0) throw new Error('The patch has no hunk.');
  const old: string[] = [];
  const next: string[] = [];
  let open = { old: true, next: true };
  let last: 'old' | 'next' | 'both' = 'both';
  for (let index = start + 1; index < lines.length; index++) {
    const line = lines[index]!;
    if (line === '' && index === lines.length - 1) break;
    if (line.startsWith('@@')) throw new Error('Expected one whole-file hunk.');
    const text = line.slice(1);
    if (line.startsWith('\\')) {
      // "\ No newline at end of file" applies to the line before it.
      if (last !== 'next') open = { ...open, old: false };
      if (last !== 'old') open = { ...open, next: false };
    } else if (line.startsWith('-')) {
      old.push(text);
      last = 'old';
    } else if (line.startsWith('+')) {
      next.push(text);
      last = 'next';
    } else {
      old.push(text);
      next.push(text);
      last = 'both';
    }
  }
  const contents = (side: string[], newline: boolean) =>
    side.length ? side.join('\n') + (newline ? '\n' : '') : '';
  return {
    oldFile: { name: file.prevName ?? file.name, contents: contents(old, open.old) },
    newFile: { name: file.name, contents: contents(next, open.next) },
  };
}
