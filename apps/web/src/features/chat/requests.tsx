import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { PermissionRequest, PermissionReply } from '@opencodex/contracts';
import { api } from '../../lib/api';
import { Button } from '../../components/ui/button';

export function PermissionCard({ request }: { request: PermissionRequest }) {
  const client = useQueryClient();
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
        <Button size="sm" disabled={reply.isPending} onClick={() => reply.mutate('once')}>
          Allow once
        </Button>
        {Boolean(request.save?.length) && (
          <Button
            size="sm"
            variant="secondary"
            disabled={reply.isPending}
            onClick={() => reply.mutate('always')}
          >
            Always allow
          </Button>
        )}
        <Button
          size="sm"
          variant="ghost"
          disabled={reply.isPending}
          onClick={() => reply.mutate('reject')}
        >
          Reject
        </Button>
      </div>
      {reply.isError && (
        <p className="text-error" role="alert">
          {reply.error.message}
        </p>
      )}
    </section>
  );
}
