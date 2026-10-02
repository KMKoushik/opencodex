import { defaultUrlTransform } from 'react-markdown';

export function markdownUrl(url: string, key: string) {
  if (/^file:/i.test(url)) return url;
  if (key === 'src' && /^data:image\/(?:png|jpeg|gif|webp|svg\+xml);base64,/i.test(url)) return url;
  return defaultUrlTransform(url);
}
