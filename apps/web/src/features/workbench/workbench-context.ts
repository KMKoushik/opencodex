import { createContext, useContext } from 'react';
import type { createWorkbenchStore } from './workbench-store';

export const WorkbenchContext = createContext<ReturnType<typeof createWorkbenchStore> | null>(null);
export function useWorkbenchStore() {
  const store = useContext(WorkbenchContext);
  if (!store) throw new Error('WorkbenchProvider is required');
  return store;
}
export const workbenchKey = (sessionID: string | undefined, directory: string | undefined) =>
  sessionID || JSON.stringify(['project', directory ?? '']);
