import { createContext } from 'react';

/** Opens a canvas full-size in the workbench; absent outside a chat. */
export const CanvasOpenContext = createContext<((id: string) => void) | null>(null);

/** Opens a chat by session id, for canvases that link the sessions their server started. */
export const CanvasSessionContext = createContext<((sessionID: string) => void) | null>(null);

export const appsKey = ['apps'] as const;
/** Under `appsKey`, so app events refresh an open run log too. */
export const appRunsKey = (id: string) => ['apps', id, 'runs'] as const;
export const appModelKey = (id: string) => ['apps', id, 'model'] as const;
export const canvasFilesKey = (id: string) => ['canvas', id, 'files'] as const;
export const canvasSourceKey = (id: string) => ['canvas', id, 'source'] as const;
export const canvasDataKey = (id: string) => ['canvas', id, 'data'] as const;
