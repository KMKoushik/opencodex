import { createContext } from 'react';

/** Adds selected main-chat text to a side chat. Provided only around the main chat. */
export const SideChatQuoteContext = createContext<((quote: string) => void) | null>(null);

/** Opens one of the main chat's side chats. Provided only around the main chat. */
export const SideChatOpenContext = createContext<((sideID: string) => void) | null>(null);
