import type { ReactNode } from 'react';
import type { Project } from '@opencodex/contracts';
import { Button } from '../../components/ui/button';
import { useConnection } from '../connection/use-connection';
import { ProjectForm } from '../projects/project-form';
import { ProjectSwitcher } from '../projects/project-switcher';
import { shortcutProps } from '../shortcuts/commands';
import { BrandIcon } from '../brand/brand';

export function WorkspaceView({
  project,
  projects,
  onSelectProject,
  onNewChat,
  creating,
  createError,
}: {
  project: Project | null;
  projects: Project[];
  onSelectProject: (project: Project) => void;
  onNewChat: () => void;
  creating: boolean;
  createError?: string;
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

  return (
    <EmptyState
      title="What should we build?"
      description="Any model, any provider. Your repo stays on your machine."
    >
      <ProjectSwitcher
        project={project}
        opened={projects}
        disabled={creating}
        onSelect={onSelectProject}
      />
      <Button {...shortcutProps('chat.new')} onClick={onNewChat} disabled={creating}>
        {creating ? 'Creating…' : 'New chat'}
      </Button>
      {createError && (
        <p className="text-error" role="alert">
          {createError}
        </p>
      )}
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
