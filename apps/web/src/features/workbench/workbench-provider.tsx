import { useEffect, useState, type ReactNode } from 'react';
import { readStorage, writeStorage } from '../../lib/storage';
import { WorkbenchContext } from './workbench-context';
import { createWorkbenchStore, serializeWorkbench } from './workbench-store';

export function WorkbenchProvider({ children }: { children: ReactNode }) {
  const [store] = useState(() => createWorkbenchStore(readStorage('sessionWorkbench')));
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const flush = () => {
      if (timer === undefined) return;
      clearTimeout(timer);
      timer = undefined;
      writeStorage('sessionWorkbench', serializeWorkbench(store.getState().entries));
    };
    const unsubscribe = store.subscribe(() => {
      // Coalesce layout changes, never serialize on pointer-move or streaming paths.
      if (timer === undefined) timer = setTimeout(flush, 200);
    });
    window.addEventListener('pagehide', flush);
    return () => {
      unsubscribe();
      window.removeEventListener('pagehide', flush);
      flush();
    };
  }, [store]);
  return <WorkbenchContext.Provider value={store}>{children}</WorkbenchContext.Provider>;
}
