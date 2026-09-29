import { z } from 'zod';
import {
  apiErrorSchema,
  connectionSchema,
  projectSchema,
  sessionPageSchema,
} from '@opencodex/contracts';

async function request<T>(path: string, schema: z.ZodType<T>, options?: RequestInit): Promise<T> {
  const response = await fetch(`/api${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    signal: options?.signal ?? AbortSignal.timeout(30_000),
  });
  const body: unknown = await response.json();
  if (!response.ok) {
    const error = apiErrorSchema.safeParse(body);
    throw new Error(
      error.success ? error.data.message : 'The gateway could not complete this request.',
    );
  }
  return schema.parse(body);
}

export const api = {
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
