import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import {
  Add01Icon,
  Archive03Icon,
  Calendar03Icon,
  CheckListIcon,
  CheckmarkCircle02Icon,
  Sun03Icon,
} from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { OpenCodeProject, TaskBucket, TasksPluginStatus } from '@opencodex/contracts';
import { Button } from '../../components/ui/button';
import { Select } from '../../components/ui/select';
import { api } from '../../lib/api';
import { ProjectIcon } from '../projects/project-icon';
import { projectFolders, projectName } from '../projects/project-metadata';
import { TaskCard, type TaskProjects } from './task-card';
import { columns, delayedDays, groupTasks, orderBetween, type ProjectFilter } from './task-model';
import { useTaskMutations } from './use-tasks';
import './tasks.css';

const icons = {
  today: Sun03Icon,
  week: Calendar03Icon,
  someday: Archive03Icon,
  done: CheckmarkCircle02Icon,
};
const empty: Record<TaskBucket, string> = {
  today: 'Nothing planned for today.',
  week: 'Nothing else this week.',
  someday: 'Ideas and later work go here.',
  done: 'Completed tasks stay here for two weeks.',
};

export function TaskBoard({
  connected,
  onOpenSession,
}: {
  connected: boolean;
  onOpenSession: (sessionID: string) => void;
}) {
  const client = useQueryClient();
  const status = useQuery({
    queryKey: ['tasks-plugin'],
    queryFn: ({ signal }) => api.tasksPlugin(signal),
    enabled: connected,
    // OpenCode reloads its plugins folder on change; follow that briefly, not indefinitely.
    refetchInterval: (query) =>
      query.state.data?.state === 'loading' && query.state.dataUpdateCount < 30 ? 2_000 : false,
  });
  const ready = status.data?.state === 'active' || status.data?.state === 'outdated';
  const install = useMutation({
    mutationFn: api.installTasksPlugin,
    onSettled: () => client.invalidateQueries({ queryKey: ['tasks-plugin'] }),
  });

  return (
    <div className="tasks-page">
      {!connected ? (
        <p className="tasks-note">Connect to OpenCode to see your tasks.</p>
      ) : !status.data ? (
        <p className="tasks-note" role="status">
          {status.error ? status.error.message : 'Loading tasks…'}
        </p>
      ) : ready ? (
        <Board
          outdated={status.data.state === 'outdated'}
          installing={install.isPending}
          onUpdatePlugin={() => install.mutate()}
          onOpenSession={onOpenSession}
        />
      ) : (
        <Setup
          status={status.data}
          stalled={(client.getQueryState(['tasks-plugin'])?.dataUpdateCount ?? 0) >= 30}
          installing={install.isPending}
          error={install.error?.message}
          onInstall={() => install.mutate()}
        />
      )}
    </div>
  );
}

function Setup({
  status,
  stalled,
  installing,
  error,
  onInstall,
}: {
  status: TasksPluginStatus;
  stalled: boolean;
  installing: boolean;
  error?: string;
  onInstall: () => void;
}) {
  return (
    <section className="tasks-setup">
      <span className="tasks-setup-icon" aria-hidden="true">
        <HugeiconsIcon icon={CheckListIcon} size={22} />
      </span>
      <h1>Tasks</h1>
      <p>
        Plan your day across Today, This week, and Someday. Tasks are saved in OpenCode by a small
        OpenCodex plugin, so agents can add and update them when you ask.
      </p>
      {status.state === 'unavailable' || status.state === 'failed' ? (
        <p className="text-error" role="alert">
          {status.message}
        </p>
      ) : status.state === 'loading' ? (
        <p role="status">
          {stalled
            ? 'OpenCode hasn’t loaded the plugin yet. Restart it with opencode service restart.'
            : 'Starting Tasks…'}
        </p>
      ) : (
        <Button disabled={installing} onClick={onInstall}>
          {installing ? 'Turning on…' : 'Turn on Tasks'}
        </Button>
      )}
      {error && (
        <p className="text-error" role="alert">
          {error}
        </p>
      )}
      {status.path && <code>{status.path}</code>}
    </section>
  );
}

function Board({
  outdated,
  installing,
  onUpdatePlugin,
  onOpenSession,
}: {
  outdated: boolean;
  installing: boolean;
  onUpdatePlugin: () => void;
  onOpenSession: (sessionID: string) => void;
}) {
  const tasks = useQuery({ queryKey: ['tasks'], queryFn: ({ signal }) => api.tasks(signal) });
  const nativeProjects = useQuery({
    queryKey: ['projects'],
    queryFn: ({ signal }) => api.projects(signal),
  });
  const { create, update, remove } = useTaskMutations();
  const [filter, setFilter] = useState<ProjectFilter>('all');
  const [adding, setAdding] = useState<TaskBucket | null>(null);
  const [dragged, setDragged] = useState<string | null>(null);
  const [drop, setDrop] = useState<{ bucket: TaskBucket; index: number } | null>(null);
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    // Delayed labels change at midnight; a minute's lag is fine.
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);

  const projects: TaskProjects = useMemo(
    () => projectFolders(nativeProjects.data ?? []),
    [nativeProjects.data],
  );
  const groups = useMemo(() => groupTasks(tasks.data ?? [], filter), [tasks.data, filter]);
  const filterOptions = useMemo(() => {
    const used = new Set((tasks.data ?? []).flatMap((task) => task.project?.directory ?? []));
    // Projects with tasks first, then the rest in the service's recency order.
    const listed = [...projects.values()].sort(
      (a, b) => Number(used.has(b.canonical)) - Number(used.has(a.canonical)),
    );
    return [
      { value: 'all', label: 'All projects', project: undefined as OpenCodeProject | undefined },
      { value: 'none', label: 'No project', project: undefined },
      ...listed.map((project) => ({
        value: project.canonical,
        label: projectName(project),
        project,
      })),
    ];
  }, [projects, tasks.data]);
  const filterProject = projects.get(filter);
  const open = groups.today.length + groups.week.length + groups.someday.length;
  const delayed = groups.today.filter((task) => delayedDays(task, now) > 0).length;

  function dropAt(event: DragEvent<HTMLElement>) {
    const cards = Array.from(
      event.currentTarget.querySelectorAll<HTMLElement>('[data-task-id]'),
    ).filter((card) => card.dataset.taskId !== dragged);
    const index = cards.findIndex((card) => {
      const rect = card.getBoundingClientRect();
      return event.clientY < rect.top + rect.height / 2;
    });
    return index < 0 ? cards.length : index;
  }

  function move(id: string, bucket: TaskBucket, index: number) {
    const task = tasks.data?.find((item) => item.id === id);
    if (!task) return;
    if (bucket === 'done') {
      if (task.bucket !== 'done') update.mutate({ id, input: { bucket } });
      return;
    }
    // Dropping a task where it already is changes nothing.
    if (task.bucket === bucket && groups[bucket].indexOf(task) === index) return;
    const siblings = groups[bucket].filter((item) => item.id !== id);
    const order = orderBetween(siblings[index - 1], siblings[index]);
    update.mutate({ id, input: task.bucket === bucket ? { order } : { bucket, order } });
  }

  return (
    <>
      <header className="tasks-header">
        <div>
          <h1>Tasks</h1>
          <p className="tasks-summary">
            {tasks.isSuccess
              ? `${open} open${delayed ? ` · ${delayed} delayed` : ''}`
              : (tasks.error?.message ?? 'Loading…')}
          </p>
        </div>
        <div className="tasks-filter">
          <Select
            label="Filter by project"
            value={filter}
            options={filterOptions}
            onChange={setFilter}
            renderOption={(option) => (
              <span className="task-select-project">
                {option.project && <ProjectIcon name={option.label} icon={option.project.icon} />}
                <span className="truncate">{option.label}</span>
              </span>
            )}
          />
        </div>
      </header>
      {outdated && (
        <p className="tasks-banner" role="status">
          A newer version of the Tasks plugin is available.
          <Button variant="secondary" size="sm" disabled={installing} onClick={onUpdatePlugin}>
            {installing ? 'Updating…' : 'Update'}
          </Button>
        </p>
      )}
      {(create.error || update.error || remove.error) && (
        <p className="tasks-banner text-error" role="alert">
          {(create.error ?? update.error ?? remove.error)?.message}
        </p>
      )}
      <div className="task-columns">
        {columns.map(({ bucket, label }) => {
          const items = groups[bucket];
          return (
            <section
              key={bucket}
              className="task-column"
              data-bucket={bucket}
              data-drop-target={drop?.bucket === bucket || undefined}
              aria-label={label}
              onDragOver={(event) => {
                if (!dragged) return;
                event.preventDefault();
                event.dataTransfer.dropEffect = 'move';
                const index = dropAt(event);
                if (drop?.bucket !== bucket || drop.index !== index) setDrop({ bucket, index });
              }}
              onDragLeave={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget as Node | null))
                  setDrop(null);
              }}
              onDrop={(event) => {
                event.preventDefault();
                if (dragged) move(dragged, bucket, dropAt(event));
                setDragged(null);
                setDrop(null);
              }}
            >
              <header className="task-column-header">
                <HugeiconsIcon icon={icons[bucket]} size={16} className="task-column-icon" />
                <h2>{label}</h2>
                <span className="task-count">{items.length}</span>
                {bucket !== 'done' && (
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Add a task to ${label}`}
                    onClick={() => setAdding(bucket)}
                  >
                    <HugeiconsIcon icon={Add01Icon} size={15} />
                  </Button>
                )}
              </header>
              <div className="task-list">
                {items.map((task, index) => (
                  <div key={task.id} data-task-id={task.id} className="task-slot">
                    {drop?.bucket === bucket && drop.index === index && bucket !== 'done' && (
                      <div className="task-drop-line" />
                    )}
                    <TaskCard
                      task={task}
                      now={now}
                      projects={projects}
                      dragging={dragged === task.id}
                      onUpdate={(input) => update.mutate({ id: task.id, input })}
                      onDelete={() => remove.mutate(task.id)}
                      onOpenSession={onOpenSession}
                      onDragStart={(event) => {
                        event.dataTransfer.effectAllowed = 'move';
                        event.dataTransfer.setData('text/plain', task.title);
                        setDragged(task.id);
                      }}
                      onDragEnd={() => {
                        setDragged(null);
                        setDrop(null);
                      }}
                    />
                  </div>
                ))}
                {drop?.bucket === bucket &&
                  drop.index >= items.filter((task) => task.id !== dragged).length &&
                  bucket !== 'done' && <div className="task-drop-line" />}
                {adding === bucket ? (
                  <NewTask
                    onSubmit={(title) =>
                      create.mutate({
                        title,
                        bucket: bucket as Exclude<TaskBucket, 'done'>,
                        project: filterProject
                          ? { id: filterProject.id, directory: filterProject.canonical }
                          : undefined,
                      })
                    }
                    onClose={() => setAdding(null)}
                  />
                ) : items.length === 0 ? (
                  <p className="task-empty">{empty[bucket]}</p>
                ) : null}
                {bucket !== 'done' && adding !== bucket && (
                  <button type="button" className="task-add" onClick={() => setAdding(bucket)}>
                    <HugeiconsIcon icon={Add01Icon} size={14} />
                    New task
                  </button>
                )}
              </div>
            </section>
          );
        })}
      </div>
    </>
  );
}

function NewTask({
  onSubmit,
  onClose,
}: {
  onSubmit: (title: string) => void;
  onClose: () => void;
}) {
  const [title, setTitle] = useState('');
  const input = useRef<HTMLInputElement>(null);
  return (
    <form
      className="task-card task-new"
      onSubmit={(event) => {
        event.preventDefault();
        if (!title.trim()) return;
        onSubmit(title.trim());
        // Stay open for the next task, like a checklist.
        setTitle('');
        input.current?.focus();
      }}
    >
      <span className="task-check" aria-hidden="true" />
      <input
        ref={input}
        aria-label="New task"
        placeholder="New task"
        maxLength={500}
        autoFocus
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        onBlur={() => {
          if (!title.trim()) onClose();
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
            onClose();
          }
        }}
      />
    </form>
  );
}
