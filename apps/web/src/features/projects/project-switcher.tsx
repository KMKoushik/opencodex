import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowDown01Icon,
  FolderOpenIcon,
  Search01Icon,
  Tick02Icon,
} from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import type { Project } from '@opencodex/contracts';
import { Button } from '../../components/ui/button';
import { Dialog } from '../../components/ui/dialog';
import { api } from '../../lib/api';
import { ProjectForm } from './project-form';
import { projectFolder, projectFolders } from './project-metadata';

export function ProjectSwitcher({
  project,
  opened,
  disabled = false,
  onSelect,
}: {
  project: Project;
  opened: Project[];
  disabled?: boolean;
  onSelect: (project: Project) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [placement, setPlacement] = useState<{ above: boolean; height: number }>();
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const projects = useQuery({
    queryKey: ['projects'],
    queryFn: ({ signal }) => api.projects(signal),
    select: projectFolders,
  });
  const options = useMemo(() => {
    const folders = new Map(opened.map((item) => [item.directory, item]));
    for (const metadata of projects.data?.values() ?? []) {
      const item = projectFolder(metadata);
      folders.set(item.directory, item);
    }
    folders.set(project.directory, project);
    return Array.from(folders.values());
  }, [opened, project, projects.data]);

  function close() {
    setAdding(false);
    setPlacement(undefined);
    trigger.current?.focus({ preventScroll: true });
  }
  useEffect(() => {
    if (!placement) return;
    const dismiss = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setPlacement(undefined);
    };
    document.addEventListener('pointerdown', dismiss);
    return () => document.removeEventListener('pointerdown', dismiss);
  }, [placement]);

  function show() {
    if (disabled) return;
    const rect = trigger.current!.getBoundingClientRect();
    const below = innerHeight - rect.bottom;
    const above = rect.top > below;
    setPlacement({ above, height: Math.min(440, (above ? rect.top : below) - 12) });
  }

  return (
    <div className="project-switcher">
      <div
        className="select"
        ref={root}
        data-shortcut-boundary={placement ? '' : undefined}
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) setPlacement(undefined);
        }}
      >
        <button
          ref={trigger}
          type="button"
          className="select-trigger"
          aria-label="Switch project"
          title={`Switch project · ${project.directory}`}
          disabled={disabled}
          aria-haspopup="listbox"
          aria-expanded={Boolean(placement)}
          aria-controls={placement ? id : undefined}
          onClick={() => (placement ? close() : show())}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
              event.preventDefault();
              show();
            }
          }}
        >
          <span className="truncate">{project.name}</span>
          <HugeiconsIcon icon={ArrowDown01Icon} size={14} className="select-chevron" />
        </button>
        {placement && (
          <ProjectMenu
            id={id}
            options={options}
            project={project}
            placement={placement}
            onClose={close}
            onSelect={(next) => {
              close();
              if (next.directory !== project.directory) onSelect(next);
            }}
            onOpen={() => {
              setPlacement(undefined);
              trigger.current?.focus({ preventScroll: true });
              setAdding(true);
            }}
          />
        )}
      </div>
      {projects.isError && (
        <div className="chat-error" role="alert">
          <p>Could not load projects. {projects.error.message}</p>
          <Button variant="ghost" size="sm" onClick={() => void projects.refetch()}>
            Retry
          </Button>
        </div>
      )}
      {adding && (
        <Dialog title="Open project" onClose={close}>
          <ProjectForm
            onSelect={(next) => {
              close();
              if (next.directory !== project.directory) onSelect(next);
            }}
          />
        </Dialog>
      )}
    </div>
  );
}

function ProjectMenu({
  id,
  options,
  project,
  placement,
  onClose,
  onSelect,
  onOpen,
}: {
  id: string;
  options: Project[];
  project: Project;
  placement: { above: boolean; height: number };
  onClose: () => void;
  onSelect: (project: Project) => void;
  onOpen: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const [query, setQuery] = useState('');
  const [activeDirectory, setActiveDirectory] = useState(project.directory);
  const client = useQueryClient();
  const resolve = useMutation({ mutationFn: api.project });
  const rows = useMemo(() => {
    const search = query.trim().toLowerCase();
    const matching = options.filter((item) =>
      `${item.name} ${item.directory}`.toLowerCase().includes(search),
    );
    const path = query.trim();
    const canOpen = /[\\/]|^[~.]/.test(path) && !options.some((item) => item.directory === path);
    return [
      ...matching.map((item) => ({ directory: item.directory, project: item })),
      ...(canOpen ? [{ directory: path, project: undefined }] : []),
    ];
  }, [options, query]);
  const found = rows.findIndex((row) => row.directory === activeDirectory);
  const active = Math.max(0, found);

  useEffect(() => {
    input.current?.focus({ preventScroll: true });
  }, []);
  useEffect(() => {
    const menu = list.current;
    const item = menu?.children[active] as HTMLElement | undefined;
    if (!menu || !item) return;
    if (item.offsetTop < menu.scrollTop) menu.scrollTop = item.offsetTop;
    const bottom = item.offsetTop + item.offsetHeight;
    if (bottom > menu.scrollTop + menu.clientHeight) menu.scrollTop = bottom - menu.clientHeight;
  }, [active, rows]);

  function choose(index: number) {
    const row = rows[index];
    if (!row || resolve.isPending) return;
    if (row.project) onSelect(row.project);
    else {
      resolve.mutate(row.directory, {
        // A dismissed menu must not switch projects when folder resolution completes.
        onSuccess: (next) => {
          void client.invalidateQueries({ queryKey: ['projects'] });
          onSelect(next);
        },
      });
    }
  }

  function navigate(event: KeyboardEvent) {
    if (event.nativeEvent.isComposing) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      onClose();
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const next = Math.max(
        0,
        Math.min(rows.length - 1, active + (event.key === 'ArrowDown' ? 1 : -1)),
      );
      if (rows[next]) setActiveDirectory(rows[next].directory);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      choose(active);
    }
  }

  return (
    <div
      className="select-menu project-menu"
      data-placement={placement.above ? 'top' : 'bottom'}
      style={{ maxHeight: placement.height }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') navigate(event);
      }}
    >
      <div className="project-switcher-search">
        <HugeiconsIcon icon={Search01Icon} size={16} aria-hidden="true" />
        <input
          ref={input}
          role="combobox"
          aria-label="Search projects or enter a folder path"
          aria-controls={id}
          aria-expanded="true"
          aria-autocomplete="list"
          aria-activedescendant={rows.length ? `${id}-${active}` : undefined}
          placeholder="Search projects or enter a folder path…"
          autoComplete="off"
          spellCheck={false}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setActiveDirectory('');
            resolve.reset();
          }}
          onKeyDown={navigate}
        />
      </div>
      <ul ref={list} id={id} className="select-options" role="listbox" aria-label="Projects">
        {rows.map((row, index) => (
          <li
            key={row.directory}
            id={`${id}-${index}`}
            role="option"
            aria-selected={row.directory === project.directory}
            data-active={index === active}
            aria-disabled={resolve.isPending}
            onPointerMove={(event) => {
              if (event.pointerType === 'mouse' && (event.movementX || event.movementY))
                setActiveDirectory(row.directory);
            }}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => choose(index)}
          >
            <HugeiconsIcon icon={FolderOpenIcon} size={16} />
            <span className="project-switcher-option">
              <span className="truncate">
                {row.project?.name || (resolve.isPending ? 'Opening…' : 'Open folder')}
              </span>
              <small className="truncate">{row.directory}</small>
            </span>
            {row.directory === project.directory && (
              <HugeiconsIcon icon={Tick02Icon} size={14} className="select-check" />
            )}
          </li>
        ))}
      </ul>
      {!rows.length && (
        <p className="project-switcher-empty" role="status">
          No matching projects
        </p>
      )}
      {resolve.isError && (
        <p className="project-switcher-error text-error" role="alert">
          {resolve.error.message}
        </p>
      )}
      <Button
        className="project-switcher-open"
        variant="ghost"
        disabled={resolve.isPending}
        onClick={onOpen}
      >
        <HugeiconsIcon icon={FolderOpenIcon} size={16} />
        Open project…
      </Button>
    </div>
  );
}
