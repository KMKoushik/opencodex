import { useState } from 'react';
import {
  Add01Icon,
  ArrowDown01Icon,
  ArrowRight01Icon,
  Cancel01Icon,
  Folder01Icon,
} from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { useQuery } from '@tanstack/react-query';
import type { Project } from '@opencodex/contracts';
import { api } from '../../lib/api';
import { Button } from '../../components/ui/button';
import { projectFolder, projectFolders } from './project-metadata';
import { ProjectIcon } from './project-icon';
import { SessionList } from '../sessions/session-list';

export function ProjectList({
  connected,
  live,
  opened,
  current,
  onSelect,
  onClose,
  onNewChat,
  creatingDirectory,
  selectedID,
  onSelectSession,
}: {
  connected: boolean;
  live: boolean;
  opened: Project[];
  current: Project | null;
  onSelect: (project: Project) => void;
  onClose: (directory: string) => void;
  onNewChat: (project: Project) => void;
  creatingDirectory: string | undefined;
  selectedID: string | undefined;
  onSelectSession: (project: Project, id: string) => void;
}) {
  const [expandedDirectories, setExpandedDirectories] = useState(
    () => new Set(current ? [current.directory] : []),
  );
  const [previousDirectory, setPreviousDirectory] = useState(current?.directory);
  if (previousDirectory !== current?.directory) {
    setPreviousDirectory(current?.directory);
    if (current && !expandedDirectories.has(current.directory)) {
      setExpandedDirectories(new Set(expandedDirectories).add(current.directory));
    }
  }
  const projects = useQuery({
    queryKey: ['projects'],
    queryFn: ({ signal }) => api.projects(signal),
    select: projectFolders,
    enabled: connected && opened.length > 0,
  });
  if (!connected) return null;
  const items = opened.map((project) => {
    const metadata = projects.data?.get(project.directory);
    return metadata ? projectFolder(metadata) : project;
  });
  return (
    <nav className="project-groups" aria-label="Projects">
      {opened.length > 0 && projects.isError && (
        <div className="sidebar-note" role="alert">
          <p>{projects.error.message}</p>
          <Button variant="ghost" size="sm" onClick={() => void projects.refetch()}>
            Retry
          </Button>
        </div>
      )}
      {!items.length && <p className="sidebar-note">Open a project to get started.</p>}
      {items.map((project) => {
        const active = current?.directory === project.directory;
        const metadata = projects.data?.get(project.directory);
        const expanded = expandedDirectories.has(project.directory);
        return (
          <div className="project-group" key={project.directory}>
            <div className="project-heading">
              <button
                className="nav-row project-row"
                aria-expanded={expanded}
                title={project.directory}
                onClick={() => {
                  setExpandedDirectories((previous) => {
                    const next = new Set(previous);
                    if (expanded) next.delete(project.directory);
                    else next.add(project.directory);
                    return next;
                  });
                  if (!expanded && !active) onSelect(project);
                }}
              >
                <span className="project-folder">
                  {projects.data?.get(project.directory)?.icon ? (
                    <ProjectIcon
                      name={project.name}
                      icon={projects.data?.get(project.directory)?.icon}
                    />
                  ) : (
                    <HugeiconsIcon icon={Folder01Icon} size={16} />
                  )}
                  <HugeiconsIcon
                    className="project-chevron"
                    icon={expanded ? ArrowDown01Icon : ArrowRight01Icon}
                    size={12}
                  />
                </span>
                <span className="truncate">{project.name}</span>
              </button>
              <Button
                className="project-new-chat"
                variant="ghost"
                size="icon"
                aria-label={`New chat in ${project.name}`}
                title={`New chat in ${project.name}`}
                disabled={Boolean(creatingDirectory)}
                aria-busy={creatingDirectory === project.directory}
                onClick={() => {
                  setExpandedDirectories((previous) =>
                    previous.has(project.directory)
                      ? previous
                      : new Set(previous).add(project.directory),
                  );
                  onNewChat(project);
                }}
              >
                <HugeiconsIcon icon={Add01Icon} size={14} />
              </Button>
              <Button
                className="project-close"
                variant="ghost"
                size="icon"
                aria-label={`Close project ${project.name}`}
                title="Close project"
                onClick={() => {
                  setExpandedDirectories((previous) => {
                    const next = new Set(previous);
                    next.delete(project.directory);
                    return next;
                  });
                  onClose(project.directory);
                }}
              >
                <HugeiconsIcon icon={Cancel01Icon} size={14} />
              </Button>
            </div>
            {expanded && (
              <SessionList
                directory={project.directory}
                projectID={metadata?.vcs ? metadata.id : undefined}
                connected={connected}
                live={live}
                selectedID={selectedID}
                onSelect={(id) => onSelectSession(project, id)}
              />
            )}
          </div>
        );
      })}
    </nav>
  );
}
