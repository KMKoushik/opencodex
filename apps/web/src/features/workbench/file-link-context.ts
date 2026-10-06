import { createContext } from 'react';

/** Opens a chat link inside the app and returns true, or returns false to let it open normally. */
export const FileLinkContext = createContext<
  ((href: string, event?: { metaKey: boolean; ctrlKey: boolean }) => boolean) | null
>(null);
