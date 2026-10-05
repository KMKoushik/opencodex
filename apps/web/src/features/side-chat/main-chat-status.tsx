import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';

/**
 * The main chat's state, shown above the side composer. It shares the main chat's existing
 * Query snapshots, which events keep current, so it adds no polling or model calls.
 */
export function MainChatStatus({ mainID }: { mainID: string }) {
  const options = { refetchOnMount: false } as const;
  const info = useQuery({
    queryKey: ['chat', mainID, 'info'],
    queryFn: ({ signal }) => api.session(mainID, signal),
    ...options,
  });
  const active = useQuery({
    queryKey: ['active'],
    queryFn: ({ signal }) => api.active(signal),
    ...options,
  });
  const permissions = useQuery({
    queryKey: ['chat', mainID, 'permissions'],
    queryFn: ({ signal }) => api.permissions(mainID, signal),
    ...options,
  });
  const forms = useQuery({
    queryKey: ['chat', mainID, 'forms'],
    queryFn: ({ signal }) => api.forms(mainID, signal),
    ...options,
  });
  const [state, label] = permissions.data?.length
    ? ['attention', 'Main chat needs approval']
    : forms.data?.length
      ? ['attention', 'Main chat has a question']
      : active.data?.[mainID]
        ? ['running', 'Main chat is working']
        : info.data?.outcome === 'failed'
          ? ['failed', 'Main chat’s last run failed']
          : ['idle', 'Main chat is idle'];
  return (
    <p className="side-chat-main-status" data-state={state} role="status">
      <span aria-hidden="true" />
      {label}
    </p>
  );
}
