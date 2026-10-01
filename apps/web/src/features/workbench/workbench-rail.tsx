import { HugeiconsIcon } from '@hugeicons/react';
import type { PanelDefinition } from './panels';
import { OpenInApp } from './open-in-app';
import './workbench-rail.css';

export function WorkbenchRail({
  directory,
  panels,
  active,
  onSelect,
}: {
  directory: string;
  panels: readonly PanelDefinition[];
  active: string | null;
  onSelect: (panel: PanelDefinition) => void;
}) {
  return (
    <nav className="wb-rail" aria-label="Workspace views">
      <div className="wb-rail-header">
        <OpenInApp directory={directory} active />
      </div>
      {panels.map((view) => (
        <button
          key={view.id}
          type="button"
          aria-label={view.label}
          title={view.label}
          aria-pressed={active === view.id}
          onClick={() => onSelect(view)}
        >
          <HugeiconsIcon icon={view.icon} size={18} />
        </button>
      ))}
    </nav>
  );
}
