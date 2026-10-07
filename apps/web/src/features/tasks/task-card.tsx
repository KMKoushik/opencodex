import { useEffect, useLayoutEffect, useRef, useState, type DragEvent } from 'react';
import {
  BubbleChatIcon,
  Clock01Icon,
  Delete02Icon,
  Note01Icon,
  Tick02Icon,
} from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import type { OpenCodeProject, Task, TaskProject, TaskUpdate } from '@opencodex/contracts';
import { Button } from '../../components/ui/button';
import { Select } from '../../components/ui/select';
import { ProjectIcon } from '../projects/project-icon';
import { projectName } from '../projects/project-metadata';
import { columns, delayedDays, shortDate } from './task-model';

/** Native projects by canonical directory. */
export type TaskProjects = Map<string, OpenCodeProject>;

export function TaskCard({
  task,
  now,
  projects,
  dragging,
  onUpdate,
  onDelete,
  onOpenSession,
  onDragStart,
  onDragEnd,
}: {
  task: Task;
  now: number;
  projects: TaskProjects;
  dragging: boolean;
  onUpdate: (input: TaskUpdate) => void;
  onDelete: () => void;
  onOpenSession: (sessionID: string) => void;
  onDragStart: (event: DragEvent<HTMLElement>) => void;
  onDragEnd: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const titleButton = useRef<HTMLButtonElement>(null);
  const refocus = useRef(false);
  useEffect(() => {
    if (editing || !refocus.current) return;
    refocus.current = false;
    titleButton.current?.focus();
  }, [editing]);
  const close = (focus: boolean) => {
    refocus.current = focus;
    setEditing(false);
  };
  const done = task.bucket === 'done';
  const delayed = delayedDays(task, now);
  const project = task.project ? projects.get(task.project.directory) : undefined;
  const projectLabel = task.project
    ? project
      ? projectName(project)
      : task.project.directory.split(/[\\/]/).filter(Boolean).at(-1)
    : undefined;

  if (editing)
    return (
      <TaskEditor
        task={task}
        projects={projects}
        onSave={(input, focus) => {
          close(focus);
          if (Object.keys(input).length) onUpdate(input);
        }}
        onCancel={() => close(true)}
        onDelete={onDelete}
      />
    );

  return (
    <article
      className="task-card"
      data-done={done || undefined}
      data-dragging={dragging || undefined}
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      aria-label={task.title}
    >
      <button
        type="button"
        className="task-check"
        role="checkbox"
        aria-checked={done}
        aria-label={done ? `Reopen “${task.title}”` : `Complete “${task.title}”`}
        onClick={() => onUpdate({ bucket: done ? (task.reopen ?? 'today') : 'done' })}
      >
        <HugeiconsIcon icon={Tick02Icon} size={11} strokeWidth={2.5} />
      </button>
      <div className="task-body">
        <button
          ref={titleButton}
          type="button"
          className="task-title"
          onClick={() => setEditing(true)}
        >
          {task.title}
        </button>
        {(projectLabel || delayed > 0 || task.notes || task.sessionID || done) && (
          <div className="task-meta">
            {delayed > 0 && (
              <span
                className="task-chip"
                data-tone="warning"
                title={`In Today since ${new Date(task.time.moved).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}`}
              >
                <HugeiconsIcon icon={Clock01Icon} size={12} />
                {delayed === 1 ? 'From yesterday' : `Delayed ${delayed} days`}
              </span>
            )}
            {done && task.time.completed && (
              <span className="task-chip">{shortDate(task.time.completed, now)}</span>
            )}
            {projectLabel && (
              <span className="task-chip task-project" title={task.project?.directory}>
                <ProjectIcon name={projectLabel} icon={project?.icon} />
                <span className="truncate">{projectLabel}</span>
              </span>
            )}
            {task.notes && (
              <span className="task-chip" role="img" aria-label="Has notes" title={task.notes}>
                <HugeiconsIcon icon={Note01Icon} size={12} />
              </span>
            )}
            {task.sessionID && (
              <button
                type="button"
                className="task-chip task-link"
                title="Open the chat that added this task"
                onClick={() => onOpenSession(task.sessionID!)}
              >
                <HugeiconsIcon icon={BubbleChatIcon} size={12} />
                From chat
              </button>
            )}
          </div>
        )}
      </div>
      <Button
        className="task-delete"
        variant="ghost"
        size="icon"
        aria-label={`Delete “${task.title}”`}
        title="Delete"
        onClick={onDelete}
      >
        <HugeiconsIcon icon={Delete02Icon} size={14} />
      </Button>
    </article>
  );
}

function TaskEditor({
  task,
  projects,
  onSave,
  onCancel,
  onDelete,
}: {
  task: Task;
  projects: TaskProjects;
  /** `focus` returns keyboard focus to the card; false when the user moved elsewhere. */
  onSave: (input: TaskUpdate, focus: boolean) => void;
  onCancel: () => void;
  onDelete: () => void;
}) {
  const form = useRef<HTMLFormElement>(null);
  // A pointer press outside can also blur the form; close only once.
  const closed = useRef(false);
  const [title, setTitle] = useState(task.title);
  const [notes, setNotes] = useState(task.notes ?? '');
  const [directory, setDirectory] = useState(task.project?.directory ?? '');
  const [bucket, setBucket] = useState(task.bucket);
  const options = [
    { value: '', label: 'No project', project: undefined as OpenCodeProject | undefined },
    ...[...projects.values()].map((project) => ({
      value: project.canonical,
      label: projectName(project),
      project,
    })),
  ];
  // Keep a project that is no longer listed, so saving other fields doesn't drop it.
  if (task.project && !projects.has(task.project.directory))
    options.push({
      value: task.project.directory,
      label: task.project.directory.split(/[\\/]/).filter(Boolean).at(-1) ?? task.project.id,
      project: undefined,
    });

  function save(focus: boolean) {
    if (closed.current) return;
    closed.current = true;
    const input: TaskUpdate = {};
    if (title.trim() && title.trim() !== task.title) input.title = title;
    if (notes.trim() !== (task.notes ?? '')) input.notes = notes;
    if (directory !== (task.project?.directory ?? '')) {
      const project = projects.get(directory);
      input.project = project
        ? ({ id: project.id, directory: project.canonical } satisfies TaskProject)
        : null;
    }
    if (bucket !== task.bucket) input.bucket = bucket;
    onSave(input, focus);
  }
  function cancel() {
    if (closed.current) return;
    closed.current = true;
    onCancel();
  }
  // Clicking elsewhere keeps the edits, like a checklist app; Escape discards them.
  const latestSave = useRef(save);
  useLayoutEffect(() => {
    latestSave.current = save;
  });
  const pressing = useRef(false);
  useEffect(() => {
    let outside = false;
    const inside = (target: EventTarget | null) => form.current?.contains(target as Node);
    const down = (event: PointerEvent) => {
      pressing.current = true;
      outside = !inside(event.target);
    };
    const up = () => {
      pressing.current = false;
    };
    // Close after the click, not on press: shrinking the editor mid-click would move the
    // card under the pointer and swallow the click that opens another one.
    const click = (event: MouseEvent) => {
      if (outside && !inside(event.target)) latestSave.current(false);
      outside = false;
    };
    document.addEventListener('pointerdown', down);
    document.addEventListener('pointerup', up);
    document.addEventListener('pointercancel', up);
    document.addEventListener('click', click);
    return () => {
      document.removeEventListener('pointerdown', down);
      document.removeEventListener('pointerup', up);
      document.removeEventListener('pointercancel', up);
      document.removeEventListener('click', click);
    };
  }, []);

  return (
    <form
      ref={form}
      className="task-card task-editor"
      onSubmit={(event) => {
        event.preventDefault();
        save(true);
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          cancel();
        }
      }}
      onBlur={(event) => {
        // Tabbing out saves; clicks are handled above, and a window switch (no related
        // target) keeps the editor open.
        if (
          !pressing.current &&
          event.relatedTarget &&
          !event.currentTarget.contains(event.relatedTarget)
        )
          save(false);
      }}
    >
      <input
        className="task-editor-title"
        aria-label="Task title"
        value={title}
        maxLength={500}
        autoFocus
        onChange={(event) => setTitle(event.target.value)}
      />
      <textarea
        className="task-editor-notes"
        aria-label="Notes"
        placeholder="Notes"
        rows={3}
        maxLength={10_000}
        value={notes}
        onChange={(event) => setNotes(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
            event.preventDefault();
            save(true);
          }
        }}
      />
      <div className="task-editor-fields">
        <Select
          label="List"
          value={bucket}
          options={columns.map(({ bucket, label }) => ({ value: bucket, label }))}
          onChange={(value) => setBucket(value as Task['bucket'])}
          renderOption={(option) => option.label}
          floating
        />
        <Select
          label="Project"
          value={directory}
          options={options}
          onChange={setDirectory}
          floating
          renderOption={(option) => (
            <span className="task-select-project">
              {option.project && <ProjectIcon name={option.label} icon={option.project.icon} />}
              <span className="truncate">{option.label}</span>
            </span>
          )}
        />
      </div>
      <div className="task-editor-actions">
        <Button variant="ghost" size="sm" className="task-editor-delete" onClick={onDelete}>
          Delete
        </Button>
        <Button variant="ghost" size="sm" onClick={cancel}>
          Cancel
        </Button>
        <Button type="submit" size="sm" disabled={!title.trim()}>
          Save
        </Button>
      </div>
    </form>
  );
}
