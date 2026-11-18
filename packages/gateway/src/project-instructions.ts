import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { OpenCodeClient } from '@opencode/client';
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { projectInstructionsSchema } from '@opencodex/contracts';
import { GatewayError } from './errors';

/**
 * A project's own instructions, written in OpenCodex and kept out of the repo (AGENTS.md is the
 * shared, committed kind). OpenCode has no per-project store for them, so OpenCodex keeps one
 * Markdown file per native project ID, and puts the text on each chat it sends in that project
 * as a native session instruction entry, which OpenCode adds to the system prompt.
 */
const ROOT = join(homedir(), '.opencodex', 'projects');
const KEY = 'opencodex.project-instructions';
const MAX_SESSIONS = 2000;

function file(projectID: string) {
  // Native project IDs are hashes or "global"; refuse anything that could leave the folder.
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(projectID)) throw new GatewayError('Unknown project.', 400);
  return join(ROOT, projectID, 'instructions.md');
}

/**
 * The project's instructions; `undefined` if it never had any. Clearing them leaves an empty
 * file, so chats that were given the old text have it removed on their next message.
 */
export async function readProjectInstructions(projectID: string) {
  try {
    return (await readFile(file(projectID), 'utf8')).trim();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  }
}

async function writeProjectInstructions(projectID: string, text: string) {
  const path = file(projectID);
  if (!text && (await readProjectInstructions(projectID)) === undefined) return;
  await mkdir(join(ROOT, projectID), { recursive: true });
  const temporary = `${path}.${process.pid}.tmp`;
  await writeFile(temporary, text ? `${text}\n` : '', 'utf8');
  await rename(temporary, path);
}

function entry(text: string) {
  return `Project instructions from the user. They apply to every chat in this project; follow them unless the user says otherwise in this chat.

${text}`;
}

/**
 * Keeps each session's project-instructions entry in step with its project's file, once per
 * session per change: a changed file updates chats on their next message, and clearing it
 * removes the entry. Forks (side chats) inherit the entry natively.
 */
export function createProjectInstructions() {
  /** What each session was last given this gateway run ('' = no entry). */
  const applied = new Map<string, string>();
  return async (
    client: OpenCodeClient,
    session: { id: string; projectID?: string },
    options: { signal: AbortSignal },
  ) => {
    if (!session.projectID) return;
    const text = await readProjectInstructions(session.projectID);
    // Never set for this project: nothing to add or remove.
    if (text === undefined) return;
    const sessionID = session.id;
    const value = text && entry(text);
    if (applied.get(sessionID) === value) return;
    if (value) {
      await client.session.instructions.entry.put({ sessionID, key: KEY, value }, options);
    } else {
      // First look this run: only remove an entry that's there.
      const entries = await client.session.instructions.entry.list({ sessionID }, options);
      if (entries.some((item) => item.key === KEY))
        await client.session.instructions.entry.remove({ sessionID, key: KEY }, options);
    }
    applied.delete(sessionID);
    if (applied.size >= MAX_SESSIONS) applied.delete(applied.keys().next().value!);
    applied.set(sessionID, value);
  };
}

export function projectInstructionRoutes() {
  const app = new Hono();
  app.get('/:id/instructions', async (c) =>
    c.json({ text: (await readProjectInstructions(c.req.param('id'))) ?? '' }),
  );
  app.put('/:id/instructions', bodyLimit({ maxSize: 400_000 }), async (c) => {
    const input = projectInstructionsSchema.safeParse(await c.req.json().catch(() => null));
    if (!input.success)
      return c.json({ message: input.error.issues[0]?.message ?? 'Invalid instructions.' }, 400);
    const text = input.data.text.trim();
    await writeProjectInstructions(c.req.param('id'), text);
    return c.json({ text });
  });
  return app;
}
