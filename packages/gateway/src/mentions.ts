import { readdir, stat } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { OpenCodeClient, SessionInfo, SessionMessageInfo } from '@opencode/client';
import type { PromptFiles, PromptMention } from '@opencodex/contracts';
import { CANVAS_ROOT, folder, readData, readManifest } from './canvases';
import { GatewayError } from './errors';

/** Each mentioned chat's transcript is bounded, newest messages first. */
const TRANSCRIPT_BUDGET = 40_000;
const MAX_PAGES = 20;

/** A mentioned canvas's saved data is bounded too; its files stay in its folder. */
const CANVAS_DATA_BUDGET = 40_000;

/**
 * Files and skills map onto OpenCode's native mentions. OpenCode has no chat or canvas
 * reference, so a mentioned chat becomes a bounded text transcript attached at that mention,
 * and a canvas a summary: where its files are and its saved data.
 */
export async function resolveMentions(
  client: OpenCodeClient,
  session: SessionInfo,
  mentions: readonly PromptMention[],
  options: { signal: AbortSignal },
  canvasRoot = CANVAS_ROOT,
) {
  const skills = new Map<string, { id: string; mention: PromptMention['mention'] }>();
  const files = await Promise.all(
    mentions.map(async (item): Promise<PromptFiles[number] | undefined> => {
      if (item.type === 'skill') {
        if (!skills.has(item.id)) skills.set(item.id, { id: item.id, mention: item.mention });
        return;
      }
      if (item.type === 'file')
        return {
          uri: pathToFileURL(join(session.location.directory, item.path)).href,
          name: basename(item.path),
          mention: item.mention,
        };
      if (item.type === 'canvas') {
        const canvas = await canvasSummary(canvasRoot, item.id).catch((error) => {
          if (error instanceof GatewayError && error.status === 404)
            throw new GatewayError(
              `${item.mention.text} no longer exists. Remove the mention and send again.`,
              404,
            );
          throw error;
        });
        return {
          uri: `data:text/plain;base64,${Buffer.from(canvas.text).toString('base64')}`,
          name: `${canvas.title.replace(/[\\/]/g, '-').slice(0, 120)} canvas.md`,
          description: `Canvas "${canvas.title}" (${item.id})`,
          mention: item.mention,
        };
      }
      const chat = await chatTranscript(client, item.id, options).catch((error) => {
        if (notFound(error))
          throw new GatewayError(
            `${item.mention.text} no longer exists. Remove the mention and send again.`,
            404,
          );
        throw error;
      });
      return {
        uri: `data:text/plain;base64,${Buffer.from(chat.text).toString('base64')}`,
        name: `${chat.title.replace(/[\\/]/g, '-').slice(0, 120)}.md`,
        description: `Transcript of the chat "${chat.title}" (${item.id})`,
        mention: item.mention,
      };
    }),
  );
  return {
    files: files.filter((file) => file !== undefined),
    skills: [...skills.values()],
  };
}

async function canvasSummary(root: string, id: string) {
  const directory = folder(root, id);
  const info = await readManifest(directory, id);
  const [entries, data] = await Promise.all([
    readdir(directory, { withFileTypes: true }),
    readData(root, id),
  ]);
  const files = await Promise.all(
    entries
      .filter((entry) => entry.isFile() && !entry.name.startsWith('.'))
      .map(async (entry) => {
        const { size } = await stat(join(directory, entry.name));
        return `${entry.name} (${size < 1024 ? `${size} B` : `${Math.round(size / 1024)} KB`})`;
      }),
  );
  const app = entries.some((entry) => entry.name === 'server.ts');
  const values: string[] = [];
  let left = CANVAS_DATA_BUDGET;
  for (const [key, { value }] of Object.entries(data.values)) {
    const json = JSON.stringify(value, null, 2);
    if (left <= 0) {
      values.push(`### data/${key}.json\n\n(Not included; read the file.)`);
      continue;
    }
    const shown =
      json.length > left ? `${json.slice(0, left)}\n[… read the file for the rest]` : json;
    left -= shown.length;
    values.push(`### data/${key}.json\n\n\`\`\`json\n${shown}\n\`\`\``);
  }
  return {
    title: info.title,
    text: [
      `# Canvas: ${info.title}`,
      [
        `Canvas id: ${id}`,
        `Folder: ${directory}`,
        `Files: ${files.sort().join(', ') || 'none'}`,
        app
          ? 'It is an app: index.html is its page, server.ts its functions (canvas_run runs them), data/ its saved data.'
          : 'index.html is its page and data/ its saved data.',
        ...(info.sessionID ? [`Made in chat: ${info.sessionID}`] : []),
        'To change it, edit its files, then run canvas_check.',
      ].join('\n'),
      ...(data.errors.length ? [`Unreadable data:\n${data.errors.join('\n')}`] : []),
      values.length ? `## Saved data\n\n${values.join('\n\n')}` : 'It has no saved data.',
    ].join('\n\n'),
  };
}

async function chatTranscript(
  client: OpenCodeClient,
  sessionID: string,
  options: { signal: AbortSignal },
) {
  const chat = await client.session.get({ sessionID }, options);
  const title = chat.title || 'Untitled chat';
  // Undone messages stay hidden in the chat until the next send, so leave them out here too.
  let undone = Boolean(chat.revert?.messageID);
  const blocks: string[] = [];
  let size = 0;
  let omitted = false;
  let cursor: string | undefined;
  pages: for (let page = 0; page < MAX_PAGES; page++) {
    const result = await client.message.list({ sessionID, limit: 50, cursor }, options);
    for (const message of result.data) {
      if (undone) {
        if (message.id === chat.revert?.messageID) undone = false;
        continue;
      }
      const block = render(message);
      if (!block) continue;
      if (size + block.length > TRANSCRIPT_BUDGET) {
        if (!blocks.length) blocks.push(`${block.slice(0, TRANSCRIPT_BUDGET)}\n[…]`);
        omitted = true;
        break pages;
      }
      blocks.push(block);
      size += block.length;
      // A completed compaction summarizes everything before it.
      if (message.type === 'compaction') break pages;
    }
    cursor = result.cursor.next ?? undefined;
    if (!cursor || !result.data.length) break;
    if (page === MAX_PAGES - 1) omitted = true;
  }
  return {
    title,
    text: [
      `# Chat: ${title}`,
      `Project: ${chat.location.directory}`,
      ...(omitted ? ['Earlier messages are omitted.'] : []),
      ...blocks.reverse(),
    ].join('\n\n'),
  };
}

function render(message: SessionMessageInfo) {
  if (message.type === 'user') {
    const files = message.files?.flatMap((file) => (file.mention ? [] : [file.name || file.mime]));
    return `## User\n\n${message.text}${files?.length ? `\n\n(Attached: ${files.join(', ')})` : ''}`;
  }
  if (message.type === 'assistant') {
    const parts = message.content.flatMap((part) => {
      if (part.type === 'text') return part.text.trim() ? [part.text] : [];
      if (part.type !== 'tool') return [];
      const input = JSON.stringify(part.state.input ?? {});
      return [`- Used ${part.name}: ${input.length > 200 ? `${input.slice(0, 200)}…` : input}`];
    });
    if (message.error) parts.push(`(Failed: ${message.error.message})`);
    return parts.length ? `## Assistant\n\n${parts.join('\n\n')}` : undefined;
  }
  if (message.type === 'shell') {
    const output = message.output?.output ?? '';
    return `## User ran \`${message.command}\`\n\n\`\`\`\n${output.length > 2000 ? `${output.slice(0, 2000)}\n[…]` : output}\n\`\`\``;
  }
  if (message.type === 'compaction' && message.status === 'completed')
    return `## Summary of the earlier conversation\n\n${message.summary}`;
}

function notFound(error: unknown) {
  return (
    error instanceof Error && (error as Error & { _tag?: string })._tag === 'SessionNotFoundError'
  );
}
