import {
  useDeferredValue,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import {
  ArrowDown01Icon,
  Folder01Icon,
  FolderGit2Icon,
  GitBranchIcon,
  Search01Icon,
  Tick02Icon,
} from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { Select } from '../../components/ui/select';
import { api } from '../../lib/api';
import type { useCheckout } from './checkout';
import './worktrees.css';

/** Where an empty chat's first prompt runs. `branch` undefined means the local checkout's HEAD. */
export type WorkspaceChoice = { mode: 'local' | 'worktree'; branch?: string };

export function WorkspaceBar({
  checkout,
  choice,
  editable,
  starting,
  live,
  onChange,
}: {
  checkout: ReturnType<typeof useCheckout>;
  choice: WorkspaceChoice;
  /** Only an unsent chat in the local checkout can choose where it starts. */
  editable: boolean;
  starting: boolean;
  live: boolean;
  onChange: (choice: WorkspaceChoice) => void;
}) {
  const { canonical, directory, removed } = checkout;
  const branch = useQuery({
    queryKey: ['workspace', 'vcs', directory],
    queryFn: ({ signal }) => api.workspaceVcs(directory!, signal),
    enabled: Boolean(editable && canonical && directory && !removed),
    staleTime: 15_000,
    refetchInterval: live ? false : 15_000,
    select: (vcs) => vcs.info.branch.current,
  });
  if (!canonical || !directory) return null;
  const status = (starting || removed) && (
    <span className="workspace-status" role="status">
      {starting
        ? 'Creating worktree…'
        : 'This worktree was removed. The conversation is read-only.'}
    </span>
  );
  // Once the chat has started, the session card shows its folder and branch.
  if (!editable)
    return (
      status && (
        <div className="workspace-bar" aria-label="Workspace">
          {status}
        </div>
      )
    );
  const worktree = choice.mode === 'worktree';
  return (
    <div className="workspace-bar" aria-label="Workspace">
      <Select
        label="Where this chat works"
        value={choice.mode}
        disabled={starting}
        options={[
          { value: 'local', label: 'Local', detail: 'Work in your project folder' },
          {
            value: 'worktree',
            label: 'New worktree',
            detail: 'Isolated checkout. Local changes stay put.',
          },
        ]}
        onChange={(mode) =>
          onChange(mode === 'worktree' ? { ...choice, mode: 'worktree' } : { mode: 'local' })
        }
        renderValue={(option) => (
          <>
            <HugeiconsIcon
              icon={option.value === 'worktree' ? FolderGit2Icon : Folder01Icon}
              size={14}
            />
            <span className="truncate">{option.label}</span>
          </>
        )}
        renderOption={(option) => (
          <>
            <HugeiconsIcon
              icon={option.value === 'worktree' ? FolderGit2Icon : Folder01Icon}
              size={16}
            />
            <span className="workspace-option">
              <span>{option.label}</span>
              <small>{option.detail}</small>
            </span>
          </>
        )}
      />
      {worktree ? (
        <BranchPicker
          directory={canonical}
          current={branch.data}
          value={choice.branch}
          disabled={starting}
          onChange={(next) => onChange({ mode: 'worktree', branch: next })}
        />
      ) : (
        !removed &&
        branch.isSuccess && (
          <span className="workspace-label" title="Current branch">
            <HugeiconsIcon icon={GitBranchIcon} size={14} />
            <span className="truncate">{branch.data ?? 'Detached HEAD'}</span>
          </span>
        )
      )}
      {status}
    </div>
  );
}

const NO_BRANCHES: string[] = [];
const BRANCH_LIMIT = 100;

function BranchPicker({
  directory,
  current,
  value,
  disabled,
  onChange,
}: {
  directory: string;
  current?: string;
  value?: string;
  disabled: boolean;
  onChange: (branch: string | undefined) => void;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const selected = value ?? current;
  function close() {
    setOpen(false);
    trigger.current?.focus({ preventScroll: true });
  }
  useEffect(() => {
    if (!open) return;
    const dismiss = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', dismiss);
    return () => document.removeEventListener('pointerdown', dismiss);
  }, [open]);
  return (
    <div
      ref={root}
      className="select branch-picker"
      data-shortcut-boundary={open ? '' : undefined}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
    >
      <button
        ref={trigger}
        type="button"
        className="select-trigger"
        aria-label={`Start from branch ${selected ?? 'HEAD'}`}
        title="What branch should this worktree start from?"
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => (open ? close() : setOpen(true))}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            setOpen(true);
          }
        }}
      >
        <HugeiconsIcon icon={GitBranchIcon} size={14} />
        <span className="truncate">From {selected ?? 'HEAD'}</span>
        <HugeiconsIcon icon={ArrowDown01Icon} size={14} className="select-chevron" />
      </button>
      {open && (
        <BranchMenu
          directory={directory}
          current={current}
          selected={selected}
          onClose={close}
          onSelect={(branch) => {
            close();
            onChange(branch === current ? undefined : branch);
          }}
        />
      )}
    </div>
  );
}

function BranchMenu({
  directory,
  current,
  selected,
  onClose,
  onSelect,
}: {
  directory: string;
  current?: string;
  selected?: string;
  onClose: () => void;
  onSelect: (branch: string) => void;
}) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const [query, setQuery] = useState('');
  const search = useDeferredValue(query.trim());
  const [active, setActive] = useState(0);
  const all = useQuery({
    queryKey: ['workspace', 'branches', directory, ''],
    queryFn: ({ signal }) => api.branches(directory, '', signal),
    staleTime: 30_000,
  });
  // Native search misses substring matches, so filter locally and only ask OpenCode when the
  // listing was truncated at the gateway's limit.
  const truncated = (all.data?.length ?? 0) >= BRANCH_LIMIT;
  const searched = useQuery({
    queryKey: ['workspace', 'branches', directory, search],
    queryFn: ({ signal }) => api.branches(directory, search, signal),
    enabled: truncated && Boolean(search),
    staleTime: 30_000,
    placeholderData: keepPreviousData,
  });
  const rows = useMemo(() => {
    const names = all.data ?? NO_BRANCHES;
    const needle = search.toLowerCase();
    const matching = new Set(names.filter((name) => name.toLowerCase().includes(needle)));
    if (truncated && search) for (const name of searched.data ?? NO_BRANCHES) matching.add(name);
    // `origin` alone is the remote's HEAD alias; its branches are listed individually.
    return [...matching].filter(
      (name) => name.includes('/') || !names.some((other) => other.startsWith(`${name}/`)),
    );
  }, [all.data, searched.data, search, truncated]);
  const branches = truncated && search ? searched : all;
  const index = Math.min(active, Math.max(0, rows.length - 1));
  useEffect(() => {
    input.current?.focus({ preventScroll: true });
  }, []);
  useEffect(() => {
    const menu = list.current;
    const item = menu?.children[index] as HTMLElement | undefined;
    if (!menu || !item) return;
    if (item.offsetTop < menu.scrollTop) menu.scrollTop = item.offsetTop;
    const bottom = item.offsetTop + item.offsetHeight;
    if (bottom > menu.scrollTop + menu.clientHeight) menu.scrollTop = bottom - menu.clientHeight;
  }, [index, rows]);
  function navigate(event: KeyboardEvent) {
    if (event.nativeEvent.isComposing) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      onClose();
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      setActive(
        Math.max(0, Math.min(rows.length - 1, index + (event.key === 'ArrowDown' ? 1 : -1))),
      );
    } else if (event.key === 'Enter') {
      event.preventDefault();
      if (rows[index]) onSelect(rows[index]);
    }
  }
  return (
    <div className="select-menu branch-menu" data-placement="top">
      <div className="branch-search">
        <HugeiconsIcon icon={Search01Icon} size={14} aria-hidden="true" />
        <input
          ref={input}
          role="combobox"
          aria-label="Search branches"
          aria-controls={id}
          aria-expanded="true"
          aria-autocomplete="list"
          aria-activedescendant={rows.length ? `${id}-${index}` : undefined}
          placeholder="Search branches"
          autoComplete="off"
          spellCheck={false}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setActive(0);
          }}
          onKeyDown={navigate}
        />
      </div>
      <ul ref={list} id={id} className="select-options" role="listbox" aria-label="Branches">
        {rows.map((name, row) => (
          <li
            key={name}
            id={`${id}-${row}`}
            role="option"
            aria-selected={name === selected}
            data-active={row === index}
            onPointerMove={(event) => {
              if (event.pointerType === 'mouse' && (event.movementX || event.movementY))
                setActive(row);
            }}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => onSelect(name)}
          >
            <span className="truncate">{name}</span>
            {name === current && <small className="branch-current">current</small>}
            {name === selected && (
              <HugeiconsIcon icon={Tick02Icon} size={14} className="select-check" />
            )}
          </li>
        ))}
      </ul>
      {branches.isPending && (
        <p className="branch-note" role="status">
          Loading branches…
        </p>
      )}
      {branches.isSuccess && !rows.length && <p className="branch-note">No matching branches</p>}
      {branches.isError && (
        <p className="branch-note text-error" role="alert">
          {branches.error.message}
        </p>
      )}
    </div>
  );
}
