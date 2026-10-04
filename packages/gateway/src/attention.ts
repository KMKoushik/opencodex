import type { OpenCodeClient } from '@opencode/client';
import type { SessionAttention } from '@opencodex/contracts';

/**
 * Pending approvals and questions are location-scoped, so read each directory, then attribute
 * subagent requests to the root thread the sidebar shows.
 */
export async function attention(
  client: OpenCodeClient,
  directories: string[],
  options: { signal: AbortSignal },
): Promise<SessionAttention> {
  const lists = await Promise.all(
    directories.map((directory) =>
      Promise.all([
        client.permission.request.list({ location: { directory } }, options),
        client.form.list({ location: { directory } }, options),
      ]),
    ),
  );
  const parents = new Map<string, Promise<string | undefined>>();
  async function root(sessionID: string) {
    let current = sessionID;
    for (let depth = 0; depth < 8; depth++) {
      let parent = parents.get(current);
      if (!parent) {
        parent = client.session.get({ sessionID: current }, options).then((info) => info.parentID);
        parents.set(current, parent);
      }
      const next = await parent;
      if (!next) return current;
      current = next;
    }
    return current;
  }
  const result: SessionAttention = {};
  for (const [permissions, forms] of lists) {
    for (const form of forms.data) result[await root(form.sessionID)] ??= 'question';
    for (const request of permissions.data) result[await root(request.sessionID)] = 'permission';
  }
  return result;
}
