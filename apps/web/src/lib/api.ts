import { z } from 'zod';
import {
  apiErrorSchema,
  connectionSchema,
  projectSchema,
  sessionPageSchema,
  type OpenCodeProject,
  type SessionInfo,
  type SessionMessagesResponse,
  type SessionInboxInfo,
  type SessionInboxUser,
  type SessionActive,
  type PermissionRequest,
  type PermissionReply,
  type FormInfo,
  type FormAnswer,
  type ModelCatalog,
  type ModelRef,
} from '@opencodex/contracts';

async function nativeRequest<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`/api${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    signal: options?.signal ?? AbortSignal.timeout(30_000),
  });
  const body = await response.json();
  if (!response.ok) {
    const error = apiErrorSchema.safeParse(body);
    throw new Error(
      error.success ? error.data.message : 'The gateway could not complete this request.',
    );
  }
  return body;
}

async function request<T>(path: string, schema: z.ZodType<T>, options?: RequestInit): Promise<T> {
  return schema.parse(await nativeRequest(path, options));
}

const sessionPath = (id: string) => `/sessions/${encodeURIComponent(id)}`;
const post = (body?: unknown): RequestInit => ({ method: 'POST', body: JSON.stringify(body) });

export const api = {
  models: (directory: string, signal: AbortSignal) =>
    nativeRequest<ModelCatalog>(`/models?${new URLSearchParams({ directory })}`, { signal }),
  selectModel: (id: string, model: ModelRef) =>
    nativeRequest(`${sessionPath(id)}/model`, post({ model })),
  projects: (signal: AbortSignal) => nativeRequest<OpenCodeProject[]>('/projects', { signal }),
  createSession: (directory: string) =>
    nativeRequest<SessionInfo>('/sessions', post({ directory })),
  session: (id: string, signal: AbortSignal) =>
    nativeRequest<SessionInfo>(sessionPath(id), { signal }),
  active: (signal: AbortSignal) =>
    nativeRequest<Record<string, SessionActive>>('/sessions/active', { signal }),
  messages: (id: string, cursor: string | undefined, signal: AbortSignal) =>
    nativeRequest<SessionMessagesResponse>(
      `${sessionPath(id)}/messages${cursor ? `?${new URLSearchParams({ cursor })}` : ''}`,
      { signal },
    ),
  inbox: (id: string, signal: AbortSignal) =>
    nativeRequest<SessionInboxInfo[]>(`${sessionPath(id)}/inbox`, { signal }),
  prompt: (id: string, text: string) =>
    nativeRequest<SessionInboxUser>(`${sessionPath(id)}/prompt`, post({ text })),
  interrupt: (id: string) => nativeRequest(`${sessionPath(id)}/interrupt`, post()),
  permissions: (id: string, signal: AbortSignal) =>
    nativeRequest<PermissionRequest[]>(`${sessionPath(id)}/permissions`, { signal }),
  replyPermission: (id: string, requestID: string, decision: PermissionReply) =>
    nativeRequest(
      `${sessionPath(id)}/permissions/${encodeURIComponent(requestID)}`,
      post({ decision }),
    ),
  forms: (id: string, signal: AbortSignal) =>
    nativeRequest<FormInfo[]>(`${sessionPath(id)}/forms`, { signal }),
  replyForm: (id: string, formID: string, answer: FormAnswer) =>
    nativeRequest(`${sessionPath(id)}/forms/${encodeURIComponent(formID)}`, post({ answer })),
  cancelForm: (id: string, formID: string) =>
    nativeRequest(`${sessionPath(id)}/forms/${encodeURIComponent(formID)}`, { method: 'DELETE' }),
  connection: (signal?: AbortSignal) => request('/connection', connectionSchema, { signal }),
  connect: () => request('/connection', connectionSchema, { method: 'POST' }),
  project: (directory: string) =>
    request('/projects/resolve', projectSchema, {
      method: 'POST',
      body: JSON.stringify({ directory }),
    }),
  sessions: (directory: string, cursor: string | undefined, signal: AbortSignal) => {
    const query = new URLSearchParams({ directory });
    if (cursor) query.set('cursor', cursor);
    return request(`/sessions?${query}`, sessionPageSchema, { signal });
  },
};
