import { useMemo, useRef, useState } from 'react';
import { useIsMutating, useMutation, useQueryClient } from '@tanstack/react-query';
import type { ModelRef, Project, SessionInfo } from '@opencodex/contracts';
import { Button } from '../../components/ui/button';
import { Dialog } from '../../components/ui/dialog';
import { api } from '../../lib/api';
import { useChat } from './use-chat';
import { PermissionCard } from './requests';
import { QuestionDock } from './question-dock';
import { Composer } from './composer';
import { Timeline, type TimelineHandle } from './timeline';
import { ModelControls } from './model-controls';
import { useModelSelection } from './use-model-selection';
import { useDraftStore } from './draft-context';
import type { DraftSnapshot } from './draft-store';
import { EMPTY_ATTACHMENTS, encodeAttachments } from './attachments';
import { MessageAttachments } from './message-attachments';
import { reviewPrompt } from './review-comments';
import { localCommands, parseSlash, useSlashCommands } from './slash-commands';
import { SessionViewed } from '../sessions/session-viewed';
import { BrandIcon } from '../brand/brand';
import { Starters } from './starters';
import { sessionUnread } from '@opencodex/contracts';
import { ProjectSwitcher } from '../projects/project-switcher';
import { undoDraft } from './undo-draft';
import { ThinkingIndicator } from './thinking-indicator';

export function ChatView({
  sessionID,
  live,
  projectName,
  project,
  projects,
  switching,
  switchError,
  onSwitchProject,
  onOpenSession,
}: {
  sessionID: string;
  live: boolean;
  projectName?: string;
  project: Project | null;
  projects: Project[];
  switching: boolean;
  switchError?: string;
  onSwitchProject: (project: Project, model?: ModelRef) => void;
  onOpenSession: (id: string) => void;
}) {
  const client = useQueryClient();
  const chat = useChat(sessionID, live);
  const { catalog, select, model } = useModelSelection(sessionID, chat.info.data);
  const drafts = useDraftStore();
  const [forkDraft, setForkDraft] = useState<DraftSnapshot>();
  const forkButton = useRef<HTMLButtonElement>(null);
  const commands = useSlashCommands(chat.info.data?.location.directory, false);
  const sendKey = ['chat', sessionID, 'send'];
  const sending = useIsMutating({ mutationKey: sendKey }) > 0;
  const timeline = useRef<TimelineHandle>(null);
  const key = ['chat', sessionID];
  const refresh = () =>
    client.invalidateQueries({
      queryKey: key,
      predicate: (query) => query.queryKey[2] !== 'stream',
    });
  const send = useMutation({
    mutationKey: sendKey,
    gcTime: 0,
    mutationFn: async (input: { draft: DraftSnapshot; model?: ModelRef; before?: string }) => {
      const slash = parseSlash(input.draft.text);
      const local = slash && localCommands.some((item) => item.name === slash.name);
      if (slash && local) {
        if (
          slash.name !== 'undo' &&
          slash.name !== 'redo' &&
          (input.draft.attachments?.length || input.draft.comments?.length)
        )
          throw new Error('Send or remove attached context before running a thread action.');
        if (slash.name !== 'rename' && slash.text.trim())
          throw new Error(`/${slash.name} does not take arguments.`);
        if (slash.name === 'fork')
          return {
            session: await api.sessionAction(sessionID, { action: 'fork', before: input.before }),
          };
        if (slash.name === 'new')
          return {
            session: await api.createSession(chat.info.data!.location.directory, input.model),
          };
        if (slash.name === 'compact') await api.sessionAction(sessionID, { action: 'compact' });
        if (slash.name === 'undo' || slash.name === 'redo') {
          if (running) throw new Error('Stop the current response before undoing or redoing.');
          if (slash.name === 'redo') {
            if (!chat.info.data?.revert) throw new Error('There is nothing to redo.');
            await api.sessionAction(sessionID, { action: 'redo' });
          } else {
            const message = unique.findLast((item) => item.type === 'user');
            if (!message)
              throw new Error('No earlier user message is loaded. Load earlier history to undo.');
            const restored = await undoDraft(message);
            await api.sessionAction(sessionID, { action: 'undo', messageID: message.id });
            client.setQueryData<SessionInfo>(['chat', sessionID, 'info'], (info) =>
              info ? { ...info, revert: { ...info.revert, messageID: message.id } } : info,
            );
            return { session: null, restored };
          }
        }
        if (slash.name === 'rename') {
          if (!slash.text.trim()) throw new Error('Enter a title after /rename.');
          await api.sessionAction(sessionID, { action: 'rename', title: slash.text.trim() });
        }
        if (slash.name === 'export') {
          const data = await api.exportSession(sessionID);
          const url = URL.createObjectURL(
            new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }),
          );
          const link = document.createElement('a');
          link.href = url;
          link.download = `conversation-${sessionID}.json`;
          link.click();
          setTimeout(() => URL.revokeObjectURL(url), 1000);
        }
        return { session: null };
      }
      const catalog = slash ? await commands.refetch() : undefined;
      if (catalog?.error) throw catalog.error;
      const command = slash && catalog?.data?.find((item) => item.name === slash.name);
      if (slash && !command)
        throw new Error(`Unknown command /${slash.name}. Type / to see available commands.`);
      const text = reviewPrompt(slash ? slash.text : input.draft.text, input.draft.comments);
      if (text.length > 200_000)
        throw new Error('The draft is too long. Shorten it before sending.');
      await api.prompt(
        input.draft.sessionID,
        text,
        input.model,
        input.draft.attachments?.length
          ? await encodeAttachments(input.draft.attachments)
          : undefined,
        command && !command.skill ? command.name : undefined,
        command ? command.skill : undefined,
      );
      return { model: input.model };
    },
    retry: false,
    onSuccess: (result, input) => {
      if ('model' in result && result.model)
        client.setQueryData<SessionInfo>(['chat', sessionID, 'info'], (info) =>
          info ? { ...info, model: input.model } : info,
        );
      if ('restored' in result && result.restored)
        drafts.getState().restore(input.draft, result.restored);
      else drafts.getState().acknowledge(input.draft);
      setForkDraft(undefined);
      if ('session' in result && result.session) {
        client.setQueryData(['chat', result.session.id, 'info'], result.session);
        onOpenSession(result.session.id);
      }
      timeline.current?.scrollToLatest();
      void refresh();
      void client.invalidateQueries({ queryKey: ['sessions'] });
      void client.invalidateQueries({ queryKey: ['active'] });
      if ('session' in result) void client.invalidateQueries({ queryKey: ['workspace'] });
      send.reset();
    },
    onError: () => {
      void refresh();
    },
  });
  const stop = useMutation({
    mutationFn: () => api.interrupt(sessionID),
    onSuccess: () => {
      void refresh();
      void client.invalidateQueries({ queryKey: ['active'] });
    },
  });
  const { unique, seen } = useMemo(() => {
    const messages = chat.messages.data?.pages.flatMap((page) => page.data).toReversed() ?? [];
    const seen = new Set<string>();
    const boundary = chat.info.data?.revert?.messageID;
    const end = boundary ? messages.findIndex((message) => message.id === boundary) : -1;
    const visible = boundary ? (end < 0 ? [] : messages.slice(0, end)) : messages;
    const unique = visible.filter((message) => {
      if (seen.has(message.id)) return false;
      seen.add(message.id);
      return true;
    });
    return { unique, seen };
  }, [chat.messages.data, chat.info.data?.revert?.messageID]);
  const running = Boolean(chat.active.data?.[sessionID]);
  const waiting =
    chat.inbox.data?.filter((item) => item.type === 'user' && !seen.has(item.id)) ?? [];
  const failed = [
    chat.info,
    chat.messages,
    chat.active,
    chat.inbox,
    chat.permissions,
    chat.forms,
  ].find((query) => query.isError);
  const empty =
    chat.messages.isSuccess &&
    !chat.info.data?.revert &&
    !unique.length &&
    !waiting.length &&
    !running &&
    !chat.permissions.data?.length &&
    !chat.forms.data?.length &&
    !failed;
  const footer = (
    <>
      {chat.info.data?.revert && (
        <p className="message-note">
          Conversation undone. Use /redo to restore it, or send a message to continue from here.
        </p>
      )}
      {failed && (
        <div className="chat-error" role="alert">
          <p>{failed.error?.message}</p>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              void refresh();
              void client.invalidateQueries({ queryKey: ['active'] });
            }}
          >
            Retry
          </Button>
        </div>
      )}
      {waiting.map((item) => (
        <article className="user-message" key={item.id}>
          {item.type === 'user' && (
            <>
              {item.payload.text && <p className="user-message-bubble">{item.payload.text}</p>}
              <MessageAttachments files={item.payload.files} />
            </>
          )}
          <span className="message-note">Pending in OpenCode</span>
        </article>
      ))}
      {chat.permissions.data?.map((request) => (
        <PermissionCard key={request.id} request={request} />
      ))}
      {!running && (chat.executionError.data || chat.info.data?.outcome === 'failed') && (
        <p className="text-error" role="alert">
          {chat.executionError.data ||
            'The run failed. Check OpenCode’s provider configuration and try again.'}
        </p>
      )}
      <div className="chat-status" role="status">
        {chat.permissions.data?.length ? (
          'Waiting for permission'
        ) : chat.forms.data?.length ? (
          'Waiting for your answer'
        ) : running ? (
          <ThinkingIndicator sessionID={sessionID} latest={unique.at(-1)} />
        ) : waiting.length ? (
          'Message accepted; waiting to run…'
        ) : chat.info.data?.outcome === 'interrupted' ? (
          'Stopped'
        ) : (
          ''
        )}
      </div>
    </>
  );
  return (
    <div className="chat" data-empty={empty}>
      {forkDraft && (
        <Dialog
          title="Fork conversation"
          busy={sending}
          initialFocus={forkButton}
          onClose={() => setForkDraft(undefined)}
        >
          <p className="message-note">
            Continue in a new thread from the latest state, or fork just before an earlier message.
          </p>
          <div
            className="fork-options"
            onKeyDown={(event) => {
              if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
              if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
              const options = Array.from(
                event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'),
              );
              const index = options.findIndex((option) => option === event.target);
              if (index < 0) return;
              event.preventDefault();
              const next =
                event.key === 'Home'
                  ? 0
                  : event.key === 'End'
                    ? options.length - 1
                    : (index + (event.key === 'ArrowDown' ? 1 : -1) + options.length) %
                      options.length;
              options[next]?.focus({ preventScroll: true });
              options[next]?.scrollIntoView({ block: 'nearest' });
            }}
          >
            <Button
              ref={forkButton}
              variant="ghost"
              disabled={sending}
              onClick={() => send.mutate({ draft: forkDraft })}
            >
              {sending && !send.variables?.before ? 'Forking…' : 'Fork from latest'}
            </Button>
            {unique
              .filter((message) => message.type === 'user')
              .toReversed()
              .map((message) => (
                <Button
                  key={message.id}
                  variant="ghost"
                  disabled={sending}
                  onClick={() => send.mutate({ draft: forkDraft, before: message.id })}
                >
                  <span className="truncate">
                    {sending && send.variables?.before === message.id
                      ? 'Forking…'
                      : `Before: ${message.text || 'Attachments'}`}
                  </span>
                </Button>
              ))}
            {chat.messages.hasNextPage && (
              <Button
                variant="ghost"
                disabled={chat.messages.isFetchingNextPage}
                onClick={() => void chat.messages.fetchNextPage()}
              >
                Load earlier messages
              </Button>
            )}
          </div>
          {send.isError && (
            <p className="text-error" role="alert">
              {send.error.message}
            </p>
          )}
        </Dialog>
      )}
      {empty ? (
        <div className="chat-empty">
          <BrandIcon size="large" className="hero-art" />
          <h2>What should we build?</h2>
          <p>Any model, any provider. Your repo stays on your machine.</p>
          {project ? (
            <ProjectSwitcher
              project={project}
              opened={projects}
              disabled={sending || switching || !chat.info.isSuccess}
              onSelect={(next) => {
                if (client.isMutating({ mutationKey: sendKey }) || switching) return;
                onSwitchProject(next, drafts.getState().capture(sessionID).model ?? model);
              }}
            />
          ) : (
            <p>{projectName || 'Start a new thread'}</p>
          )}
          {switching && (
            <p className="message-note" role="status">
              Switching project…
            </p>
          )}
          {switchError && (
            <p className="text-error" role="alert">
              {switchError}
            </p>
          )}
          <Starters sessionID={sessionID} />
        </div>
      ) : chat.messages.data ? (
        <Timeline
          ref={timeline}
          sessionID={sessionID}
          messages={unique}
          hasEarlier={chat.messages.hasNextPage}
          loadingEarlier={chat.messages.isFetchingNextPage}
          historyError={chat.messages.isFetchNextPageError}
          fetchEarlier={chat.messages.fetchNextPage}
          footer={footer}
          working={running && !chat.permissions.data?.length && !chat.forms.data?.length}
          running={running}
        />
      ) : (
        <div className="chat-transcript">
          {chat.messages.isPending && (
            <p className="message-note" role="status">
              Loading messages…
            </p>
          )}
          {footer}
        </div>
      )}
      <div className="composer-area">
        <SessionViewed
          key={sessionID}
          sessionID={sessionID}
          time={chat.info.data?.time}
          unread={chat.info.data ? (sessionUnread(chat.info.data) ?? null) : undefined}
          ready={
            chat.info.isSuccess &&
            !chat.info.isFetching &&
            chat.messages.isSuccess &&
            !chat.messages.isFetching
          }
        />
        {catalog.isError && (
          <div className="chat-error" role="alert">
            <p>Could not load models. {catalog.error.message}</p>
            <Button variant="ghost" size="sm" onClick={() => void catalog.refetch()}>
              Retry
            </Button>
          </div>
        )}
        {send.isError && (
          <p className="text-error" role="alert">
            {send.error.message} Your draft is kept. Check the conversation before sending again.
          </p>
        )}
        {stop.isError && (
          <p className="text-error" role="alert">
            {stop.error.message}
          </p>
        )}
        {chat.forms.data?.[0] ? (
          <QuestionDock
            key={chat.forms.data[0].id}
            form={chat.forms.data[0]}
            pendingCount={chat.forms.data.length}
          />
        ) : (
          <Composer
            directory={chat.info.data?.location.directory}
            sessionID={sessionID}
            onSend={async () => {
              if (client.isMutating({ mutationKey: sendKey }) || switching) return;
              const draft = drafts.getState().capture(sessionID);
              if (
                draft.text.trim() === '/fork' &&
                !draft.attachments?.length &&
                !draft.comments?.length
              ) {
                setForkDraft(draft);
                return;
              }
              if (
                !draft.text.trim() &&
                !(draft.attachments ?? EMPTY_ATTACHMENTS).length &&
                !draft.comments?.length
              )
                return;
              const selection = draft.model ?? model;
              if (selection && chat.info.data)
                drafts.getState().rememberModel(chat.info.data.location.directory, selection);
              return send.mutateAsync({ draft, model: selection });
            }}
            sending={sending}
            ready={chat.info.isSuccess && !switching}
            running={running}
            stopping={stop.isPending}
            onStop={() => stop.mutate()}
            controls={
              <ModelControls
                sessionID={sessionID}
                models={catalog.data?.data}
                providers={catalog.data?.providers}
                model={model}
                disabled={!chat.info.isSuccess || sending || switching}
                loading={catalog.isPending}
                failed={catalog.isError}
                onChange={select}
              />
            }
          />
        )}
      </div>
    </div>
  );
}
