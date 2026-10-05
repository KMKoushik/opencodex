import { MAX_PREVIEW_BYTES } from '@opencodex/contracts';
import { GatewayError } from './errors';

/** Bound bytes before the native client buffers/decodes previews and shell output. */
export const previewFetch: typeof fetch = async (input, init) => {
  const path = new URL(input instanceof Request ? input.url : input.toString()).pathname;
  const limit = path.startsWith('/api/fs/read/')
    ? MAX_PREVIEW_BYTES
    : path === '/api/vcs/diff'
      ? 16 * 1024 * 1024
      : /^\/api\/shell\/[^/]+\/output$/.test(path)
        ? 512 * 1024
        : undefined;
  const response = await fetch(input, init);
  if (!limit || !response.ok || !response.body) return response;
  const reader = response.body.getReader();
  let size = 0;
  const tooLarge = () =>
    new GatewayError(
      path.startsWith('/api/fs/read/')
        ? 'File exceeds the 2 MiB preview and editing limit.'
        : path === '/api/vcs/diff'
          ? 'Changes exceed the 16 MiB diff preview limit. Browse individual files instead.'
          : 'Shell output exceeds the preview limit.',
      413,
    );
  if (Number(response.headers.get('content-length')) > limit) {
    await reader.cancel();
    throw tooLarge();
  }
  return new Response(
    new ReadableStream<Uint8Array>({
      async pull(controller) {
        try {
          const chunk = await reader.read();
          if (chunk.done) {
            controller.close();
            return;
          }
          size += chunk.value.byteLength;
          if (size > limit) {
            await reader.cancel();
            controller.error(tooLarge());
            return;
          }
          controller.enqueue(chunk.value);
        } catch (error) {
          controller.error(error);
        }
      },
      cancel(reason) {
        return reader.cancel(reason);
      },
    }),
    { status: response.status, headers: response.headers },
  );
};
