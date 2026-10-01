import { useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type {
  FormInfo,
  FormField,
  FormAnswer,
  PermissionRequest,
  PermissionReply,
} from '@opencodex/contracts';
import { api } from '../../lib/api';
import { Button } from '../../components/ui/button';

export function PermissionCard({ request }: { request: PermissionRequest }) {
  const client = useQueryClient();
  const reply = useMutation({
    mutationFn: (value: PermissionReply) =>
      api.replyPermission(request.sessionID, request.id, value),
    onSuccess: () =>
      client.invalidateQueries({ queryKey: ['chat', request.sessionID, 'permissions'] }),
  });
  return (
    <section className="request-card" aria-label="Permission request">
      <h2>{request.action}</h2>
      {request.message && <p>{request.message}</p>}
      <pre>{request.resources.join('\n')}</pre>
      <div className="request-actions">
        <Button size="sm" disabled={reply.isPending} onClick={() => reply.mutate('once')}>
          Allow once
        </Button>
        {Boolean(request.save?.length) && (
          <Button
            size="sm"
            variant="secondary"
            disabled={reply.isPending}
            onClick={() => reply.mutate('always')}
          >
            Always allow
          </Button>
        )}
        <Button
          size="sm"
          variant="ghost"
          disabled={reply.isPending}
          onClick={() => reply.mutate('reject')}
        >
          Reject
        </Button>
      </div>
      {reply.isError && (
        <p className="text-error" role="alert">
          {reply.error.message}
        </p>
      )}
    </section>
  );
}

export function QuestionCard({ form }: { form: FormInfo }) {
  const client = useQueryClient();
  const [answer, setAnswer] = useState<FormAnswer>(() =>
    Object.fromEntries(
      form.fields.flatMap((field) =>
        'default' in field && field.default !== undefined
          ? [[field.key, field.default]]
          : field.type === 'boolean'
            ? [[field.key, false]]
            : [],
      ),
    ),
  );
  const reply = useMutation({
    mutationFn: (value: FormAnswer | null) =>
      value === null
        ? api.cancelForm(form.sessionID, form.id)
        : api.replyForm(form.sessionID, form.id, value),
    onSuccess: () => client.invalidateQueries({ queryKey: ['chat', form.sessionID, 'forms'] }),
  });
  const visible = (field: FormField) =>
    !('when' in field) ||
    !field.when ||
    field.when.every((condition) =>
      condition.op === 'eq'
        ? answer[condition.key] === condition.value
        : answer[condition.key] !== condition.value,
    );
  function submit(event: FormEvent) {
    event.preventDefault();
    const keys = new Set(form.fields.filter(visible).map((field) => field.key));
    reply.mutate(Object.fromEntries(Object.entries(answer).filter(([key]) => keys.has(key))));
  }
  return (
    <form className="request-card" aria-label={form.title} onSubmit={submit}>
      <h2>{form.title}</h2>
      {form.fields
        .filter(visible)
        .filter((field) => !('hidden' in field && field.hidden))
        .map((field) => (
          <QuestionField
            key={field.key}
            field={field}
            value={answer[field.key]}
            onChange={(value) => setAnswer((current) => ({ ...current, [field.key]: value }))}
          />
        ))}
      <div className="request-actions">
        <Button type="submit" size="sm" disabled={reply.isPending}>
          Submit
        </Button>
        <Button
          variant="ghost"
          size="sm"
          disabled={reply.isPending}
          onClick={() => reply.mutate(null)}
        >
          Dismiss
        </Button>
      </div>
      {reply.isError && (
        <p className="text-error" role="alert">
          {reply.error.message}
        </p>
      )}
    </form>
  );
}

function QuestionField({
  field,
  value,
  onChange,
}: {
  field: FormField;
  value: FormAnswer[string] | undefined;
  onChange: (value: FormAnswer[string]) => void;
}) {
  const [custom, setCustom] = useState(() =>
    field.type === 'multiselect' && Array.isArray(value)
      ? value.filter((item) => !field.options.some((option) => option.value === item)).join('\n')
      : '',
  );
  if (field.type === 'external') {
    const safe = /^https?:\/\//i.test(field.url);
    return (
      <p>
        {safe ? (
          <a href={field.url} target="_blank" rel="noreferrer">
            {field.title || 'Open link'}
          </a>
        ) : (
          'Open this request in OpenCode to continue.'
        )}
      </p>
    );
  }
  const title = field.title || field.key;
  if (field.type === 'multiselect') {
    const selected = Array.isArray(value) ? value : [];
    return (
      <fieldset className="question-field">
        <legend>{title}</legend>
        {field.description && <p>{field.description}</p>}
        {field.options.map((option) => (
          <label className="question-option" key={option.value}>
            <input
              type="checkbox"
              checked={selected.includes(option.value)}
              onChange={(event) =>
                onChange(
                  event.target.checked
                    ? [...selected, option.value]
                    : selected.filter((item) => item !== option.value),
                )
              }
            />
            {option.label}
            {option.description && <span>{option.description}</span>}
          </label>
        ))}
        {field.custom && (
          <label>
            Other (one per line)
            <textarea
              value={custom}
              onChange={(event) => {
                setCustom(event.target.value);
                onChange([
                  ...selected.filter((item) =>
                    field.options.some((option) => option.value === item),
                  ),
                  ...event.target.value.split('\n').filter(Boolean),
                ]);
              }}
            />
          </label>
        )}
      </fieldset>
    );
  }
  if (field.type === 'boolean')
    return (
      <label className="question-option">
        <input
          type="checkbox"
          checked={value === true}
          onChange={(event) => onChange(event.target.checked)}
        />
        {title}
      </label>
    );
  if (field.type === 'string' && field.options?.length && !field.custom) {
    return (
      <label className="question-field">
        {title}
        {field.description && <span>{field.description}</span>}
        <select
          required={field.required}
          value={typeof value === 'string' ? value : ''}
          onChange={(event) => onChange(event.target.value)}
        >
          <option value="">Choose…</option>
          {field.options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
    );
  }
  if (field.type === 'string')
    return (
      <label className="question-field">
        {title}
        {field.description && <span>{field.description}</span>}
        {field.options && (
          <span>
            {field.options.map((option) => option.label).join(' · ')}, or enter your own answer
          </span>
        )}
        <input
          required={field.required}
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
          placeholder={field.placeholder}
          minLength={field.minLength}
          maxLength={field.maxLength}
          pattern={field.pattern}
          value={typeof value === 'string' ? value : ''}
          onChange={(event) => onChange(event.target.value)}
        />
      </label>
    );
  return (
    <label className="question-field">
      {title}
      <input
        type="number"
        required={field.required}
        step={field.type === 'integer' ? 1 : 'any'}
        min={typeof field.minimum === 'number' ? field.minimum : undefined}
        max={typeof field.maximum === 'number' ? field.maximum : undefined}
        value={typeof value === 'number' ? value : ''}
        onChange={(event) => onChange(event.target.value === '' ? '' : Number(event.target.value))}
      />
    </label>
  );
}
