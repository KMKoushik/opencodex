import { CANVAS_LINK } from '@opencodex/contracts/canvas';
import { defaultUrlTransform } from 'react-markdown';

export function markdownUrl(url: string, key: string) {
  if (/^file:/i.test(url)) return url;
  // Canvas links render as canvas cards or open the canvas panel; they never navigate.
  if (key === 'href' && CANVAS_LINK.test(url)) return url;
  if (key === 'src' && /^data:image\/(?:png|jpeg|gif|webp|svg\+xml);base64,/i.test(url)) return url;
  return defaultUrlTransform(url);
}
