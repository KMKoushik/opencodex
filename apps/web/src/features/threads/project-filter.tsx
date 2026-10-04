import { useId, type KeyboardEvent } from 'react';
import { FilterHorizontalIcon, Tick02Icon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import type { OpenCodeProject } from '@opencodex/contracts';
import { Button } from '../../components/ui/button';
import { ProjectIcon } from '../projects/project-icon';

type Option = { directory: string; name: string; icon?: OpenCodeProject['icon'] };

/** Chooses which projects Focus shows. Unchecked projects are hidden from Focus only. */
export function ProjectFilter({
  options,
  excluded,
  onChange,
}: {
  options: Option[];
  excluded: ReadonlySet<string>;
  onChange: (excluded: ReadonlySet<string>) => void;
}) {
  const id = useId();
  const hidden = options.filter((option) => excluded.has(option.directory)).length;
  function toggle(directory: string) {
    const next = new Set(excluded);
    if (!next.delete(directory)) next.add(directory);
    onChange(next);
  }
  function move(event: KeyboardEvent<HTMLDivElement>) {
    const items = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('button'));
    const index = items.indexOf(document.activeElement as HTMLButtonElement);
    const next = {
      ArrowDown: (index + 1) % items.length,
      ArrowUp: (index - 1 + items.length) % items.length,
      Home: 0,
      End: items.length - 1,
    }[event.key];
    if (next === undefined) return;
    event.preventDefault();
    items[next]?.focus();
  }
  return (
    <>
      <Button
        className="thread-view-toggle project-filter-trigger"
        variant="ghost"
        size="icon"
        aria-label="Filter projects"
        title={hidden ? `Filter projects (${hidden} hidden)` : 'Choose projects shown in Focus'}
        aria-haspopup="menu"
        aria-pressed={hidden > 0}
        popoverTarget={id}
      >
        <HugeiconsIcon icon={FilterHorizontalIcon} size={14} />
      </Button>
      <div
        id={id}
        className="project-filter"
        popover="auto"
        role="menu"
        aria-label="Projects shown in Focus"
        onToggle={(event) => {
          if (event.newState === 'open')
            event.currentTarget.querySelector<HTMLButtonElement>('button')?.focus();
        }}
        onKeyDown={move}
      >
        <p className="project-filter-heading">Show in Focus</p>
        {options.length === 0 && <p className="project-filter-empty">No recent projects</p>}
        {options.map((option) => {
          const shown = !excluded.has(option.directory);
          return (
            <button
              key={option.directory}
              type="button"
              role="menuitemcheckbox"
              aria-checked={shown}
              title={option.directory}
              onClick={() => toggle(option.directory)}
            >
              <ProjectIcon name={option.name} icon={option.icon} />
              <span className="truncate">{option.name}</span>
              {shown && <HugeiconsIcon icon={Tick02Icon} size={14} />}
            </button>
          );
        })}
        {hidden > 0 && (
          <button
            type="button"
            role="menuitem"
            className="project-filter-reset"
            onClick={() => onChange(new Set())}
          >
            Show all projects
          </button>
        )}
      </div>
    </>
  );
}
