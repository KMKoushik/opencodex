import { createContext, useContext } from 'react';
import type { CommandRegistry } from './commands';

export const ShortcutContext = createContext<CommandRegistry | null>(null);

export function useCommandRegistry() {
  const registry = useContext(ShortcutContext);
  if (!registry) throw new Error('ShortcutsProvider is required');
  return registry;
}
