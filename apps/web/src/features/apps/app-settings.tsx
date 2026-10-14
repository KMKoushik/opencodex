import { useState } from 'react';
import { ArrowUpRight01Icon, PlayIcon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { useQuery } from '@tanstack/react-query';
import { parseEvery, type AppInfo } from '@opencodex/contracts/canvas';
import { Button } from '../../components/ui/button';
import { api } from '../../lib/api';
import { appRunsKey } from '../canvas/canvas-context';
import { ProjectIcon } from '../projects/project-icon';
import { projectName } from '../projects/project-metadata';
import { SettingsGroup, SettingsRow } from '../settings/settings-layout';
import { AppIcon } from './app-icon';
import { MODEL_SOURCE, useAppModel, useAppProject } from './app-hooks';
import { ago, everyLabel } from './app-time';

const created = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });
const sentence = (text: string) => text[0]!.toUpperCase() + text.slice(1);

/** How the app is set up: canvas.json and the triggers in server.ts, as settings rows. */
export function AppSettings({
  app,
  connected,
  onRun,
  onOpenSession,
  onChangeIcon,
  onChangeModel,
}: {
  app: AppInfo;
  connected: boolean;
  onRun: (name: string) => void;
  onOpenSession: (sessionID: string) => void;
  onChangeIcon: () => void;
  onChangeModel: () => void;
}) {
  // When the tab opened; next runs are hours apart, so it needn't tick.
  const [now] = useState(Date.now);
  const model = useAppModel(app.id);
  const project = useAppProject(app.projectID);
  const runs = useQuery({
    queryKey: appRunsKey(app.id),
    queryFn: ({ signal }) => api.appRuns(app.id, signal),
  });
  return (
    <div className="apps-settings scrollbar-on-hover">
      <SettingsGroup title="App">
        <SettingsRow label="Icon">
          <button
            className="apps-icon-button"
            aria-label="Change icon"
            title="Change icon"
            disabled={!connected}
            onClick={onChangeIcon}
          >
            <AppIcon id={app.id} title={app.title} icon={app.icon} size={28} />
          </button>
        </SettingsRow>
        <SettingsRow label="Name" description={app.title} />
        {project && (
          <SettingsRow label="Project" description={<code>{project.canonical}</code>}>
            <span className="apps-project">
              <ProjectIcon name={projectName(project)} icon={project.icon} />
              {projectName(project)}
            </span>
          </SettingsRow>
        )}
        <SettingsRow label="Created" description={created.format(app.created)}>
          {app.sessionID && (
            <Button variant="secondary" size="sm" onClick={() => onOpenSession(app.sessionID!)}>
              Open chat
              <HugeiconsIcon icon={ArrowUpRight01Icon} size={13} />
            </Button>
          )}
        </SettingsRow>
        <SettingsRow label="Folder" description={<code>{app.path}</code>} />
      </SettingsGroup>

      <SettingsGroup title="Model">
        <SettingsRow
          label={model.name ?? (model.current.isPending ? 'Loading…' : 'No model')}
          description={
            model.current.data
              ? `${MODEL_SOURCE[model.current.data.source]} Used by oc.ask and oc.run unless the code names one.`
              : model.current.error?.message
          }
        >
          <Button variant="secondary" size="sm" disabled={!connected} onClick={onChangeModel}>
            Change
          </Button>
        </SettingsRow>
      </SettingsGroup>

      <SettingsGroup title="Functions">
        {app.functions.length === 0 && (
          <SettingsRow label="No functions" description="server.ts exports no functions yet." />
        )}
        {app.functions.map((name) => {
          const every = app.triggers[name]?.every;
          const last = runs.data?.find((run) => run.fn === name);
          const ms = every ? parseEvery(every) : undefined;
          const running = app.running.includes(name);
          const details = [
            every ? sentence(everyLabel(every)) : 'On demand',
            running
              ? 'running now'
              : last
                ? `${last.status === 'error' ? 'failed' : 'ran'} ${ago(last.ended ?? last.started)}`
                : runs.data && 'never run',
            // The gateway fires a trigger `every` after its last run, while OpenCodex is open.
            ms && last && !running && `next ${ago(Math.max(now, last.started + ms))}`,
          ].filter(Boolean);
          return (
            <SettingsRow key={name} label={name} description={details.join(' · ')}>
              {every && (
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={!connected || running}
                  onClick={() => onRun(name)}
                >
                  <HugeiconsIcon icon={PlayIcon} size={12} />
                  Run
                </Button>
              )}
            </SettingsRow>
          );
        })}
      </SettingsGroup>
    </div>
  );
}
