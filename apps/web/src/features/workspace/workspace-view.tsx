import type { ReactNode } from 'react';
import type { Project } from '@opencodex/contracts';
import { Button } from '../../components/ui/button';
import { useConnection } from '../connection/use-connection';
import { ProjectForm } from '../projects/project-form';
import { BrandIcon } from '../brand/brand';

/** Connection and project setup; a chosen project shows the new-thread composer instead. */
export function WorkspaceView({
  onSelectProject,
}: {
  onSelectProject: (project: Project) => void;
}) {
  const { connection, connect, connected } = useConnection();

  if (!connected) {
    if (connection.isPending) {
      return (
        <EmptyState title="Looking for OpenCode…" description="Checking for your local service." />
      );
    }
    const unreachable = connection.isError;
    return (
      <EmptyState
        title={unreachable ? 'Can’t reach the gateway' : 'Connect to OpenCode'}
        description={
          unreachable
            ? 'Check that the OpenCodex server is running, then try again.'
            : connection.data?.status === 'disconnected'
              ? connection.data.message
              : undefined
        }
      >
        <Button
          disabled={connect.isPending || connection.isFetching}
          onClick={() => (unreachable ? void connection.refetch() : connect.mutate())}
        >
          {connect.isPending ? 'Connecting…' : unreachable ? 'Try again' : 'Connect'}
        </Button>
        {connect.isError && (
          <p className="empty-error" role="alert">
            {connect.error.message}
          </p>
        )}
      </EmptyState>
    );
  }

  return (
    <EmptyState
      title="Open a project"
      description="Choose a folder on the machine running OpenCodex."
    >
      <ProjectForm onSelect={onSelectProject} />
    </EmptyState>
  );
}

function EmptyState({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <BrandIcon size="large" className="hero-art" />
      <h1>{title}</h1>
      {description && <p>{description}</p>}
      {children && <div className="empty-actions">{children}</div>}
    </div>
  );
}
