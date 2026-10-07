import mammoth from 'mammoth/mammoth.browser';

self.onmessage = async (event: MessageEvent<File | string>) => {
  try {
    const source = event.data;
    const arrayBuffer =
      typeof source === 'string'
        ? Uint8Array.from(atob(source), (char) => char.charCodeAt(0)).buffer
        : await source.arrayBuffer();
    const result = await mammoth.convertToHtml(
      { arrayBuffer },
      {
        externalFileAccess: false,
        includeEmbeddedStyleMap: false,
        convertImage: mammoth.images.imgElement(async (image) => {
          if (!/^image\/(png|jpeg|gif|webp)$/.test(image.contentType)) return { src: '' };
          const data = await image.readAsBase64String();
          if (data.length > 1_000_000) return { src: '' };
          return { src: `data:${image.contentType};base64,${data}` };
        }),
      },
    );
    // Bound both the main-thread sanitizer and the rendered document, even for tiny ZIPs.
    if (result.value.length > 2_000_000 || (result.value.match(/</g)?.length ?? 0) > 20_000)
      throw new Error('This document is too large for preview. Download it to open in Word.');
    self.postMessage({ html: result.value });
  } catch (error) {
    self.postMessage({
      error: error instanceof Error ? error.message : 'Could not preview this Word document.',
    });
  }
};
