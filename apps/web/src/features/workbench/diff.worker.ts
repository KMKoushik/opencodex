import { parsePatchFiles } from '@pierre/diffs';
self.onmessage = (event: MessageEvent<{ patch: string; path: string; key: string }>) => {
  try {
    const { patch, path, key } = event.data;
    // Native untracked-file patches may omit file headers.
    const source = patch.startsWith('@@') ? `--- a/${path}\n+++ b/${path}\n${patch}` : patch;
    const file = parsePatchFiles(source, key).flatMap((patch) => patch.files)[0];
    self.postMessage({ file });
  } catch (error) {
    self.postMessage({
      error: error instanceof Error ? error.message : 'Cannot parse this patch.',
    });
  }
};
