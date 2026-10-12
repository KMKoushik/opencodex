import { createContext } from 'react';

/** Opens a canvas full-size in the workbench; absent outside a chat. */
export const CanvasOpenContext = createContext<((id: string) => void) | null>(null);

export const canvasSourceKey = (id: string) => ['canvas', id, 'source'] as const;
export const canvasDataKey = (id: string) => ['canvas', id, 'data'] as const;
