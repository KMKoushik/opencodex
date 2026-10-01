import { useEffect, useState, type ReactNode } from 'react';
import { WorkerPoolContext } from '@pierre/diffs/react';
import { WorkerPoolManager } from '@pierre/diffs/worker';
import DiffWorker from '@pierre/diffs/worker/worker.js?worker';

export function DiffPool({ children }: { children: ReactNode }) {
  const [pool] = useState(
    () =>
      new WorkerPoolManager(
        { workerFactory: () => new DiffWorker(), poolSize: 2, totalASTLRUCacheSize: 4 },
        {
          theme: { dark: 'pierre-dark', light: 'pierre-light' },
          preferredHighlighter: 'shiki-js',
          tokenizeMaxLineLength: 2000,
          maxLineDiffLength: 2000,
        },
      ),
  );
  useEffect(() => () => pool.terminate(), [pool]);
  return <WorkerPoolContext value={pool}>{children}</WorkerPoolContext>;
}
