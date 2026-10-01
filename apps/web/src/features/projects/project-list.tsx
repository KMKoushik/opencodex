import { useState, type ReactNode } from 'react';
import {
  ArrowDown01Icon,
  ArrowRight01Icon,
  Cancel01Icon,
  Folder01Icon,
} from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { useQuery } from '@tanstack/react-query';
import type { OpenCodeProject, Project } from '@opencodex/contracts';
import { api } from '../../lib/api';
import { Button } from '../../components/ui/button';

function projectFolders(projects: OpenCodeProject[]): Map<string, Project> {
  const folders = new Map<string, Project>();
  // OpenCode can retain multiple identities for a folder (e.g. before and after
  // git init). Navigation and session queries are directory-based. Keep the
  // first record in the service's recency order, without merging by name.
  for (const project of projects) {
    if (folders.has(project.canonical)) continue;
    folders.set(project.canonical, {
      name:
        project.name ||
        project.canonical.split(/[\\/]/).filter(Boolean).at(-1) ||
        project.canonical,
      directory: project.canonical,
    });
  }
  return folders;
}

export function ProjectList({
  connected,
  opened,
  current,
  onSelect,
  onClose,
  children,
}: {
  connected: boolean;
  opened: Project[];
  current: Project | null;
  onSelect: (project: Project) => void;
  onClose: (directory: string) => void;
  children: ReactNode;
}) {
  const [collapsed, setCollapsed] = useState<string>();
  const projects = useQuery({
    queryKey: ['projects'],
    queryFn: ({ signal }) => api.projects(signal),
    select: projectFolders,
    enabled: connected && opened.length > 0,
  });
  if (!connected) return null;
  const items = opened.map((project) => projects.data?.get(project.directory) ?? project);
  return (
    <nav className="project-list" aria-label="Projects">
      <div className="sidebar-heading">Threads</div>
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
        const expanded = active && collapsed !== project.directory;
        return (
          <div className="project-group" key={project.directory}>
            <div className="project-heading">
              <button
                className="nav-row project-row"
                aria-expanded={expanded}
                title={project.directory}
                onClick={() => {
                  setCollapsed(expanded ? project.directory : undefined);
                  if (!active) onSelect(project);
                }}
              >
                <HugeiconsIcon icon={expanded ? ArrowDown01Icon : ArrowRight01Icon} size={12} />
                <HugeiconsIcon icon={Folder01Icon} size={16} />
                <span className="truncate">{project.name}</span>
              </button>
              <Button
                className="project-close"
                variant="ghost"
                size="icon"
                aria-label={`Close project ${project.name}`}
                title="Close project"
                onClick={() => onClose(project.directory)}
              >
                <HugeiconsIcon icon={Cancel01Icon} size={14} />
              </Button>
            </div>
            {expanded && children}
          </div>
        );
      })}
    </nav>
  );
}
