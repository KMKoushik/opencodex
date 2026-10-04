import { useId, useState, type ReactNode } from 'react';
import { ComputerIcon, Moon02Icon, Sun03Icon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { Button } from '../../components/ui/button';
import { SegmentedControl } from '../../components/ui/segmented-control';
import { Select } from '../../components/ui/select';
import { SettingsGroup, SettingsRow } from '../settings/settings-layout';
import {
  defaultChatFontSize,
  minChatFontSize,
  maxChatFontSize,
  useChatFontSize,
} from '../settings/chat-font-size';
import { presets, type Variant } from './presets';
import { isCustomized, resolveSeed, type ThemeMode, type VariantPreference } from './theme';
import { useTheme } from './use-theme';
import type { TerminalPlacement } from '../terminal/placement';

const modes = [
  { value: 'light', label: 'Light', icon: <HugeiconsIcon icon={Sun03Icon} size={14} /> },
  { value: 'dark', label: 'Dark', icon: <HugeiconsIcon icon={Moon02Icon} size={14} /> },
  { value: 'system', label: 'System', icon: <HugeiconsIcon icon={ComputerIcon} size={14} /> },
] satisfies { value: ThemeMode; label: string; icon: ReactNode }[];

export function AppearanceSettings({
  terminalPlacement,
  onTerminalPlacementChange,
}: {
  terminalPlacement: TerminalPlacement;
  onTerminalPlacementChange: (placement: TerminalPlacement) => void;
}) {
  const { preference, update } = useTheme();
  return (
    <>
      <SettingsGroup>
        <SettingsRow label="Mode" description="Follow your system or keep one appearance.">
          <SegmentedControl
            label="Mode"
            value={preference.mode}
            options={modes}
            onChange={(mode) => update({ ...preference, mode })}
          />
        </SettingsRow>
      </SettingsGroup>
      <ChatFontSettings />
      <SettingsGroup title="Terminal">
        <SettingsRow
          label="Placement"
          description="Open the terminal below the workspace or in the right-side panel."
        >
          <SegmentedControl<TerminalPlacement>
            label="Terminal placement"
            value={terminalPlacement}
            options={[
              { value: 'bottom', label: 'Bottom' },
              { value: 'right', label: 'Right' },
            ]}
            onChange={onTerminalPlacementChange}
          />
        </SettingsRow>
      </SettingsGroup>
      {(['light', 'dark'] as const).map((variant) => (
        <VariantSettings
          key={variant}
          variant={variant}
          value={preference[variant]}
          onChange={(value) => update({ ...preference, [variant]: value })}
        />
      ))}
    </>
  );
}

function ChatFontSettings() {
  const id = useId();
  const { size, update } = useChatFontSize();
  return (
    <SettingsGroup
      title="Typography"
      action={
        <Button
          variant="ghost"
          size="sm"
          aria-label="Reset chat font size"
          disabled={size === defaultChatFontSize}
          onClick={() => update(defaultChatFontSize)}
        >
          Reset
        </Button>
      }
    >
      <SettingsRow
        label="Chat font size"
        description="Messages and the prompt input. Code and sidebar text are unchanged."
        htmlFor={id}
      >
        <div className="contrast-field chat-font-size-field">
          <input
            id={id}
            type="range"
            min={minChatFontSize}
            max={maxChatFontSize}
            step={1}
            value={size}
            aria-label="Chat font size"
            aria-valuetext={`${size} pixels`}
            onChange={(event) => update(Number(event.target.value))}
          />
          <output htmlFor={id}>{size}px</output>
        </div>
      </SettingsRow>
      <div className="settings-chat-preview" aria-label="Chat font preview">
        Good code should be easy to read.
      </div>
    </SettingsGroup>
  );
}

function VariantSettings({
  variant,
  value,
  onChange,
}: {
  variant: Variant;
  value: VariantPreference;
  onChange: (value: VariantPreference) => void;
}) {
  const name = variant === 'light' ? 'Light' : 'Dark';
  const seed = resolveSeed(variant, value);
  const id = useId();
  const options = presets[variant].map((preset) => ({
    value: preset.id,
    label: preset.name,
    seed: preset.seed,
  }));

  return (
    <SettingsGroup
      title={`${name} theme`}
      action={
        <>
          {isCustomized(value) && (
            <Button variant="ghost" size="sm" onClick={() => onChange({ preset: value.preset })}>
              Reset
            </Button>
          )}
          <Select
            label={`${name} theme`}
            value={value.preset}
            options={options}
            onChange={(preset) => onChange({ preset })}
            renderOption={(option) => (
              <span className="theme-option">
                <ThemeChip
                  surface={option.seed.surface}
                  ink={option.seed.ink}
                  accent={option.seed.accent}
                />
                <span className="truncate">{option.label}</span>
              </span>
            )}
          />
        </>
      }
    >
      <ColorRow
        label="Accent"
        name={`${name} accent`}
        value={seed.accent}
        onChange={(accent) => onChange({ ...value, accent })}
      />
      <ColorRow
        label="Background"
        name={`${name} background`}
        value={seed.surface}
        onChange={(surface) => onChange({ ...value, surface })}
      />
      <ColorRow
        label="Foreground"
        name={`${name} foreground`}
        value={seed.ink}
        onChange={(ink) => onChange({ ...value, ink })}
      />
      <SettingsRow label="Contrast" htmlFor={id}>
        <div className="contrast-field">
          <input
            id={id}
            type="range"
            min={0}
            max={100}
            value={seed.contrast}
            aria-label={`${name} contrast`}
            onChange={(event) => onChange({ ...value, contrast: Number(event.target.value) })}
          />
          <output htmlFor={id}>{seed.contrast}</output>
        </div>
      </SettingsRow>
    </SettingsGroup>
  );
}

function ColorRow({
  label,
  name,
  value,
  onChange,
}: {
  label: string;
  name: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const [draft, setDraft] = useState<string>();
  const commit = () => {
    if (draft && /^#?[0-9a-f]{6}$/i.test(draft)) {
      onChange(`#${draft.replace('#', '').toLowerCase()}`);
    }
    setDraft(undefined);
  };
  return (
    <SettingsRow label={label}>
      <div className="color-field">
        <input
          type="color"
          value={value}
          aria-label={`${name} color`}
          onChange={(event) => onChange(event.target.value)}
        />
        <input
          type="text"
          value={draft ?? value}
          aria-label={`${name} hex value`}
          spellCheck={false}
          autoComplete="off"
          maxLength={7}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === 'Enter') commit();
            if (event.key === 'Escape') setDraft(undefined);
          }}
        />
      </div>
    </SettingsRow>
  );
}

function ThemeChip({ surface, ink, accent }: { surface: string; ink: string; accent: string }) {
  return (
    <span
      aria-hidden="true"
      className="theme-chip"
      style={{
        background: surface,
        color: accent,
        borderColor: `color-mix(in srgb, ${ink} 16%, ${surface})`,
      }}
    >
      Aa
    </span>
  );
}
