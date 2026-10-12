import type { OpenCodeClient } from '@opencode/client';

const KEY = 'opencodex.reply-format';
const VALUE = `OpenCodex renders your replies as Markdown, and links in them are clickable. Unless the user asks otherwise:

- Whenever you mention a file, write it as a Markdown link to its absolute path, with the file name or a short relative path as the link text, such as [app.ts](/Users/me/project/src/app.ts) or [src/app.ts](/Users/me/project/src/app.ts). Wrap paths that contain spaces in angle brackets, such as [notes.md](</Users/me/My Project/notes.md>). Never leave a file path only in a code span, because code spans can't be clicked. When a command includes a file path, keep the command in code and also link the file.
- Whenever you mention a GitHub issue, pull request, or commit, link it with its ID as the link text, such as [#123](https://github.com/owner/repo/pull/123) or [a1b2c3d](https://github.com/owner/repo/commit/a1b2c3d). Take the owner and repository from the git remote or from output you already have. If you aren't sure whether a number is an issue or a pull request, use /issues/123; GitHub redirects it.`;
const MAX_SESSIONS = 2000;

/**
 * Keeps OpenCodex's reply-format instruction entry on every session it prompts. Entries are
 * native and durable (forks inherit them, and OpenCode ignores an unchanged put), so each
 * session is written once per gateway run.
 */
export function createReplyFormat() {
  const current = new Set<string>();
  return async (client: OpenCodeClient, sessionID: string, options: { signal: AbortSignal }) => {
    if (current.has(sessionID)) return;
    await client.session.instructions.entry.put({ sessionID, key: KEY, value: VALUE }, options);
    if (current.size >= MAX_SESSIONS) current.delete(current.values().next().value!);
    current.add(sessionID);
  };
}
