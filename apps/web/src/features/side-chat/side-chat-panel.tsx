import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BubbleChatQuestionIcon, Cancel01Icon, PlusSignIcon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { MAX_SIDE_CHATS, type SessionInfo } from '@opencodex/contracts';
import { Button } from '../../components/ui/button';
import { Dialog } from '../../components/ui/dialog';
import { api } from '../../lib/api';
import { useDraftStore } from '../chat/draft-context';
import { QueryError } from '../workbench/query-error';
import type { PanelContext, SideChatRequest } from '../workbench/panels';
import { SideChatView } from './side-chat-view';
import './side-chat.css';

const noSideChats: SessionInfo[] = [];

export function SideChatPanel({
  sessionID,
  directory,
  live,
  active,
  headerElement,
  sideChatRequest,
  onSideChatRequestHandled,
}: PanelContext) {
  const client = useQueryClient();
  const drafts = useDraftStore();
  const listKey = ['side-chats', sessionID];
  const list = useQuery({
    queryKey: listKey,
    queryFn: ({ signal }) => api.sideChats(sessionID, signal),
    enabled: active,
  });
  const running = useQuery({
    queryKey: ['active'],
    queryFn: ({ signal }) => api.active(signal),
    refetchOnMount: false,
    enabled: active,
  });
  const sessions = list.data ?? noSideChats;
  const [selectedID, setSelectedID] = useState<string>();
  const [openRequest, setOpenRequest] = useState<SideChatRequest>();
  if (sideChatRequest?.kind === 'open' && sideChatRequest !== openRequest) {
    setOpenRequest(sideChatRequest);
    setSelectedID(sideChatRequest.sideID);
  }
  const selected = sessions.find((session) => session.id === selectedID) ?? sessions.at(-1);
  const [deleting, setDeleting] = useState<SessionInfo>();
  const deleteButton = useRef<HTMLButtonElement>(null);

  const addQuote = useCallback(
    (sideID: string, quote: string) => {
      const block = quote
        .split('\n')
        .map((line) => `> ${line}`)
        .join('\n');
      const text = drafts.getState().drafts[sideID]?.text ?? '';
      drafts
        .getState()
        .editText(sideID, `${text.trim() ? `${text.trimEnd()}\n\n` : ''}${block}\n\n`);
      requestAnimationFrame(() =>
        document
          .querySelector<HTMLTextAreaElement>(
            `.side-chat[data-session-id="${sideID}"] textarea[aria-label="Message"]`,
          )
          ?.focus(),
      );
    },
    [drafts],
  );

  const create = useMutation({
    mutationFn: async (input: { quote?: string }) => {
      const session = await api.createSideChat(sessionID);
      client.setQueryData(['chat', session.id, 'info'], session);
      client.setQueryData<SessionInfo[]>(listKey, (items) => [
        ...(items ?? []).filter((item) => item.id !== session.id),
        session,
      ]);
      setSelectedID(session.id);
      // A new chat's draft is empty unless typed into already; quoting appends either way.
      if (input.quote) addQuote(session.id, input.quote);
      return session;
    },
    onSettled: (session) => {
      void client.invalidateQueries({ queryKey: listKey });
      if (session) void client.invalidateQueries({ queryKey: ['chat', session.id] });
    },
  });
  const remove = useMutation({
    mutationFn: (sideID: string) => api.deleteSideChat(sessionID, sideID),
    onSuccess: (_, sideID) => {
      client.setQueryData<SessionInfo[]>(listKey, (items) =>
        items?.filter((item) => item.id !== sideID),
      );
      // Release any unsent text and attachment blobs for the deleted chat.
      drafts.getState().acknowledge(drafts.getState().capture(sideID));
      setDeleting(undefined);
    },
    onSettled: () => client.invalidateQueries({ queryKey: listKey }),
  });

  // Requests are one-shot objects. Handle each once, after the list shows existing chats, then
  // clear it in the app so remounting this panel (e.g. after Settings) can't apply it again.
  const handled = useRef<SideChatRequest>(undefined);
  useEffect(() => {
    const request = sideChatRequest;
    if (!request || handled.current === request || !list.isSuccess || create.isPending) return;
    handled.current = request;
    onSideChatRequestHandled?.(request);
    if (request.kind !== 'quote') return;
    if (selected && !running.data?.[selected.id]) addQuote(selected.id, request.quote);
    else create.mutate({ quote: request.quote });
  }, [
    sideChatRequest,
    list.isSuccess,
    create,
    selected,
    running.data,
    addQuote,
    onSideChatRequestHandled,
  ]);

  if (!active) return null;
  const full = sessions.length >= MAX_SIDE_CHATS;
  const newButton = (
    <Button
      variant="ghost"
      size="icon"
      aria-label="New side chat"
      title={
        full ? `Delete a side chat to start another (up to ${MAX_SIDE_CHATS})` : 'New side chat'
      }
      disabled={create.isPending || full || !list.isSuccess}
      onClick={() => create.mutate({})}
    >
      <HugeiconsIcon icon={PlusSignIcon} size={15} />
    </Button>
  );
  return (
    <section className="side-chat-panel" aria-label="Side chats">
      {headerElement &&
        createPortal(
          <div
            className="wb-document-tabs side-chat-tabs"
            role="tablist"
            aria-label="Side chats"
            onKeyDown={(event) => {
              if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
              if (!sessions.length || !(event.target as HTMLElement).matches('[role="tab"]'))
                return;
              event.preventDefault();
              const index = sessions.findIndex((session) => session.id === selected?.id);
              const next =
                event.key === 'Home'
                  ? 0
                  : event.key === 'End'
                    ? sessions.length - 1
                    : (index + (event.key === 'ArrowRight' ? 1 : sessions.length - 1)) %
                      sessions.length;
              setSelectedID(sessions[next]!.id);
              const tabs = event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]');
              tabs[next]?.focus();
            }}
          >
            {sessions.map((session, index) => (
              <div
                className="wb-document-tab"
                data-active={selected?.id === session.id}
                key={session.id}
              >
                <button
                  role="tab"
                  aria-selected={selected?.id === session.id}
                  aria-controls="side-chat-content"
                  tabIndex={selected?.id === session.id ? 0 : -1}
                  title={session.title}
                  onClick={() => setSelectedID(session.id)}
                >
                  <HugeiconsIcon icon={BubbleChatQuestionIcon} size={14} />
                  <span>Side chat {index + 1}</span>
                  {running.data?.[session.id] && (
                    <span className="session-activity" role="img" aria-label="Responding" />
                  )}
                </button>
                <button
                  aria-label={`Delete side chat ${index + 1}`}
                  title="Delete side chat"
                  onClick={() => setDeleting(session)}
                >
                  <HugeiconsIcon icon={Cancel01Icon} size={12} />
                </button>
              </div>
            ))}
            {!sessions.length && <span className="wb-tabs-placeholder">Side chat</span>}
            {newButton}
          </div>,
          headerElement,
        )}
      {create.isPending && (
        <p className="wb-notice" role="status">
          Starting a side chat…
        </p>
      )}
      {create.isError && (
        <div className="wb-notice text-error" role="alert">
          {create.error.message}
        </div>
      )}
      <QueryError query={list} />
      {selected ? (
        <div className="side-chat-content" id="side-chat-content" role="tabpanel">
          <SideChatView
            key={selected.id}
            mainID={sessionID}
            sessionID={selected.id}
            directory={directory}
            live={live}
          />
        </div>
      ) : (
        list.isSuccess &&
        !create.isPending && (
          <div className="wb-empty">
            <HugeiconsIcon icon={BubbleChatQuestionIcon} size={28} />
            <h3>Ask on the side</h3>
            <p>
              A side chat starts from this chat’s history, so you can ask questions or explore
              without interrupting the main chat.
            </p>
            <Button variant="secondary" size="sm" onClick={() => create.mutate({})}>
              New side chat
            </Button>
          </div>
        )
      )}
      {deleting && (
        <Dialog
          title="Delete side chat?"
          busy={remove.isPending}
          initialFocus={deleteButton}
          onClose={() => {
            setDeleting(undefined);
            remove.reset();
          }}
        >
          <p className="message-note">
            This deletes the side chat and its messages. The main chat isn’t affected.
          </p>
          {remove.isError && (
            <p className="text-error" role="alert">
              {remove.error.message}
            </p>
          )}
          <div className="dialog-actions">
            <Button
              variant="ghost"
              disabled={remove.isPending}
              onClick={() => {
                setDeleting(undefined);
                remove.reset();
              }}
            >
              Cancel
            </Button>
            <Button
              ref={deleteButton}
              variant="primary"
              disabled={remove.isPending}
              onClick={() => remove.mutate(deleting.id)}
            >
              {remove.isPending ? 'Deleting…' : 'Delete'}
            </Button>
          </div>
        </Dialog>
      )}
    </section>
  );
}
