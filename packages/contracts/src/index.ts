import { z } from 'zod';

export const connectionSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('connected'), version: z.string() }),
  z.object({ status: z.literal('disconnected'), message: z.string() }),
]);

export const projectInputSchema = z.object({ directory: z.string().trim().min(1).max(4096) });
export const projectSchema = z.object({ directory: z.string(), name: z.string() });

export const sessionSchema = z.object({
  id: z.string(),
  title: z.string(),
  directory: z.string(),
  updatedAt: z.number(),
  model: z.string().optional(),
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

// OpenCode owns these wire contracts. Re-export types only; no client runtime in the UI.
export type {
  Project as OpenCodeProject,
  SessionInfo,
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
  FormField,
  FormAnswer,
} from '@opencode/client';

export const promptInputSchema = z.object({ text: z.string().min(1).max(200_000) });
export const permissionReplySchema = z.object({ decision: z.enum(['once', 'always', 'reject']) });
export const formReplySchema = z.object({
  answer: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.array(z.string())])),
});
