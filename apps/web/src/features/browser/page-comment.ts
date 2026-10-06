import type { BrowserAnnotation, BrowserAnnotationTheme } from '@opencodex/contracts/desktop';
import type { createDraftStore } from '../chat/draft-store';

/** The overlay is drawn inside the page, which cannot read the app's CSS variables. */
export function annotationTheme(): BrowserAnnotationTheme {
  const style = getComputedStyle(document.documentElement);
  const token = (name: string) => style.getPropertyValue(name).trim();
  return {
    primary: token('--primary'),
    onPrimary: token('--on-primary'),
    surface: token('--elevated'),
    text: token('--text'),
    muted: token('--text-tertiary'),
    border: token('--border-heavy'),
    font: token('--font-sans'),
  };
}

function describe(annotation: BrowserAnnotation) {
  const marks = [
    annotation.regions && `${annotation.regions} marked region${annotation.regions > 1 ? 's' : ''}`,
    annotation.drawings && `${annotation.drawings} drawing${annotation.drawings > 1 ? 's' : ''}`,
  ].filter(Boolean);
  return [
    ...annotation.elements.flatMap((element) => [
      `<${element.tag}>${element.text ? ` "${element.text}"` : ''}`,
      `  selector: ${element.selector}`,
      `  html: ${element.html.replace(/\s+/g, ' ')}`,
    ]),
    ...(marks.length ? [marks.join(', ')] : []),
  ].join('\n');
}

function pngFile(dataURL: string, name: string) {
  const bytes = Uint8Array.from(atob(dataURL.slice(dataURL.indexOf(',') + 1)), (char) =>
    char.charCodeAt(0),
  );
  return new File([bytes], name, { type: 'image/png' });
}

/** Adds the screenshot and the comment to the chat draft; returns an error to show, if any. */
export function addPageComment(
  drafts: ReturnType<typeof createDraftStore>,
  sessionID: string,
  annotation: BrowserAnnotation,
) {
  const id = crypto.randomUUID();
  const screenshot = annotation.screenshot?.startsWith('data:image/png;base64,')
    ? annotation.screenshot
    : undefined;
  const comment = (attached: boolean) => ({
    id,
    target: {
      url: annotation.url,
      title: annotation.title || undefined,
      quote: describe(annotation),
      screenshot: attached,
    },
    text: annotation.comment,
  });
  const error = drafts.getState().saveComment(sessionID, comment(Boolean(screenshot)));
  if (error) return error;
  if (!screenshot) return 'The comment was added, but its screenshot could not be captured.';
  const imageError = drafts
    .getState()
    .attach(sessionID, [pngFile(screenshot, `page-${id.slice(0, 8)}.png`)]);
  if (!imageError) return;
  drafts.getState().saveComment(sessionID, comment(false));
  return `The comment was added without its screenshot. ${imageError}`;
}
