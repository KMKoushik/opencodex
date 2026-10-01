import { useEffect, useRef, useState } from 'react';
import type { FormAnswer, FormField } from '@opencodex/contracts';

export function QuestionField({
  field,
  value,
  onChange,
}: {
  field: FormField;
  value: FormAnswer[string] | undefined;
  onChange: (value: FormAnswer[string]) => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  const options =
    field.type === 'string' || field.type === 'multiselect' ? (field.options ?? []) : [];
  const multi = field.type === 'multiselect';
  const initialCustom = Array.isArray(value)
    ? value.filter((item) => !options.some((option) => option.value === item)).join('\n')
    : typeof value === 'string' && !options.some((option) => option.value === value)
      ? value
      : '';
  const [custom, setCustom] = useState(initialCustom);
  const [customOn, setCustomOn] = useState(Boolean(initialCustom));
  useEffect(() => {
    const node = root.current;
    node
      ?.querySelector<HTMLElement>('input:checked, input, textarea, a')
      ?.focus({ preventScroll: true });
    if (node?.parentElement) node.parentElement.scrollTop = 0;
  }, []);
  function updateCustom(text: string, on = true) {
    setCustom(text);
    if (multi) {
      const selected = Array.isArray(value)
        ? value.filter((item) => options.some((option) => option.value === item))
        : [];
      onChange([
        ...selected,
        ...(on
          ? [
              ...new Set(
                text
                  .split('\n')
                  .map((item) => item.trim())
                  .filter(Boolean),
              ),
            ].filter((item) => !selected.includes(item))
          : []),
      ]);
    } else onChange(on ? text : '');
  }
  const label = field.title || field.key;
  return (
    <div
      ref={root}
      className="question-field-content"
      onKeyDown={(event) => {
        if (
          event.nativeEvent.isComposing ||
          event.metaKey ||
          event.ctrlKey ||
          event.altKey ||
          event.repeat
        )
          return;
        const target = event.target;
        if (
          target instanceof HTMLTextAreaElement ||
          (target instanceof HTMLInputElement && !['radio', 'checkbox'].includes(target.type))
        )
          return;
        if (/^[1-9]$/.test(event.key)) {
          const input = root.current?.querySelectorAll<HTMLInputElement>(
            '.question-choice > input',
          )[Number(event.key) - 1];
          if (input) {
            event.preventDefault();
            input.focus();
            input.click();
          }
        }
      }}
    >
      {options.length > 0 ? (
        <>
          <p className="question-instruction">
            {multi ? 'Select one or more answers' : 'Select one answer'}
          </p>
          <div
            className="question-choices"
            role={multi ? 'group' : 'radiogroup'}
            aria-label={label}
          >
            {options.map((option, index) => {
              const selected = multi
                ? Array.isArray(value) && value.includes(option.value)
                : !customOn && value === option.value;
              return (
                <label className="question-choice" data-selected={selected} key={option.value}>
                  <input
                    type={multi ? 'checkbox' : 'radio'}
                    name={field.key}
                    checked={selected}
                    value={option.value}
                    onChange={() => {
                      if (multi)
                        onChange(
                          selected
                            ? (Array.isArray(value) ? value : []).filter(
                                (item) => item !== option.value,
                              )
                            : [...(Array.isArray(value) ? value : []), option.value],
                        );
                      else {
                        setCustomOn(false);
                        onChange(option.value);
                      }
                    }}
                  />
                  <span className="question-choice-copy">
                    <span>{option.label}</span>
                    {option.description && <small>{option.description}</small>}
                  </span>
                  {index < 9 && <kbd aria-hidden="true">{index + 1}</kbd>}
                </label>
              );
            })}
            {'custom' in field && field.custom && (
              <>
                <label className="question-choice" data-selected={customOn}>
                  <input
                    type={multi ? 'checkbox' : 'radio'}
                    name={field.key}
                    checked={customOn}
                    onChange={() => {
                      const on = multi ? !customOn : true;
                      setCustomOn(on);
                      updateCustom(custom, on);
                    }}
                  />
                  <span className="question-choice-copy">Type your own answer</span>
                </label>
                {customOn && (
                  <textarea
                    className="question-input"
                    aria-label={`Custom answer for ${label}`}
                    autoFocus
                    rows={2}
                    placeholder={multi ? 'One answer per line…' : 'Type your answer…'}
                    value={custom}
                    maxLength={field.type === 'string' ? field.maxLength : undefined}
                    onChange={(event) => updateCustom(event.target.value)}
                  />
                )}
              </>
            )}
          </div>
        </>
      ) : field.type === 'external' ? (
        <p className="question-external">
          {/^(https?):\/\//i.test(field.url) ? (
            <a href={field.url} target="_blank" rel="noreferrer">
              {field.title || 'Open link'} ↗
            </a>
          ) : (
            'Open this request in OpenCode to continue.'
          )}
        </p>
      ) : field.type === 'boolean' ? (
        <div className="question-choices" role="radiogroup" aria-label={label}>
          {[true, false].map((choice) => (
            <label
              className="question-choice"
              key={String(choice)}
              data-selected={value === choice}
            >
              <input
                type="radio"
                name={field.key}
                checked={value === choice}
                onChange={() => onChange(choice)}
              />
              <span>{choice ? 'Yes' : 'No'}</span>
            </label>
          ))}
        </div>
      ) : field.type === 'string' ? (
        <input
          className="question-input"
          aria-label={label}
          type={
            field.format === 'email'
              ? 'email'
              : field.format === 'uri'
                ? 'url'
                : field.format === 'date'
                  ? 'date'
                  : field.format === 'date-time'
                    ? 'datetime-local'
                    : 'text'
          }
          required={field.required}
          placeholder={field.placeholder || 'Type your answer…'}
          minLength={field.minLength}
          maxLength={field.maxLength}
          pattern={field.pattern}
          value={typeof value === 'string' ? value : ''}
          onChange={(event) => onChange(event.target.value)}
        />
      ) : field.type === 'multiselect' ? (
        <textarea
          className="question-input"
          aria-label={label}
          rows={2}
          value={custom}
          placeholder="One answer per line…"
          onChange={(event) => updateCustom(event.target.value)}
        />
      ) : (
        <input
          className="question-input"
          aria-label={label}
          type="number"
          required={field.required}
          step={field.type === 'integer' ? 1 : 'any'}
          min={typeof field.minimum === 'number' ? field.minimum : undefined}
          max={typeof field.maximum === 'number' ? field.maximum : undefined}
          value={typeof value === 'number' ? value : ''}
          onChange={(event) =>
            onChange(event.target.value === '' ? '' : Number(event.target.value))
          }
        />
      )}
    </div>
  );
}
