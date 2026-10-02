import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { useStore } from 'zustand';
import { ArrowUp02Icon, PlusSignIcon, StopIcon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { Button } from '../../components/ui/button';
import { useCommand } from '../shortcuts/use-command';
import { shortcutProps } from '../shortcuts/commands';
import { useDraftStore } from './draft-context';
import { EMPTY_ATTACHMENTS } from './attachments';
import { ComposerAttachments } from './composer-attachments';
import { ComposerComments } from './composer-comments';
import { localCommands, matchSlashCommands, useSlashCommands } from './slash-commands';
import { useTypeToCompose } from './use-type-to-compose';
import './slash-commands.css';

export function Composer({
  sessionID,
  onSend,
  sending,
  ready,
  running,
  stopping,
  onStop,
  controls,
  directory,
}: {
  sessionID: string;
  onSend: () => Promise<unknown>;
  sending: boolean;
  ready: boolean;
  running: boolean;
  stopping: boolean;
  onStop: () => void;
  controls: ReactNode;
  directory?: string;
}) {
  const store = useDraftStore();
  const draft = useStore(store, (state) => state.drafts[sessionID]?.text ?? '');
  const attachments = useStore(
    store,
    (state) => state.drafts[sessionID]?.attachments ?? EMPTY_ATTACHMENTS,
  );
  const [attachmentError, setAttachmentError] = useState<string>();
  const commentCount = useStore(store, (state) => state.drafts[sessionID]?.comments?.length ?? 0);
  const [dragging, setDragging] = useState(false);
  const dragDepth = useRef(0);
  const fileInput = useRef<HTMLInputElement>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);
  useTypeToCompose(textarea, sessionID);
  const [commandIndex, setCommandIndex] = useState(0);
  const [dismissed, setDismissed] = useState(false);
  const [focused, setFocused] = useState(false);
  const commandQuery = useSlashCommands(directory, focused && draft.startsWith('/'));
  const commandSearch = /^\/[^\s/]*$/.test(draft) && focused && !dismissed;
  const commands = commandSearch
    ? matchSlashCommands(commandQuery.data ?? localCommands, draft.slice(1))
    : [];
  const activeCommand = Math.min(commandIndex, Math.max(0, commands.length - 1));
  function chooseCommand(name: string) {
    store.getState().editText(sessionID, `/${name} `);
    setDismissed(true);
    textarea.current?.focus();
  }
  const hasContent = Boolean(draft.trim() || attachments.length || commentCount);
  const removeAttachment = useCallback(
    (id: string) => {
      store.getState().removeAttachment(sessionID, id);
      setAttachmentError(undefined);
      textarea.current?.focus();
    },
    [store, sessionID],
  );
  function attach(files: File[]) {
    setAttachmentError(store.getState().attach(sessionID, files));
    textarea.current?.focus();
  }
  useEffect(() => {
    // A missed drop should never navigate the browser away from an unsent draft.
    const preventFileNavigation = (event: DragEvent) => {
      if (event.dataTransfer?.types.includes('Files')) event.preventDefault();
      if (event.type === 'drop' || event.type === 'dragend') {
        dragDepth.current = 0;
        setDragging(false);
      }
    };
    window.addEventListener('dragover', preventFileNavigation);
    window.addEventListener('drop', preventFileNavigation);
    window.addEventListener('dragend', preventFileNavigation);
    return () => {
      window.removeEventListener('dragover', preventFileNavigation);
      window.removeEventListener('drop', preventFileNavigation);
      window.removeEventListener('dragend', preventFileNavigation);
    };
  }, []);
  useCommand('composer.focus', () => textarea.current?.focus());
  useCommand('chat.stop', running && !stopping ? onStop : undefined);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!hasContent || sending || !ready) return;
    try {
      await onSend();
      textarea.current?.focus();
    } catch {
      // The mutation renders the error. Keep the draft for an explicit retry.
    }
  }
  return (
    <>
      <ComposerComments sessionID={sessionID} />
      <form
        className="composer"
        data-dragging={dragging}
        onSubmit={(event) => void submit(event)}
        onDragEnter={(event) => {
          if (!event.dataTransfer.types.includes('Files')) return;
          event.preventDefault();
          dragDepth.current++;
          setDragging(true);
        }}
        onDragOver={(event) => {
          if (!event.dataTransfer.types.includes('Files')) return;
          event.preventDefault();
          event.dataTransfer.dropEffect = 'copy';
        }}
        onDragLeave={(event) => {
          event.preventDefault();
          if (--dragDepth.current <= 0) {
            dragDepth.current = 0;
            setDragging(false);
          }
        }}
        onDrop={(event) => {
          if (!event.dataTransfer.types.includes('Files')) return;
          event.preventDefault();
          attach(Array.from(event.dataTransfer.files));
        }}
        onPaste={(event) => {
          const files = Array.from(event.clipboardData.files);
          if (!files.length) return;
          event.preventDefault();
          attach(files);
          const text = event.clipboardData.getData('text/plain');
          if (text && event.target === textarea.current) {
            const input = textarea.current!;
            store
              .getState()
              .editText(
                sessionID,
                draft.slice(0, input.selectionStart) + text + draft.slice(input.selectionEnd),
              );
          }
        }}
      >
        {commandSearch && (
          <div
            className="slash-menu"
            id="slash-commands"
            role="listbox"
            aria-label="Slash commands"
          >
            {commands.map((command, index) => (
              <button
                type="button"
                role="option"
                id={`slash-command-${index}`}
                aria-selected={index === activeCommand}
                key={command.name}
                onMouseDown={(event) => event.preventDefault()}
                onMouseEnter={() => setCommandIndex(index)}
                onClick={() => chooseCommand(command.name)}
              >
                <span>/{command.name}</span>
                <small>{command.description}</small>
              </button>
            ))}
            {commandQuery.isPending && <p role="status">Loading project commands…</p>}
            {commandQuery.isError && (
              <button
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => void commandQuery.refetch()}
              >
                Could not load commands. Retry
              </button>
            )}
            {!commands.length && !commandQuery.isPending && <p>No matching commands</p>}
          </div>
        )}
        {dragging && <div className="composer-drop-overlay">Drop files to attach</div>}
        <ComposerAttachments attachments={attachments} onRemove={removeAttachment} />
        {attachmentError && (
          <p className="attachment-error text-error" role="alert">
            {attachmentError}
          </p>
        )}
        <input
          ref={fileInput}
          type="file"
          aria-label="Attach files"
          multiple
          hidden
          onChange={(event) => {
            attach(Array.from(event.target.files ?? []));
            event.target.value = '';
          }}
        />
        <textarea
          ref={textarea}
          aria-label="Message"
          aria-controls={commandSearch ? 'slash-commands' : undefined}
          aria-activedescendant={
            commandSearch && commands.length ? `slash-command-${activeCommand}` : undefined
          }
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          {...shortcutProps('composer.focus')}
          placeholder="Ask anything, or describe what to build"
          rows={2}
          value={draft}
          onChange={(event) => {
            setCommandIndex(0);
            setDismissed(false);
            store.getState().editText(sessionID, event.target.value);
          }}
          onKeyDown={(event) => {
            if (event.nativeEvent.isComposing) return;
            if (commandSearch) {
              if (event.key === 'Escape') {
                event.preventDefault();
                event.stopPropagation();
                setDismissed(true);
                return;
              }
              if (
                commands.length &&
                ['ArrowDown', 'ArrowUp', 'Enter', 'Tab'].includes(event.key) &&
                !event.shiftKey
              ) {
                event.preventDefault();
                if (event.key === 'Enter' || event.key === 'Tab')
                  chooseCommand(commands[activeCommand]!.name);
                else {
                  const next =
                    (activeCommand + (event.key === 'ArrowDown' ? 1 : -1) + commands.length) %
                    commands.length;
                  setCommandIndex(next);
                  document
                    .getElementById(`slash-command-${next}`)
                    ?.scrollIntoView({ block: 'nearest' });
                }
                return;
              }
            }
            if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              event.currentTarget.form?.requestSubmit();
            }
          }}
        />
        <div className="composer-footer">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Attach files"
            title="Attach images, PDFs, or text/code files"
            onClick={() => fileInput.current?.click()}
          >
            <HugeiconsIcon icon={PlusSignIcon} size={18} />
          </Button>
          {controls}
          {running && (
            <Button
              variant="secondary"
              size="icon"
              aria-label="Stop"
              {...shortcutProps('chat.stop')}
              disabled={stopping}
              onClick={onStop}
            >
              <HugeiconsIcon icon={StopIcon} size={14} />
            </Button>
          )}
          <Button
            type="submit"
            size="icon"
            className="composer-send"
            aria-label="Send message"
            title="Send message"
            disabled={!hasContent || sending || !ready}
          >
            <HugeiconsIcon icon={ArrowUp02Icon} size={16} />
          </Button>
        </div>
      </form>
    </>
  );
}
