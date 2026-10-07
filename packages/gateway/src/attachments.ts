import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import type { OpenCodeClient } from '@opencode/client';
import type { PromptFiles, SessionInfo } from '@opencodex/contracts';

/** Native admission keeps binary bytes, but model projection omits them. Give tools a path. */
export async function prepareAttachments(
  client: OpenCodeClient,
  session: SessionInfo,
  input: { text: string; files?: PromptFiles },
  options: { signal: AbortSignal },
) {
  if (!input.files?.some((file) => file.uri.startsWith('data:application/octet-stream;')))
    return { text: input.text, files: input.files };
  const files: PromptFiles[number][] = [];
  const references: string[] = [];
  // Each send owns a unique directory. Never overwrite project files or earlier attachments.
  const directory = `.opencode/opencodex-attachments/${randomUUID()}`;
  await client.file.write(
    { location: session.location, path: `${directory}/.gitignore`, payload: Buffer.from('*\n') },
    options,
  );
  for (const [index, file] of input.files.entries()) {
    if (!file.uri.startsWith('data:application/octet-stream;')) {
      files.push(file);
      continue;
    }
    const name =
      (file.name ?? 'attachment')
        .split(/[\\/]/)
        .at(-1)!
        .replace(/[^\p{L}\p{N} ._()-]/gu, '_')
        .slice(-120) || 'attachment';
    const path = `${directory}/${index + 1}-${name}`;
    const written = await client.file.write(
      {
        location: session.location,
        path,
        payload: Buffer.from(file.uri.slice(file.uri.indexOf(',') + 1), 'base64'),
      },
      options,
    );
    // OpenCode retains the original bytes and native source URI for download, undo and export.
    files.push({ ...file, uri: pathToFileURL(written.data.path).href });
    references.push(JSON.stringify({ name: file.name, path: written.data.path }));
  }
  return {
    text: `${input.text}${input.text ? '\n\n' : ''}Attached files are available on disk. Use tools to inspect their contents:\n${references.join('\n')}`,
    files,
  };
}
