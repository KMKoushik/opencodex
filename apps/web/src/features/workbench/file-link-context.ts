import { createContext } from 'react';

export const FileLinkContext = createContext<((href: string) => boolean) | null>(null);
