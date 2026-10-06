import { useQuery } from '@tanstack/react-query';
import type { SessionInfo } from '@opencodex/contracts';
import { api } from '../../lib/api';

/** The chat's native checkout: its project's local folder or one of its Git worktrees. */
export function useCheckout(session: SessionInfo | undefined) {
  const project = useQuery({
    queryKey: ['projects'],
    queryFn: ({ signal }) => api.projects(signal),
    enabled: Boolean(session),
    select: (projects) => projects.find((project) => project.id === session?.projectID),
  });
  const directory = session?.location.directory;
  const canonical = project.data?.vcs ? project.data.canonical : undefined;
  const local = Boolean(directory && canonical && withinCheckout(directory, canonical));
  const trees = useQuery({
    queryKey: ['worktrees', session?.projectID],
    queryFn: ({ signal }) => api.worktrees(session!.projectID, signal),
    enabled: Boolean(canonical && !local),
    staleTime: 30_000,
  });
  return {
    canonical,
    directory,
    local,
    /** A chat in a worktree that OpenCode no longer lists; its history stays readable. */
    removed:
      Boolean(canonical && !local && directory) &&
      trees.isSuccess &&
      !trees.data.some((tree) => withinCheckout(directory!, tree.directory)),
  };
}

export function withinCheckout(directory: string, checkout: string) {
  return (
    directory === checkout ||
    directory.startsWith(`${checkout}/`) ||
    directory.startsWith(`${checkout}\\`)
  );
}
