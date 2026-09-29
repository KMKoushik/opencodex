import type { ReactNode } from 'react';
import type { Project, Session } from '@opencodex/contracts';
import { Button } from '../../components/ui/button';
import { useConnection } from '../connection/use-connection';
import { ProjectForm } from '../projects/project-form';

export function WorkspaceView({
  project,
  session,
  sessionCount,
  onSelectProject,
}: {
  project: Project | null;
  session: Session | undefined;
  sessionCount: number | undefined;
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

  if (!project) {
    return (
      <EmptyState
        title="Open a project"
        description="Choose a folder on the machine running OpenCodex."
      >
        <ProjectForm onSelect={onSelectProject} />
      </EmptyState>
    );
  }

  if (!session) {
    return (
      <EmptyState
        title={project.name}
        description={
          sessionCount === 0
            ? 'This project has no sessions yet.'
            : 'Select a session from the sidebar.'
        }
      >
        <code className="empty-path">{project.directory}</code>
      </EmptyState>
    );
  }

  return (
    <article className="session-view">
      <dl className="session-meta">
        <div>
          <dt>Updated</dt>
          <dd>{new Date(session.updatedAt).toLocaleString()}</dd>
        </div>
        <div>
          <dt>Model</dt>
          <dd>{session.model ?? 'Default'}</dd>
        </div>
      </dl>
      <p className="session-note">Messages for this session aren’t shown in OpenCodex yet.</p>
    </article>
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
      <h1>{title}</h1>
      {description && <p>{description}</p>}
      {children && <div className="empty-actions">{children}</div>}
    </div>
  );
}
