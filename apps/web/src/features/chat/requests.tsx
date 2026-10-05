import { useIsMutating, useMutation, useQueryClient } from '@tanstack/react-query';
import type { PermissionRequest, PermissionReply, SessionInfo } from '@opencodex/contracts';
import { api } from '../../lib/api';
import { Button } from '../../components/ui/button';
import { PermissionControl } from './permission-control';

export function PermissionCard({
  request,
  session,
}: {
  request: PermissionRequest;
  session?: SessionInfo;
}) {
  const client = useQueryClient();
  const accessPending = useIsMutating({ mutationKey: ['chat', request.sessionID, 'access'] }) > 0;
  const reply = useMutation({
    mutationFn: (value: PermissionReply) =>
      api.replyPermission(request.sessionID, request.id, value),
    onSuccess: () =>
      client.invalidateQueries({ queryKey: ['chat', request.sessionID, 'permissions'] }),
  });
  return (
    <section className="request-card" aria-label="Permission request">
      <h2>{request.action}</h2>
      {request.message && <p>{request.message}</p>}
      <pre>{request.resources.join('\n')}</pre>
      <div className="request-actions">
        <Button
          size="sm"
          disabled={reply.isPending || accessPending}
          onClick={() => reply.mutate('once')}
        >
          Allow once
        </Button>
        {Boolean(request.save?.length) && (
          <Button
            size="sm"
            variant="secondary"
            disabled={reply.isPending || accessPending}
            onClick={() => reply.mutate('always')}
          >
            Always allow
          </Button>
        )}
        <Button
          size="sm"
          variant="ghost"
          disabled={reply.isPending || accessPending}
          onClick={() => reply.mutate('reject')}
        >
          Reject
        </Button>
        <PermissionControl
          sessionID={request.sessionID}
          session={session}
          request
          disabled={reply.isPending}
        />
      </div>
      {reply.isError && (
        <p className="text-error" role="alert">
          {reply.error.message}
        </p>
      )}
    </section>
  );
}
