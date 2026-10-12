import { useId, type ReactNode } from 'react';
import { cx } from './util';

export function Button({
  children,
  onClick,
  variant = 'secondary',
  size = 'md',
  disabled,
  title,
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md';
  disabled?: boolean;
  title?: string;
}) {
  return (
    <button
      type="button"
      className={cx('cv-button', `cv-button-${variant}`, size === 'sm' && 'cv-button-sm')}
      onClick={onClick}
      disabled={disabled}
      title={title}
    >
      {children}
    </button>
  );
}

function Field({
  label,
  hint,
  id,
  children,
}: {
  label?: ReactNode;
  hint?: ReactNode;
  id: string;
  children: ReactNode;
}) {
  return (
    <div className="cv-field">
      {label && (
        <label className="cv-field-label" htmlFor={id}>
          {label}
        </label>
      )}
      {children}
      {hint && <p className="cv-muted cv-text-sm">{hint}</p>}
    </div>
  );
}

/** Single-line text input. `onChange` receives the new text. */
export function TextInput({
  value,
  onChange,
  label,
  hint,
  placeholder,
  type = 'text',
  onSubmit,
}: {
  value: string;
  onChange: (value: string) => void;
  label?: ReactNode;
  hint?: ReactNode;
  placeholder?: string;
  type?: 'text' | 'search' | 'email' | 'url';
  /** Called when the user presses Enter. */
  onSubmit?: (value: string) => void;
}) {
  const id = useId();
  return (
    <Field label={label} hint={hint} id={id}>
      <input
        id={id}
        className="cv-input"
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && onSubmit) onSubmit(event.currentTarget.value);
        }}
      />
    </Field>
  );
}

export function TextArea({
  value,
  onChange,
  label,
  hint,
  placeholder,
  rows = 4,
}: {
  value: string;
  onChange: (value: string) => void;
  label?: ReactNode;
  hint?: ReactNode;
  placeholder?: string;
  rows?: number;
}) {
  const id = useId();
  return (
    <Field label={label} hint={hint} id={id}>
      <textarea
        id={id}
        className="cv-input cv-textarea"
        rows={rows}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
    </Field>
  );
}

export function NumberInput({
  value,
  onChange,
  label,
  hint,
  min,
  max,
  step,
}: {
  value: number;
  onChange: (value: number) => void;
  label?: ReactNode;
  hint?: ReactNode;
  min?: number;
  max?: number;
  step?: number;
}) {
  const id = useId();
  return (
    <Field label={label} hint={hint} id={id}>
      <input
        id={id}
        className="cv-input"
        type="number"
        value={Number.isFinite(value) ? value : ''}
        min={min}
        max={max}
        step={step}
        onChange={(event) => {
          const next = event.target.valueAsNumber;
          if (Number.isFinite(next)) onChange(next);
        }}
      />
    </Field>
  );
}

type Option = string | { value: string; label: ReactNode };
const optionValue = (option: Option) => (typeof option === 'string' ? option : option.value);
const optionLabel = (option: Option) => (typeof option === 'string' ? option : option.label);

export function Select({
  value,
  onChange,
  options,
  label,
  hint,
}: {
  value: string;
  onChange: (value: string) => void;
  options: Option[];
  label?: ReactNode;
  hint?: ReactNode;
}) {
  const id = useId();
  return (
    <Field label={label} hint={hint} id={id}>
      <select
        id={id}
        className="cv-input cv-select"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {options.map((option) => (
          <option key={optionValue(option)} value={optionValue(option)}>
            {String(optionLabel(option))}
          </option>
        ))}
      </select>
    </Field>
  );
}

/** A row of mutually exclusive choices, for filters and view switches. */
export function SegmentedControl({
  value,
  onChange,
  options,
  label,
}: {
  value: string;
  onChange: (value: string) => void;
  options: Option[];
  label?: string;
}) {
  return (
    <div className="cv-segmented" role="radiogroup" aria-label={label}>
      {options.map((option) => (
        <button
          key={optionValue(option)}
          type="button"
          role="radio"
          aria-checked={optionValue(option) === value}
          className="cv-segment"
          onClick={() => onChange(optionValue(option))}
        >
          {optionLabel(option)}
        </button>
      ))}
    </div>
  );
}

export function Checkbox({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: ReactNode;
}) {
  return (
    <label className="cv-check">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span>{label}</span>
    </label>
  );
}

export function Switch({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: ReactNode;
}) {
  return (
    <label className="cv-switch">
      <input
        type="checkbox"
        role="switch"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span className="cv-switch-track" aria-hidden="true" />
      <span>{label}</span>
    </label>
  );
}

export function Slider({
  value,
  onChange,
  min = 0,
  max = 100,
  step = 1,
  label,
  format = (value: number) => String(value),
}: {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  label?: ReactNode;
  format?: (value: number) => string;
}) {
  const id = useId();
  return (
    <div className="cv-field">
      <div className="cv-progress-labels">
        <label className="cv-field-label" htmlFor={id}>
          {label}
        </label>
        <span className="cv-muted">{format(value)}</span>
      </div>
      <input
        id={id}
        className="cv-slider"
        type="range"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(event) => onChange(event.target.valueAsNumber)}
      />
    </div>
  );
}
