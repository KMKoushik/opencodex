import { useMemo } from 'react';
import type { ModelInfo, ModelProvider, ModelRef } from '@opencodex/contracts';
import { Select } from '../../components/ui/select';
import { ModelPicker } from './model-picker';

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
        label="Thinking level"
        value={model?.variant ?? ''}
        options={variants}
        disabled={disabled || !hasVariants}
        placeholder={model?.variant ? variantLabel(model.variant) : 'Default'}
        onChange={(variant) => {
          if (model)
            onChange({
              id: model.id,
              providerID: model.providerID,
              ...(variant ? { variant } : {}),
            });
        }}
        renderValue={(option) => (
          <span className="truncate">{hasVariants ? option.label : 'No thinking options'}</span>
        )}
        renderOption={(option) => <span>{option.label}</span>}
      />
    </div>
  );
}
