import { useEffect, useId, useRef, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { Cancel01Icon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { Button } from './button';
import { cn } from '../../lib/utils';

export function Dialog({
  title,
  onClose,
  children,
  busy = false,
  initialFocus,
  className,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  busy?: boolean;
  initialFocus?: RefObject<HTMLElement | null>;
  className?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const heading = useId();
  const backdrop = useRef(false);
  useEffect(() => {
    const dialog = ref.current!;
    dialog.showModal();
    initialFocus?.current?.focus();
    return () => dialog.close();
  }, [initialFocus]);
  return createPortal(
    <dialog
      ref={ref}
      className={cn('dialog', className)}
      aria-labelledby={heading}
      onCancel={(event) => {
        if (busy) event.preventDefault();
      }}
      onClose={(event) => {
        if (!event.currentTarget.open) onClose();
      }}
      onPointerDown={(event) => {
        backdrop.current = event.target === event.currentTarget;
      }}
      onClick={(event) => {
        if (!busy && backdrop.current && event.target === event.currentTarget) ref.current?.close();
      }}
    >
      <div className="dialog-content">
        <header className="dialog-header">
          <h2 id={heading}>{title}</h2>
          <Button
            variant="ghost"
            size="icon"
            aria-label={`Close ${title.toLowerCase()}`}
            disabled={busy}
            onClick={() => ref.current?.close()}
          >
            <HugeiconsIcon icon={Cancel01Icon} size={16} />
          </Button>
        </header>
        {children}
      </div>
    </dialog>,
    document.body,
  );
}
