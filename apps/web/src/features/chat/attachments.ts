import type { PromptFiles } from '@opencodex/contracts';

export type DraftAttachment = Readonly<{ id: string; file: File }>;
export const EMPTY_ATTACHMENTS: readonly DraftAttachment[] = [];

const imageTypes: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
};

export function attachmentMime(file: File) {
  const extension = file.name.split('.').at(-1)?.toLowerCase() ?? '';
  return (
    imageTypes[extension] ?? (extension === 'pdf' ? 'application/pdf' : file.type.toLowerCase())
  );
}

export function imageAttachment(file: File) {
  return Object.values(imageTypes).includes(attachmentMime(file));
}

export function attachmentSize(bytes: number) {
  return bytes < 1024
    ? `${bytes} B`
    : bytes < 1024 * 1024
      ? `${Math.ceil(bytes / 1024)} KB`
      : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Keep blobs in drafts; encode only the captured send, outside the typing path. */
export async function encodeAttachments(
  attachments: readonly DraftAttachment[],
): Promise<PromptFiles> {
  const files: PromptFiles[number][] = [];
  // Sequential reads bound transient memory when several large files are sent together.
  for (const { file } of attachments) {
    let mime = attachmentMime(file);
    if (!imageAttachment(file) && mime !== 'application/pdf') {
      const bytes = new Uint8Array(await file.slice(0, 8192).arrayBuffer());
      const controls = bytes.filter((byte) => byte < 9 || (byte > 13 && byte < 32)).length;
      if (bytes.includes(0) || controls > bytes.length * 0.1)
        throw new Error(
          `${file.name} is not a supported file. Attach images, PDFs, or text/code files.`,
        );
      mime = 'text/plain';
    }
    const uri = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () =>
        typeof reader.result === 'string'
          ? resolve(reader.result)
          : reject(new Error(`Could not read ${file.name}.`));
      reader.onerror = () =>
        reject(new Error(`Could not read ${file.name}. Try attaching it again.`));
      reader.onabort = () => reject(new Error(`Reading ${file.name} was cancelled.`));
      reader.readAsDataURL(file.slice(0, file.size, mime));
    });
    files.push({ name: file.name, uri });
  }
  return files;
}
