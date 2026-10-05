import { useRef, useState } from 'react';
import { useIsMutating, useMutation, useQueryClient } from '@tanstack/react-query';
import { sessionFullAccess, type SessionInfo } from '@opencodex/contracts';
import { Button } from '../../components/ui/button';
import { Dialog } from '../../components/ui/dialog';
import { api } from '../../lib/api';
import { Shield01Icon, ShieldEnergyIcon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import './permission-control.css';

export function PermissionControl({
  sessionID,
  session,
  disabled = false,
  request = false,
}: {
  sessionID: string;
  session?: SessionInfo;
  disabled?: boolean;
  request?: boolean;
}) {
  const client = useQueryClient();
  const [confirm, setConfirm] = useState(false);
  const cancel = useRef<HTMLButtonElement>(null);
  const mutationKey = ['chat', sessionID, 'access'];
  const pending = useIsMutating({ mutationKey }) > 0;
  const full = session ? sessionFullAccess(session) : false;
  const access = useMutation({
    mutationKey,
    mutationFn: (mode: 'default' | 'full') => api.sessionAccess(sessionID, mode),
    retry: false,
    onSuccess: () => setConfirm(false),
    onSettled: () => {
      void client.invalidateQueries({ queryKey: ['chat', sessionID, 'info'] });
      void client.invalidateQueries({ queryKey: ['chat', sessionID, 'permissions'] });
      void client.invalidateQueries({ queryKey: ['subagent-attention', sessionID] });
      void client.invalidateQueries({ queryKey: ['attention'] });
    },
  });
  return (
    <>
      <Button
        size="sm"
        variant="ghost"
        className={request ? undefined : 'permission-control'}
        data-full-access={full}
        disabled={disabled || !session || pending}
        aria-label={
          request
            ? 'Enable full access for this thread'
            : full
              ? 'Full access: restore OpenCode permissions'
              : 'Permissions: enable full access'
        }
        aria-pressed={request ? undefined : full}
        title={
          full
            ? 'Full access — click to restore OpenCode permissions'
            : 'OpenCode permissions — click to enable full access'
        }
        onClick={() => {
          access.reset();
          if (full && !request) access.mutate('default');
          else setConfirm(true);
        }}
      >
        {!request && <HugeiconsIcon icon={full ? ShieldEnergyIcon : Shield01Icon} size={16} />}
        <span>{request ? 'Enable full access…' : full ? 'Full access' : 'Permissions'}</span>
      </Button>
      {access.isError && !confirm && (
        <span className="text-error" role="alert">
          {access.error.message}
        </span>
      )}
      {confirm && (
        <Dialog
          title="Enable full access?"
          busy={pending}
          initialFocus={cancel}
          onClose={() => setConfirm(false)}
        >
          <p className="message-note">
            This agent can read and change files outside the project and run commands without
            approval, including destructive commands and access to secrets. Only enable this for
            work you trust.
          </p>
          <p className="message-note">
            Applies to this thread and new subagents. Existing subagents keep their own permissions.
            Pending approvals in this thread will be allowed. Your global OpenCode settings stay
            unchanged; server policies still apply.
          </p>
          {access.isError && (
            <p className="text-error" role="alert">
              {access.error.message}
            </p>
          )}
          <div className="dialog-actions">
            <Button
              ref={cancel}
              variant="secondary"
              disabled={pending}
              onClick={() => setConfirm(false)}
            >
              Cancel
            </Button>
            <Button disabled={pending} onClick={() => access.mutate('full')}>
              {pending ? 'Enabling…' : 'Enable full access'}
            </Button>
          </div>
        </Dialog>
      )}
    </>
  );
}
