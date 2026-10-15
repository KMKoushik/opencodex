import { useCallback, useRef, useState } from 'react';
import { useIsMutating, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useStore } from 'zustand';
import type {
  ModelRef,
  OpenCodeProject,
  Project,
  SessionInfo,
  WorktreeDirectory,
} from '@opencodex/contracts';
import { Button } from '../../components/ui/button';
import { api } from '../../lib/api';
import { BrandIcon } from '../brand/brand';
import { ProjectSwitcher } from '../projects/project-switcher';
import { useCheckout } from '../worktrees/checkout';
import { WorkspaceBar, type WorkspaceChoice } from '../worktrees/workspace-bar';
import { encodeAttachments } from './attachments';
import { Composer } from './composer';
import { useDraftStore } from './draft-context';
import { NEW_CHAT_DRAFT, type DraftSnapshot } from './draft-store';
import { ModelControls } from './model-controls';
import { PermissionControl } from './permission-control';
import { annotatedPrompt } from './review-comments';
import { localCommands, parseSlash, useSlashCommands } from './slash-commands';
import { promptMentions } from './mentions';
import { Starters } from './starters';
import { useModelSelection } from './use-model-selection';

const THREAD_COMMANDS: ReadonlySet<string> = new Set(localCommands.map((item) => item.name));

export function NewChatView({
  project,
  projects,
  live,
  onSelectProject,
  onStarted,
  focusRequest,
  onFocusHandled,
}: {
  project: Project;
  projects: Project[];
  live: boolean;
  onSelectProject: (project: Project) => void;
  onStarted: (session: SessionInfo, directory: string) => void;
  focusRequest?: number;
  onFocusHandled?: () => void;
}) {
  const client = useQueryClient();
  const drafts = useDraftStore();
  const directory = project.directory;
  const projectModel = useStore(drafts, (state) => state.projectModels[directory]);
  const { catalog, select, model } = useModelSelection(NEW_CHAT_DRAFT, {
    model: projectModel,
    location: { directory },
  });
  const commands = useSlashCommands(directory, false);
  const metadata = useQuery({
    queryKey: ['projects'],
    queryFn: ({ signal }) => api.projects(signal),
    select: useCallback(
      (projects: OpenCodeProject[]) => projects.find((item) => item.canonical === directory),
      [directory],
    ),
  });
  const checkout = useCheckout(
    metadata.data ? { projectID: metadata.data.id, location: { directory } } : undefined,
  );
  const [workspace, setWorkspace] = useState<WorkspaceChoice>({ mode: 'local' });
  const [full, setFull] = useState(false);
  // A session created before a later step failed is reused, so retrying never leaves another empty thread.
  const started = useRef<{ directory: string; session: SessionInfo }>(undefined);
  const sendKey = ['chat', NEW_CHAT_DRAFT, 'send'];
  const sending = useIsMutating({ mutationKey: sendKey }) > 0;
  const send = useMutation({
    mutationKey: sendKey,
    gcTime: 0,
    retry: false,
    mutationFn: async (input: {
      draft: DraftSnapshot;
      directory: string;
      model?: ModelRef;
      worktree?: { branch?: string };
      full: boolean;
    }) => {
      const slash = parseSlash(input.draft.text);
      if (slash && THREAD_COMMANDS.has(slash.name))
        throw new Error(`/${slash.name} needs a thread. Send a message first.`);
      const catalog = slash ? await commands.refetch() : undefined;
      if (catalog?.error) throw catalog.error;
      const command = slash && catalog?.data?.find((item) => item.name === slash.name);
      if (slash && !command)
        throw new Error(`Unknown command /${slash.name}. Type / to see available commands.`);
      const { text, annotations } = annotatedPrompt(
        slash ? slash.text : input.draft.text,
        input.draft.comments,
      );
      if (text.length > 200_000)
        throw new Error('The draft is too long. Shorten it before sending.');
      const files = input.draft.attachments?.length
        ? await encodeAttachments(input.draft.attachments)
        : undefined;
      let session =
        started.current?.directory === input.directory
          ? started.current.session
          : await api.createSession(input.directory, input.model);
      started.current = { directory: input.directory, session };
      if (input.worktree && session.location.directory === input.directory) {
        session = await api.startWorktree(session.id, input.worktree.branch);
        started.current = { directory: input.directory, session };
        const moved = session.location.directory;
        client.setQueryData<WorktreeDirectory[]>(['worktrees', session.projectID], (trees) =>
          trees && !trees.some((tree) => tree.directory === moved)
            ? [...trees, { directory: moved, strategy: 'git' }]
            : trees,
        );
        void client.invalidateQueries({ queryKey: ['worktrees', session.projectID] });
      }
      if (input.full) await api.sessionAccess(session.id, 'full');
      await api.prompt(session.id, {
        text,
        model: input.model,
        files,
        command: command && !command.skill ? command.name : undefined,
        skill: command ? command.skill : undefined,
        mentions: promptMentions(text, input.draft.mentions),
        annotations,
      });
      return session;
    },
    onSuccess: (session, input) => {
      started.current = undefined;
      // The thread view refetches it on mount, picking up the access change and the prompt.
      client.setQueryData(['chat', session.id, 'info'], session);
      drafts.getState().acknowledge(input.draft);
      setWorkspace({ mode: 'local' });
      setFull(false);
      void client.invalidateQueries({ queryKey: ['sessions'] });
      void client.invalidateQueries({ queryKey: ['projects'] });
      void client.invalidateQueries({ queryKey: ['active'] });
      onStarted(session, input.directory);
      send.reset();
    },
    onError: () => {
      // A session that exists now should appear in the sidebar while the draft stays here.
      if (started.current) void client.invalidateQueries({ queryKey: ['sessions'] });
    },
  });
  return (
    <div className="chat" data-empty="true">
      <div className="chat-empty">
        <BrandIcon size="large" className="hero-art" />
        <h2>What should we build?</h2>
        <p>Any model, any provider. Your repo stays on your machine.</p>
        <ProjectSwitcher
          project={project}
          opened={projects}
          disabled={sending}
          onSelect={(next) => {
            if (client.isMutating({ mutationKey: sendKey })) return;
            const selection = drafts.getState().capture(NEW_CHAT_DRAFT).model ?? model;
            if (selection) drafts.getState().rememberModel(next.directory, selection);
            onSelectProject(next);
          }}
        />
        <Starters sessionID={NEW_CHAT_DRAFT} />
      </div>
      <div className="composer-area">
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
            {send.error.message} Your draft is kept.
          </p>
        )}
        <Composer
          focusRequest={focusRequest}
          onFocusHandled={onFocusHandled}
          directory={directory}
          sessionID={NEW_CHAT_DRAFT}
          hiddenCommands={THREAD_COMMANDS}
          onSend={async () => {
            if (client.isMutating({ mutationKey: sendKey })) return;
            const draft = drafts.getState().capture(NEW_CHAT_DRAFT);
            const selection = draft.model ?? model;
            if (selection) drafts.getState().rememberModel(directory, selection);
            return send.mutateAsync({
              draft,
              directory,
              model: selection,
              worktree:
                checkout.local && workspace.mode === 'worktree'
                  ? { branch: workspace.branch }
                  : undefined,
              full,
            });
          }}
          sending={sending}
          ready
          running={false}
          stopping={false}
          onStop={() => undefined}
          controls={
            <>
              <ModelControls
                models={catalog.data?.data}
                providers={catalog.data?.providers}
                model={model}
                disabled={sending}
                loading={catalog.isPending}
                failed={catalog.isError}
                onChange={select}
              />
              <PermissionControl
                sessionID={NEW_CHAT_DRAFT}
                disabled={sending}
                draft={{ full, onChange: setFull }}
              />
            </>
          }
        />
        <WorkspaceBar
          checkout={checkout}
          choice={workspace}
          editable={checkout.local}
          starting={sending && Boolean(send.variables?.worktree)}
          live={live}
          onChange={setWorkspace}
        />
      </div>
    </div>
  );
}
