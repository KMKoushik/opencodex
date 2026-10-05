import { z } from 'zod';
import {
  apiErrorSchema,
  connectionSchema,
  projectSchema,
  sessionPageSchema,
  type OpenCodeProject,
  type ProjectUpdate,
  type SessionInfo,
  type SessionListOutput,
  type SessionMessagesResponse,
  type SessionInboxInfo,
  type SessionInboxUser,
  type SessionActive,
  type PermissionRequest,
  type PermissionReply,
  type FormInfo,
  type CommandInfo,
  sessionActionSchema,
  sessionUnreadSchema,
  sessionAccessSchema,
  type SessionAttention,
  type SessionFocusAction,
  type FormAnswer,
  type ModelCatalog,
  type ModelRef,
  type PromptFiles,
  type WorkspaceVcs,
  type WorkspaceSkills,
  type McpServer,
  type WorkspaceFile,
  type FileSystemEntry,
  type FileDiffInfo,
  type Pty,
  type ShellInfo,
  type ShellOutputOutput,
  type SideChatPluginStatus,
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
  videoURL: (directory: string, path: string) =>
    `/api/workspace/video?${new URLSearchParams({ directory, path })}`,
  fileLocation: (directory: string, path: string) =>
    nativeRequest<{ path: string }>(
      `/workspace/file-location?${new URLSearchParams({ directory, path })}`,
    ),
  shells: (directory: string, signal: AbortSignal) =>
    nativeRequest<ShellInfo[]>(`/shells?${new URLSearchParams({ directory })}`, { signal }),
  shell: (directory: string, id: string, signal: AbortSignal) =>
    nativeRequest<ShellInfo>(
      `/shells/${encodeURIComponent(id)}?${new URLSearchParams({ directory })}`,
      { signal },
    ),
  shellOutput: (directory: string, id: string, cursor: number | undefined, signal: AbortSignal) =>
    nativeRequest<ShellOutputOutput['data']>(
      `/shells/${encodeURIComponent(id)}/output?${new URLSearchParams({ directory, ...(cursor === undefined ? {} : { cursor: String(cursor) }) })}`,
      { signal },
    ),
  stopShell: (directory: string, id: string) =>
    nativeRequest<{ ok: true }>(
      `/shells/${encodeURIComponent(id)}?${new URLSearchParams({ directory })}`,
      { method: 'DELETE' },
    ),
  terminals: (directory: string, signal: AbortSignal) =>
    nativeRequest<Pty[]>(`/terminals?${new URLSearchParams({ directory })}`, { signal }),
  createTerminal: (directory: string) =>
    nativeRequest<Pty>(`/terminals?${new URLSearchParams({ directory })}`, post()),
  removeTerminal: (directory: string, id: string) =>
    nativeRequest<{ ok: true }>(
      `/terminals/${encodeURIComponent(id)}?${new URLSearchParams({ directory })}`,
      { method: 'DELETE' },
    ),
  resizeTerminal: (
    directory: string,
    id: string,
    size: { cols: number; rows: number },
    signal: AbortSignal,
  ) =>
    nativeRequest<Pty>(
      `/terminals/${encodeURIComponent(id)}?${new URLSearchParams({ directory })}`,
      { method: 'PATCH', body: JSON.stringify({ size }), signal },
    ),
  commands: (directory: string, signal: AbortSignal) =>
    nativeRequest<CommandInfo[]>(`/commands?${new URLSearchParams({ directory })}`, { signal }),
  sessionAction: (id: string, input: z.infer<typeof sessionActionSchema>) =>
    nativeRequest<SessionInfo | null>(`${sessionPath(id)}/action`, post(input)),
  exportSession: (id: string) => nativeRequest<unknown>(`${sessionPath(id)}/export`),
  files: (directory: string, path: string, query: string, signal: AbortSignal) =>
    nativeRequest<FileSystemEntry[]>(
      `/workspace/files?${new URLSearchParams({ directory, ...(path ? { path } : {}), ...(query ? { query } : {}) })}`,
      { signal },
    ),
  file: (directory: string, path: string, signal: AbortSignal) =>
    nativeRequest<WorkspaceFile>(`/workspace/file?${new URLSearchParams({ directory, path })}`, {
      signal,
    }),
  saveFile: (input: { directory: string; path: string; text: string; version: string }) =>
    nativeRequest<WorkspaceFile>('/workspace/file', { method: 'PUT', body: JSON.stringify(input) }),
  changes: (directory: string, mode: 'working' | 'branch', signal: AbortSignal) =>
    nativeRequest<WorkspaceVcs['files']>(
      `/workspace/diff?${new URLSearchParams({ directory, mode })}`,
      { signal },
    ),
  diff: (directory: string, mode: 'working' | 'branch', path: string, signal: AbortSignal) =>
    nativeRequest<FileDiffInfo | null>(
      `/workspace/diff?${new URLSearchParams({ directory, mode, path })}`,
      { signal },
    ),
  workspaceVcs: (directory: string, signal: AbortSignal) =>
    nativeRequest<WorkspaceVcs>(`/workspace/vcs?${new URLSearchParams({ directory })}`, { signal }),
  workspaceMcp: (directory: string, signal: AbortSignal) =>
    nativeRequest<McpServer[]>(`/workspace/mcp?${new URLSearchParams({ directory })}`, { signal }),
  workspaceSkills: (directory: string, signal: AbortSignal) =>
    nativeRequest<WorkspaceSkills>(`/workspace/skills?${new URLSearchParams({ directory })}`, {
      signal,
    }),
  models: (directory: string, signal: AbortSignal) =>
    nativeRequest<ModelCatalog>(`/models?${new URLSearchParams({ directory })}`, { signal }),
  selectModel: (id: string, model: ModelRef) =>
    nativeRequest(`${sessionPath(id)}/model`, post({ model })),
  projects: (signal: AbortSignal) => nativeRequest<OpenCodeProject[]>('/projects', { signal }),
  addProject: (directory: string) =>
    nativeRequest<OpenCodeProject>('/projects', post({ directory })),
  updateProject: (id: string, input: ProjectUpdate) =>
    nativeRequest<OpenCodeProject>(`/projects/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    }),
  createSession: (directory: string, model?: ModelRef) =>
    nativeRequest<SessionInfo>('/sessions', post({ directory, model })),
  session: (id: string, signal: AbortSignal) =>
    nativeRequest<SessionInfo>(sessionPath(id), { signal }),
  viewSession: (id: string, idle: number) =>
    nativeRequest<{ ok: true }>(`${sessionPath(id)}/view`, post({ idle })),
  unreadSession: (id: string, input: z.infer<typeof sessionUnreadSchema>) =>
    nativeRequest<{ unread: string | null }>(`${sessionPath(id)}/unread`, post(input)),
  focusSession: (id: string, action: SessionFocusAction) =>
    nativeRequest<{ pinned: number | null; done: number | null }>(
      `${sessionPath(id)}/focus`,
      post({ action }),
    ),
  attention: (directories: string[], signal: AbortSignal) =>
    nativeRequest<SessionAttention>(
      `/attention?${new URLSearchParams(directories.map((directory) => ['directory', directory]))}`,
      { signal },
    ),
  subagents: (id: string, cursor: string | undefined, signal: AbortSignal) =>
    nativeRequest<SessionListOutput>(
      `${sessionPath(id)}/subagents${cursor ? `?${new URLSearchParams({ cursor })}` : ''}`,
      { signal },
    ),
  sideChats: (id: string, signal: AbortSignal) =>
    nativeRequest<SessionInfo[]>(`${sessionPath(id)}/side-chats`, { signal }),
  createSideChat: (id: string) =>
    nativeRequest<SessionInfo>(`${sessionPath(id)}/side-chats`, {
      ...post(),
      signal: AbortSignal.timeout(60_000),
    }),
  deleteSideChat: (id: string, sideID: string) =>
    nativeRequest<{ ok: true }>(`${sessionPath(id)}/side-chats/${encodeURIComponent(sideID)}`, {
      method: 'DELETE',
    }),
  sideChatPlugin: (directory: string | undefined, signal: AbortSignal) =>
    nativeRequest<SideChatPluginStatus>(
      `/side-chat-plugin${directory ? `?${new URLSearchParams({ directory })}` : ''}`,
      { signal },
    ),
  installSideChatPlugin: () => nativeRequest<{ ok: true }>('/side-chat-plugin', { method: 'PUT' }),
  removeSideChatPlugin: () =>
    nativeRequest<{ ok: true }>('/side-chat-plugin', { method: 'DELETE' }),
  active: (signal: AbortSignal) =>
    nativeRequest<Record<string, SessionActive>>('/sessions/active', { signal }),
  messages: (id: string, cursor: string | undefined, signal: AbortSignal) =>
    nativeRequest<SessionMessagesResponse>(
      `${sessionPath(id)}/messages${cursor ? `?${new URLSearchParams({ cursor })}` : ''}`,
      { signal },
    ),
  inbox: (id: string, signal: AbortSignal) =>
    nativeRequest<SessionInboxInfo[]>(`${sessionPath(id)}/inbox`, { signal }),
  prompt: (
    id: string,
    text: string,
    model?: ModelRef,
    files?: PromptFiles,
    command?: string,
    skill?: string,
  ) =>
    nativeRequest<SessionInboxUser | null>(
      `${sessionPath(id)}/prompt`,
      post({ text, model, files, command, skill }),
    ),
  interrupt: (id: string) => nativeRequest(`${sessionPath(id)}/interrupt`, post()),
  permissions: (id: string, signal: AbortSignal) =>
    nativeRequest<PermissionRequest[]>(`${sessionPath(id)}/permissions`, { signal }),
  sessionAccess: (id: string, mode: z.infer<typeof sessionAccessSchema>['mode']) =>
    nativeRequest<{ ok: true }>(`${sessionPath(id)}/access`, post({ mode })),
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
  /** All projects' root threads, newest update first. An empty search lists everything. */
  searchSessions: (search: string, cursor: string | undefined, signal: AbortSignal) => {
    const query = new URLSearchParams({ search });
    if (cursor) query.set('cursor', cursor);
    return request(`/session-search?${query}`, sessionPageSchema, { signal });
  },
};
