import { useState, type ReactNode } from 'react';
import { ArrowRight01Icon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { DisclosureContext, useDisclosure } from './disclosure-state';

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
  const [open, toggle] = useDisclosure(id);
  return (
    <section className={`disclosure ${className}`}>
      <button type="button" className="disclosure-trigger" aria-expanded={open} onClick={toggle}>
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
