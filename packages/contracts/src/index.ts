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

export const sessionSchema = z.object({
  id: z.string(),
  title: z.string(),
  directory: z.string(),
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
export type WorkspaceFile =
  | { kind: 'text'; text: string; version: string; bytes: number }
  | { kind: 'image'; uri: string; bytes: number }
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
export const sessionFocusSchema = z.object({ action: z.enum(['pin', 'unpin', 'done', 'undone']) });
export type SessionFocusAction = z.infer<typeof sessionFocusSchema>['action'];
/** Root threads waiting on an approval or a question, including requests from their subagents. */
export type SessionAttention = Record<string, 'permission' | 'question'>;
export function sessionSummary(session: SessionInfo): Session {
  return {
    id: session.id,
    title: session.title || 'Untitled session',
    directory: session.location.directory,
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
