import type { Task, TaskBucket } from '@opencodex/contracts';

export const columns: { bucket: TaskBucket; label: string }[] = [
  { bucket: 'today', label: 'Today' },
  { bucket: 'week', label: 'This week' },
  { bucket: 'someday', label: 'Someday' },
  { bucket: 'done', label: 'Done' },
];

/** `all`, `none` (tasks without a project), or a project's canonical directory. */
export type ProjectFilter = string;

export function groupTasks(tasks: Task[], filter: ProjectFilter) {
  const groups: Record<TaskBucket, Task[]> = { today: [], week: [], someday: [], done: [] };
  for (const task of tasks) {
    if (filter === 'none' ? task.project : filter !== 'all' && task.project?.directory !== filter)
      continue;
    groups[task.bucket].push(task);
  }
  for (const [bucket, items] of Object.entries(groups))
    items.sort(
      bucket === 'done'
        ? (a, b) => (b.time.completed ?? 0) - (a.time.completed ?? 0)
        : (a, b) => a.order - b.order,
    );
  return groups;
}

/** An order that places a task between its new neighbours without rewriting the others. */
export function orderBetween(before: Task | undefined, after: Task | undefined) {
  if (before && after) return (before.order + after.order) / 2;
  if (before) return before.order + 1;
  if (after) return after.order - 1;
  return 1;
}

const DAY = 24 * 60 * 60 * 1000;
const startOfDay = (time: number) => new Date(time).setHours(0, 0, 0, 0);

/** Whole days a Today task has been carried over from an earlier day. */
export function delayedDays(task: Task, now: number) {
  if (task.bucket !== 'today') return 0;
  return Math.max(0, Math.round((startOfDay(now) - startOfDay(task.time.moved)) / DAY));
}

export function shortDate(time: number, now: number) {
  const days = Math.round((startOfDay(now) - startOfDay(time)) / DAY);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  return new Date(time).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
