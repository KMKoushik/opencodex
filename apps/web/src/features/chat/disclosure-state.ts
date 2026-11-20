import { createContext, useContext, useLayoutEffect, useState } from 'react';
import { useSyncLayout } from '@legendapp/list/react';

export const DisclosureContext = createContext(new Map<string, boolean>());

/** Open state that survives virtualization (rows unmount while scrolled away). */
export function useDisclosure(id: string) {
  const states = useContext(DisclosureContext);
  const [open, setOpen] = useState(() => states.get(id) ?? false);
  const syncLayout = useSyncLayout();
  // Update the virtual row's measurement before paint, not a frame after the
  // expanded content appears over the next message.
  useLayoutEffect(syncLayout, [open, syncLayout]);
  const toggle = () => {
    states.set(id, !open);
    setOpen(!open);
  };
  return [open, toggle] as const;
}
