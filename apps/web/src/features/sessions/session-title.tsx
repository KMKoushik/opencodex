import { useEffect, useId, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { SessionInfo } from '@opencodex/contracts';
import { api } from '../../lib/api';
import './session-title.css';

export function SessionTitle({
  sessionID,
  title,
  disabled,
}: {
  sessionID: string;
  title: string;
  disabled: boolean;
}) {
  const client = useQueryClient();
  const [draft, setDraft] = useState<string>();
  const editing = draft !== undefined;
  const input = useRef<HTMLInputElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const finished = useRef(false);
  const restoreFocus = useRef(false);
  const errorID = useId();
  const save = useMutation({
    mutationFn: (title: string) => api.sessionAction(sessionID, { action: 'rename', title }),
    onSuccess: (_, title) => {
      client.setQueryData<SessionInfo>(['chat', sessionID, 'info'], (session) =>
        session ? { ...session, title } : session,
      );
      setDraft(undefined);
      void client.invalidateQueries({ queryKey: ['chat', sessionID, 'info'] });
      void client.invalidateQueries({ queryKey: ['sessions'] });
    },
    onError: () => {
      finished.current = false;
    },
  });
  useEffect(() => {
    if (editing) {
      input.current?.focus();
      input.current?.select();
    } else if (restoreFocus.current) {
      button.current?.focus();
      restoreFocus.current = false;
    }
  }, [editing]);

  function submit() {
    if (finished.current || save.isPending || disabled) return;
    finished.current = true;
    const next = draft?.trim();
    if (!next || next === title) setDraft(undefined);
    else save.mutate(next);
  }

  return (
    <div className="session-title">
      <h1 className="toolbar-title">
        {editing ? (
          <input
            ref={input}
            aria-label="Conversation title"
            aria-describedby={save.isError ? errorID : undefined}
            aria-invalid={save.isError || undefined}
            value={draft}
            maxLength={256}
            readOnly={save.isPending}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={submit}
            onKeyDown={(event) => {
              if (event.nativeEvent.isComposing) return;
              if (event.key === 'Escape' && !save.isPending) {
                event.preventDefault();
                event.stopPropagation();
                finished.current = true;
                restoreFocus.current = true;
                setDraft(undefined);
              }
              if (event.key === 'Enter') {
                event.preventDefault();
                restoreFocus.current = true;
                submit();
              }
            }}
          />
        ) : (
          <button
            ref={button}
            type="button"
            aria-label={`Rename conversation: ${title}`}
            title="Rename conversation"
            disabled={disabled}
            onClick={() => {
              finished.current = false;
              save.reset();
              setDraft(title);
            }}
          >
            <span className="truncate-fade">{title}</span>
          </button>
        )}
      </h1>
      {editing && save.isError && (
        <p className="session-title-error" id={errorID} role="alert">
          {save.error.message}
        </p>
      )}
    </div>
  );
}
