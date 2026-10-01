import { createContext, useContext, useLayoutEffect, useState, type ReactNode } from 'react';
import { useSyncLayout } from '@legendapp/list/react';
import { ArrowRight01Icon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';

const DisclosureContext = createContext(new Map<string, boolean>());

export function DisclosureProvider({ children }: { children: ReactNode }) {
  const [states] = useState(() => new Map<string, boolean>());
  return <DisclosureContext value={states}>{children}</DisclosureContext>;
}

export function Disclosure({
  id,
  label,
  children,
  className = '',
}: {
  id: string;
  label: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const states = useContext(DisclosureContext);
  const [open, setOpen] = useState(() => states.get(id) ?? false);
  const syncLayout = useSyncLayout();
  // Update the virtual row's measurement before paint, not a frame after the
  // expanded content appears over the next message.
  useLayoutEffect(syncLayout, [open, syncLayout]);
  return (
    <section className={`disclosure ${className}`}>
      <button
        type="button"
        className="disclosure-trigger"
        aria-expanded={open}
        onClick={() => {
          states.set(id, !open);
          setOpen(!open);
        }}
      >
        <HugeiconsIcon
          icon={ArrowRight01Icon}
          size={14}
          className="disclosure-chevron"
          data-open={open}
        />
        {label}
      </button>
      {open && <div className="disclosure-content">{children}</div>}
    </section>
  );
}
