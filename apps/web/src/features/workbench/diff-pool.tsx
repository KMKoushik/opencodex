import { useEffect, useState, type ReactNode } from 'react';
import { WorkerPoolContext } from '@pierre/diffs/react';
import { WorkerPoolManager } from '@pierre/diffs/worker';
import DiffWorker from '@pierre/diffs/worker/worker.js?worker';
import { useSyntaxTheme } from '../theme/use-theme';
import { diffThemes } from './syntax';

export function DiffPool({ children }: { children: ReactNode }) {
  const syntax = useSyntaxTheme();
  const [pool] = useState(
    () =>
      new WorkerPoolManager(
        { workerFactory: () => new DiffWorker(), poolSize: 2, totalASTLRUCacheSize: 4 },
        {
          theme: diffThemes(syntax),
          preferredHighlighter: 'shiki-js',
          tokenizeMaxLineLength: 2000,
          maxLineDiffLength: 2000,
          lineDiffType: 'word-alt',
        },
      ),
  );
  useEffect(() => () => pool.terminate(), [pool]);
  useEffect(() => {
    void pool.setRenderOptions({ theme: diffThemes(syntax) });
  }, [pool, syntax]);
  return <WorkerPoolContext value={pool}>{children}</WorkerPoolContext>;
}
