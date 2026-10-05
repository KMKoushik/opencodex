import type { Project } from '@opencodex/contracts';
import { Button } from '../../components/ui/button';
import { useConnection } from '../connection/use-connection';
import { SettingsGroup, SettingsRow } from './settings-layout';
import { UpdateSettings } from '../updates/update-settings';

export function GeneralSettings({
  live,
  project,
  onCloseProject,
}: {
  live: boolean;
  project: Project | null;
  onCloseProject: () => void;
}) {
  const { connection, connect, connected } = useConnection();
  const status = connection.isError
    ? 'The local gateway is unavailable.'
    : connection.data?.status === 'connected'
      ? `Connected · v${connection.data.version}`
      : (connection.data?.message ?? 'Checking…');

  return (
    <>
      <UpdateSettings />
      <SettingsGroup title="OpenCode">
        <SettingsRow
          label="Service"
          description={
            <span role="status" className={connect.isError ? 'text-error' : undefined}>
              {connect.error?.message ?? status}
            </span>
          }
        >
          <Button
            variant="secondary"
            size="sm"
            disabled={connect.isPending || connection.isFetching}
            onClick={() => (connected ? void connection.refetch() : connect.mutate())}
          >
            {connect.isPending ? 'Connecting…' : connected ? 'Check' : 'Connect'}
          </Button>
        </SettingsRow>
        <SettingsRow
          label="Live updates"
          description={connected ? (live ? 'Connected' : 'Reconnecting…') : 'Unavailable'}
        />
      </SettingsGroup>
      <SettingsGroup title="Project">
        <SettingsRow
          label={project?.name ?? 'No project open'}
          description={project && <code>{project.directory}</code>}
        >
          {project && (
            <Button variant="secondary" size="sm" onClick={onCloseProject}>
              Close project
            </Button>
          )}
        </SettingsRow>
      </SettingsGroup>
    </>
  );
}
