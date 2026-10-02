import { attachmentLimitError, type SessionMessageInfo } from '@opencodex/contracts';
import type { DraftAttachment } from './attachments';

/** Decode only the undone prompt, never transcript rows or the streaming path. */
export async function undoDraft(message: Extract<SessionMessageInfo, { type: 'user' }>) {
  if (message.text.length > 200_000)
    throw new Error('This message is too long to restore into the composer.');
  const files = message.files ?? [];
  const error = attachmentLimitError(
    files.map((file) => ({
      name: file.name || 'attachment',
      size: Math.floor((file.data.length * 3) / 4) - (file.data.match(/=+$/)?.[0].length ?? 0),
      image: /^image\/(png|jpeg|gif|webp)$/.test(file.mime),
    })),
  );
  if (error) throw new Error(error);
  const attachments: DraftAttachment[] = [];
  for (const file of files) {
    const chunks: Uint8Array<ArrayBuffer>[] = [];
    for (let offset = 0; offset < file.data.length; offset += 65_536) {
      const binary = atob(file.data.slice(offset, offset + 65_536));
      const bytes = new Uint8Array(binary.length);
      for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
      chunks.push(bytes);
      // Yield between bounded batches so large attachments don't freeze the composer.
      if ((offset + 65_536) % 1_048_576 === 0)
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
    attachments.push({
      id: crypto.randomUUID(),
      file: new File(chunks, file.name || 'attachment', { type: file.mime }),
    });
  }
  return { text: message.text, attachments };
}
