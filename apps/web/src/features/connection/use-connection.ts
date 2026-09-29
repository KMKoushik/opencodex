import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';

export function useConnection() {
  const client = useQueryClient();
  const connection = useQuery({
    queryKey: ['connection'],
    queryFn: ({ signal }) => api.connection(signal),
    refetchInterval: 15_000,
  });
  const connect = useMutation({
    mutationFn: api.connect,
    onMutate: () => client.cancelQueries({ queryKey: ['connection'] }),
    onSuccess: (data) => {
      client.setQueryData(['connection'], data);
      void client.invalidateQueries({ queryKey: ['sessions'] });
    },
  });
  return {
    connection,
    connect,
    connected: !connection.isError && connection.data?.status === 'connected',
  };
}
