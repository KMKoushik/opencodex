import { useMemo, useRef } from 'react';
import type { ModelInfo, ModelProvider, ModelRef } from '@opencodex/contracts';
import { Select } from '../../components/ui/select';
import { ModelPicker } from './model-picker';
import { useCommand } from '../shortcuts/use-command';
import { shortcutProps } from '../shortcuts/commands';

const variantLabel = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);

export function ModelControls({
  models,
  providers,
  model,
  disabled,
  loading,
  failed,
  onChange,
}: {
  models?: ModelInfo[];
  providers?: ModelProvider[];
  model?: ModelRef;
  disabled: boolean;
  loading: boolean;
  failed: boolean;
  onChange: (model: ModelRef) => void;
}) {
  const options = useMemo(
    () => models?.filter((item) => item.enabled).sort((a, b) => a.name.localeCompare(b.name)) ?? [],
    [models],
  );
  const current = options.find(
    (option) => option.id === model?.id && option.providerID === model.providerID,
  );
  const variants = useMemo(
    () => [
      { value: '', label: 'Default' },
      ...(current?.variants ?? []).map((variant) => ({
        value: variant.id,
        label: variantLabel(variant.id),
      })),
    ],
    [current],
  );
  const hasVariants = variants.length > 1;
  // OpenCode can return its explicit default sentinel after a selection is saved.
  const selectedVariant = model?.variant === 'default' ? '' : (model?.variant ?? '');
  const thinking = useRef<HTMLButtonElement>(null);
  useCommand(
    'thinking.choose',
    disabled || !hasVariants ? undefined : () => thinking.current?.click(),
  );
  function changeVariant(variant: string) {
    if (model)
      onChange({
        id: model.id,
        providerID: model.providerID,
        ...(variant ? { variant } : {}),
      });
  }
  useCommand(
    'thinking.cycle',
    disabled || !hasVariants || !model
      ? undefined
      : () => {
          const index = variants.findIndex((variant) => variant.value === selectedVariant);
          changeVariant(variants[(index + 1) % variants.length]!.value);
        },
  );
  const chooseShortcut = shortcutProps('thinking.choose');
  const cycleShortcut = shortcutProps('thinking.cycle');
  return (
    <div className="composer-controls">
      <ModelPicker
        models={options}
        providers={providers}
        model={model}
        disabled={disabled || !options.length}
        placeholder={
          model?.id ||
          (loading
            ? 'Loading models…'
            : failed
              ? 'Models unavailable'
              : options.length
                ? 'Choose model'
                : 'No models available')
        }
        onChange={(next) => {
          // A new model starts with its own default, never the previous model's variant.
          if (next.id !== model?.id || next.providerID !== model.providerID) onChange(next);
        }}
      />
      <Select
        triggerRef={thinking}
        triggerProps={{
          title: `${chooseShortcut.title}; ${cycleShortcut.title}`,
          'aria-keyshortcuts': `${chooseShortcut['aria-keyshortcuts']} ${cycleShortcut['aria-keyshortcuts']}`,
        }}
        label="Thinking level"
        value={selectedVariant}
        options={variants}
        disabled={disabled || !hasVariants}
        placeholder={model?.variant ? variantLabel(model.variant) : 'Default'}
        onChange={changeVariant}
        renderValue={(option) => (
          <span className="truncate">{hasVariants ? option.label : 'No thinking options'}</span>
        )}
        renderOption={(option) => <span>{option.label}</span>}
      />
    </div>
  );
}
