import { useId, useRef, useState } from 'react';
import { MoreHorizontalIcon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { useQuery } from '@tanstack/react-query';
import { sessionSummary } from '@opencodex/contracts';
import { Button } from '../../components/ui/button';
import { api } from '../../lib/api';
import { cn } from '../../lib/utils';
import { isSettled } from '../threads/focus';
import { SessionActionsMenu, type SessionActionsHandle } from './session-actions-menu';

export function SessionActionsToggle({
  sessionID,
  title,
  className,
}: {
  sessionID: string;
  title: string;
  className?: string;
}) {
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<SessionActionsHandle>(null);
  const [open, setOpen] = useState(false);
  const info = useQuery({
    queryKey: ['chat', sessionID, 'info'],
    queryFn: ({ signal }) => api.session(sessionID, signal),
    select: sessionSummary,
  });
  const active = useQuery({
    queryKey: ['active'],
    queryFn: ({ signal }) => api.active(signal),
    refetchOnMount: false,
  });
  return (
    <div className={cn('session-actions-toggle', className)}>
      <Button
        ref={trigger}
        variant="ghost"
        size="icon"
        aria-label="Thread actions"
        title="Thread actions"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={id}
        popoverTarget={id}
        onClick={(event) => {
          event.preventDefault();
          if (open) menu.current?.dismiss();
          else menu.current?.show();
        }}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            menu.current?.show();
          }
        }}
      >
        <HugeiconsIcon icon={MoreHorizontalIcon} size={16} />
      </Button>
      <SessionActionsMenu
        ref={menu}
        id={id}
        sessionID={sessionID}
        title={title}
        connected
        pinned={Boolean(info.data?.pinned)}
        done={Boolean(info.data && isSettled(info.data))}
        running={Boolean(active.data?.[sessionID])}
        anchor={trigger}
        align="end"
        onOpenChange={setOpen}
      />
    </div>
  );
}
