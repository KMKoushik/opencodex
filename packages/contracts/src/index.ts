import { z } from 'zod';
import type {
  ModelListOutput,
  ModelRef,
  ProviderInfo,
  SessionInfo,
  SessionPromptInput,
  SkillInfo,
  VcsInfo,
  VcsFileStatus,
} from '@opencode/client';

export const connectionSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('connected'), version: z.string() }),
  z.object({ status: z.literal('disconnected'), message: z.string() }),
]);

export const projectInputSchema = z.object({ directory: z.string().trim().min(1).max(4096) });
export const terminalUpdateSchema = z.object({
  size: z.object({
    rows: z.number().int().min(1).max(500),
    cols: z.number().int().min(2).max(1000),
  }),
});
export const projectSchema = z.object({ directory: z.string(), name: z.string() });
export const projectUpdateSchema = z.object({
  name: z.string().trim().max(256),
  icon: z
    .object({
      color: z.string().max(64),
      override: z
        .string()
        .max(2_000_000)
        .refine((value) => {
          if (!value || /^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/]*={0,2}$/.test(value))
            return true;
          if (value.length > 4096) return false;
          try {
            const url = new URL(value);
            return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password;
          } catch {
            return false;
          }
        }, 'Choose a PNG, JPEG, WebP, or GIF image, or an HTTP(S) icon URL without credentials.'),
    })
    .optional(),
});
export type ProjectUpdate = z.infer<typeof projectUpdateSchema>;

export const sessionWorktreeSchema = z.object({
  /** The ref the new detached checkout starts from; omitted means the chat's current HEAD. */
  branch: z
    .string()
    .trim()
    .min(1)
    .max(512)
    .refine((value) => !value.includes('\0') && !value.startsWith('-'))
    .optional(),
});
export const worktreeDirectorySchema = projectInputSchema;

export const sessionSchema = z.object({
  id: z.string(),
  title: z.string(),
  directory: z.string(),
  projectID: z.string().optional(),
  updatedAt: z.number(),
  time: z.object({
    created: z.number(),
    idle: z.number().optional(),
    viewed: z.number().optional(),
  }),
  unread: z.string().optional(),
  pinned: z.number().optional(),
  done: z.number().optional(),
  model: z.string().optional(),
  fork: z.object({ sessionID: z.string() }).optional(),
});

export const sessionPageSchema = z.object({
  sessions: z.array(sessionSchema),
  nextCursor: z.string().nullable(),
});

export const apiErrorSchema = z.object({ message: z.string() });

export type Connection = z.infer<typeof connectionSchema>;
export type Project = z.infer<typeof projectSchema>;
export type Session = z.infer<typeof sessionSchema>;
export type SessionPage = z.infer<typeof sessionPageSchema>;
export type ModelProvider = Pick<ProviderInfo, 'id' | 'name' | 'canonical'>;
export type ModelCatalog = ModelListOutput & {
  defaultModel: ModelRef | null;
  providers: ModelProvider[];
};
export type WorkspaceVcs = { info: VcsInfo; files: VcsFileStatus[] };
export type WorkspaceSkills = Pick<SkillInfo, 'id' | 'name' | 'description'>[];
export type ClaudeCodeStatus = {
  state: 'unavailable' | 'missing' | 'outdated' | 'loading' | 'active' | 'failed' | 'external';
  removable: boolean;
  path?: string;
  message?: string;
};
/** One subscription rate-limit window, as reported by the plan's own usage endpoint. */
export type UsageWindow = {
  id: string;
  label: string;
  /** 0–100. */
  usedPercent: number;
  /** Epoch milliseconds. */
  resetsAt?: number;
  /** Window length in milliseconds, used to compare usage against elapsed time. */
  durationMs?: number;
  limited: boolean;
};
export type UsageProvider = {
  id: 'codex' | 'claude' | 'opencode-go';
  name: string;
  windows: UsageWindow[];
  /** Why the windows could not be read; the provider is configured but unavailable. */
  error?: string;
};
export type UsageLimits = { providers: UsageProvider[] };
export type WorkspaceFile =
  | { kind: 'text'; text: string; version: string; bytes: number }
  | { kind: 'image'; uri: string; bytes: number }
  | { kind: 'video'; mime: string; bytes: number }
  | { kind: 'pdf'; bytes: number }
  | { kind: 'binary'; bytes: number };
export const MAX_PREVIEW_BYTES = 2 * 1024 * 1024;
export const workspaceFileInputSchema = projectInputSchema.extend({
  path: z
    .string()
    .min(1)
    .max(4096)
    .refine(
      (path) =>
        !path.startsWith('/') &&
        !path.includes('\\') &&
        !path.split('/').includes('..') &&
        !path.includes('\0'),
      'Choose a file within the project.',
    ),
});
export const workspaceWriteSchema = workspaceFileInputSchema.extend({
  text: z.string().max(MAX_PREVIEW_BYTES),
  version: z.string().regex(/^[a-f0-9]{64}$/),
});

// OpenCode owns these wire contracts. Re-export types only; no client runtime in the UI.
export type {
  Project as OpenCodeProject,
  SessionInfo,
  SessionListOutput,
  SessionMessagesResponse,
  SessionMessageInfo,
  SessionMessageAssistantTool,
  SessionInboxInfo,
  SessionInboxUser,
  SessionActive,
  OpenCodeEvent,
  PermissionRequest,
  PermissionReply,
  FormInfo,
  CommandInfo,
  FormField,
  FormAnswer,
  ModelInfo,
  ModelRef,
  ModelListOutput,
  PromptFileAttachment,
  McpServer,
  TokenUsageInfo,
  FileSystemEntry,
  FileDiffInfo,
  Pty,
  ShellInfo,
  ShellOutputOutput,
  WorktreeDirectory,
  WorktreeInfo,
} from '@opencode/client';

export const modelInputSchema = z.object({
  model: z.object({
    id: z.string().min(1).max(512),
    providerID: z.string().min(1).max(512),
    variant: z.string().min(1).max(512).optional(),
  }),
});
export const sessionViewSchema = z.object({ idle: z.number().nonnegative() });
export const sessionUnreadSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('mark') }),
  z.object({ action: z.literal('clear'), marker: z.string().uuid() }),
]);
export const SESSION_UNREAD_KEY = 'opencodexUnread';
export function sessionUnread(session: { metadata?: Record<string, unknown> }): string | undefined {
  const marker = session.metadata?.[SESSION_UNREAD_KEY];
  return typeof marker === 'string' && marker ? marker : undefined;
}
/** When the thread was pinned. */
export const SESSION_PINNED_KEY = 'opencodexPinned';
/** The thread's last activity when it was marked done; newer activity reopens it. */
export const SESSION_DONE_KEY = 'opencodexDone';
export function sessionMarker(
  session: { metadata?: Record<string, unknown> },
  key: typeof SESSION_PINNED_KEY | typeof SESSION_DONE_KEY,
): number | undefined {
  const value = session.metadata?.[key];
  return typeof value === 'number' && value > 0 ? value : undefined;
}
/** On a side chat: `{ parentID }`, the main chat it was forked from. */
export const SIDE_CHAT_KEY = 'opencodexSideChat';
/** On a main chat: its side chats' IDs, oldest first. */
export const SIDE_CHATS_KEY = 'opencodexSideChats';
export const MAX_SIDE_CHATS = 8;
export function sideChatParent(session: {
  metadata?: Record<string, unknown>;
}): string | undefined {
  const marker = session.metadata?.[SIDE_CHAT_KEY];
  return marker && typeof marker === 'object' && 'parentID' in marker
    ? typeof marker.parentID === 'string' && marker.parentID
      ? marker.parentID
      : undefined
    : undefined;
}
export function sideChatIDs(session: { metadata?: Record<string, unknown> }): string[] {
  const ids = session.metadata?.[SIDE_CHATS_KEY];
  return Array.isArray(ids)
    ? ids.filter((id): id is string => typeof id === 'string' && id.length > 0)
    : [];
}
/** Installation and load state of the plugin that lets side chats read their main chat. */
export type SideChatPluginStatus = {
  state: 'unavailable' | 'missing' | 'outdated' | 'loading' | 'active' | 'failed';
  path?: string;
  message?: string;
};
export type TasksPluginStatus = SideChatPluginStatus;

export const taskBuckets = ['today', 'week', 'someday', 'done'] as const;
export type TaskBucket = (typeof taskBuckets)[number];
export const taskProjectSchema = z.object({
  id: z.string().min(1).max(256),
  directory: z.string().min(1).max(4096),
});
export type TaskProject = z.infer<typeof taskProjectSchema>;
/** A task on the board, stored by the OpenCodex tasks plugin in OpenCode's plugin storage. */
export type Task = {
  id: string;
  title: string;
  notes?: string;
  bucket: TaskBucket;
  /** Ascending position within its bucket. */
  order: number;
  project?: TaskProject;
  /** The chat whose agent created the task. */
  sessionID?: string;
  source: 'user' | 'agent';
  /** Where the task returns when it is reopened from Done. */
  reopen?: Exclude<TaskBucket, 'done'>;
  time: { created: number; updated: number; moved: number; completed?: number };
};
/** Done tasks are deleted this long after completion. */
export const TASK_DONE_RETENTION = 14 * 24 * 60 * 60 * 1000;
const taskTitleSchema = z.string().trim().min(1, 'Enter a task.').max(500);
const taskNotesSchema = z.string().max(10_000);
export const taskCreateSchema = z.object({
  title: taskTitleSchema,
  notes: taskNotesSchema.optional(),
  bucket: z.enum(taskBuckets).exclude(['done']).default('today'),
  project: taskProjectSchema.nullish(),
});
export type TaskCreate = z.input<typeof taskCreateSchema>;
export const taskUpdateSchema = z.object({
  title: taskTitleSchema.optional(),
  notes: taskNotesSchema.optional(),
  bucket: z.enum(taskBuckets).optional(),
  order: z.number().finite().optional(),
  project: taskProjectSchema.nullable().optional(),
});
export type TaskUpdate = z.input<typeof taskUpdateSchema>;

export const sessionFocusSchema = z.object({ action: z.enum(['pin', 'unpin', 'done', 'undone']) });
export type SessionFocusAction = z.infer<typeof sessionFocusSchema>['action'];
/** Root threads waiting on an approval or a question, including requests from their subagents. */
export type SessionAttention = Record<string, 'permission' | 'question'>;
export function sessionSummary(session: SessionInfo): Session {
  return {
    id: session.id,
    title: session.title || 'Untitled session',
    directory: session.location.directory,
    projectID: session.projectID,
    updatedAt: session.time.updated,
    time: { created: session.time.created, idle: session.time.idle, viewed: session.time.viewed },
    unread: sessionUnread(session),
    pinned: sessionMarker(session, SESSION_PINNED_KEY),
    done: sessionMarker(session, SESSION_DONE_KEY),
    model: session.model?.id,
    fork: session.fork ? { sessionID: session.fork.sessionID } : undefined,
  };
}
export const sessionCreateSchema = projectInputSchema.extend({
  model: modelInputSchema.shape.model.optional(),
});
// Match T3 Code's composer limits; non-image files have no aggregate byte cap.
export const MAX_ATTACHMENTS = 100;
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const MAX_TOTAL_IMAGE_BYTES = 80 * 1024 * 1024;
export const MAX_FILE_BYTES = 50 * 1024 * 1024;

export function attachmentLimitError(
  files: readonly { name: string; size: number; image: boolean }[],
): string | undefined {
  if (files.length > MAX_ATTACHMENTS) return `Attach up to ${MAX_ATTACHMENTS} files per message.`;
  let imageBytes = 0;
  for (const file of files) {
    if (file.size > (file.image ? MAX_IMAGE_BYTES : MAX_FILE_BYTES))
      return `${file.name} exceeds the ${file.image ? 10 : 50} MiB ${file.image ? 'image' : 'file'} limit.`;
    if (file.image) imageBytes += file.size;
  }
  if (imageBytes > MAX_TOTAL_IMAGE_BYTES) return 'Images must total 80 MiB or less per message.';
}
export type PromptFiles = NonNullable<SessionPromptInput['files']>;
const attachmentInputSchema = z.object({
  uri: z
    .string()
    .max(Math.ceil(MAX_FILE_BYTES / 3) * 4 + 256)
    .regex(
      /^data:(?:image\/(?:png|jpeg|gif|webp)|application\/pdf|text\/plain);base64,[A-Za-z0-9+/]*={0,2}$/,
      'Unsupported attachment data.',
    ),
  name: z.string().min(1).max(1024),
});
export const promptInputSchema = z
  .object({
    text: z.string().max(200_000),
    command: z.string().min(1).max(512).optional(),
    skill: z.string().min(1).max(512).optional(),
    model: modelInputSchema.shape.model.optional(),
    files: z.array(attachmentInputSchema).max(MAX_ATTACHMENTS).optional(),
  })
  .refine(
    (input) => input.text.trim() || input.files?.length || input.command || input.skill,
    'Enter a message or attach a file.',
  )
  .superRefine((input, context) => {
    const error = attachmentLimitError(
      (input.files ?? []).map((file) => {
        const payload = file.uri.length - file.uri.indexOf(',') - 1;
        return {
          name: file.name,
          image: file.uri.startsWith('data:image/'),
          size: (payload * 3) / 4 - (file.uri.endsWith('==') ? 2 : file.uri.endsWith('=') ? 1 : 0),
        };
      }),
    );
    if (error) context.addIssue({ code: 'custom', message: error, path: ['files'] });
  });
export const permissionReplySchema = z.object({ decision: z.enum(['once', 'always', 'reject']) });
export const sessionAccessSchema = z.object({ mode: z.enum(['default', 'full']) });
/** A trailing native allow-all rule is the session's explicit full-access override. */
export function sessionFullAccess(session: Pick<SessionInfo, 'permissions'>): boolean {
  const rule = session.permissions?.at(-1);
  return rule?.action === '*' && rule.resource === '*' && rule.effect === 'allow';
}
export const sessionActionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('fork'), before: z.string().min(1).optional() }),
  z.object({ action: z.literal('compact') }),
  z.object({ action: z.literal('undo'), messageID: z.string().min(1) }),
  z.object({ action: z.literal('redo') }),
  z.object({ action: z.literal('rename'), title: z.string().trim().min(1).max(256) }),
]);
export const formReplySchema = z.object({
  answer: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.array(z.string())])),
});
