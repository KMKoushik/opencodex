import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { Task, TaskUpdate } from '@opencodex/contracts';
import { api } from '../../lib/api';

const key = ['tasks'];

/** Task edits apply to the cached board at once; the server's copy replaces them on success. */
export function useTaskMutations() {
  const client = useQueryClient();
  const replace = (task: Task) =>
    client.setQueryData<Task[]>(key, (tasks) =>
      tasks?.some((item) => item.id === task.id)
        ? tasks.map((item) => (item.id === task.id ? task : item))
        : [...(tasks ?? []), task],
    );
  const rollback = () => client.invalidateQueries({ queryKey: key });

  const create = useMutation({
    mutationFn: api.createTask,
    onSuccess: replace,
  });
  const update = useMutation({
    mutationFn: ({ id, input }: { id: string; input: TaskUpdate }) => api.updateTask(id, input),
    onMutate: async ({ id, input }) => {
      await client.cancelQueries({ queryKey: key });
      const now = Date.now();
      client.setQueryData<Task[]>(key, (tasks) =>
        tasks?.map((task) => (task.id === id ? preview(task, input, now) : task)),
      );
    },
    onSuccess: replace,
    onError: rollback,
  });
  const remove = useMutation({
    mutationFn: api.deleteTask,
    onMutate: async (id: string) => {
      await client.cancelQueries({ queryKey: key });
      client.setQueryData<Task[]>(key, (tasks) => tasks?.filter((task) => task.id !== id));
    },
    onError: rollback,
  });
  return { create, update, remove };
}

function preview(task: Task, input: TaskUpdate, now: number): Task {
  const next: Task = { ...task, time: { ...task.time, updated: now } };
  if (input.title !== undefined) next.title = input.title.trim();
  if (input.notes !== undefined) next.notes = input.notes.trim() || undefined;
  if (input.project !== undefined) next.project = input.project ?? undefined;
  if (input.order !== undefined) next.order = input.order;
  if (input.bucket && input.bucket !== task.bucket) {
    next.bucket = input.bucket;
    next.time.moved = now;
    next.time.completed = input.bucket === 'done' ? now : undefined;
    if (input.bucket === 'done') next.reopen = task.bucket as Exclude<Task['bucket'], 'done'>;
  }
  return next;
}
