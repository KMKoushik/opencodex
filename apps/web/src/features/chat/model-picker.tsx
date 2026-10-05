import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type CSSProperties,
} from 'react';
import { LegendList, type LegendListRef } from '@legendapp/list/react';
import {
  ArrowDown01Icon,
  ArrowRight01Icon,
  Search01Icon,
  Tick02Icon,
} from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import type { ModelInfo, ModelProvider, ModelRef } from '@opencodex/contracts';
import { ProviderLogo } from './provider-logo';
import { modelKey, readModelUsage, recordModelUsage } from './model-usage';
import { useCommand } from '../shortcuts/use-command';
import { shortcutProps } from '../shortcuts/commands';
import './model-picker.css';

type Entry = { key: string; model: ModelInfo; provider: ModelProvider; search: string };
type Group = { provider: ModelProvider; entries: Entry[]; frequent?: boolean };
type Row =
  | {
      type: 'provider';
      key: string;
      group: Group;
      position: number;
      size: number;
      expanded: boolean;
    }
  | { type: 'model'; key: string; group: Group; entry: Entry; position: number; size: number };
const rowKey = (row: Row) => row.key;
const contextSize = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 });

export function ModelPicker({
  models,
  providers,
  model,
  disabled,
  placeholder,
  onChange,
  shortcuts = true,
}: {
  /** The main chat's picker owns the app-wide model shortcut. */
  shortcuts?: boolean;
  models: ModelInfo[];
  providers?: ModelProvider[];
  model?: ModelRef;
  disabled: boolean;
  placeholder: string;
  onChange: (model: ModelRef) => void;
}) {
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const [placement, setPlacement] = useState<{ above: boolean; height: number }>();
  const groups = useMemo(() => {
    const metadata = new Map(providers?.map((provider) => [provider.id, provider]));
    const grouped = new Map<string, Group>();
    for (const item of models) {
      let group = grouped.get(item.providerID);
      if (!group) {
        group = {
          provider: metadata.get(item.providerID) ?? { id: item.providerID, name: item.providerID },
          entries: [],
        };
        grouped.set(item.providerID, group);
      }
      group.entries.push({
        key: modelKey(item),
        model: item,
        provider: group.provider,
        search: `${group.provider.name} ${item.providerID} ${item.name} ${item.id}`.toLowerCase(),
      });
    }
    return [...grouped.values()].sort((a, b) => a.provider.name.localeCompare(b.provider.name));
  }, [models, providers]);
  const current = models.find(
    (item) => item.id === model?.id && item.providerID === model.providerID,
  );
  const provider = groups.find((group) => group.provider.id === model?.providerID)?.provider;
  const close = () => {
    setPlacement(undefined);
    trigger.current?.focus({ preventScroll: true });
  };
  useEffect(() => {
    if (!placement) return;
    const dismiss = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setPlacement(undefined);
    };
    document.addEventListener('pointerdown', dismiss);
    return () => document.removeEventListener('pointerdown', dismiss);
  }, [placement]);
  function open() {
    if (disabled) return;
    const rect = trigger.current!.getBoundingClientRect();
    const below = innerHeight - rect.bottom;
    const above = rect.top > below;
    setPlacement({ above, height: Math.min(420, (above ? rect.top : below) - 12) });
  }
  useCommand('model.choose', disabled || !shortcuts ? undefined : open);
  return (
    <div
      className="select model-select"
      data-shortcut-boundary={placement ? '' : undefined}
      ref={root}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setPlacement(undefined);
      }}
    >
      <button
        type="button"
        ref={trigger}
        className="select-trigger"
        disabled={disabled}
        aria-label="Model"
        {...(shortcuts ? shortcutProps('model.choose') : { 'data-tooltip': 'Model' })}
        aria-haspopup="tree"
        aria-expanded={Boolean(placement)}
        aria-controls={placement ? id : undefined}
        onClick={() => (placement ? close() : open())}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            open();
          }
        }}
      >
        {model && <ProviderLogo providerID={model.providerID} canonical={provider?.canonical} />}
        <span className="truncate">{current?.name || placeholder}</span>
        <HugeiconsIcon icon={ArrowDown01Icon} size={14} className="select-chevron" />
      </button>
      {placement && (
        <ModelMenu
          id={id}
          groups={groups}
          model={model}
          placement={placement}
          onClose={close}
          onSelect={(next) => {
            recordModelUsage(next);
            onChange(next);
            close();
          }}
        />
      )}
    </div>
  );
}

function ModelMenu({
  id,
  groups,
  model,
  placement,
  onClose,
  onSelect,
}: {
  id: string;
  groups: Group[];
  model?: ModelRef;
  placement: { above: boolean; height: number };
  onClose: () => void;
  onSelect: (model: ModelRef) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<LegendListRef>(null);
  const [query, setQuery] = useState('');
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const [usage] = useState(readModelUsage);
  const frequent = useMemo(() => {
    const entries = groups.flatMap((group) => group.entries);
    const ranked = entries.filter((entry) => usage.has(entry.key));
    ranked.sort((a, b) => usage.get(b.key)! - usage.get(a.key)!);
    if (!ranked.length && model) {
      const current = entries.find((entry) => entry.key === modelKey(model));
      if (current) ranked.push(current);
    }
    return ranked.slice(0, 5).map((entry) => ({ ...entry, key: `frequent:${entry.key}` }));
  }, [groups, model, usage]);
  const [activeKey, setActiveKey] = useState('');
  const rows = useMemo(() => {
    const terms = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
    const filtered = [
      ...(frequent.length && !terms.length
        ? [
            {
              provider: { id: 'most-used', name: usage.size ? 'Most used' : 'Current model' },
              entries: frequent,
              frequent: true,
            },
          ]
        : []),
      ...groups,
    ]
      .map((group) => ({
        ...group,
        entries: group.entries.filter((entry) =>
          terms.every((term) => entry.search.includes(term)),
        ),
      }))
      .filter((group) => group.entries.length);
    return filtered.flatMap((group, position): Row[] => {
      const expanded = !collapsed.has(group.provider.id);
      return [
        {
          type: 'provider',
          key: `provider:${group.provider.id}`,
          group,
          position,
          size: filtered.length,
          expanded,
        },
        ...(expanded
          ? group.entries.map((entry, index): Row => ({
              type: 'model',
              key: entry.key,
              group,
              entry,
              position: index,
              size: group.entries.length,
            }))
          : []),
      ];
    });
  }, [groups, frequent, query, collapsed, usage]);
  const found = rows.findIndex((row) => row.key === activeKey);
  const active =
    found >= 0
      ? found
      : Math.max(
          0,
          rows.findIndex((row) => row.type === 'model'),
        );
  useEffect(() => {
    input.current?.focus({ preventScroll: true });
  }, []);
  function move(index: number) {
    const next = Math.max(0, Math.min(rows.length - 1, index));
    if (!rows[next]) return;
    setActiveKey(rows[next].key);
    void list.current?.scrollToIndex({ index: next, animated: false, viewPosition: 0.5 });
  }
  function choose(row: Row) {
    if (row.type === 'model') {
      onSelect({ id: row.entry.model.id, providerID: row.entry.model.providerID });
      return;
    }
    setActiveKey(row.key);
    setCollapsed((previous) => {
      const next = new Set(previous);
      if (next.has(row.group.provider.id)) next.delete(row.group.provider.id);
      else next.add(row.group.provider.id);
      return next;
    });
    input.current?.focus({ preventScroll: true });
  }
  function navigate(event: KeyboardEvent) {
    if (event.nativeEvent.isComposing) return;
    if (event.key === 'Escape' || event.key === 'Tab') {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
      }
      onClose();
      return;
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      move(active + (event.key === 'ArrowDown' ? 1 : -1));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      if (rows[active]) choose(rows[active]);
    } else if (!query && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) {
      const row = rows[active];
      if (!row) return;
      event.preventDefault();
      if (row.type === 'model') {
        if (event.key === 'ArrowLeft')
          move(rows.findIndex((item) => item.key === `provider:${row.group.provider.id}`));
      } else if (
        (event.key === 'ArrowLeft' && row.expanded) ||
        (event.key === 'ArrowRight' && !row.expanded)
      )
        choose(row);
      else if (event.key === 'ArrowRight') move(active + 1);
    }
  }
  return (
    <div
      className="model-picker"
      data-placement={placement.above ? 'top' : 'bottom'}
      style={{ '--picker-height': `${placement.height}px` } as CSSProperties}
    >
      <div className="model-picker-search">
        <HugeiconsIcon icon={Search01Icon} size={16} aria-hidden="true" />
        <input
          ref={input}
          name="model-search"
          role="combobox"
          aria-label="Search model"
          aria-haspopup="tree"
          aria-expanded="true"
          aria-controls={id}
          aria-autocomplete="list"
          aria-activedescendant={rows.length ? `${id}-${active}` : undefined}
          placeholder="Search models…"
          autoComplete="off"
          spellCheck={false}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setActiveKey('');
            setCollapsed((previous) => (previous.size ? new Set() : previous));
            list.current?.scrollToOffset({ offset: 0, animated: false });
          }}
          onKeyDown={navigate}
        />
      </div>
      {rows.length ? (
        <LegendList
          ref={list}
          data={rows}
          extraData={active}
          keyExtractor={rowKey}
          estimatedItemSize={36}
          drawDistance={80}
          initialScrollIndex={Math.max(0, active - 1)}
          className="model-picker-list"
          style={{ height: Math.min(rows.length * 44, placement.height - 78) }}
          id={id}
          role="tree"
          aria-label="Models by provider"
          renderItem={({ item, index }) => {
            const selected =
              item.type === 'model' &&
              item.entry.model.id === model?.id &&
              item.entry.model.providerID === model.providerID;
            const context = item.type === 'model' ? item.entry.model.limit?.context : undefined;
            return (
              <div
                id={`${id}-${index}`}
                role="treeitem"
                tabIndex={-1}
                aria-level={item.type === 'provider' ? 1 : 2}
                aria-posinset={item.position + 1}
                aria-setsize={item.size}
                aria-expanded={item.type === 'provider' ? item.expanded : undefined}
                aria-selected={item.type === 'model' ? selected : undefined}
                aria-label={
                  item.type === 'provider'
                    ? item.group.provider.name
                    : `${item.entry.model.name}, ${item.entry.provider.name}`
                }
                className={item.type === 'provider' ? 'model-group-heading' : 'model-picker-option'}
                data-active={index === active}
                data-frequent={item.group.frequent || undefined}
                onPointerMove={(event) => {
                  if (event.pointerType === 'mouse' && (event.movementX || event.movementY))
                    setActiveKey(item.key);
                }}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => choose(item)}
                onKeyDown={navigate}
              >
                {item.type === 'provider' ? (
                  <>
                    {!item.group.frequent && (
                      <ProviderLogo
                        providerID={item.group.provider.id}
                        canonical={item.group.provider.canonical}
                      />
                    )}
                    <span className="truncate">{item.group.provider.name}</span>
                    <span className="model-group-count">{item.group.entries.length}</span>
                    <HugeiconsIcon
                      icon={item.expanded ? ArrowDown01Icon : ArrowRight01Icon}
                      size={14}
                    />
                  </>
                ) : (
                  <>
                    {item.group.frequent && (
                      <ProviderLogo
                        providerID={item.entry.model.providerID}
                        canonical={item.entry.provider.canonical}
                      />
                    )}
                    <span className="truncate">{item.entry.model.name}</span>
                    {Boolean(context) && (
                      <span
                        className="model-context"
                        title={`${context!.toLocaleString('en')} token context window`}
                      >
                        {contextSize.format(context!)}
                      </span>
                    )}
                    <span className="model-picker-check">
                      {selected && <HugeiconsIcon icon={Tick02Icon} size={16} />}
                    </span>
                  </>
                )}
              </div>
            );
          }}
        />
      ) : (
        <div id={id} role="tree" aria-label="Models by provider">
          <p className="model-picker-empty" role="status">
            No matching models
          </p>
        </div>
      )}
      <div className="model-picker-footer" aria-hidden="true">
        <span>↑↓ Navigate</span>
        <span>↵ Select</span>
        <span>esc Close</span>
      </div>
    </div>
  );
}
