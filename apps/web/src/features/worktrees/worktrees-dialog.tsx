import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { OpenCodeProject } from '@opencodex/contracts';
import { Button } from '../../components/ui/button';
import { Dialog } from '../../components/ui/dialog';
import { api } from '../../lib/api';
import './worktrees.css';

export function WorktreesDialog({
  project,
  name,
  onClose,
}: {
  project: OpenCodeProject;
  name: string;
  onClose: () => void;
}) {
  const client = useQueryClient();
  const [confirming, setConfirming] = useState<string>();
  const queryKey = ['worktrees', project.id];
  const trees = useQuery({
    queryKey,
    queryFn: ({ signal }) => api.worktrees(project.id, signal),
    select: (trees) =>
      trees.filter((tree) => tree.strategy === 'git' && tree.directory !== project.canonical),
  });
  const remove = useMutation({
    mutationFn: (directory: string) => api.removeWorktree(project.id, directory),
    onSuccess: () => {
      setConfirming(undefined);
      void client.invalidateQueries({ queryKey });
      void client.invalidateQueries({ queryKey: ['sessions'] });
    },
  });
  return (
    <Dialog title={`Worktrees · ${name}`} busy={remove.isPending} onClose={onClose}>
      <p className="message-note">
        Chats started in a new worktree get their own checkout. Removing one deletes it from disk;
        Git refuses if it has uncommitted changes, and its chats stay as read-only history.
      </p>
      {trees.isPending && (
        <p className="message-note" role="status">
          Loading worktrees…
        </p>
      )}
      {trees.isError && (
        <div role="alert" className="text-error">
          <p>{trees.error.message}</p>
          <Button variant="ghost" size="sm" onClick={() => void trees.refetch()}>
            Retry
          </Button>
        </div>
      )}
      {trees.isSuccess && !trees.data.length && (
        <p className="message-note">No worktrees yet. Choose “New worktree” below a new chat.</p>
      )}
      {trees.isSuccess && trees.data.length > 0 && (
        <ul className="worktree-rows" aria-label="Worktrees">
          {trees.data.map((tree) => (
            <li key={tree.directory} className="worktree-row">
              <div>
                <strong>{tree.directory.split(/[\\/]/).filter(Boolean).at(-1)}</strong>
                <span className="worktree-path">{tree.directory}</span>
              </div>
              {confirming === tree.directory ? (
                <>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={remove.isPending}
                    onClick={() => setConfirming(undefined)}
                  >
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    disabled={remove.isPending}
                    onClick={() => remove.mutate(tree.directory)}
                  >
                    {remove.isPending ? 'Removing…' : 'Remove'}
                  </Button>
                </>
              ) : (
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={remove.isPending}
                  aria-label={`Remove worktree ${tree.directory}`}
                  onClick={() => {
                    remove.reset();
                    setConfirming(tree.directory);
                  }}
                >
                  Remove…
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      {remove.isError && (
        <p className="text-error" role="alert">
          {remove.error.message}
        </p>
      )}
    </Dialog>
  );
}
