/**
 * `<opencodex-tasks>`: the user's task board as a drop-in list for canvas pages. It reads
 * the board through the host (`canvas.tasks`), stays live as tasks change anywhere, and lets
 * the user complete, add, and start agent tasks in place. Its styles live in a shadow root,
 * so a page's CSS can't break it; it follows the theme through inherited CSS variables.
 *
 * Attributes, all optional:
 * - `assignee`: `me` (or `user`) or `agent`. Default: everyone.
 * - `list`: `today`, `week`, `someday`, `done`, `open` (the three open lists), or `all`; or
 *   several, comma separated. Default: `open`.
 * - `project`: a project folder, or its folder name. Default: every project.
 * - `heading`: a title shown above the list with its count.
 * - `add`: shows a "New task" field; new tasks take the filters' assignee, project, and list.
 * - `limit`: the most tasks to show.
 * - `empty`: the text shown when nothing matches.
 */
import type { CanvasTaskInput, CanvasTasks } from '@opencodex/contracts/canvas';
import type { Task, TaskBucket } from '@opencodex/contracts';

export type TaskBridge = {
  state(): CanvasTasks | undefined;
  subscribe(listener: () => void): () => void;
  add(input: CanvasTaskInput): Promise<unknown>;
  update(id: string, input: CanvasTaskInput): Promise<unknown>;
  start(id: string): Promise<unknown>;
  open(session: string): void;
};

const BUCKETS: TaskBucket[] = ['today', 'week', 'someday', 'done'];
const LABELS: Record<TaskBucket, string> = {
  today: 'Today',
  week: 'This week',
  someday: 'Someday',
  done: 'Done',
};
const DAY = 86_400_000;

const STYLE = `
:host{display:block;font:inherit;color:var(--text)}
*{box-sizing:border-box}
.head{display:flex;align-items:baseline;gap:8px;margin:0 0 8px}
.head h3{margin:0;font-size:15px;font-weight:650;letter-spacing:-.01em}
.head .count{color:var(--text-tertiary);font-size:13px;font-variant-numeric:tabular-nums}
.group{margin:14px 0 4px;color:var(--text-tertiary);font-size:12px;font-weight:600;letter-spacing:.02em}
.group:first-child{margin-top:0}
ul{margin:0;padding:0;list-style:none}
li{display:grid;grid-template-columns:20px minmax(0,1fr) auto;gap:10px;align-items:start;padding:9px 0;border-top:1px solid var(--border)}
li:first-child{border-top:0}
.check{width:18px;height:18px;margin-top:1px;padding:0;display:grid;place-items:center;border:1.5px solid var(--border-heavy);border-radius:50%;background:transparent;color:transparent;cursor:pointer;transition:border-color .15s,background-color .15s,color .15s}
.check svg{width:10px;height:10px}
.check:hover{border-color:var(--success);color:var(--success)}
li[data-done] .check{border-color:var(--success);background:var(--success);color:var(--surface)}
.title{font-size:14px;line-height:1.45;overflow-wrap:anywhere}
li[data-done] .title{color:var(--text-tertiary);text-decoration:line-through;text-decoration-color:var(--border-heavy)}
.notes{margin-top:1px;color:var(--text-secondary);font-size:12.5px;line-height:1.45;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.meta{display:flex;flex-wrap:wrap;gap:4px;margin-top:5px}
.meta:empty{display:none}
.chip{display:inline-flex;align-items:center;gap:4px;height:19px;max-width:100%;padding:0 7px;border-radius:6px;background:color-mix(in srgb,var(--text) 7%,transparent);color:var(--text-secondary);font-size:11.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.chip.agent{background:color-mix(in srgb,var(--purple) 18%,transparent);color:color-mix(in srgb,var(--purple) 60%,var(--text))}
.chip.late{background:color-mix(in srgb,var(--warning) 15%,transparent);color:var(--warning)}
.chip svg{width:11px;height:11px;flex:none}
.actions{display:flex;align-items:center;gap:6px;padding-top:1px}
.action{display:inline-flex;align-items:center;gap:5px;height:24px;padding:0 9px;border:0;border-radius:999px;font:inherit;font-size:12px;font-weight:550;white-space:nowrap;cursor:pointer}
.action svg{width:11px;height:11px}
.start{background:color-mix(in srgb,var(--purple) 18%,transparent);color:color-mix(in srgb,var(--purple) 60%,var(--text))}
.start:hover{background:color-mix(in srgb,var(--purple) 28%,transparent)}
.start:disabled{opacity:.6;cursor:default}
.chat{background:transparent;color:var(--text-secondary);box-shadow:inset 0 0 0 1px var(--border-heavy)}
.chat:hover{background:var(--hover);color:var(--text)}
.note{padding:10px 0;color:var(--text-tertiary);font-size:13px}
.note.error{color:var(--error)}
.add{display:grid;grid-template-columns:20px minmax(0,1fr);gap:10px;align-items:center;padding:8px 0 0}
.add .dot{width:18px;height:18px;border:1.5px dashed var(--border-heavy);border-radius:50%}
input{width:100%;height:30px;padding:0;border:0;outline:0;background:transparent;color:var(--text);font:inherit;font-size:14px}
input::placeholder{color:var(--text-tertiary)}
ul + .add{border-top:1px solid var(--border);margin-top:0}
`;

const svg = (path: string) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`;
const ICONS = {
  tick: svg('<path d="M5 12.5l4.5 4.5L19 7.5"/>'),
  play: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 4.8v14.4a1 1 0 0 0 1.5.86l12-7.2a1 1 0 0 0 0-1.72l-12-7.2A1 1 0 0 0 7 4.8z"/></svg>',
  bot: svg('<rect x="4" y="8" width="16" height="12" rx="3"/><path d="M12 4v4M9 13v1M15 13v1"/>'),
  arrow: svg('<path d="M7 17L17 7M9 7h8v8"/>'),
  person: svg(
    '<circle cx="12" cy="8" r="3.6"/><path d="M5 20c.8-3.6 3.5-5.5 7-5.5s6.2 1.9 7 5.5"/>',
  ),
};

const folderName = (path: string) => path.split(/[\\/]/).filter(Boolean).at(-1) ?? path;
const startOfDay = (time: number) => new Date(time).setHours(0, 0, 0, 0);

function text(tag: string, className: string, value: string) {
  const node = document.createElement(tag);
  node.className = className;
  node.textContent = value;
  return node;
}

export function defineTaskElement(bridge: TaskBridge) {
  if (customElements.get('opencodex-tasks')) return;

  class OpenCodexTasks extends HTMLElement {
    static observedAttributes = ['assignee', 'list', 'project', 'heading', 'add', 'limit', 'empty'];
    #root = this.attachShadow({ mode: 'open' });
    #unsubscribe?: () => void;
    /** Optimistic edits shown until the board catches up. */
    #local = new Map<string, Partial<Task>>();
    #starting = new Set<string>();
    #error = '';
    #draft = '';

    connectedCallback() {
      this.#unsubscribe ??= bridge.subscribe(() => {
        this.#local.clear();
        this.#render();
      });
      this.#render();
    }

    disconnectedCallback() {
      this.#unsubscribe?.();
      this.#unsubscribe = undefined;
    }

    attributeChangedCallback() {
      if (this.isConnected) this.#render();
    }

    get #buckets(): TaskBucket[] {
      const value = (this.getAttribute('list') ?? 'open').toLowerCase();
      const names = value.split(',').map((name) => name.trim());
      if (names.includes('all')) return BUCKETS;
      const chosen = new Set<TaskBucket>();
      for (const name of names) {
        if (name === 'open')
          ['today', 'week', 'someday'].forEach((b) => chosen.add(b as TaskBucket));
        else if (name === 'this week') chosen.add('week');
        else if (BUCKETS.includes(name as TaskBucket)) chosen.add(name as TaskBucket);
      }
      return chosen.size ? BUCKETS.filter((bucket) => chosen.has(bucket)) : BUCKETS.slice(0, 3);
    }

    get #assignee() {
      const value = this.getAttribute('assignee')?.toLowerCase();
      return value === 'me' || value === 'user' ? 'user' : value === 'agent' ? 'agent' : undefined;
    }

    #matches(task: Task, buckets: TaskBucket[]) {
      if (!buckets.includes(task.bucket)) return false;
      const assignee = this.#assignee;
      if (assignee && (task.assignee ?? 'user') !== assignee) return false;
      const project = this.getAttribute('project');
      if (
        project &&
        task.project?.directory !== project &&
        (!task.project || folderName(task.project.directory) !== project)
      )
        return false;
      return true;
    }

    #render() {
      const root = this.#root;
      const state = bridge.state();
      const buckets = this.#buckets;
      const style = document.createElement('style');
      style.textContent = STYLE;
      const nodes: Node[] = [style];
      const tasks =
        state && 'tasks' in state
          ? state.tasks
              .map((task) => ({ ...task, ...this.#local.get(task.id) }) as Task)
              .filter((task) => this.#matches(task, buckets))
              .sort((a, b) =>
                a.bucket !== b.bucket
                  ? BUCKETS.indexOf(a.bucket) - BUCKETS.indexOf(b.bucket)
                  : a.bucket === 'done'
                    ? (b.time.completed ?? 0) - (a.time.completed ?? 0)
                    : a.order - b.order,
              )
          : [];
      const limit = Number(this.getAttribute('limit'));
      const shown = limit > 0 ? tasks.slice(0, limit) : tasks;
      const heading = this.getAttribute('heading');
      if (heading) {
        const head = document.createElement('div');
        head.className = 'head';
        head.part.add('heading');
        head.append(text('h3', '', heading));
        if (state && 'tasks' in state) head.append(text('span', 'count', String(tasks.length)));
        nodes.push(head);
      }
      if (!state) nodes.push(text('p', 'note', 'Loading tasks…'));
      else if ('error' in state) nodes.push(text('p', 'note error', state.error));
      else {
        if (this.#error) nodes.push(text('p', 'note error', this.#error));
        const grouped = buckets.length > 1 && new Set(shown.map((task) => task.bucket)).size > 1;
        let list: HTMLUListElement | undefined;
        let bucket: TaskBucket | undefined;
        for (const task of shown) {
          if (!list || (grouped && task.bucket !== bucket)) {
            if (grouped) nodes.push(text('div', 'group', LABELS[task.bucket]));
            list = document.createElement('ul');
            list.part.add('list');
            nodes.push(list);
            bucket = task.bucket;
          }
          list.append(this.#row(task));
        }
        if (!shown.length)
          nodes.push(text('p', 'note', this.getAttribute('empty') ?? 'Nothing here.'));
        if (this.hasAttribute('add') && buckets.some((item) => item !== 'done'))
          nodes.push(this.#form(buckets));
      }
      const focused = root.activeElement instanceof HTMLInputElement;
      root.replaceChildren(...nodes);
      if (focused) root.querySelector('input')?.focus();
    }

    #row(task: Task) {
      const item = document.createElement('li');
      item.part.add('task');
      const done = task.bucket === 'done';
      if (done) item.dataset.done = '';
      const check = document.createElement('button');
      check.type = 'button';
      check.className = 'check';
      check.setAttribute('role', 'checkbox');
      check.setAttribute('aria-checked', String(done));
      check.setAttribute('aria-label', `${done ? 'Reopen' : 'Complete'} “${task.title}”`);
      check.innerHTML = ICONS.tick;
      check.onclick = () =>
        this.#edit(task.id, { bucket: done ? (task.reopen ?? 'today') : 'done' });

      const body = document.createElement('div');
      body.append(text('div', 'title', task.title));
      const notes = task.notes
        ?.trim()
        .split('\n')[0]
        ?.replace(/[#*_`>]/g, '')
        .trim();
      if (notes) body.append(text('div', 'notes', notes));
      const meta = document.createElement('div');
      meta.className = 'meta';
      const late =
        task.bucket === 'today'
          ? Math.round((startOfDay(Date.now()) - startOfDay(task.time.moved)) / DAY)
          : 0;
      if (late > 0)
        meta.append(
          text('span', 'chip late', late === 1 ? 'From yesterday' : `Delayed ${late} days`),
        );
      if (task.project && !this.getAttribute('project'))
        meta.append(text('span', 'chip', folderName(task.project.directory)));
      // Who it's for, unless the list already shows only one side.
      if (!this.#assignee) {
        const agent = task.assignee === 'agent';
        const chip = text('span', agent ? 'chip agent' : 'chip', agent ? 'Agent' : 'Me');
        chip.insertAdjacentHTML('afterbegin', agent ? ICONS.bot : ICONS.person);
        meta.prepend(chip);
      }
      if (task.assignee === 'agent' && !done && !task.project && !task.workSessionID) {
        const chip = text('span', 'chip', 'Needs a project');
        chip.title = 'Set a project on the Tasks page so an agent can work on it';
        meta.append(chip);
      }
      body.append(meta);

      const actions = document.createElement('div');
      actions.className = 'actions';
      if (task.workSessionID) {
        const open = document.createElement('button');
        open.type = 'button';
        open.className = 'action chat';
        open.innerHTML = `Chat${ICONS.arrow}`;
        open.title = 'Open the chat the agent is working in';
        open.onclick = () => bridge.open(task.workSessionID!);
        actions.append(open);
      } else if (task.assignee === 'agent' && !done && task.project) {
        const starting = this.#starting.has(task.id);
        const start = document.createElement('button');
        start.type = 'button';
        start.className = 'action start';
        start.disabled = starting;
        start.innerHTML = `${ICONS.play}${starting ? 'Starting…' : 'Start'}`;
        start.title = 'Start an agent on this task in a new chat';
        start.onclick = () => {
          this.#starting.add(task.id);
          this.#error = '';
          this.#render();
          bridge.start(task.id).then(
            () => this.#starting.delete(task.id),
            (error: Error) => {
              this.#starting.delete(task.id);
              this.#error = error.message;
              this.#render();
            },
          );
        };
        actions.append(start);
      }
      item.append(check, body, actions);
      return item;
    }

    #form(buckets: TaskBucket[]) {
      const form = document.createElement('div');
      form.className = 'add';
      form.part.add('add');
      const input = document.createElement('input');
      input.placeholder = 'New task';
      input.maxLength = 500;
      input.value = this.#draft;
      input.setAttribute('aria-label', 'New task');
      input.oninput = () => (this.#draft = input.value);
      form.append(text('span', 'dot', ''), input);
      // The frame's sandbox blocks form submission, so Enter adds the task.
      input.onkeydown = (event) => {
        if (event.key !== 'Enter' || event.isComposing) return;
        event.preventDefault();
        const title = input.value.trim();
        if (!title) return;
        this.#draft = '';
        input.value = '';
        this.#error = '';
        const project = this.getAttribute('project');
        bridge
          .add({
            title,
            bucket: buckets.find((bucket) => bucket !== 'done'),
            ...(this.#assignee ? { assignee: this.#assignee } : {}),
            ...(project ? { project } : {}),
          })
          .catch((error: Error) => {
            this.#error = error.message;
            this.#render();
          });
      };
      return form;
    }

    #edit(id: string, input: Partial<Task>) {
      this.#local.set(id, { ...this.#local.get(id), ...input });
      this.#error = '';
      this.#render();
      bridge.update(id, input as CanvasTaskInput).catch((error: Error) => {
        this.#local.delete(id);
        this.#error = error.message;
        this.#render();
      });
    }
  }

  customElements.define('opencodex-tasks', OpenCodexTasks);
}
