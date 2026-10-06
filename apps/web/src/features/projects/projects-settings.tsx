import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Add01Icon, Search01Icon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import type { OpenCodeProject, Project } from '@opencodex/contracts';
import { Button } from '../../components/ui/button';
import { Dialog } from '../../components/ui/dialog';
import { api } from '../../lib/api';
import { ProjectForm } from './project-form';
import { ProjectIcon } from './project-icon';
import { ProjectActions } from './project-actions';
import { ProjectEditor } from './project-editor';
import { projectFolder, projectFolders } from './project-metadata';
import { WorktreesDialog } from '../worktrees/worktrees-dialog';

export function ProjectsSettings({
  connected,
  live,
  opened,
  onAdd,
  onOpen,
  onClose,
}: {
  connected: boolean;
  live: boolean;
  opened: Project[];
  onAdd: (project: Project) => void;
  onOpen: (project: Project) => void;
  onClose: (directory: string) => void;
}) {
  const [search, setSearch] = useState('');
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<OpenCodeProject>();
  const [worktrees, setWorktrees] = useState<{ project: OpenCodeProject; name: string }>();
  const client = useQueryClient();
  const projects = useQuery({
    queryKey: ['projects'],
    queryFn: ({ signal }) => api.projects(signal),
    enabled: connected,
    select: projectFolders,
    refetchInterval: connected && !live ? 15_000 : false,
  });
  const copy = useMutation({ mutationFn: (path: string) => navigator.clipboard.writeText(path) });
  const register = useMutation({
    mutationFn: api.addProject,
    onSuccess: (project) => {
      void client.invalidateQueries({ queryKey: ['projects'] });
      setEditing(project);
    },
  });
  const items = useMemo(() => {
    const folders = new Map<
      string,
      { folder: Project; metadata?: OpenCodeProject; opened: boolean }
    >();
    for (const project of projects.data?.values() ?? []) {
      folders.set(project.canonical, {
        folder: projectFolder(project),
        metadata: project,
        opened: false,
      });
    }
    for (const folder of opened) {
      const existing = folders.get(folder.directory);
      folders.set(
        folder.directory,
        existing ? { ...existing, opened: true } : { folder, opened: true },
      );
    }
    return Array.from(folders.values());
  }, [projects.data, opened]);
  const query = search.trim().toLocaleLowerCase();
  const visible = items.filter(({ folder }) =>
    `${folder.name}\n${folder.directory}`.toLocaleLowerCase().includes(query),
  );
  return (
    <>
      <header className="projects-settings-header">
        <div>
          <h1>Projects</h1>
          <p>Manage projects and their settings.</p>
        </div>
        <Button variant="ghost" disabled={!connected} onClick={() => setAdding(true)}>
          <HugeiconsIcon icon={Add01Icon} size={16} /> Add project
        </Button>
      </header>
      <div className="projects-search">
        <HugeiconsIcon icon={Search01Icon} size={18} />
        <input
          type="search"
          name="projects-search"
          aria-label="Search projects"
          placeholder="Search projects"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          autoComplete="off"
          spellCheck={false}
        />
      </div>
      {!connected && (
        <p className="projects-notice" role="status">
          Connect to OpenCode in General settings to manage projects.
        </p>
      )}
      {connected && projects.isPending && (
        <p className="projects-notice" role="status">
          Loading projects…
        </p>
      )}
      {projects.isError && (
        <div className="projects-notice" role="alert">
          <p className="text-error">{projects.error.message}</p>
          <Button variant="secondary" size="sm" onClick={() => void projects.refetch()}>
            Retry
          </Button>
        </div>
      )}
      {register.isError && (
        <p className="text-error" role="alert">
          {register.error.message}
        </p>
      )}
      {copy.isError && (
        <p className="text-error" role="alert">
          The project path could not be copied.
        </p>
      )}
      {copy.isSuccess && (
        <p className="projects-notice" role="status">
          Project path copied.
        </p>
      )}
      {visible.length > 0 ? (
        <ul className="projects-settings-list" role="list" aria-label="Project settings">
          {visible.map(({ folder, metadata, opened }) => (
            <li key={folder.directory} className="projects-settings-row">
              <button
                type="button"
                className="project-settings-link"
                title={folder.directory}
                disabled={!connected || register.isPending}
                onClick={() =>
                  metadata ? setEditing(metadata) : register.mutate(folder.directory)
                }
              >
                <ProjectIcon name={folder.name} icon={metadata?.icon} />
                <span className="truncate">{folder.name}</span>
              </button>
              <ProjectActions
                name={folder.name}
                actions={[
                  { label: 'Open project', onSelect: () => onOpen(folder), disabled: !connected },
                  {
                    label: 'Edit project',
                    onSelect: () =>
                      metadata ? setEditing(metadata) : register.mutate(folder.directory),
                    disabled: !connected || register.isPending,
                  },
                  ...(metadata?.vcs
                    ? [
                        {
                          label: 'Manage worktrees',
                          onSelect: () => setWorktrees({ project: metadata, name: folder.name }),
                          disabled: !connected,
                        },
                      ]
                    : []),
                  { label: 'Copy path', onSelect: () => copy.mutate(folder.directory) },
                  ...(opened
                    ? [{ label: 'Close project', onSelect: () => onClose(folder.directory) }]
                    : []),
                ]}
              />
            </li>
          ))}
        </ul>
      ) : (
        (projects.isSuccess || query) && (
          <div className="projects-empty">
            <p>
              {query
                ? 'No projects match your search.'
                : 'No projects yet. Add a folder to get started.'}
            </p>
            {query && (
              <Button variant="ghost" onClick={() => setSearch('')}>
                Clear search
              </Button>
            )}
          </div>
        )
      )}
      {adding && (
        <Dialog title="Add project" onClose={() => setAdding(false)}>
          <p className="project-dialog-description">
            Choose a folder on the machine running OpenCodex.
          </p>
          <ProjectForm
            register
            onSelect={(project) => {
              onAdd(project);
              setSearch('');
              setAdding(false);
            }}
          />
        </Dialog>
      )}
      {worktrees && (
        <WorktreesDialog
          key={worktrees.project.id}
          project={worktrees.project}
          name={worktrees.name}
          onClose={() => setWorktrees(undefined)}
        />
      )}
      {editing && (
        <ProjectEditor key={editing.id} project={editing} onClose={() => setEditing(undefined)} />
      )}
    </>
  );
}
