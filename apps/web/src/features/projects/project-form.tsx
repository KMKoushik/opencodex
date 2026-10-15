import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
  type KeyboardEvent,
} from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Folder01Icon, FolderOpenIcon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import type { Project } from '@opencodex/contracts';
import { Button } from '../../components/ui/button';
import { api } from '../../lib/api';
import { fuzzyRank } from '../../lib/fuzzy';
import { projectFolder } from './project-metadata';

const SHOWN = 50;
const ROWS = 8;

/** The folder being typed into and the name typed so far: `~/Personal/op` → `~/Personal/`, `op`. */
function splitPath(path: string) {
  if (!path.startsWith('/') && !path.startsWith('~/')) return;
  const slash = path.lastIndexOf('/');
  return { parent: path.slice(0, slash + 1), name: path.slice(slash + 1) };
}

export function ProjectForm({
  onSelect,
  register = false,
}: {
  onSelect: (project: Project) => void;
  register?: boolean;
}) {
  const [directory, setDirectory] = useState('');
  const [pickerError, setPickerError] = useState<string>();
  const [suggesting, setSuggesting] = useState(false);
  // Arrow-key choice for one typed value; typing again resets it.
  const [picked, setPicked] = useState<{ path: string; index: number }>();
  const listID = useId();
  const list = useRef<HTMLDivElement>(null);
  const client = useQueryClient();
  const project = useMutation({
    mutationFn: async (directory: string) =>
      register ? projectFolder(await api.addProject(directory)) : api.project(directory),
    onSuccess: (project) => {
      void client.invalidateQueries({ queryKey: ['projects'] });
      onSelect(project);
    },
  });
  const typed = splitPath(directory);
  const parent = typed?.parent;
  const name = typed?.name ?? '';
  const folders = useQuery({
    queryKey: ['folders', parent],
    queryFn: ({ signal }) => api.folders(parent!, signal),
    enabled: suggesting && parent !== undefined,
    staleTime: 30_000,
    gcTime: 60_000,
    retry: false,
    // The last folder's list stays up, dimmed, until the next one arrives, so the list
    // never blinks out between folders.
    placeholderData: keepPreviousData,
  });
  const stale = folders.isPlaceholderData;
  const { matches, total } = useMemo(() => {
    if (!folders.data) return { matches: [], total: 0 };
    // Hidden folders appear once the name starts with a dot, as in a shell.
    const visible = name.startsWith('.')
      ? folders.data.folders
      : folders.data.folders.filter((folder) => !folder.startsWith('.'));
    return {
      total: visible.length,
      matches: name
        ? fuzzyRank(visible, name, (folder) => folder, SHOWN).map(({ item, match }) => ({
            name: item,
            positions: match.positions,
          }))
        : visible.slice(0, SHOWN).map((folder) => ({ name: folder, positions: [] as number[] })),
    };
  }, [name, folders.data]);
  const open =
    suggesting && parent !== undefined && (folders.data !== undefined || folders.isError);
  // A typed name highlights its best match; a bare folder path highlights nothing, so Enter
  // opens the folder itself rather than its first child.
  const active = picked?.path === directory ? picked.index : name && matches.length ? 0 : -1;
  const choice = open && !stale && active >= 0 ? matches[active] : undefined;

  // A popover sits in the top layer, so the list overlays dialogs and pages instead of
  // pushing the content below it.
  useLayoutEffect(() => {
    if (open) list.current?.showPopover();
  }, [open]);
  useEffect(() => {
    if (active >= 0) list.current?.children[active]?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const error = pickerError || project.error?.message;
  const openPath = (path: string) => {
    setPickerError(undefined);
    setSuggesting(false);
    setDirectory(path);
    project.mutate(path);
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    openPath(choice ? parent + choice.name : directory);
  };
  const enter = (folder: string) => {
    setDirectory(`${parent}${folder}/`);
    setSuggesting(true);
  };
  const keyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (!open) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!matches.length) return;
      const step = event.key === 'ArrowDown' ? 1 : -1;
      const from = active < 0 && step < 0 ? 0 : active;
      setPicked({ path: directory, index: (from + step + matches.length) % matches.length });
    } else if (event.key === 'Tab' && !event.shiftKey && !stale && matches.length) {
      event.preventDefault();
      enter(matches[Math.max(active, 0)]!.name);
    } else if (event.key === 'Escape') {
      // Close the list without closing a surrounding dialog.
      event.preventDefault();
      event.stopPropagation();
      setSuggesting(false);
    }
  };
  const browse = async () => {
    setPickerError(undefined);
    try {
      const selected = await window.desktop?.selectDirectory();
      if (selected) openPath(selected);
    } catch {
      setPickerError('The folder picker could not be opened. Enter the path instead.');
    }
  };
  return (
    <form onSubmit={submit} className="project-form">
      <div className="project-input" data-suggesting={open || undefined}>
        <input
          id="directory"
          role="combobox"
          aria-label="Project directory"
          aria-expanded={open}
          aria-controls={listID}
          aria-autocomplete="list"
          aria-activedescendant={choice ? `${listID}-${active}` : undefined}
          placeholder="~/projects/my-app"
          value={directory}
          onChange={(event) => {
            setDirectory(event.target.value);
            setSuggesting(true);
          }}
          onFocus={() => setSuggesting(Boolean(directory))}
          onBlur={() => setSuggesting(false)}
          onKeyDown={keyDown}
          autoComplete="off"
          spellCheck={false}
          required
          aria-describedby={error ? 'directory-error' : undefined}
          aria-invalid={Boolean(error)}
        />
        {window.desktop && (
          <Button
            variant="ghost"
            size="icon"
            onClick={() => void browse()}
            disabled={project.isPending}
            aria-label="Browse for a project folder"
            title="Browse for a project folder"
          >
            <HugeiconsIcon icon={FolderOpenIcon} size={16} />
          </Button>
        )}
      </div>
      <Button type="submit" disabled={!directory.trim() || project.isPending}>
        {project.isPending ? 'Opening…' : 'Open'}
      </Button>
      {open && (
        <div
          ref={list}
          id={listID}
          className="project-folders scrollbar-on-hover"
          popover="manual"
          role="listbox"
          aria-label="Folders"
          aria-busy={stale}
          data-stale={stale || undefined}
          // Sized by the folder, not the matches, so filtering never resizes it, as in fzf.
          style={{ '--rows': Math.min(ROWS, Math.max(1, total)) } as CSSProperties}
          onMouseDown={(event) => event.preventDefault()}
        >
          {folders.isError ? (
            <p>{folders.error.message}</p>
          ) : !matches.length ? (
            <p>{total ? 'No matching folders' : 'No folders here'}</p>
          ) : (
            matches.map((match, index) => (
              <div
                key={index}
                id={`${listID}-${index}`}
                role="option"
                aria-selected={index === active}
                onMouseMove={() => index !== active && setPicked({ path: directory, index })}
                onClick={() => !stale && enter(match.name)}
              >
                <HugeiconsIcon icon={Folder01Icon} size={14} aria-hidden="true" />
                <span>
                  <Highlighted text={match.name} positions={match.positions} />
                </span>
              </div>
            ))
          )}
        </div>
      )}
      <p id="directory-error" role="alert" className="field-error">
        {error}
      </p>
    </form>
  );
}

function Highlighted({ text, positions }: { text: string; positions: number[] }) {
  if (!positions.length) return text;
  const parts: React.ReactNode[] = [];
  let at = 0;
  for (const position of positions) {
    if (position > at) parts.push(text.slice(at, position));
    parts.push(<mark key={position}>{text[position]}</mark>);
    at = position + 1;
  }
  parts.push(text.slice(at));
  return parts;
}
