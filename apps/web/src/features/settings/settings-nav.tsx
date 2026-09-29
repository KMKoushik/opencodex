import { ArrowLeft02Icon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { settingsSections, type SettingsSection } from './sections';

export function SettingsNav({
  section,
  onSelect,
  onBack,
}: {
  section: SettingsSection;
  onSelect: (section: SettingsSection) => void;
  onBack: () => void;
}) {
  return (
    <nav className="sidebar-nav" aria-label="Settings">
      <button className="nav-row" onClick={onBack}>
        <HugeiconsIcon icon={ArrowLeft02Icon} size={16} />
        <span>Back to app</span>
      </button>
      <div className="nav-group">
        {settingsSections.map(({ id, label, icon }) => (
          <button
            key={id}
            className="nav-row"
            aria-current={section === id ? 'page' : undefined}
            onClick={() => onSelect(id)}
          >
            <HugeiconsIcon icon={icon} size={16} />
            <span>{label}</span>
          </button>
        ))}
      </div>
    </nav>
  );
}
