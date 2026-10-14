import { z } from 'zod';
import type { BrowserAnnotation } from '@opencodex/contracts/desktop';

// Agent-written view code shares the frame with the overlay; treat its result as untrusted.
const overlayResult = z.object({
  annotation: z.object({
    comment: z.string().max(4000),
    elements: z
      .array(
        z.object({
          tag: z.string().max(100),
          selector: z.string().max(500),
          text: z.string().max(200),
          html: z.string().max(500),
        }),
      )
      .max(20),
    regions: z.number().int().min(0).max(50),
    drawings: z.number().int().min(0).max(50),
  }),
  crop: z
    .object({ x: z.number(), y: z.number(), width: z.number(), height: z.number() })
    .nullable(),
});

/**
 * Turns the frame's overlay result into a comment on `canvas:<id>`. On desktop it captures the
 * marked area, which the overlay keeps drawn until the frame is told to close it.
 */
export async function canvasAnnotation(
  frame: HTMLIFrameElement,
  canvas: { id: string; title: string },
  value: unknown,
): Promise<BrowserAnnotation | null> {
  const parsed = overlayResult.safeParse(value);
  if (!parsed.success) return null;
  const { annotation, crop } = parsed.data;
  return {
    ...annotation,
    url: `canvas:${canvas.id}`,
    title: canvas.title,
    screenshot: crop ? await capture(frame, crop) : undefined,
  };
}

async function capture(frame: HTMLIFrameElement, crop: z.infer<typeof overlayResult>['crop'] & {}) {
  const desktop = window.desktop;
  // An app window older than this UI has no capture; the comment goes without a screenshot.
  if (typeof desktop?.captureWindowRegion !== 'function') return;
  const bounds = frame.getBoundingClientRect();
  const left = Math.max(0, Math.floor(bounds.left + crop.x));
  const top = Math.max(0, Math.floor(bounds.top + crop.y));
  const right = Math.min(innerWidth, Math.ceil(bounds.left + crop.x + crop.width));
  const bottom = Math.min(innerHeight, Math.ceil(bounds.top + crop.y + crop.height));
  if (right - left < 1 || bottom - top < 1) return;
  try {
    return await desktop.captureWindowRegion({
      x: left,
      y: top,
      width: right - left,
      height: bottom - top,
    });
  } catch {
    return undefined;
  }
}
