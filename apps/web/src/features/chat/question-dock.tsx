import { useEffect, useId, useRef, useState } from 'react';
import { useIsMutating, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowDown01Icon, ArrowUp01Icon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import type { FormAnswer, FormInfo } from '@opencodex/contracts';
import { Button } from '../../components/ui/button';
import { api } from '../../lib/api';
import { answerError, fieldApplies, initialAnswers } from './question-answer';
import { QuestionField } from './question-field';
import './question-dock.css';

export function QuestionDock({ form, pendingCount }: { form: FormInfo; pendingCount: number }) {
  const client = useQueryClient();
  const root = useRef<HTMLFormElement>(null);
  const submit = useRef<HTMLButtonElement>(null);
  const bodyID = useId();
  const titleID = useId();
  const [answer, setAnswer] = useState(() => initialAnswers(form));
  const [activeKey, setActiveKey] = useState<string>();
  const [collapsed, setCollapsed] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  useEffect(() => {
    if (reviewing && !collapsed) submit.current?.focus({ preventScroll: true });
  }, [reviewing, collapsed]);
  const [error, setError] = useState<string>();
  const mutationKey = ['chat', form.sessionID, 'form-reply', form.id];
  const sending = useIsMutating({ mutationKey }) > 0;
  const reply = useMutation({
    mutationKey,
    retry: false,
    mutationFn: (value: FormAnswer | null) =>
      value === null
        ? api.cancelForm(form.sessionID, form.id)
        : api.replyForm(form.sessionID, form.id, value),
    onSuccess: () => {
      client.setQueryData<FormInfo[]>(['chat', form.sessionID, 'forms'], (forms) =>
        forms?.filter((item) => item.id !== form.id),
      );
      void client.invalidateQueries({ queryKey: ['chat', form.sessionID, 'forms'] });
    },
  });
  const applicable = form.fields.filter((field) => fieldApplies(field, answer));
  const fields = applicable.filter((field) => !('hidden' in field && field.hidden));
  const index = Math.max(
    0,
    fields.findIndex((field) => field.key === activeKey),
  );
  const field = fields[index];
  const last = index >= fields.length - 1;
  function advance() {
    if (client.isMutating({ mutationKey })) return;
    if (collapsed) {
      setCollapsed(false);
      return;
    }
    if (!root.current?.reportValidity()) return;
    const invalid = (reviewing || last ? fields : field ? [field] : []).find((item) =>
      answerError(item, answer[item.key]),
    );
    if (invalid) {
      setReviewing(false);
      setActiveKey(invalid.key);
      setError(answerError(invalid, answer[invalid.key]));
      return;
    }
    setError(undefined);
    if (!reviewing && !last) {
      setActiveKey(fields[index + 1]!.key);
      return;
    }
    if (!reviewing) {
      setReviewing(true);
      return;
    }
    const keys = new Set(applicable.map((item) => item.key));
    reply.mutate(Object.fromEntries(Object.entries(answer).filter(([key]) => keys.has(key))));
  }
  return (
    <form
      ref={root}
      className="question-dock"
      aria-label={form.title}
      data-shortcut-boundary=""
      onSubmit={(event) => {
        event.preventDefault();
        advance();
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter' && (event.nativeEvent.isComposing || event.repeat)) {
          event.preventDefault();
          return;
        }
        if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
          event.preventDefault();
          event.stopPropagation();
          advance();
        }
      }}
    >
      <header className="question-dock-header">
        <span>
          {reviewing
            ? 'Review answers'
            : fields.length > 1
              ? `Question ${index + 1} of ${fields.length}`
              : 'Question'}
        </span>
        {!reviewing && field?.description && field.title && (
          <span className="question-topic">{field.title}</span>
        )}
        {pendingCount > 1 && (
          <span className="question-queued">{pendingCount - 1} more pending</span>
        )}
        <Button
          variant="ghost"
          size="icon"
          aria-label={collapsed ? 'Expand question' : 'Collapse question'}
          aria-expanded={!collapsed}
          aria-controls={bodyID}
          onClick={() => setCollapsed((value) => !value)}
        >
          <HugeiconsIcon icon={collapsed ? ArrowUp01Icon : ArrowDown01Icon} size={16} />
        </Button>
      </header>
      {collapsed ? (
        <p className="question-collapsed">
          {reviewing
            ? 'Your answers are ready to send'
            : field?.description || field?.title || form.title}
        </p>
      ) : (
        <div className="question-dock-body" id={bodyID}>
          <h2 id={titleID}>
            {reviewing
              ? 'Check your answers before sending'
              : field?.description || field?.title || form.title}
          </h2>
          <fieldset disabled={sending} aria-labelledby={titleID}>
            {reviewing ? (
              <dl className="question-review">
                {fields.map((item) => {
                  const value = answer[item.key];
                  const options =
                    item.type === 'string' || item.type === 'multiselect'
                      ? item.options
                      : undefined;
                  const values = Array.isArray(value)
                    ? value
                    : value === undefined || value === ''
                      ? []
                      : [value];
                  return (
                    <div className="question-review-item" key={item.key}>
                      <dt>{item.description || item.title || item.key}</dt>
                      <dd>
                        {values.length ? (
                          values.map((entry, i) => (
                            <span key={i}>
                              {typeof entry === 'boolean'
                                ? entry
                                  ? 'Yes'
                                  : 'No'
                                : (options?.find((option) => option.value === entry)?.label ??
                                  String(entry))}
                            </span>
                          ))
                        ) : (
                          <span className="question-review-empty">
                            {item.type === 'external' ? 'External step' : 'Not answered'}
                          </span>
                        )}
                      </dd>
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label={`Edit ${item.title || item.key}`}
                        onClick={() => {
                          setActiveKey(item.key);
                          setReviewing(false);
                          setError(undefined);
                        }}
                      >
                        Edit
                      </Button>
                    </div>
                  );
                })}
              </dl>
            ) : (
              field && (
                <QuestionField
                  key={field.key}
                  field={field}
                  value={answer[field.key]}
                  onChange={(value) => {
                    setAnswer((current) => ({ ...current, [field.key]: value }));
                    setError(undefined);
                  }}
                />
              )
            )}
          </fieldset>
          {(error || reply.isError) && (
            <p className="question-error text-error" role="alert">
              {error || reply.error?.message}
            </p>
          )}
        </div>
      )}
      <footer className="question-dock-footer">
        <Button
          variant="ghost"
          size="sm"
          disabled={sending}
          onClick={() => {
            if (!client.isMutating({ mutationKey })) reply.mutate(null);
          }}
        >
          Dismiss
        </Button>
        <div className="question-dock-actions">
          {(reviewing || index > 0) && !collapsed && fields.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              disabled={sending}
              onClick={() => {
                setActiveKey(fields[reviewing ? fields.length - 1 : index - 1]!.key);
                setReviewing(false);
                setError(undefined);
              }}
            >
              Back
            </Button>
          )}
          <Button
            ref={submit}
            type="submit"
            size="sm"
            disabled={sending}
            aria-keyshortcuts={
              reviewing ? 'Enter Meta+Enter Control+Enter' : 'Meta+Enter Control+Enter'
            }
            title={reviewing ? 'Enter to send' : '⌘/Ctrl + Enter'}
          >
            {sending
              ? 'Sending…'
              : collapsed
                ? 'Continue'
                : reviewing
                  ? 'Send answers ↵'
                  : last
                    ? 'Review answers'
                    : 'Next'}
          </Button>
        </div>
      </footer>
    </form>
  );
}
