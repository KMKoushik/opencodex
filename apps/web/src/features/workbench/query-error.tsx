import { Button } from '../../components/ui/button';
export function QueryError({
  query,
}: {
  query: { isError: boolean; error: Error | null; refetch: () => unknown };
}) {
  if (!query.isError) return null;
  return (
    <div role="alert" className="wb-empty text-error">
      <p>{query.error?.message}</p>
      <Button variant="secondary" size="sm" onClick={() => void query.refetch()}>
        Retry
      </Button>
    </div>
  );
}
